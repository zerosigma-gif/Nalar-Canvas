import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function parseLifetimeMinutes(val: unknown): RoomLifetimeMinutes {
  const num = Number(val);
  if (ALLOWED_LIFETIMES.has(num as RoomLifetimeMinutes)) {
    return num as RoomLifetimeMinutes;
  }
  return DEFAULT_LIFETIME_MINUTES;
}

interface RoomState {
  roomId: string;
  encrypted: boolean;
  encryptedEnvelope: unknown | null;
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

function getOrCreateRoom(
  roomId: string,
  initialLifetimeMinutes?: RoomLifetimeMinutes
): RoomState {
  const existing = rooms.get(roomId);
  if (existing) {
    if (Date.now() >= existing.expiresAt) {
      expireAndDestroyRoom(existing);
    } else {
      return existing;
    }
  }

  const now = Date.now();
  const lifetimeMinutes = initialLifetimeMinutes ?? DEFAULT_LIFETIME_MINUTES;
  const room: RoomState = {
    roomId,
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

// Periodic safety sweep for room expiry & low-time warning notifications
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
}, 15_000);

if (typeof lifecycleSweepTimer.unref === 'function') {
  lifecycleSweepTimer.unref();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  app.get('/api/rooms/:roomId', (req, res) => {
    const room = rooms.get(req.params.roomId);
    if (!room) {
      res.json({ exists: false, encrypted: true, peers: 0 });
      return;
    }
    if (Date.now() >= room.expiresAt) {
      expireAndDestroyRoom(room);
      res.json({ exists: false, encrypted: true, peers: 0 });
      return;
    }
    res.json({
      exists: true,
      encrypted: room.encrypted,
      hasData: Boolean(room.encryptedEnvelope || room.plainBoard),
      peers: room.clients.size,
      updatedAt: room.updatedAt,
      lifetimeMinutes: room.lifetimeMinutes,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname === '/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
      // Other upgrade paths (such as Vite HMR /__vite_hmr) are handled by their own listeners
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    let activeRoomId: string | null = null;
    let activeClientId: string | null = null;

    const detachActiveClient = () => {
      if (!activeRoomId || !activeClientId) return;
      const prevRoom = rooms.get(activeRoomId);
      if (!prevRoom) return;
      prevRoom.clients.delete(activeClientId);
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
      try {
        const msg = JSON.parse(rawData.toString());
        const type = msg?.type;

        if (type === 'room:join') {
          const roomId = String(msg.roomId || 'default-studio').slice(0, 64);
          const clientId = String(msg.clientId || crypto.randomUUID());
          const name = String(msg.name || 'Kolaborator').slice(0, 40);
          const color = String(msg.color || '#2563EB').slice(0, 20);
          const requestedLifetime = msg.lifetimeMinutes
            ? parseLifetimeMinutes(msg.lifetimeMinutes)
            : undefined;

          // Leave previous room if rejoining or switching
          detachActiveClient();

          activeRoomId = roomId;
          activeClientId = clientId;

          const room = getOrCreateRoom(roomId, requestedLifetime);
          const presence: PeerPresence = {
            clientId,
            name,
            color,
            cursor: null,
            selectedNodeId: null,
            lastSeen: Date.now(),
          };
          room.clients.set(clientId, { ws, presence });

          // Send current room state & lifetime to joining client
          ws.send(
            JSON.stringify({
              type: 'room:init',
              roomId,
              encrypted: room.encrypted,
              encryptedEnvelope: room.encryptedEnvelope,
              plainBoard: room.plainBoard,
              peers: getPresenceList(room),
              lifetime: getLifetimePayload(room),
            })
          );

          // Broadcast updated peer list to everyone else
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

        if (!activeRoomId || !activeClientId) return;
        const room = rooms.get(activeRoomId);
        if (!room) return;

        if (Date.now() >= room.expiresAt) {
          expireAndDestroyRoom(room);
          return;
        }

        if (type === 'room:set-lifetime') {
          const nextMinutes = parseLifetimeMinutes(msg.lifetimeMinutes);
          const now = Date.now();
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
          const isEncrypted = Boolean(msg.encrypted);
          room.encrypted = isEncrypted;
          room.updatedAt = Date.now();
          if (isEncrypted) {
            room.encryptedEnvelope = msg.encryptedEnvelope ?? null;
            room.plainBoard = null;
          } else {
            room.plainBoard = msg.plainBoard ?? null;
            room.encryptedEnvelope = null;
          }

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
          const client = room.clients.get(activeClientId);
          if (client) {
            client.presence.cursor = msg.cursor ?? null;
            client.presence.selectedNodeId = msg.selectedNodeId ?? null;
            client.presence.lastSeen = Date.now();
          }
          broadcastToRoom(
            room,
            {
              type: 'cursor:moved',
              clientId: activeClientId,
              cursor: msg.cursor ?? null,
              selectedNodeId: msg.selectedNodeId ?? null,
            },
            activeClientId
          );
          return;
        }

        if (type === 'presence:update') {
          const client = room.clients.get(activeClientId);
          if (client) {
            if (msg.name) client.presence.name = String(msg.name).slice(0, 40);
            if (msg.color) client.presence.color = String(msg.color).slice(0, 20);
            client.presence.lastSeen = Date.now();
          }
          broadcastToRoom(room, {
            type: 'presence:list',
            peers: getPresenceList(room),
          });
          return;
        }

        if (type === 'room:ping') {
          ws.send(JSON.stringify({ type: 'room:pong', ts: Date.now() }));
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    ws.on('close', () => {
      detachActiveClient();
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
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`NalarCanvas server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
