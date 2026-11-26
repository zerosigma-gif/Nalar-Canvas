import { EncryptedEnvelope } from '../types/canvas';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const PBKDF2_ITERATIONS = 300000;

const keyFingerprintMap = new WeakMap<CryptoKey, string>();

function toFreshBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const binary = atob(b64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function computeFingerprintFromBytes(rawBytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toFreshBuffer(rawBytes));
  const bytes = new Uint8Array(digest);
  return Array.from(bytes.slice(0, 6))
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(':');
}

async function deriveSubkeysFromMasterBytes(
  masterBytes: Uint8Array,
  roomId: string
): Promise<{
  key: CryptoKey;
  keyFingerprint: string;
  accessVerifier: string;
}> {
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    toFreshBuffer(masterBytes),
    'HKDF',
    false,
    ['deriveBits']
  );

  const hkdfSalt = textEncoder.encode(`nalarcanvas-hkdf-v2:${roomId}`);
  const aesInfo = textEncoder.encode('nalarcanvas-aes-gcm-key');
  const verifierInfo = textEncoder.encode('nalarcanvas-room-access-verifier');

  const aesBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toFreshBuffer(hkdfSalt),
      info: toFreshBuffer(aesInfo),
    },
    hkdfKey,
    256
  );

  const aesBytes = new Uint8Array(aesBits);
  const keyFingerprint = await computeFingerprintFromBytes(aesBytes);

  const key = await crypto.subtle.importKey(
    'raw',
    toFreshBuffer(aesBytes),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  keyFingerprintMap.set(key, keyFingerprint);

  const verifierBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toFreshBuffer(hkdfSalt),
      info: toFreshBuffer(verifierInfo),
    },
    hkdfKey,
    256
  );
  const accessVerifier = bytesToBase64Url(new Uint8Array(verifierBits));

  return {
    key,
    keyFingerprint,
    accessVerifier,
  };
}

export function generateRoomKeyBase64(): string {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64Url(raw);
}

export async function importRawRoomKey(
  keyBase64Url: string,
  roomId = ''
): Promise<CryptoKey> {
  const rawBytes = base64UrlToBytes(keyBase64Url);
  if (rawBytes.byteLength !== 32) {
    throw new Error('Kunci enkripsi harus tepat 256-bit.');
  }
  if (roomId) {
    const derived = await deriveSubkeysFromMasterBytes(rawBytes, roomId);
    return derived.key;
  }
  const keyFingerprint = await computeFingerprintFromBytes(rawBytes);
  const key = await crypto.subtle.importKey(
    'raw',
    toFreshBuffer(rawBytes),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  keyFingerprintMap.set(key, keyFingerprint);
  return key;
}

export async function deriveSessionFromRawKey(
  keyBase64Url: string,
  roomId: string
): Promise<{
  key: CryptoKey;
  keyBase64Url: string;
  keyFingerprint: string;
  accessVerifier: string;
}> {
  const rawBytes = base64UrlToBytes(keyBase64Url);
  if (rawBytes.byteLength !== 32) {
    throw new Error('Kunci enkripsi harus tepat 256-bit.');
  }
  const { key, keyFingerprint, accessVerifier } = await deriveSubkeysFromMasterBytes(
    rawBytes,
    roomId
  );
  return {
    key,
    keyBase64Url,
    keyFingerprint,
    accessVerifier,
  };
}

export async function deriveKeyFromPassphrase(
  passphrase: string,
  roomId: string
): Promise<{
  key: CryptoKey;
  keyBase64Url: string;
  keyFingerprint: string;
  accessVerifier: string;
}> {
  const passphraseBytes = textEncoder.encode(passphrase);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    toFreshBuffer(passphraseBytes),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const saltBytes = textEncoder.encode(`nalarcanvas-e2ee-${roomId}`);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: toFreshBuffer(saltBytes),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  const masterBytes = new Uint8Array(derivedBits);
  const { key, keyFingerprint, accessVerifier } = await deriveSubkeysFromMasterBytes(
    masterBytes,
    roomId
  );
  return {
    key,
    keyBase64Url: bytesToBase64Url(masterBytes),
    keyFingerprint,
    accessVerifier,
  };
}

export async function getKeyFingerprint(key: CryptoKey): Promise<string> {
  const cached = keyFingerprintMap.get(key);
  if (cached) return cached;
  const exported = await crypto.subtle.exportKey('raw', key);
  return computeFingerprintFromBytes(new Uint8Array(exported));
}

export async function encryptPayload<T>(
  key: CryptoKey,
  payload: T,
  roomId?: string
): Promise<EncryptedEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const jsonBytes = textEncoder.encode(JSON.stringify(payload));
  const aadBytes = roomId ? textEncoder.encode(roomId) : null;

  const algorithm: AesGcmParams = aadBytes
    ? {
        name: 'AES-GCM',
        iv: toFreshBuffer(iv),
        additionalData: toFreshBuffer(aadBytes),
      }
    : {
        name: 'AES-GCM',
        iv: toFreshBuffer(iv),
      };

  const cipherBuffer = await crypto.subtle.encrypt(
    algorithm,
    key,
    toFreshBuffer(jsonBytes)
  );
  const keyFingerprint = await getKeyFingerprint(key);
  return {
    encrypted: true,
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(cipherBuffer)),
    keyFingerprint,
    updatedAt: Date.now(),
  };
}

export async function decryptPayload<T>(
  key: CryptoKey,
  envelope: EncryptedEnvelope,
  roomId?: string
): Promise<T> {
  const ivBytes = base64UrlToBytes(envelope.iv);
  const cipherBytes = base64UrlToBytes(envelope.ciphertext);

  let plainBuffer: ArrayBuffer;
  if (roomId) {
    const aadBytes = textEncoder.encode(roomId);
    try {
      plainBuffer = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: toFreshBuffer(ivBytes),
          additionalData: toFreshBuffer(aadBytes),
        },
        key,
        toFreshBuffer(cipherBytes)
      );
    } catch {
      // Fallback without additionalData for legacy session envelopes
      plainBuffer = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: toFreshBuffer(ivBytes),
        },
        key,
        toFreshBuffer(cipherBytes)
      );
    }
  } else {
    plainBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toFreshBuffer(ivBytes),
      },
      key,
      toFreshBuffer(cipherBytes)
    );
  }

  const jsonText = textDecoder.decode(plainBuffer);
  return JSON.parse(jsonText) as T;
}

export async function deriveAccessVerifier(
  roomId: string,
  keyBase64Url: string
): Promise<string> {
  const { accessVerifier } = await deriveSessionFromRawKey(keyBase64Url, roomId);
  return accessVerifier;
}

export async function deriveAccessVerifierFromPassphrase(
  passphrase: string,
  roomId: string
): Promise<{
  key: CryptoKey;
  keyBase64Url: string;
  keyFingerprint: string;
  accessVerifier: string;
}> {
  return deriveKeyFromPassphrase(passphrase, roomId);
}
