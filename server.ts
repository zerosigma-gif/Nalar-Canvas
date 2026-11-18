import crypto from 'node:crypto';
import express from 'express';
import type { Request } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';

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
const FINGERPRINT_REGEX = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
const BASE64URL_REGEX = /^[A-Za-z0-9_-]+$/;
const NODE_ID_REGEX = /^[a-zA-Z0-9_-]{1,80}$/;
const TEMPLATE_IDS = new Set([
  'mind-mapping',
  'fishbone',
  'tree',
  'star-bursting',
  'lotus-blossom',
  'timeframe',
]);

const MAX_WS_PAYLOAD_BYTES = 15 * 1024 * 1024; // 15 MB transport ceiling

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
  if (!isPlainObject(val)) return false;
  if (typeof val.id !== 'string' || !ROOM_ID_REGEX.test(val.id)) return false;
  if (typeof val.title !== 'string' || val.title.length > 160) return false;
  if (typeof val.templateId !== 'string' || !TEMPLATE_IDS.has(val.templateId)) return false;
  if (!Array.isArray(val.nodes) || val.nodes.length > 2000) return false;
  if (!Array.isArray(val.edges) || val.edges.length > 4000) return false;
  if (typeof val.updatedAt !== 'number' || !Number.isFinite(val.updatedAt)) return false;
  return true;
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
const wsActiveConnectionsByIp = new Map<string, number>();
const roomAuthCooldownMap = new Map<string, AuthFailureRecord>();
const globalAuthWindowMap = new Map<string, GlobalAuthWindow>();

const COOLDOWN_SCHEDULE_SEC = [3, 5, 15, 30, 60, 120];
const AUTH_FAILURE_TTL_MS = 15 * 60_000;
const GLOBAL_AUTH_WINDOW_MS = 10 * 60_000;
const GLOBAL_AUTH_MAX_FAILURES = 15;
const GLOBAL_AUTH_BLOCK_SEC = 180;

function extractClientIp(req: http.IncomingMessage | Request): string {
  const xff = req.headers['x-forwarded-for'];
  let ip = '';
  if (typeof xff === 'string' && xff.trim()) {
    ip = xff.split(',')[0].trim();
  } else if (Array.isArray(xff) && xff.length > 0) {
    ip = xff[0].trim();
  } else {
    ip = req.socket?.remoteAddress || 'unknown';
  }
  return ip.slice(0, 64);
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
    map.set(key, { count: 1, resetAt: now + windowMs });
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
  const globalRec = globalAuthWindowMap.get(ip);

  let maxLockedUntil = 0;
  let attempts = roomRec?.failures ?? 0;

  if (roomRec && roomRec.lockedUntil > now) {
    maxLockedUntil = Math.max(maxLockedUntil, roomRec.lockedUntil);
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

  roomAuthCooldownMap.set(roomKey, {
    failures: nextFailures,
    lockedUntil: roomLockedUntil,
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
  globalAuthWindowMap.set(ip, gNext);

  const effectiveLockedUntil = Math.max(roomLockedUntil, gNext.blockedUntil);
  return {
    retryAfterSeconds: Math.max(1, Math.ceil((effectiveLockedUntil - now) / 1000)),
    lockedUntil: effectiveLockedUntil,
    attempts: nextFailures,
    globalBlocked,
  };
}

function clearRoomAuthFailures(ip: string, roomId: string): void {
  roomAuthCooldownMap.delete(`${ip}::${roomId}`);
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
  passwordProtected: boolean;
  encrypted: boolean;
  encryptedEnvelope: { keyFingerprint?: string } | Record<string, unknown> | null;
  plainBoard: unknown | null;
  clients: Map<string, RoomClient>;
  createdAt: number;
  updatedAt: number;
  lifetimeMinutes: RoomLifetimeMinutes;
  expiresAt: number;
  warnedFiveMin: boolean;
  warnedOneMin: boolean;
  expirationTimer: ReturnType<typeof setTimeout> | null;
}

const rooms = new Map<string, RoomState>();

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
  initialLifetimeMinutes?: RoomLifetimeMinutes
): RoomState {
  const now = Date.now();
  const lifetimeMinutes = initialLifetimeMinutes ?? DEFAULT_LIFETIME_MINUTES;
  const room: RoomState = {
    roomId,
    accessVerifierHash: hashVerifier(accessVerifier).toString('hex'),
    passwordProtected,
    encrypted: true,
    encryptedEnvelope: null,
    plainBoard: null,
    clients: new Map(),
    createdAt: now,
    updatedAt: now,
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

// Periodic safety sweep for room expiry, low-time warnings & stale rate-limit GC
const lifecycleSweepTimer = setInterval(() => {
  const now = Date.now();
  for (const room of Array.from(rooms.values())) {
    const remainingMs = room.expiresAt - now;
    if (remainingMs <= 0) {
      expireAndDestroyRoom(room);
      continue;
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
  for (const [k, v] of roomAuthCooldownMap.entries()) {
    if (now - v.lastAttemptAt >= AUTH_FAILURE_TTL_MS && now >= v.lockedUntil) {
      roomAuthCooldownMap.delete(k);
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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

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
    wsActiveConnectionsByIp.set(clientIp, (wsActiveConnectionsByIp.get(clientIp) ?? 0) + 1);

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
          const clientId = validateClientId(msg.clientId);
          const name = validateDisplayName(msg.name);
          const color = validateHexColor(msg.color) ?? '#2563EB';
          const isInvite = msg.isInvite === true;
          const isAuthAttempt = msg.authAttempt === true;

          if (!roomId || !clientId || !name || !validateHexColor(msg.color ?? '#2563EB')) {
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
              requestedLifetime
            );

            activeRoomId = roomId;
            activeClientId = clientId;

            const presence: PeerPresence = {
              clientId,
              name,
              color,
              cursor: null,
              selectedNodeId: null,
              lastSeen: now,
            };
            room.clients.set(clientId, { ws, presence });

            sendJson(ws, {
              type: 'room:init',
              roomId,
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
              clientId
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

          activeRoomId = roomId;
          activeClientId = clientId;

          const presence: PeerPresence = {
            clientId,
            name,
            color,
            cursor: null,
            selectedNodeId: null,
            lastSeen: now,
          };
          existing.clients.set(clientId, { ws, presence });

          sendJson(ws, {
            type: 'room:init',
            roomId,
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
            clientId
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
        if (!room || !room.clients.has(activeClientId)) {
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

          const updatedBy = room.clients.get(activeClientId)?.presence.name || 'Kolaborator';
          broadcastToRoom(room, {
            type: 'room:access-updated',
            passwordProtected: room.passwordProtected,
            updatedBy,
          });
          return;
        }

        if (type === 'room:set-lifetime') {
          const nextMinutes = parseLifetimeMinutes(msg.lifetimeMinutes);
          if (!nextMinutes) {
            sendJson(ws, {
              type: 'room:error',
              code: 'INVALID_LIFETIME',
              error: 'Durasi sesi harus 30, 60, 120, atau 1440 menit.',
            });
            return;
          }
          room.lifetimeMinutes = nextMinutes;
          room.createdAt = now;
          room.expiresAt = now + nextMinutes * 60_000;
          room.warnedFiveMin = false;
          room.warnedOneMin = false;
          scheduleRoomExpiration(room);

          const updatedBy = room.clients.get(activeClientId)?.presence.name || 'Kolaborator';
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
            if (msg.plainBoard !== null && !isValidPlainBoard(msg.plainBoard)) {
              sendJson(ws, {
                type: 'room:error',
                code: 'INVALID_BOARD',
                error: 'Struktur dokumen kanvas tidak valid.',
              });
              return;
            }
            room.encrypted = false;
            room.plainBoard = msg.plainBoard ?? null;
            room.encryptedEnvelope = null;
          }

          room.updatedAt = now;
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
          const client = room.clients.get(activeClientId);
          if (client) {
            client.presence.cursor = cursor;
            client.presence.selectedNodeId = selectedNodeId;
            client.presence.lastSeen = now;
          }
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
          const client = room.clients.get(activeClientId);
          if (client) {
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
              client.presence.name = validName;
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
              client.presence.color = validColor;
            }
            client.presence.lastSeen = now;
          }
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
