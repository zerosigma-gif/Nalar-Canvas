import { EncryptedEnvelope } from '../types/canvas';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

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

export function generateRoomKeyBase64(): string {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64Url(raw);
}

export async function importRawRoomKey(keyBase64Url: string): Promise<CryptoKey> {
  const rawBytes = base64UrlToBytes(keyBase64Url);
  if (rawBytes.byteLength !== 32) {
    throw new Error('Kunci enkripsi harus tepat 256-bit.');
  }
  return crypto.subtle.importKey(
    'raw',
    rawBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function deriveKeyFromPassphrase(
  passphrase: string,
  roomId: string
): Promise<{ key: CryptoKey; keyBase64Url: string }> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const salt = textEncoder.encode(`nalarcanvas-e2ee-${roomId}`);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 120000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  const rawBytes = new Uint8Array(derivedBits);
  const key = await crypto.subtle.importKey(
    'raw',
    rawBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  return {
    key,
    keyBase64Url: bytesToBase64Url(rawBytes),
  };
}

export async function getKeyFingerprint(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('raw', key);
  const digest = await crypto.subtle.digest('SHA-256', exported);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes.slice(0, 6))
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(':');
}

export async function encryptPayload<T>(
  key: CryptoKey,
  payload: T
): Promise<EncryptedEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const jsonBytes = textEncoder.encode(JSON.stringify(payload));
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    jsonBytes
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
  envelope: EncryptedEnvelope
): Promise<T> {
  const iv = base64UrlToBytes(envelope.iv);
  const cipherBytes = base64UrlToBytes(envelope.ciphertext);
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    cipherBytes.buffer as ArrayBuffer
  );
  const jsonText = textDecoder.decode(plainBuffer);
  return JSON.parse(jsonText) as T;
}
