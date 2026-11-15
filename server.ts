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

interface RoomState {
  roomId: string;
  encrypted: boolean;
  encryptedEnvelope: unknown | null;
  plainBoard: unknown | null;
  clients: Map<string, RoomClient>;
  updatedAt: number;
}

const rooms = new Map<string, RoomState>();

function getOrCreateRoom(roomId: string): RoomState {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      roomId,
      encrypted: true,
      encryptedEnvelope: null,
      plainBoard: null,
      clients: new Map(),
      updatedAt: Date.now(),
    };
    rooms.set(roomId, room);
  }
  return room;
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
    res.json({
      exists: true,
      encrypted: room.encrypted,
      hasData: Boolean(room.encryptedEnvelope || room.plainBoard),
      peers: room.clients.size,
      updatedAt: room.updatedAt,
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

    ws.on('message', (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString());
        const type = msg?.type;

        if (type === 'room:join') {
          const roomId = String(msg.roomId || 'default-studio').slice(0, 64);
          const clientId = String(msg.clientId || crypto.randomUUID());
          const name = String(msg.name || 'Kolaborator').slice(0, 40);
          const color = String(msg.color || '#2563EB').slice(0, 20);

          // Leave previous room if rejoining
          if (activeRoomId && activeClientId) {
            const prevRoom = rooms.get(activeRoomId);
            if (prevRoom) {
              prevRoom.clients.delete(activeClientId);
              broadcastToRoom(prevRoom, {
                type: 'presence:list',
                peers: getPresenceList(prevRoom),
              });
            }
          }

          activeRoomId = roomId;
          activeClientId = clientId;

          const room = getOrCreateRoom(roomId);
          const presence: PeerPresence = {
            clientId,
            name,
            color,
            cursor: null,
            selectedNodeId: null,
            lastSeen: Date.now(),
          };
          room.clients.set(clientId, { ws, presence });

          // Send current room state to joining client
          ws.send(
            JSON.stringify({
              type: 'room:init',
              roomId,
              encrypted: room.encrypted,
              encryptedEnvelope: room.encryptedEnvelope,
              plainBoard: room.plainBoard,
              peers: getPresenceList(room),
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
      if (activeRoomId && activeClientId) {
        const room = rooms.get(activeRoomId);
        if (room) {
          room.clients.delete(activeClientId);
          broadcastToRoom(room, {
            type: 'presence:list',
            peers: getPresenceList(room),
          });
        }
      }
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
