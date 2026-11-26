import crypto from 'node:crypto';
import net from 'node:net';
import express from 'express';
import type { Request } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import { trySanitizeBoardDocument } from './src/utils/boardSanitize.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Strict Input Validation Schemas & Regexes (No DB / 100% In-Memory)
// ============================================================================
const ROOM_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/;
const CLIENT_ID_REGEX = /^[a-zA-Z0-9_-]{6,64}$/;
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const SAFE_NAME_REGEX = /^[^\x00-\x1F\x7F<>]{1,40}$/;
const VERIFIER_REGEX = /^[A-Za-z0-9_-]{32,128}$/;
const OWNER_TOKEN_REGEX = /^[A-Za-z0-9_-]{16,128}$/;
const FINGERPRINT_REGEX = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
const BASE64URL_REGEX = /^[A-Za-z0-9_-]+$/;
const NODE_ID_REGEX = /^[a-zA-Z0-9_-]{1,80}$/;

const MAX_WS_PAYLOAD_BYTES = 3 * 1024 * 1024; // 3 MB transport ceiling
const MAX_ACTIVE_ROOMS = 500;
const MAX_NEW_ROOMS_PER_MINUTE_PER_IP = 6;
const MAX_RATE_MAP_ENTRIES = 5000;
const EMPTY_ROOM_IDLE_TTL_MS = 15 * 60_000;
const EMPTY_UNINIT_ROOM_IDLE_TTL_MS = 3 * 60_000;
const MAX_ROOM_LIFETIME_CAP_MS = 24 * 60 * 60_000;

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function validateRoomId(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  return ROOM_ID_REGEX.test(trimmed) ? trimmed : null;
}

function validateClientId(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  return CLIENT_ID_REGEX.test(trimmed) ? trimmed : null;
}

function validateDisplayName(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed) return 'Kolaborator';
  return SAFE_NAME_REGEX.test(trimmed) ? trimmed : null;
}

function validateHexColor(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  return HEX_COLOR_REGEX.test(trimmed) ? trimmed.toUpperCase() : null;
}

function validateAccessVerifier(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  return VERIFIER_REGEX.test(trimmed) ? trimmed : null;
}

function validateOwnerToken(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  return OWNER_TOKEN_REGEX.test(trimmed) ? trimmed : null;
}

function validateCursor(val: unknown): { x: number; y: number } | null | undefined {
  if (val === null || val === undefined) return null;
  if (!isPlainObject(val)) return undefined;
  if (
    typeof val.x !== 'number' ||
    typeof val.y !== 'number' ||
    !Number.isFinite(val.x) ||
    !Number.isFinite(val.y) ||
    Math.abs(val.x) > 1_000_000 ||
    Math.abs(val.y) > 1_000_000
  ) {
    return undefined;
  }
  return { x: val.x, y: val.y };
}

function validateSelectedNodeId(val: unknown): string | null | undefined {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'string') return undefined;
  return NODE_ID_REGEX.test(val) ? val : undefined;
}

function isValidEncryptedEnvelope(val: unknown): boolean {
  if (!isPlainObject(val)) return false;
  if (val.encrypted !== true) return false;
  if (
    typeof val.iv !== 'string' ||
    !BASE64URL_REGEX.test(val.iv) ||
    val.iv.length < 12 ||
    val.iv.length > 64
  ) {
    return false;
  }
  if (
    typeof val.ciphertext !== 'string' ||
    !BASE64URL_REGEX.test(val.ciphertext) ||
    val.ciphertext.length < 16
  ) {
    return false;
  }
  if (typeof val.keyFingerprint !== 'string' || !FINGERPRINT_REGEX.test(val.keyFingerprint)) {
    return false;
  }
  if (typeof val.updatedAt !== 'number' || !Number.isFinite(val.updatedAt)) {
    return false;
  }
  return true;
}

function isValidPlainBoard(val: unknown): boolean {
  return trySanitizeBoardDocument(val) !== null;
}

// ============================================================================
// Server-Side Access Verifier Hashing & Constant-Time Comparison
// ============================================================================
function hashVerifier(clientVerifier: string): Buffer {
  return crypto.createHash('sha256').update(clientVerifier, 'utf8').digest();
}

function verifyAccessVerifier(clientVerifier: string, storedHashHex: string): boolean {
  try {
    const candidate = hashVerifier(clientVerifier);
    const stored = Buffer.from(storedHashHex, 'hex');
    if (candidate.length !== stored.length) return false;
    return crypto.timingSafeEqual(candidate, stored);
  } catch {
    return false;
  }
}

// ============================================================================
// In-Memory Rate Limiting & Brute-Force Cooldown (Zero Storage)
// ============================================================================
interface SlidingCounter {
  count: number;
  resetAt: number;
}

interface AuthFailureRecord {
  failures: number;
  lockedUntil: number;
  lastAttemptAt: number;
}

interface GlobalAuthWindow {
  failures: number;
  resetAt: number;
  blockedUntil: number;
}

const httpRateMap = new Map<string, SlidingCounter>();
const wsUpgradeRateMap = new Map<string, SlidingCounter>();
const roomCreateRateMap = new Map<string, SlidingCounter>();
const wsActiveConnectionsByIp = new Map<string, number>();
const roomAuthCooldownMap = new Map<string, AuthFailureRecord>();
const roomOnlyAuthCooldownMap = new Map<string, AuthFailureRecord>();
const globalAuthWindowMap = new Map<string, GlobalAuthWindow>();

const COOLDOWN_SCHEDULE_SEC = [3, 5, 15, 30, 60, 120];
const AUTH_FAILURE_TTL_MS = 15 * 60_000;
const GLOBAL_AUTH_WINDOW_MS = 10 * 60_000;
const GLOBAL_AUTH_MAX_FAILURES = 15;
const GLOBAL_AUTH_BLOCK_SEC = 180;

function boundedMapSet<K, V>(
  map: Map<K, V>,
  key: K,
  value: V,
  maxEntries = MAX_RATE_MAP_ENTRIES
): void {
  if (!map.has(key)) {
    while (map.size >= maxEntries) {
      const oldestKey = map.keys().next().value;
      if (oldestKey === undefined) break;
      map.delete(oldestKey);
    }
  }
  map.set(key, value);
}

function normalizeCandidateIp(raw: string): string {
  let ip = raw.trim();
  if (!ip) return '';
  if (ip.startsWith('[')) {
    const endIdx = ip.indexOf(']');
    if (endIdx > 1) {
      ip = ip.slice(1, endIdx);
    }
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) {
    ip = ip.slice(0, ip.lastIndexOf(':'));
  }
  const zoneIdx = ip.indexOf('%');
  if (zoneIdx !== -1) {
    ip = ip.slice(0, zoneIdx);
  }
  return ip;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return true;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = nums;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && nums[2] === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateOrReservedIp(rawIp: string): boolean {
  const ip = normalizeCandidateIp(rawIp);
  const ipVersion = net.isIP(ip);
  if (ipVersion === 0) return true;
  if (ipVersion === 4) {
    return isPrivateIpv4(ip);
  }
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('::ffff:')) {
    const v4Part = lower.slice(7);
    if (net.isIP(v4Part) === 4) {
      return isPrivateIpv4(v4Part);
    }
  }
  if (/^(fc|fd|fe8|fe9|fea|feb)/i.test(lower)) return true;
  return false;
}

function extractClientIp(req: http.IncomingMessage | Request): string {
  const xff = req.headers['x-forwarded-for'];
  const rawHeader =
    typeof xff === 'string'
      ? xff
      : Array.isArray(xff)
      ? xff.join(',')
      : '';

  if (rawHeader.trim()) {
    const candidates = rawHeader.split(',');
    for (let i = candidates.length - 1; i >= 0; i--) {
      const normalized = normalizeCandidateIp(candidates[i]);
      if (net.isIP(normalized) !== 0 && !isPrivateOrReservedIp(normalized)) {
        return normalized.slice(0, 64);
      }
    }
  }

  const remote = normalizeCandidateIp(req.socket?.remoteAddress || '');
  return (remote || 'unknown').slice(0, 64);
}

function consumeFixedWindowRateLimit(
  map: Map<string, SlidingCounter>,
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now >= entry.resetAt) {
    boundedMapSet(map, key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
  entry.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

function getAuthLockStatus(
  ip: string,
  roomId: string
): { locked: boolean; retryAfterSeconds: number; lockedUntil: number; attempts: number } {
  const now = Date.now();
  const roomKey = `${ip}::${roomId}`;
  const roomRec = roomAuthCooldownMap.get(roomKey);
  const roomOnlyRec = roomOnlyAuthCooldownMap.get(roomId);
  const globalRec = globalAuthWindowMap.get(ip);

  let maxLockedUntil = 0;
  const attempts = Math.max(roomRec?.failures ?? 0, roomOnlyRec?.failures ?? 0);

  if (roomRec && roomRec.lockedUntil > now) {
    maxLockedUntil = Math.max(maxLockedUntil, roomRec.lockedUntil);
  }
  if (roomOnlyRec && roomOnlyRec.lockedUntil > now) {
    maxLockedUntil = Math.max(maxLockedUntil, roomOnlyRec.lockedUntil);
  }
  if (globalRec && globalRec.blockedUntil > now) {
    maxLockedUntil = Math.max(maxLockedUntil, globalRec.blockedUntil);
  }

  if (maxLockedUntil > now) {
    return {
      locked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((maxLockedUntil - now) / 1000)),
      lockedUntil: maxLockedUntil,
      attempts,
    };
  }

  return {
    locked: false,
    retryAfterSeconds: 0,
    lockedUntil: 0,
    attempts,
  };
}

function recordAuthFailure(
  ip: string,
  roomId: string
): { retryAfterSeconds: number; lockedUntil: number; attempts: number; globalBlocked: boolean } {
  const now = Date.now();
  const roomKey = `${ip}::${roomId}`;
  const prev = roomAuthCooldownMap.get(roomKey);
  const nextFailures =
    prev && now - prev.lastAttemptAt < AUTH_FAILURE_TTL_MS ? prev.failures + 1 : 1;

  const scheduleIdx = Math.min(nextFailures - 1, COOLDOWN_SCHEDULE_SEC.length - 1);
  const cooldownSec = COOLDOWN_SCHEDULE_SEC[scheduleIdx];
  const roomLockedUntil = now + cooldownSec * 1000;

  boundedMapSet(roomAuthCooldownMap, roomKey, {
    failures: nextFailures,
    lockedUntil: roomLockedUntil,
    lastAttemptAt: now,
  });

  // Per-roomId failure cooldown so protection remains consistent behind shared proxies
  const prevRoomOnly = roomOnlyAuthCooldownMap.get(roomId);
  const nextRoomOnlyFailures =
    prevRoomOnly && now - prevRoomOnly.lastAttemptAt < AUTH_FAILURE_TTL_MS
      ? prevRoomOnly.failures + 1
      : 1;
  const roomOnlyScheduleIdx = Math.min(
    nextRoomOnlyFailures - 1,
    COOLDOWN_SCHEDULE_SEC.length - 1
  );
  const roomOnlyCooldownSec = COOLDOWN_SCHEDULE_SEC[roomOnlyScheduleIdx];
  const roomOnlyLockedUntil = now + roomOnlyCooldownSec * 1000;

  boundedMapSet(roomOnlyAuthCooldownMap, roomId, {
    failures: nextRoomOnlyFailures,
    lockedUntil: roomOnlyLockedUntil,
    lastAttemptAt: now,
  });

  // Track global failures per IP across all rooms to block room-hopping brute-force
  const gPrev = globalAuthWindowMap.get(ip);
  let gNext: GlobalAuthWindow;
  if (!gPrev || now >= gPrev.resetAt) {
    gNext = {
      failures: 1,
      resetAt: now + GLOBAL_AUTH_WINDOW_MS,
      blockedUntil: 0,
    };
  } else {
    gNext = {
      failures: gPrev.failures + 1,
      resetAt: gPrev.resetAt,
      blockedUntil: gPrev.blockedUntil,
    };
  }

  let globalBlocked = false;
  if (gNext.failures >= GLOBAL_AUTH_MAX_FAILURES) {
    gNext.blockedUntil = Math.max(gNext.blockedUntil, now + GLOBAL_AUTH_BLOCK_SEC * 1000);
    globalBlocked = true;
  }
  boundedMapSet(globalAuthWindowMap, ip, gNext);

  const effectiveLockedUntil = Math.max(roomLockedUntil, roomOnlyLockedUntil, gNext.blockedUntil);
  return {
    retryAfterSeconds: Math.max(1, Math.ceil((effectiveLockedUntil - now) / 1000)),
    lockedUntil: effectiveLockedUntil,
    attempts: Math.max(nextFailures, nextRoomOnlyFailures),
    globalBlocked,
  };
}

function clearRoomAuthFailures(ip: string, roomId: string): void {
  roomAuthCooldownMap.delete(`${ip}::${roomId}`);
  roomOnlyAuthCooldownMap.delete(roomId);
}

// ============================================================================
// Room State & Session Lifetime Types (In-Memory Only)
// ============================================================================
interface PeerPresence {
  clientId: string;
  name: string;
  color: string;
  cursor: { x: number; y: number } | null;
  selectedNodeId: string | null;
  lastSeen: number;
}

interface RoomClient {
  ws: WebSocket;
  presence: PeerPresence;
  isOwner: boolean;
}

type RoomLifetimeMinutes = 30 | 60 | 120 | 1440;
const ALLOWED_LIFETIMES = new Set<RoomLifetimeMinutes>([30, 60, 120, 1440]);
const DEFAULT_LIFETIME_MINUTES: RoomLifetimeMinutes = 120;

function parseLifetimeMinutes(val: unknown): RoomLifetimeMinutes | null {
  if (typeof val !== 'number' && typeof val !== 'string') return null;
  const num = Number(val);
  if (ALLOWED_LIFETIMES.has(num as RoomLifetimeMinutes)) {
    return num as RoomLifetimeMinutes;
  }
  return null;
}

interface RoomState {
  roomId: string;
  accessVerifierHash: string;
  ownerTokenHash: string | null;
  passwordProtected: boolean;
  encrypted: boolean;
  encryptedEnvelope: { keyFingerprint?: string } | Record<string, unknown> | null;
  plainBoard: unknown | null;
  clients: Map<string, RoomClient>;
  createdAt: number;
  updatedAt: number;
  lastActivityAt: number;
  lifetimeMinutes: RoomLifetimeMinutes;
  expiresAt: number;
  warnedFiveMin: boolean;
  warnedOneMin: boolean;
  expirationTimer: ReturnType<typeof setTimeout> | null;
}

const rooms = new Map<string, RoomState>();

function resolveUniqueClientId(room: RoomState, requestedClientId: string): string {
  if (!room.clients.has(requestedClientId)) {
    return requestedClientId;
  }
  for (let i = 0; i < 8; i++) {
    const suffix = `-${crypto.randomBytes(2).toString('hex')}`;
    const candidate = `${requestedClientId.slice(0, 64 - suffix.length)}${suffix}`;
    if (!room.clients.has(candidate)) {
      return candidate;
    }
  }
  const fallbackSuffix = `-${crypto.randomBytes(4).toString('hex')}`;
  return `${requestedClientId.slice(0, 64 - fallbackSuffix.length)}${fallbackSuffix}`;
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastToRoom(
  room: RoomState,
  payload: unknown,
  excludeClientId?: string
): void {
  const serialized = JSON.stringify(payload);
  for (const [cid, client] of room.clients.entries()) {
    if (excludeClientId && cid === excludeClientId) continue;
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(serialized);
    }
  }
}

function getPresenceList(room: RoomState): PeerPresence[] {
  return Array.from(room.clients.values()).map((c) => c.presence);
}

function getLifetimePayload(room: RoomState) {
  return {
    lifetimeMinutes: room.lifetimeMinutes,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
  };
}

function expireAndDestroyRoom(room: RoomState): void {
  if (room.expirationTimer) {
    clearTimeout(room.expirationTimer);
    room.expirationTimer = null;
  }

  const expiredNotice = JSON.stringify({
    type: 'room:expired',
    roomId: room.roomId,
    lifetimeMinutes: room.lifetimeMinutes,
    expiredAt: Date.now(),
    reason: 'Batas masa hidup pemakaian room kolaborasi telah habis.',
  });

  for (const client of room.clients.values()) {
    try {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(expiredNotice);
      }
      if (
        client.ws.readyState === WebSocket.OPEN ||
        client.ws.readyState === WebSocket.CONNECTING
      ) {
        client.ws.close(4001, 'Room session lifetime expired');
      }
    } catch {
      // Ignore socket errors during forced cleanup
    }
  }

  room.clients.clear();
  rooms.delete(room.roomId);
  roomOnlyAuthCooldownMap.delete(room.roomId);
}

function scheduleRoomExpiration(room: RoomState): void {
  if (room.expirationTimer) {
    clearTimeout(room.expirationTimer);
    room.expirationTimer = null;
  }

  const remainingMs = room.expiresAt - Date.now();
  if (remainingMs <= 0) {
    expireAndDestroyRoom(room);
    return;
  }

  room.expirationTimer = setTimeout(() => {
    const current = rooms.get(room.roomId);
    if (current && Date.now() >= current.expiresAt) {
      expireAndDestroyRoom(current);
    }
  }, remainingMs);

  if (typeof room.expirationTimer.unref === 'function') {
    room.expirationTimer.unref();
  }
}

function createNewRoom(
  roomId: string,
  accessVerifier: string,
  passwordProtected: boolean,
  ownerToken: string | null,
  initialLifetimeMinutes?: RoomLifetimeMinutes
): RoomState {
  const now = Date.now();
  const lifetimeMinutes = initialLifetimeMinutes ?? DEFAULT_LIFETIME_MINUTES;
  const room: RoomState = {
    roomId,
    accessVerifierHash: hashVerifier(accessVerifier).toString('hex'),
    ownerTokenHash: ownerToken ? hashVerifier(ownerToken).toString('hex') : null,
    passwordProtected,
    encrypted: true,
    encryptedEnvelope: null,
    plainBoard: null,
    clients: new Map(),
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
    lifetimeMinutes,
    expiresAt: now + lifetimeMinutes * 60_000,
    warnedFiveMin: false,
    warnedOneMin: false,
    expirationTimer: null,
  };
  rooms.set(roomId, room);
  scheduleRoomExpiration(room);
  return room;
}

// Periodic safety sweep for room expiry, idle cleanup, low-time warnings & stale rate-limit GC
const lifecycleSweepTimer = setInterval(() => {
  const now = Date.now();
  for (const room of Array.from(rooms.values())) {
    const remainingMs = room.expiresAt - now;
    if (remainingMs <= 0) {
      expireAndDestroyRoom(room);
      continue;
    }

    if (room.clients.size === 0) {
      const hasCanvasContent = Boolean(room.encryptedEnvelope || room.plainBoard);
      const idleLimit = hasCanvasContent
        ? EMPTY_ROOM_IDLE_TTL_MS
        : EMPTY_UNINIT_ROOM_IDLE_TTL_MS;
      if (now - room.lastActivityAt >= idleLimit) {
        expireAndDestroyRoom(room);
        continue;
      }
    }

    if (room.clients.size > 0) {
      if (!room.warnedOneMin && remainingMs <= 60_000) {
        room.warnedOneMin = true;
        room.warnedFiveMin = true;
        broadcastToRoom(room, {
          type: 'room:warning',
          roomId: room.roomId,
          remainingMinutes: 1,
          expiresAt: room.expiresAt,
        });
      } else if (!room.warnedFiveMin && remainingMs <= 5 * 60_000) {
        room.warnedFiveMin = true;
        broadcastToRoom(room, {
          type: 'room:warning',
          roomId: room.roomId,
          remainingMinutes: Math.max(1, Math.ceil(remainingMs / 60_000)),
          expiresAt: room.expiresAt,
        });
      }
    }
  }

  for (const [k, v] of httpRateMap.entries()) {
    if (now >= v.resetAt) httpRateMap.delete(k);
  }
  for (const [k, v] of wsUpgradeRateMap.entries()) {
    if (now >= v.resetAt) wsUpgradeRateMap.delete(k);
  }
  for (const [k, v] of roomCreateRateMap.entries()) {
    if (now >= v.resetAt) roomCreateRateMap.delete(k);
  }
  for (const [k, v] of roomAuthCooldownMap.entries()) {
    if (now - v.lastAttemptAt >= AUTH_FAILURE_TTL_MS && now >= v.lockedUntil) {
      roomAuthCooldownMap.delete(k);
    }
  }
  for (const [k, v] of roomOnlyAuthCooldownMap.entries()) {
    if (now - v.lastAttemptAt >= AUTH_FAILURE_TTL_MS && now >= v.lockedUntil) {
      roomOnlyAuthCooldownMap.delete(k);
    }
  }
  for (const [k, v] of globalAuthWindowMap.entries()) {
    if (now >= v.resetAt && now >= v.blockedUntil) {
      globalAuthWindowMap.delete(k);
    }
  }
}, 15_000);

if (typeof lifecycleSweepTimer.unref === 'function') {
  lifecycleSweepTimer.unref();
}

function isAllowedWsOrigin(originHeader: string, request: http.IncomingMessage): boolean {
  try {
    const parsed = new URL(originHeader);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const originHost = parsed.hostname.toLowerCase();
    const originHostWithPort = parsed.host.toLowerCase();

    const hostHeaders = [
      typeof request.headers.host === 'string' ? request.headers.host : '',
      typeof request.headers['x-forwarded-host'] === 'string'
        ? request.headers['x-forwarded-host'].split(',')[0]
        : '',
    ];
    for (const rawHost of hostHeaders) {
      const h = rawHost.trim().toLowerCase();
      if (!h) continue;
      const hostOnly = h.replace(/:\d+$/, '');
      if (originHostWithPort === h || originHost === hostOnly) {
        return true;
      }
    }

    if (process.env.APP_URL) {
      try {
        const appUrl = new URL(process.env.APP_URL);
        if (originHost === appUrl.hostname.toLowerCase()) {
          return true;
        }
      } catch {
        // Ignore malformed APP_URL env
      }
    }

    if (
      originHost === 'localhost' ||
      originHost === '127.0.0.1' ||
      originHost === '::1' ||
      originHost === '[::1]'
    ) {
      return true;
    }

    const trustedSuffixes = [
      'google.com',
      'googleusercontent.com',
      'usercontent.goog',
      'run.app',
    ];
    for (const suffix of trustedSuffixes) {
      if (originHost === suffix || originHost.endsWith(`.${suffix}`)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use(express.json({ limit: '3mb' }));

  // Per-IP HTTP rate limiting on /api/*
  app.use('/api', (req, res, next) => {
    const ip = extractClientIp(req);
    const rl = consumeFixedWindowRateLimit(httpRateMap, ip, 90, 60_000);
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfterSeconds));
      res.status(429).json({
        error: 'Terlalu banyak permintaan. Coba beberapa saat lagi.',
        retryAfterSeconds: rl.retryAfterSeconds,
      });
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  app.get('/api/rooms/:roomId', (req, res) => {
    const roomId = validateRoomId(req.params.roomId);
    if (!roomId) {
      res.status(400).json({
        error: 'Format ID room tidak valid. Gunakan 3-64 karakter huruf, angka, "_" atau "-".',
      });
      return;
    }
    const room = rooms.get(roomId);
    if (!room) {
      res.json({ exists: false, encrypted: true, peers: 0, passwordProtected: false });
      return;
    }
    if (Date.now() >= room.expiresAt) {
      expireAndDestroyRoom(room);
      res.json({ exists: false, encrypted: true, peers: 0, passwordProtected: false });
      return;
    }
    res.json({
      exists: true,
      encrypted: room.encrypted,
      passwordProtected: room.passwordProtected,
      hasData: Boolean(room.encryptedEnvelope || room.plainBoard),
      peers: room.clients.size,
      updatedAt: room.updatedAt,
      lifetimeMinutes: room.lifetimeMinutes,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_WS_PAYLOAD_BYTES,
  });

  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname === '/ws') {
        const originHeader = request.headers.origin;
        if (typeof originHeader === 'string' && originHeader.trim() !== '') {
          if (!isAllowedWsOrigin(originHeader, request)) {
            socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
            socket.destroy();
            return;
          }
        }

        const ip = extractClientIp(request);
        const upgradeRl = consumeFixedWindowRateLimit(wsUpgradeRateMap, ip, 35, 60_000);
        const activeCount = wsActiveConnectionsByIp.get(ip) ?? 0;

        if (!upgradeRl.allowed || activeCount >= 30) {
          socket.write(
            'HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\nRetry-After: ' +
              String(upgradeRl.retryAfterSeconds || 10) +
              '\r\n\r\n'
          );
          socket.destroy();
          return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
      // Other upgrade paths (such as Vite HMR /__vite_hmr) are handled by their own listeners
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket, request: http.IncomingMessage) => {
    const clientIp = extractClientIp(request);
    boundedMapSet(
      wsActiveConnectionsByIp,
      clientIp,
      (wsActiveConnectionsByIp.get(clientIp) ?? 0) + 1
    );

    let activeRoomId: string | null = null;
    let activeClientId: string | null = null;
    let msgWindowCount = 0;
    let msgWindowResetAt = Date.now() + 2000;
    let cleanedConnectionCount = false;

    const decrementIpConnection = () => {
      if (cleanedConnectionCount) return;
      cleanedConnectionCount = true;
      const cur = wsActiveConnectionsByIp.get(clientIp) ?? 0;
      if (cur <= 1) {
        wsActiveConnectionsByIp.delete(clientIp);
      } else {
        wsActiveConnectionsByIp.set(clientIp, cur - 1);
      }
    };

    const detachActiveClient = () => {
      if (!activeRoomId || !activeClientId) return;
      const prevRoom = rooms.get(activeRoomId);
      const leavingClientId = activeClientId;
      activeRoomId = null;
      activeClientId = null;

      if (!prevRoom) return;
      prevRoom.clients.delete(leavingClientId);
      prevRoom.lastActivityAt = Date.now();
      if (Date.now() >= prevRoom.expiresAt && prevRoom.clients.size === 0) {
        expireAndDestroyRoom(prevRoom);
      } else {
        broadcastToRoom(prevRoom, {
          type: 'presence:list',
          peers: getPresenceList(prevRoom),
        });
      }
    };

    ws.on('message', (rawData) => {
      // Per-socket message flood protection
      const now = Date.now();
      if (now >= msgWindowResetAt) {
        msgWindowCount = 1;
        msgWindowResetAt = now + 2000;
      } else {
        msgWindowCount += 1;
        if (msgWindowCount > 80) {
          sendJson(ws, {
            type: 'room:error',
            code: 'RATE_LIMIT',
            error: 'Frekuensi pesan WebSocket terlalu tinggi. Koneksi dibatasi.',
          });
          ws.close(4008, 'WebSocket message rate limit exceeded');
          return;
        }
      }

      try {
        const parsed: unknown = JSON.parse(rawData.toString());
        if (!isPlainObject(parsed) || typeof parsed.type !== 'string') {
          sendJson(ws, {
            type: 'room:error',
            code: 'INVALID_PAYLOAD',
            error: 'Format pesan JSON tidak valid.',
          });
          return;
        }

        const msg = parsed;
        const type = msg.type;

        if (type === 'room:ping') {
          sendJson(ws, { type: 'room:pong', ts: now });
          return;
        }

        if (type === 'room:join') {
          const roomId = validateRoomId(msg.roomId);
          const requestedClientId = validateClientId(msg.clientId);
          const name = validateDisplayName(msg.name);
          const color = validateHexColor(msg.color) ?? '#2563EB';
          const isInvite = msg.isInvite === true;
          const isAuthAttempt = msg.authAttempt === true;
          const providedOwnerToken = validateOwnerToken(msg.ownerToken);

          if (!roomId || !requestedClientId || !name || !validateHexColor(msg.color ?? '#2563EB')) {
            sendJson(ws, {
              type: 'room:error',
              code: 'INVALID_INPUT',
              error:
                'Validasi gagal: periksa format ID ruang, ID klien, nama kolaborator, dan warna kursor.',
            });
            return;
          }

          // Always check existing room expiry before admission
          let existing = rooms.get(roomId);
          if (existing && now >= existing.expiresAt) {
            expireAndDestroyRoom(existing);
            existing = undefined;
          }

          // Case 1: Room does not exist yet
          if (!existing) {
            if (isInvite) {
              sendJson(ws, {
                type: 'room:not-found',
                roomId,
                error:
                  'Room kolaborasi tidak ditemukan atau masa sesi telah berakhir.',
              });
              return;
            }

            if (rooms.size >= MAX_ACTIVE_ROOMS) {
              sendJson(ws, {
                type: 'room:error',
                code: 'ROOM_QUOTA_EXCEEDED',
                error:
                  'Kapasitas ruang aktif di server telah mencapai batas. Coba lagi beberapa saat.',
              });
              return;
            }

            const createRl = consumeFixedWindowRateLimit(
              roomCreateRateMap,
              clientIp,
              MAX_NEW_ROOMS_PER_MINUTE_PER_IP,
              60_000
            );
            if (!createRl.allowed) {
              sendJson(ws, {
                type: 'room:error',
                code: 'ROOM_CREATE_RATE_LIMIT',
                error: `Terlalu sering membuat ruang baru. Tunggu ${createRl.retryAfterSeconds} detik.`,
              });
              return;
            }

            const accessVerifier = validateAccessVerifier(msg.accessVerifier);
            if (!accessVerifier) {
              sendJson(ws, {
                type: 'room:error',
                code: 'INVALID_VERIFIER',
                error: 'Kredensial akses ruang tidak valid atau tidak lengkap.',
              });
              return;
            }

            const requestedLifetime = msg.lifetimeMinutes
              ? parseLifetimeMinutes(msg.lifetimeMinutes) ?? undefined
              : undefined;

            detachActiveClient();
            const room = createNewRoom(
              roomId,
              accessVerifier,
              msg.passwordProtected === true,
              providedOwnerToken,
              requestedLifetime
            );

            const assignedClientId = resolveUniqueClientId(room, requestedClientId);
            const isOwner = Boolean(providedOwnerToken && room.ownerTokenHash);
            activeRoomId = roomId;
            activeClientId = assignedClientId;

            const presence: PeerPresence = {
              clientId: assignedClientId,
              name,
              color,
              cursor: null,
              selectedNodeId: null,
              lastSeen: now,
            };
            room.clients.set(assignedClientId, { ws, presence, isOwner });
            room.lastActivityAt = now;

            sendJson(ws, {
              type: 'room:init',
              roomId,
              clientId: assignedClientId,
              isOwner,
              encrypted: room.encrypted,
              passwordProtected: room.passwordProtected,
              encryptedEnvelope: room.encryptedEnvelope,
              plainBoard: room.plainBoard,
              peers: getPresenceList(room),
              lifetime: getLifetimePayload(room),
            });

            broadcastToRoom(
              room,
              {
                type: 'presence:list',
                peers: getPresenceList(room),
              },
              assignedClientId
            );
            return;
          }

          // Case 2: Room already exists -> MUST verify access BEFORE joining & BEFORE sending room:init!
          const lockStatus = getAuthLockStatus(clientIp, roomId);
          const providedVerifier =
            msg.accessVerifier === undefined || msg.accessVerifier === null
              ? null
              : validateAccessVerifier(msg.accessVerifier);

          // If user is currently in cooldown (waktu jeda) after previous wrong password(s)
          if (lockStatus.locked) {
            if (isAuthAttempt || providedVerifier !== null) {
              sendJson(ws, {
                type: 'room:auth-failed',
                roomId,
                error: `Terlalu banyak percobaan kata sandi salah. Tunggu ${lockStatus.retryAfterSeconds} detik sebelum mencoba lagi.`,
                retryAfterSeconds: lockStatus.retryAfterSeconds,
                lockedUntil: lockStatus.lockedUntil,
                attempts: lockStatus.attempts,
              });
            } else {
              sendJson(ws, {
                type: 'room:auth-required',
                roomId,
                encrypted: existing.encrypted,
                passwordProtected: existing.passwordProtected,
                peers: existing.clients.size,
                keyFingerprint:
                  (existing.encryptedEnvelope as { keyFingerprint?: string } | null)
                    ?.keyFingerprint ?? null,
                lifetime: getLifetimePayload(existing),
                minPasswordLength: 8,
                retryAfterSeconds: lockStatus.retryAfterSeconds,
                lockedUntil: lockStatus.lockedUntil,
                attempts: lockStatus.attempts,
              });
            }
            return;
          }

          // No verifier provided (e.g., invite password screen probing room metadata)
          if (msg.accessVerifier === undefined || msg.accessVerifier === null) {
            sendJson(ws, {
              type: 'room:auth-required',
              roomId,
              encrypted: existing.encrypted,
              passwordProtected: existing.passwordProtected,
              peers: existing.clients.size,
              keyFingerprint:
                (existing.encryptedEnvelope as { keyFingerprint?: string } | null)
                  ?.keyFingerprint ?? null,
              lifetime: getLifetimePayload(existing),
              minPasswordLength: 8,
              retryAfterSeconds: 0,
              lockedUntil: 0,
              attempts: lockStatus.attempts,
            });
            return;
          }

          // Verifier provided -> check format & cryptographic equality in constant time
          const isMatch =
            providedVerifier !== null &&
            verifyAccessVerifier(providedVerifier, existing.accessVerifierHash);

          if (!isMatch) {
            const penalty = recordAuthFailure(clientIp, roomId);
            sendJson(ws, {
              type: 'room:auth-failed',
              roomId,
              error: penalty.globalBlocked
                ? `Akses dibatasi sementara karena terlalu banyak percobaan gagal. Tunggu ${penalty.retryAfterSeconds} detik.`
                : `Kata sandi atau kunci ruang tidak cocok. Tunggu ${penalty.retryAfterSeconds} detik sebelum mencoba kembali.`,
              retryAfterSeconds: penalty.retryAfterSeconds,
              lockedUntil: penalty.lockedUntil,
              attempts: penalty.attempts,
            });
            return;
          }

          // Verified successfully! Clear failure state, attach client, send room:init
          clearRoomAuthFailures(clientIp, roomId);
          detachActiveClient();

          const assignedClientId = resolveUniqueClientId(existing, requestedClientId);
          const isOwner = Boolean(
            providedOwnerToken &&
              existing.ownerTokenHash &&
              verifyAccessVerifier(providedOwnerToken, existing.ownerTokenHash)
          );

          activeRoomId = roomId;
          activeClientId = assignedClientId;

          const presence: PeerPresence = {
            clientId: assignedClientId,
            name,
            color,
            cursor: null,
            selectedNodeId: null,
            lastSeen: now,
          };
          existing.clients.set(assignedClientId, { ws, presence, isOwner });
          existing.lastActivityAt = now;

          sendJson(ws, {
            type: 'room:init',
            roomId,
            clientId: assignedClientId,
            isOwner,
            encrypted: existing.encrypted,
            passwordProtected: existing.passwordProtected,
            encryptedEnvelope: existing.encryptedEnvelope,
            plainBoard: existing.plainBoard,
            peers: getPresenceList(existing),
            lifetime: getLifetimePayload(existing),
          });

          broadcastToRoom(
            existing,
            {
              type: 'presence:list',
              peers: getPresenceList(existing),
            },
            assignedClientId
          );
          return;
        }

        // Strict Server-Authoritative Guard: unverified sockets CANNOT access or mutate any room state
        if (!activeRoomId || !activeClientId) {
          sendJson(ws, {
            type: 'room:error',
            code: 'UNAUTHORIZED',
            error: 'Verifikasi akses ruang di server diperlukan sebelum mengirim aktivitas.',
          });
          return;
        }

        const room = rooms.get(activeRoomId);
        const activeClient = room?.clients.get(activeClientId);
        if (!room || !activeClient) {
          sendJson(ws, {
            type: 'room:error',
            code: 'ROOM_UNAVAILABLE',
            error: 'Sesi ruang tidak aktif atau klien belum terverifikasi.',
          });
          return;
        }

        if (now >= room.expiresAt) {
          expireAndDestroyRoom(room);
          return;
        }

        if (type === 'room:set-access') {
          if (!activeClient.isOwner) {
            sendJson(ws, {
              type: 'room:error',
              code: 'FORBIDDEN',
              error: 'Hanya pembuat ruang yang dapat mengubah kata sandi atau kunci akses ruang.',
            });
            return;
          }
          const nextVerifier = validateAccessVerifier(msg.accessVerifier);
          if (!nextVerifier) {
            sendJson(ws, {
              type: 'room:error',
              code: 'INVALID_VERIFIER',
              error: 'Kredensial akses baru tidak valid.',
            });
            return;
          }
          room.accessVerifierHash = hashVerifier(nextVerifier).toString('hex');
          room.passwordProtected = msg.passwordProtected === true;
          room.updatedAt = now;
          room.lastActivityAt = now;

          const updatedBy = activeClient.presence.name || 'Pemilik Ruang';
          broadcastToRoom(room, {
            type: 'room:access-updated',
            passwordProtected: room.passwordProtected,
            updatedBy,
          });
          return;
        }

        if (type === 'room:set-lifetime') {
          if (!activeClient.isOwner) {
            sendJson(ws, {
              type: 'room:error',
              code: 'FORBIDDEN',
              error: 'Hanya pembuat ruang yang dapat mengubah batas masa hidup ruang.',
            });
            return;
          }
          const nextMinutes = parseLifetimeMinutes(msg.lifetimeMinutes);
          if (!nextMinutes) {
            sendJson(ws, {
              type: 'room:error',
              code: 'INVALID_LIFETIME',
              error: 'Durasi sesi harus 30, 60, 120, atau 1440 menit.',
            });
            return;
          }
          const maxCapExpiresAt = room.createdAt + MAX_ROOM_LIFETIME_CAP_MS;
          const nextExpiresAt = Math.min(maxCapExpiresAt, now + nextMinutes * 60_000);
          if (nextExpiresAt <= now) {
            sendJson(ws, {
              type: 'room:error',
              code: 'LIFETIME_CAP_REACHED',
              error: 'Batas maksimal durasi ruang (24 jam sejak dibuat) telah tercapai.',
            });
            return;
          }

          const remainingAfter = nextExpiresAt - now;
          room.lifetimeMinutes = nextMinutes;
          room.expiresAt = nextExpiresAt;
          room.warnedFiveMin = remainingAfter <= 5 * 60_000;
          room.warnedOneMin = remainingAfter <= 60_000;
          room.lastActivityAt = now;
          scheduleRoomExpiration(room);

          const updatedBy = activeClient.presence.name || 'Pemilik Ruang';
          broadcastToRoom(room, {
            type: 'room:lifetime-updated',
            lifetime: getLifetimePayload(room),
            updatedBy,
          });
          return;
        }

        if (type === 'board:sync') {
          if (typeof msg.encrypted !== 'boolean') {
            sendJson(ws, {
              type: 'room:error',
              code: 'INVALID_SYNC',
              error: 'Format sinkronisasi kanvas tidak valid.',
            });
            return;
          }

          const isEncrypted = msg.encrypted;
          if (isEncrypted !== room.encrypted && !activeClient.isOwner) {
            sendJson(ws, {
              type: 'room:error',
              code: 'FORBIDDEN',
              error: 'Hanya pembuat ruang yang dapat mengubah mode enkripsi ruang.',
            });
            return;
          }

          if (isEncrypted) {
            if (msg.encryptedEnvelope !== null && !isValidEncryptedEnvelope(msg.encryptedEnvelope)) {
              sendJson(ws, {
                type: 'room:error',
                code: 'INVALID_ENVELOPE',
                error: 'Format paket enkripsi kanvas tidak valid.',
              });
              return;
            }
            room.encrypted = true;
            room.encryptedEnvelope =
              (msg.encryptedEnvelope as Record<string, unknown> | null) ?? null;
            room.plainBoard = null;
          } else {
            let sanitizedPlain: unknown | null = null;
            if (msg.plainBoard !== null) {
              sanitizedPlain = trySanitizeBoardDocument(msg.plainBoard, room.roomId);
              if (!sanitizedPlain) {
                sendJson(ws, {
                  type: 'room:error',
                  code: 'INVALID_BOARD',
                  error: 'Struktur dokumen kanvas tidak valid.',
                });
                return;
              }
            }
            room.encrypted = false;
            room.plainBoard = sanitizedPlain;
            room.encryptedEnvelope = null;
          }

          room.updatedAt = now;
          room.lastActivityAt = now;
          broadcastToRoom(
            room,
            {
              type: 'board:updated',
              senderId: activeClientId,
              encrypted: room.encrypted,
              encryptedEnvelope: room.encryptedEnvelope,
              plainBoard: room.plainBoard,
              updatedAt: room.updatedAt,
            },
            activeClientId
          );
          return;
        }

        if (type === 'cursor:move') {
          const cursor = validateCursor(msg.cursor);
          const selectedNodeId = validateSelectedNodeId(msg.selectedNodeId);
          if (cursor === undefined || selectedNodeId === undefined) {
            return;
          }
          activeClient.presence.cursor = cursor;
          activeClient.presence.selectedNodeId = selectedNodeId;
          activeClient.presence.lastSeen = now;
          room.lastActivityAt = now;
          broadcastToRoom(
            room,
            {
              type: 'cursor:moved',
              clientId: activeClientId,
              cursor,
              selectedNodeId,
            },
            activeClientId
          );
          return;
        }

        if (type === 'presence:update') {
          if (msg.name !== undefined) {
            const validName = validateDisplayName(msg.name);
            if (!validName) {
              sendJson(ws, {
                type: 'room:error',
                code: 'INVALID_NAME',
                error: 'Nama kolaborator mengandung karakter tidak diizinkan.',
              });
              return;
            }
            activeClient.presence.name = validName;
          }
          if (msg.color !== undefined) {
            const validColor = validateHexColor(msg.color);
            if (!validColor) {
              sendJson(ws, {
                type: 'room:error',
                code: 'INVALID_COLOR',
                error: 'Format warna kursor harus hex #RRGGBB.',
              });
              return;
            }
            activeClient.presence.color = validColor;
          }
          activeClient.presence.lastSeen = now;
          room.lastActivityAt = now;
          broadcastToRoom(room, {
            type: 'presence:list',
            peers: getPresenceList(room),
          });
          return;
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    ws.on('close', () => {
      detachActiveClient();
      decrementIpConnection();
    });

    ws.on('error', () => {
      detachActiveClient();
      decrementIpConnection();
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server,
          path: '/__vite_hmr',
        },
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`NalarCanvas server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start NalarCanvas server:', err);
  process.exit(1);
});
