/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomControlBar } from './components/BottomControlBar';
import { CanvasMinimap } from './components/CanvasMinimap';
import { CanvasWorkspace } from './components/CanvasWorkspace';
import { CollaborationModal } from './components/CollaborationModal';
import { CollaboratorInviteLogin } from './components/CollaboratorInviteLogin';
import { EncryptionModal } from './components/EncryptionModal';
import { FloatingToolbar } from './components/FloatingToolbar';
import { MediaModal } from './components/MediaModal';
import { NodeFormattingBar } from './components/NodeFormattingBar';
import { PresentationHud } from './components/PresentationHud';
import { TemplateModal } from './components/TemplateModal';
import { ExportFormat, TopBar } from './components/TopBar';
import { Clock3, AlertTriangle, PlusCircle, RefreshCw, X } from 'lucide-react';
import {
  BoardDocument,
  CanvasEdge,
  CanvasNode,
  CollaboratorPresence,
  ConnectorStyle,
  EncryptedEnvelope,
  InteractionTool,
  MediaAttachment,
  NodeTextTarget,
  ROOM_LIFETIME_OPTIONS,
  RoomLifetimeInfo,
  RoomLifetimeMinutes,
  TemplateId,
} from './types/canvas';
import {
  decryptPayload,
  deriveAccessVerifier,
  deriveAccessVerifierFromPassphrase,
  encryptPayload,
  generateRoomKeyBase64,
  getKeyFingerprint,
  importRawRoomKey,
} from './utils/crypto';
import {
  exportAsDocx,
  exportAsMarkdown,
  exportAsPdf,
  exportAsPng,
  exportAsPptx,
} from './utils/exports';
import {
  buildFromScratchBoard,
  buildTemplateBoard,
  createBlankNode,
  createDefaultTable,
  formatStamp,
} from './utils/templates';
import {
  buildPresentationOrder,
  estimateNodeHeight,
  organizeBoardByTemplate,
} from './utils/layout';

function getInitialRoomId(): string {
  const params = new URLSearchParams(window.location.search);
  const existing = params.get('room');
  if (existing && existing.trim()) return existing.trim();
  const generated = `ruang-${crypto.randomUUID().slice(0, 6)}`;
  params.set('room', generated);
  const nextUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
  window.history.replaceState(null, '', nextUrl);
  return generated;
}

function getHashKey(): string | null {
  const hash = window.location.hash;
  if (!hash) return null;
  const match = hash.match(/k=([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

function setHashKey(keyBase64: string | null): void {
  const url = new URL(window.location.href);
  url.hash = keyBase64 ? `k=${keyBase64}` : '';
  window.history.replaceState(null, '', url.toString());
}

function isInvitePasswordMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('invite') === '1' && !getHashKey();
}

const DEFAULT_USER_COLORS = ['#2563EB', '#059669', '#D97706', '#7C3AED', '#0891B2'];

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [roomId, setRoomId] = useState<string>(() => getInitialRoomId());
  const [clientId] = useState<string>(() => `user-${crypto.randomUUID().slice(0, 8)}`);
  const [userName, setUserName] = useState<string>(() => `Kreator-${Math.floor(100 + Math.random() * 900)}`);
  const [userColor, setUserColor] = useState<string>(
    () => DEFAULT_USER_COLORS[Math.floor(Math.random() * DEFAULT_USER_COLORS.length)]
  );

  // Board & History (starts on empty From Scratch canvas)
  const [board, setBoard] = useState<BoardDocument>(() => buildFromScratchBoard(roomId));
  const [past, setPast] = useState<BoardDocument[]>([]);
  const [future, setFuture] = useState<BoardDocument[]>([]);

  // Viewport
  const [pan, setPan] = useState<{ x: number; y: number }>(() => ({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 700,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 420,
  }));
  const [zoom, setZoom] = useState(1);

  // Tools & Selection
  const [tool, setTool] = useState<InteractionTool>('select');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [activeTextTarget, setActiveTextTarget] = useState<NodeTextTarget>('title');
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [autoOrganize, setAutoOrganize] = useState<boolean>(false);
  const autoOrganizeRef = useRef(autoOrganize);
  autoOrganizeRef.current = autoOrganize;
  const edgeColorHistoryTimerRef = useRef<number | null>(null);

  // Modals
  const [showTemplates, setShowTemplates] = useState(false);
  const [showCollab, setShowCollab] = useState(false);
  const [showEncryption, setShowEncryption] = useState(false);
  const [mediaModalNodeId, setMediaModalNodeId] = useState<string | null>(null);
  const [pendingMediaNewNode, setPendingMediaNewNode] = useState(false);

  // Presentation Mode
  const [isPresenting, setIsPresenting] = useState(false);
  const [presentationAutoPlay, setPresentationAutoPlay] = useState(false);
  const prePresentViewportRef = useRef<{ pan: { x: number; y: number }; zoom: number } | null>(null);

  // Export & Toast Feedback
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // E2EE & Server-Authoritative Auth State
  const [e2eeEnabled, setE2eeEnabled] = useState(true);
  const [roomKeyBase64, setRoomKeyBase64] = useState<string | null>(null);
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [keyFingerprint, setKeyFingerprint] = useState<string | null>(null);
  const [pendingEncryptedEnvelope, setPendingEncryptedEnvelope] =
    useState<EncryptedEnvelope | null>(null);
  const [isLockedNeedsPassphrase, setIsLockedNeedsPassphrase] = useState<boolean>(() =>
    isInvitePasswordMode()
  );
  const [authReady, setAuthReady] = useState<boolean>(() => isInvitePasswordMode());
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [cooldownLockedUntil, setCooldownLockedUntil] = useState<number>(0);
  const [failedAuthAttempts, setFailedAuthAttempts] = useState<number>(0);
  const [inviteRoomNotFound, setInviteRoomNotFound] = useState<boolean>(false);
  const [inviteMetaFingerprint, setInviteMetaFingerprint] = useState<string | null>(null);
  const [inviteMetaPeerCount, setInviteMetaPeerCount] = useState<number>(0);
  const isLockedRef = useRef(isLockedNeedsPassphrase);
  isLockedRef.current = isLockedNeedsPassphrase;
  const accessVerifierRef = useRef<string | null>(null);
  const passwordProtectedRef = useRef<boolean>(false);
  const pendingJoinResolverRef = useRef<((ok: boolean) => void) | null>(null);

  // WebSocket Real-time State
  const [wsConnected, setWsConnected] = useState(false);
  const [peers, setPeers] = useState<CollaboratorPresence[]>([]);
  const [roomLifetime, setRoomLifetime] = useState<RoomLifetimeInfo | null>(null);
  const [sessionNowTick, setSessionNowTick] = useState(() => Date.now());
  const [sessionWarningBanner, setSessionWarningBanner] = useState<{
    remainingMinutes: number;
    expiresAt: number;
  } | null>(null);
  const [expiredRoomNotice, setExpiredRoomNotice] = useState<{
    roomId: string;
    lifetimeMinutes: RoomLifetimeMinutes;
    expiredAt: number;
    reason: string;
  } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const syncTimerRef = useRef<number | null>(null);
  const cursorThrottleRef = useRef<number>(0);
  const roomExpiredStopReconnectRef = useRef<boolean>(false);

  // Refs for latest state inside socket callbacks
  const boardRef = useRef(board);
  boardRef.current = board;
  const cryptoKeyRef = useRef(cryptoKey);
  cryptoKeyRef.current = cryptoKey;
  const e2eeEnabledRef = useRef(e2eeEnabled);
  e2eeEnabledRef.current = e2eeEnabled;
  const userNameRef = useRef(userName);
  userNameRef.current = userName;
  const userColorRef = useRef(userColor);
  userColorRef.current = userColor;

  const showToast = useCallback((msg: string, durationMs = 2800) => {
    setToastMsg(msg);
    window.setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, durationMs);
  }, []);

  useEffect(() => {
    if (!roomLifetime || expiredRoomNotice) return;
    setSessionNowTick(Date.now());
    const timer = window.setInterval(() => {
      setSessionNowTick(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [expiredRoomNotice, roomLifetime]);

  // Sync dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  // Initialize E2EE Key & Access Verifier from URL hash or generate fresh key
  useEffect(() => {
    let cancelled = false;
    async function initKey() {
      const existingHash = getHashKey();
      if (existingHash) {
        try {
          const imported = await importRawRoomKey(existingHash);
          const fp = await getKeyFingerprint(imported);
          const verifier = await deriveAccessVerifier(roomId, existingHash);
          if (!cancelled) {
            setRoomKeyBase64(existingHash);
            setCryptoKey(imported);
            cryptoKeyRef.current = imported;
            accessVerifierRef.current = verifier;
            passwordProtectedRef.current = false;
            setKeyFingerprint(fp);
            setE2eeEnabled(true);
            setAuthReady(true);
          }
          return;
        } catch {
          // Fall through to generate a valid key if hash invalid
        }
      }
      if (isInvitePasswordMode()) {
        if (!cancelled) {
          accessVerifierRef.current = null;
          setAuthReady(true);
        }
        return;
      }
      const freshB64 = generateRoomKeyBase64();
      const imported = await importRawRoomKey(freshB64);
      const fp = await getKeyFingerprint(imported);
      const verifier = await deriveAccessVerifier(roomId, freshB64);
      if (!cancelled) {
        setRoomKeyBase64(freshB64);
        setCryptoKey(imported);
        cryptoKeyRef.current = imported;
        accessVerifierRef.current = verifier;
        passwordProtectedRef.current = false;
        setKeyFingerprint(fp);
        setHashKey(freshB64);
        setE2eeEnabled(true);
        setAuthReady(true);
      }
    }
    initKey();
    return () => {
      cancelled = true;
    };
    // Run once on initial boot; room switches explicitly manage keys & verifiers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Broadcast board state (encrypted or plain) over WebSocket
  const transmitBoardSync = useCallback(async (targetBoard: BoardDocument) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    if (e2eeEnabledRef.current && cryptoKeyRef.current) {
      const envelope = await encryptPayload(cryptoKeyRef.current, targetBoard);
      ws.send(
        JSON.stringify({
          type: 'board:sync',
          encrypted: true,
          encryptedEnvelope: envelope,
        })
      );
    } else {
      ws.send(
        JSON.stringify({
          type: 'board:sync',
          encrypted: false,
          plainBoard: targetBoard,
        })
      );
    }
  }, []);

  const scheduleBoardSync = useCallback(
    (nextBoard: BoardDocument) => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
      syncTimerRef.current = window.setTimeout(() => {
        transmitBoardSync(nextBoard);
      }, 90);
    },
    [transmitBoardSync]
  );

  // Try decrypting incoming envelope with current key
  const applyIncomingEnvelope = useCallback(
    async (envelope: EncryptedEnvelope) => {
      const key = cryptoKeyRef.current;
      if (!key) {
        setPendingEncryptedEnvelope(envelope);
        setIsLockedNeedsPassphrase(true);
        return;
      }
      try {
        const decrypted = await decryptPayload<BoardDocument>(key, envelope);
        setBoard(decrypted);
        setPendingEncryptedEnvelope(null);
        setIsLockedNeedsPassphrase(false);
        setDecryptError(null);
      } catch {
        // Key mismatch — likely room uses a custom passphrase
        setPendingEncryptedEnvelope(envelope);
        setIsLockedNeedsPassphrase(true);
        setDecryptError(null);
      }
    },
    []
  );

  // Real WebSocket Connection Lifecycle with Server-First Auth & Auto-Reconnect
  useEffect(() => {
    if (!authReady) return;

    let unmounted = false;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;
    let reconnectDelay = 1800;
    roomExpiredStopReconnectRef.current = false;

    function connect() {
      if (unmounted || roomExpiredStopReconnectRef.current) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      let ws: WebSocket;
      try {
        ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      } catch {
        reconnectTimer = window.setTimeout(connect, reconnectDelay);
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmounted) {
          ws.close();
          return;
        }
        reconnectDelay = 1800;
        setWsConnected(true);
        if (ws.readyState === WebSocket.OPEN) {
          const verifier = !isLockedRef.current ? accessVerifierRef.current : null;
          ws.send(
            JSON.stringify({
              type: 'room:join',
              roomId,
              clientId,
              name: userNameRef.current,
              color: userColorRef.current,
              accessVerifier: verifier,
              isInvite: isLockedRef.current || isInvitePasswordMode(),
              passwordProtected: passwordProtectedRef.current,
              authAttempt: false,
            })
          );
        }
        pingTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'room:ping' }));
          }
        }, 20000);
      };

      ws.onerror = () => {
        // Handled gracefully by onclose reconnect cycle
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'room:init') {
            setInviteRoomNotFound(false);
            setCooldownLockedUntil(0);
            setFailedAuthAttempts(0);
            if (Array.isArray(msg.peers)) {
              setPeers(msg.peers);
            }
            if (msg.lifetime) {
              setRoomLifetime(msg.lifetime);
              setSessionWarningBanner(null);
            }
            if (msg.encrypted && msg.encryptedEnvelope) {
              setE2eeEnabled(true);
              await applyIncomingEnvelope(msg.encryptedEnvelope);
            } else if (!msg.encrypted && msg.plainBoard) {
              setE2eeEnabled(false);
              setIsLockedNeedsPassphrase(false);
              setDecryptError(null);
              setBoard(msg.plainBoard);
            } else {
              setIsLockedNeedsPassphrase(false);
              setDecryptError(null);
              await transmitBoardSync(boardRef.current);
            }
            if (pendingJoinResolverRef.current) {
              const resolve = pendingJoinResolverRef.current;
              pendingJoinResolverRef.current = null;
              resolve(true);
            }
          } else if (msg.type === 'room:auth-required') {
            setIsLockedNeedsPassphrase(true);
            setInviteRoomNotFound(false);
            setInviteMetaFingerprint(msg.keyFingerprint ?? null);
            setInviteMetaPeerCount(Number(msg.peers) || 0);
            if (msg.lifetime) {
              setRoomLifetime(msg.lifetime);
            }
            if (msg.lockedUntil && Number(msg.lockedUntil) > Date.now()) {
              setCooldownLockedUntil(Number(msg.lockedUntil));
              setFailedAuthAttempts(Number(msg.attempts) || 0);
            }
            if (getHashKey()) {
              setHashKey(null);
            }
            if (pendingJoinResolverRef.current) {
              const resolve = pendingJoinResolverRef.current;
              pendingJoinResolverRef.current = null;
              resolve(false);
            }
          } else if (msg.type === 'room:auth-failed') {
            setIsLockedNeedsPassphrase(true);
            setInviteRoomNotFound(false);
            setDecryptError(
              msg.error || 'Kata sandi proyek tidak cocok. Periksa kembali kata sandi Anda.'
            );
            if (msg.lockedUntil) {
              setCooldownLockedUntil(Number(msg.lockedUntil));
            }
            if (typeof msg.attempts === 'number') {
              setFailedAuthAttempts(msg.attempts);
            }
            if (pendingJoinResolverRef.current) {
              const resolve = pendingJoinResolverRef.current;
              pendingJoinResolverRef.current = null;
              resolve(false);
            }
          } else if (msg.type === 'room:not-found') {
            setIsLockedNeedsPassphrase(true);
            setInviteRoomNotFound(true);
            setDecryptError(
              msg.error || 'Room kolaborasi tidak ditemukan atau masa sesi telah berakhir.'
            );
            if (pendingJoinResolverRef.current) {
              const resolve = pendingJoinResolverRef.current;
              pendingJoinResolverRef.current = null;
              resolve(false);
            }
          } else if (msg.type === 'room:error') {
            if (msg.error) {
              showToast(msg.error, 4000);
            }
            if (pendingJoinResolverRef.current) {
              const resolve = pendingJoinResolverRef.current;
              pendingJoinResolverRef.current = null;
              resolve(false);
            }
          } else if (msg.type === 'room:access-updated') {
            showToast(
              `Pengaturan kata sandi akses diperbarui oleh ${msg.updatedBy || 'Pemilik Room'}.`,
              3500
            );
          } else if (msg.type === 'room:lifetime-updated') {
            if (msg.lifetime) {
              setRoomLifetime(msg.lifetime);
              setSessionWarningBanner(null);
              const optLabel =
                ROOM_LIFETIME_OPTIONS.find((o) => o.value === msg.lifetime.lifetimeMinutes)
                  ?.label ?? `${msg.lifetime.lifetimeMinutes} menit`;
              const endClock = new Date(msg.lifetime.expiresAt).toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
              });
              showToast(
                `Batas masa hidup room diatur ke ${optLabel} oleh ${msg.updatedBy || 'Kolaborator'} (berakhir pukul ${endClock}).`,
                4200
              );
            }
          } else if (msg.type === 'room:warning') {
            const rem = Number(msg.remainingMinutes) || 1;
            setSessionWarningBanner({
              remainingMinutes: rem,
              expiresAt: Number(msg.expiresAt) || Date.now() + rem * 60_000,
            });
            showToast(
              `Peringatan: Room akan ditutup paksa & dihapus dalam ${rem} menit!`,
              5000
            );
          } else if (msg.type === 'room:expired') {
            roomExpiredStopReconnectRef.current = true;
            setWsConnected(false);
            setPeers([]);
            setRoomLifetime(null);
            setSessionWarningBanner(null);
            setShowCollab(false);
            setExpiredRoomNotice({
              roomId: msg.roomId || roomId,
              lifetimeMinutes: msg.lifetimeMinutes || 120,
              expiredAt: msg.expiredAt || Date.now(),
              reason:
                msg.reason ||
                'Batas masa hidup pemakaian room kolaborasi telah habis.',
            });
            showToast(
              'Waktu pemakaian room habis. Koneksi WebSocket diputus & room dihapus.',
              5000
            );
          } else if (msg.type === 'board:updated') {
            if (msg.senderId === clientId) return;
            if (msg.encrypted && msg.encryptedEnvelope) {
              setE2eeEnabled(true);
              await applyIncomingEnvelope(msg.encryptedEnvelope);
            } else if (!msg.encrypted && msg.plainBoard) {
              setE2eeEnabled(false);
              setBoard(msg.plainBoard);
            }
          } else if (msg.type === 'presence:list') {
            if (Array.isArray(msg.peers)) {
              setPeers(msg.peers);
            }
          } else if (msg.type === 'cursor:moved') {
            setPeers((prev) =>
              prev.map((p) =>
                p.clientId === msg.clientId
                  ? {
                      ...p,
                      cursor: msg.cursor,
                      selectedNodeId: msg.selectedNodeId,
                      lastSeen: Date.now(),
                    }
                  : p
              )
            );
          }
        } catch (err) {
          console.error('WS parse error:', err);
        }
      };

      ws.onclose = (closeEvent) => {
        if (pingTimer) {
          window.clearInterval(pingTimer);
          pingTimer = null;
        }
        if (unmounted) return;
        setWsConnected(false);
        if (pendingJoinResolverRef.current) {
          const resolve = pendingJoinResolverRef.current;
          pendingJoinResolverRef.current = null;
          resolve(false);
        }
        if (closeEvent.code === 4001 || roomExpiredStopReconnectRef.current) {
          roomExpiredStopReconnectRef.current = true;
          setPeers([]);
          setRoomLifetime(null);
          setSessionWarningBanner(null);
          setExpiredRoomNotice((prev) =>
            prev ?? {
              roomId,
              lifetimeMinutes: 120,
              expiredAt: Date.now(),
              reason: 'Batas masa hidup pemakaian room kolaborasi telah habis.',
            }
          );
          return;
        }
        reconnectTimer = window.setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(10000, Math.round(reconnectDelay * 1.5));
      };
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (pingTimer) window.clearInterval(pingTimer);
      const current = wsRef.current;
      if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) {
        current.close();
      }
      wsRef.current = null;
    };
  }, [authReady, roomId, clientId, applyIncomingEnvelope, showToast, transmitBoardSync]);

  // Helper to commit board mutations with Undo/Redo & Real-time E2EE Sync
  const commitBoardChange = useCallback(
    (
      updater: (prev: BoardDocument) => BoardDocument,
      recordHistory = true,
      allowAutoOrganize = false
    ) => {
      setBoard((prev) => {
        let next = updater(prev);
        if (allowAutoOrganize && autoOrganizeRef.current) {
          next = organizeBoardByTemplate(next);
        }
        next.updatedAt = Date.now();
        if (recordHistory) {
          setPast((p) => [...p.slice(-39), prev]);
          setFuture([]);
        }
        scheduleBoardSync(next);
        return next;
      });
    },
    [scheduleBoardSync]
  );

  const handleUndo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      setFuture((f) => [boardRef.current, ...f]);
      setBoard(previous);
      scheduleBoardSync(previous);
      return p.slice(0, -1);
    });
  }, [scheduleBoardSync]);

  const handleRedo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setPast((p) => [...p, boardRef.current]);
      setBoard(next);
      scheduleBoardSync(next);
      return f.slice(1);
    });
  }, [scheduleBoardSync]);

  // Node CRUD handlers
  const getViewportCenterWorld = useCallback(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return {
      x: Math.round((w / 2 - pan.x) / zoom - 124),
      y: Math.round((h / 2 - pan.y) / zoom - 48),
    };
  }, [pan.x, pan.y, zoom]);

  const getDefaultEdgeStyle = useCallback((tpl: TemplateId): ConnectorStyle => {
    if (tpl === 'fishbone') return 'fishbone';
    if (tpl === 'tree') return 'orthogonal';
    if (tpl === 'star-bursting' || tpl === 'lotus-blossom') return 'straight';
    return 'bezier';
  }, []);

  const handleAddFloatingNode = useCallback(() => {
    const center = getViewportCenterWorld();
    const jitterX = Math.round((Math.random() - 0.5) * 80);
    const jitterY = Math.round((Math.random() - 0.5) * 60);
    const node = createBlankNode({
      x: center.x + jitterX,
      y: center.y + jitterY,
      title: 'Gagasan Baru',
    });
    commitBoardChange((prev) => ({
      ...prev,
      nodes: [...prev.nodes, node],
    }));
    setSelectedNodeId(node.id);
    setTool('select');
  }, [commitBoardChange, getViewportCenterWorld]);

  const handleSpawnChild = useCallback(
    (parentId: string) => {
      const parent = boardRef.current.nodes.find((n) => n.id === parentId);
      if (!parent) return;

      const existingSiblings = boardRef.current.nodes.filter((n) => n.parentId === parentId);
      const offsetIndex = existingSiblings.length;

      let childX = parent.x + parent.width + 96;
      let childY = parent.y + (offsetIndex - 0.5) * 120;

      if (boardRef.current.templateId === 'tree') {
        childX = parent.x + (offsetIndex - 0.5) * 260;
        childY = parent.y + 185;
      } else if (parent.x < -80 && boardRef.current.templateId === 'mind-mapping') {
        // Branch left if parent is on left hemisphere
        childX = parent.x - 290;
      }

      const child = createBlankNode({
        parentId: parent.id,
        x: Math.round(childX),
        y: Math.round(childY),
        title: 'Sub-Ide',
        accentColor: parent.accentColor,
      });

      const edge: CanvasEdge = {
        id: `edge-${parent.id}-${child.id}`,
        sourceId: parent.id,
        targetId: child.id,
        color: parent.accentColor,
        style: getDefaultEdgeStyle(boardRef.current.templateId),
      };

      commitBoardChange(
        (prev) => ({
          ...prev,
          nodes: prev.nodes
            .map((n) => (n.id === parent.id ? { ...n, collapsed: false } : n))
            .concat(child),
          edges: [...prev.edges, edge],
        }),
        true,
        true
      );
      setSelectedNodeId(child.id);
    },
    [commitBoardChange, getDefaultEdgeStyle]
  );

  const handleAddTableNode = useCallback(() => {
    const center = getViewportCenterWorld();
    const node = createBlankNode({
      kind: 'table',
      x: center.x - 50,
      y: center.y,
      width: 380,
      title: 'Tabel Data Terstruktur',
      accentColor: '#D97706',
      surfaceColor: '#FFFBEB',
      table: createDefaultTable(),
    });
    commitBoardChange((prev) => ({
      ...prev,
      nodes: [...prev.nodes, node],
    }));
    setSelectedNodeId(node.id);
  }, [commitBoardChange, getViewportCenterWorld]);

  const handleAddStickyNote = useCallback(() => {
    const center = getViewportCenterWorld();
    const node = createBlankNode({
      kind: 'note',
      x: center.x,
      y: center.y,
      width: 240,
      title: 'Catatan Cepat',
      body: 'Tulis poin penting atau ringkasan rapat di sini.',
      surfaceColor: '#FFFBEB',
      accentColor: '#D97706',
      timestampStamp: formatStamp(new Date(), 'full'),
    });
    commitBoardChange((prev) => ({
      ...prev,
      nodes: [...prev.nodes, node],
    }));
    setSelectedNodeId(node.id);
  }, [commitBoardChange, getViewportCenterWorld]);

  const handleMoveNode = useCallback(
    (nodeId: string, x: number, y: number, commit = false) => {
      if (commit) {
        commitBoardChange(
          (prev) => ({
            ...prev,
            nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)),
          }),
          false
        );
      } else {
        setBoard((prev) => {
          const next = {
            ...prev,
            nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)),
          };
          scheduleBoardSync(next);
          return next;
        });
      }
    },
    [commitBoardChange, scheduleBoardSync]
  );

  const handleUpdateNode = useCallback(
    (nodeId: string, patch: Partial<CanvasNode>) => {
      const shouldReorganize = patch.collapsed !== undefined;
      commitBoardChange(
        (prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
        }),
        true,
        shouldReorganize
      );
    },
    [commitBoardChange]
  );

  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      const target = boardRef.current.nodes.find((n) => n.id === nodeId);
      if (!target) return;
      const copy: CanvasNode = {
        ...structuredClone(target),
        id: `node-${crypto.randomUUID().slice(0, 8)}`,
        x: target.x + 36,
        y: target.y + 36,
        title: `${target.title} (Salinan)`,
      };
      commitBoardChange((prev) => ({
        ...prev,
        nodes: [...prev.nodes, copy],
      }));
      setSelectedNodeId(copy.id);
    },
    [commitBoardChange]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      commitBoardChange(
        (prev) => ({
          ...prev,
          nodes: prev.nodes
            .filter((n) => n.id !== nodeId)
            .map((n) => (n.parentId === nodeId ? { ...n, parentId: null } : n)),
          edges: prev.edges.filter((e) => e.sourceId !== nodeId && e.targetId !== nodeId),
        }),
        true,
        true
      );
      if (selectedNodeId === nodeId) setSelectedNodeId(null);
      if (connectSourceId === nodeId) setConnectSourceId(null);
      setSelectedEdgeId((prev) => {
        if (!prev) return null;
        const stillExists = boardRef.current.edges.some(
          (e) => e.id === prev && e.sourceId !== nodeId && e.targetId !== nodeId
        );
        return stillExists ? prev : null;
      });
    },
    [commitBoardChange, connectSourceId, selectedNodeId]
  );

  const handleConnectClick = useCallback(
    (nodeId: string) => {
      if (!connectSourceId) {
        setConnectSourceId(nodeId);
        setTool('connect');
        showToast('Pilih node tujuan untuk membuat koneksi cabang.');
        return;
      }
      if (connectSourceId === nodeId) {
        setConnectSourceId(null);
        return;
      }
      const exists = boardRef.current.edges.some(
        (e) =>
          (e.sourceId === connectSourceId && e.targetId === nodeId) ||
          (e.sourceId === nodeId && e.targetId === connectSourceId)
      );
      if (!exists) {
        const srcNode = boardRef.current.nodes.find((n) => n.id === connectSourceId);
        const newEdge: CanvasEdge = {
          id: `edge-${crypto.randomUUID().slice(0, 8)}`,
          sourceId: connectSourceId,
          targetId: nodeId,
          color: srcNode?.accentColor || '#2563EB',
          style: getDefaultEdgeStyle(boardRef.current.templateId),
        };
        commitBoardChange(
          (prev) => ({
            ...prev,
            nodes: prev.nodes.map((n) =>
              n.id === nodeId && !n.parentId ? { ...n, parentId: connectSourceId } : n
            ),
            edges: [...prev.edges, newEdge],
          }),
          true,
          true
        );
        showToast('Kedua node berhasil dihubungkan.');
      } else {
        showToast('Kedua node tersebut sudah terhubung.');
      }
      setConnectSourceId(null);
      setTool('select');
    },
    [commitBoardChange, connectSourceId, getDefaultEdgeStyle, showToast]
  );

  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      commitBoardChange((prev) => {
        const targetEdge = prev.edges.find((e) => e.id === edgeId);
        if (!targetEdge) return prev;
        const remainingEdges = prev.edges.filter((e) => e.id !== edgeId);
        return {
          ...prev,
          nodes: prev.nodes.map((n) => {
            if (n.id === targetEdge.targetId && n.parentId === targetEdge.sourceId) {
              return { ...n, parentId: null };
            }
            if (n.id === targetEdge.sourceId && n.parentId === targetEdge.targetId) {
              return { ...n, parentId: null };
            }
            return n;
          }),
          edges: remainingEdges,
        };
      });
      if (selectedEdgeId === edgeId) setSelectedEdgeId(null);
      showToast('Garis penghubung dihapus.');
    },
    [commitBoardChange, selectedEdgeId, showToast]
  );

  const handleUpdateEdgesColor = useCallback(
    (edgeIds: string[], color: string, live = false) => {
      if (edgeIds.length === 0) return;
      const targetSet = new Set(edgeIds);
      let shouldRecordHistory = true;

      if (live) {
        if (edgeColorHistoryTimerRef.current !== null) {
          shouldRecordHistory = false;
          window.clearTimeout(edgeColorHistoryTimerRef.current);
        }
        edgeColorHistoryTimerRef.current = window.setTimeout(() => {
          edgeColorHistoryTimerRef.current = null;
        }, 700);
      } else if (edgeColorHistoryTimerRef.current !== null) {
        window.clearTimeout(edgeColorHistoryTimerRef.current);
        edgeColorHistoryTimerRef.current = null;
      }

      commitBoardChange(
        (prev) => ({
          ...prev,
          edges: prev.edges.map((e) => (targetSet.has(e.id) ? { ...e, color } : e)),
        }),
        shouldRecordHistory
      );
    },
    [commitBoardChange]
  );

  // Stamp Day & Time handler
  const handleInsertDateTimeStamp = useCallback(
    (formattedStamp: string) => {
      if (selectedNodeId) {
        handleUpdateNode(selectedNodeId, { timestampStamp: formattedStamp });
        showToast(`Stamp waktu disisipkan: ${formattedStamp}`);
      } else {
        const center = getViewportCenterWorld();
        const node = createBlankNode({
          kind: 'note',
          x: center.x,
          y: center.y,
          title: `Catatan Waktu`,
          body: 'Ide atau keputusan rapat tercatat pada stempel waktu di bawah.',
          timestampStamp: formattedStamp,
          surfaceColor: '#EFF6FF',
          accentColor: '#2563EB',
        });
        commitBoardChange((prev) => ({
          ...prev,
          nodes: [...prev.nodes, node],
        }));
        setSelectedNodeId(node.id);
        showToast(`Node baru dibuat dengan stamp: ${formattedStamp}`);
      }
    },
    [commitBoardChange, getViewportCenterWorld, handleUpdateNode, selectedNodeId, showToast]
  );

  // Zoom & Fit handlers
  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(2.5, Number((z + 0.15).toFixed(2))));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(0.25, Number((z - 0.15).toFixed(2))));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
  }, []);

  const handleFitView = useCallback(() => {
    const nodes = boardRef.current.nodes;
    if (nodes.length === 0) {
      setPan({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      setZoom(1);
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + 180);
    }
    const worldW = Math.max(300, maxX - minX + 180);
    const worldH = Math.max(250, maxY - minY + 200);
    const isMobile = window.innerWidth < 768;
    const vw = window.innerWidth - (isMobile ? 32 : 120);
    const vh = window.innerHeight - (isMobile ? 140 : 160);
    const nextZoom = Math.min(1.2, Math.max(0.3, Math.min(vw / worldW, vh / worldH)));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setZoom(nextZoom);
    setPan({
      x: window.innerWidth / 2 - centerX * nextZoom,
      y: window.innerHeight / 2 - centerY * nextZoom,
    });
  }, []);

  // Apply Template (sample board)
  const handleApplyTemplate = useCallback(
    (tplId: TemplateId) => {
      const next = buildTemplateBoard(tplId, roomId);
      commitBoardChange(() => next);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setTimeout(() => handleFitView(), 60);
      showToast(`Template "${next.title}" diterapkan.`);
    },
    [commitBoardChange, handleFitView, roomId, showToast]
  );

  // Create Empty Canvas (From Scratch)
  const handleCreateFromScratch = useCallback(() => {
    const next = buildFromScratchBoard(roomId);
    commitBoardChange(() => next);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setConnectSourceId(null);
    setTool('select');
    setPan({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    setZoom(1);
    showToast('Kanvas kosong (From Scratch) siap digunakan.');
  }, [commitBoardChange, roomId, showToast]);

  // Organize / Realign existing nodes into template pattern
  const handleOrganizeLayout = useCallback(
    (targetTemplateId?: TemplateId) => {
      commitBoardChange((prev) => organizeBoardByTemplate(prev, targetTemplateId));
      setTimeout(() => handleFitView(), 60);
      const activeName = targetTemplateId ?? boardRef.current.templateId;
      showToast(`Tata letak dirapikan sesuai pola ${activeName}.`);
    },
    [commitBoardChange, handleFitView, showToast]
  );

  const handleToggleAutoOrganize = useCallback(() => {
    setAutoOrganize((prev) => {
      const next = !prev;
      if (next) {
        commitBoardChange((b) => organizeBoardByTemplate(b));
        setTimeout(() => handleFitView(), 60);
        showToast('Auto-Rapikan diaktifkan: cabang otomatis tersusun rapi.');
      } else {
        showToast('Auto-Rapikan dimatikan.');
      }
      return next;
    });
  }, [commitBoardChange, handleFitView, showToast]);

  // Presentation Mode: sequential node ordering & camera focus
  const presentationOrder = useMemo(
    () => buildPresentationOrder(board.nodes, board.edges, board.templateId),
    [board.edges, board.nodes, board.templateId]
  );

  const presentationIndex = useMemo(() => {
    if (presentationOrder.length === 0) return -1;
    const idx = selectedNodeId ? presentationOrder.findIndex((n) => n.id === selectedNodeId) : -1;
    return idx >= 0 ? idx : 0;
  }, [presentationOrder, selectedNodeId]);

  const focusNodeInViewport = useCallback((node: CanvasNode) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const nodeW = node.width || 248;
    const nodeH = estimateNodeHeight(node);
    const marginX = vw < 640 ? 44 : 160;
    const marginY = vh < 640 ? 156 : 190;
    const availW = Math.max(220, vw - marginX);
    const availH = Math.max(180, vh - marginY);
    const fitZoom = Math.min(availW / (nodeW + 56), availH / (nodeH + 56));
    const targetZoom = Math.min(2.15, Math.max(0.8, Number(fitZoom.toFixed(2))));

    const nodeCenterX = node.x + nodeW / 2;
    const nodeCenterY = node.y + nodeH / 2;
    const safeCenterY = (vh - 68) / 2;

    setZoom(targetZoom);
    setPan({
      x: vw / 2 - nodeCenterX * targetZoom,
      y: safeCenterY - nodeCenterY * targetZoom,
    });
  }, []);

  const handleStartPresentation = useCallback(() => {
    if (presentationOrder.length === 0) {
      showToast('Tambahkan minimal satu node terlebih dahulu untuk memulai presentasi.');
      return;
    }
    prePresentViewportRef.current = { pan, zoom };
    const startNode =
      (selectedNodeId ? presentationOrder.find((n) => n.id === selectedNodeId) : null) ??
      presentationOrder[0];

    setShowTemplates(false);
    setShowCollab(false);
    setShowEncryption(false);
    setMediaModalNodeId(null);
    setConnectSourceId(null);
    setSelectedEdgeId(null);
    setTool('select');
    setPresentationAutoPlay(false);
    setIsPresenting(true);
    setSelectedNodeId(startNode.id);
    focusNodeInViewport(startNode);
  }, [focusNodeInViewport, pan, presentationOrder, selectedNodeId, showToast, zoom]);

  const handleExitPresentation = useCallback(() => {
    setIsPresenting(false);
    setPresentationAutoPlay(false);
    if (prePresentViewportRef.current) {
      setPan(prePresentViewportRef.current.pan);
      setZoom(prePresentViewportRef.current.zoom);
      prePresentViewportRef.current = null;
    }
  }, []);

  const handleStepPresentation = useCallback(
    (delta: -1 | 1) => {
      if (presentationOrder.length === 0) return;
      const baseIdx = presentationIndex >= 0 ? presentationIndex : 0;
      const nextIdx = (baseIdx + delta + presentationOrder.length) % presentationOrder.length;
      const nextNode = presentationOrder[nextIdx];
      setSelectedNodeId(nextNode.id);
      focusNodeInViewport(nextNode);
    },
    [focusNodeInViewport, presentationIndex, presentationOrder]
  );

  const handleSelectNode = useCallback(
    (nodeId: string | null) => {
      if (nodeId !== selectedNodeId) {
        setActiveTextTarget('title');
      }
      setSelectedNodeId(nodeId);
      if (nodeId) setSelectedEdgeId(null);
      if (isPresenting && nodeId) {
        const target = boardRef.current.nodes.find((n) => n.id === nodeId);
        if (target) focusNodeInViewport(target);
      }
    },
    [focusNodeInViewport, isPresenting, selectedNodeId]
  );

  const handleSelectEdge = useCallback(
    (edgeId: string | null) => {
      if (isPresenting) return;
      setSelectedEdgeId(edgeId);
      if (edgeId) setSelectedNodeId(null);
    },
    [isPresenting]
  );

  const handleFocusTextTarget = useCallback(
    (nodeId: string, target: NodeTextTarget) => {
      setSelectedNodeId(nodeId);
      setSelectedEdgeId(null);
      setActiveTextTarget(target);
    },
    []
  );

  useEffect(() => {
    if (!isPresenting || !presentationAutoPlay || presentationOrder.length <= 1) return;
    const timer = window.setInterval(() => {
      handleStepPresentation(1);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [handleStepPresentation, isPresenting, presentationAutoPlay, presentationOrder.length]);

  // Save Visual Media to existing or newly created node
  const handleSaveMedia = useCallback(
    (media: MediaAttachment | null) => {
      if (pendingMediaNewNode && media) {
        const center = getViewportCenterWorld();
        const node = createBlankNode({
          kind: 'media',
          x: center.x,
          y: center.y,
          width: 280,
          title: media.caption || 'Media Visual',
          media,
          accentColor: '#2563EB',
        });
        commitBoardChange((prev) => ({
          ...prev,
          nodes: [...prev.nodes, node],
        }));
        setSelectedNodeId(node.id);
      } else if (mediaModalNodeId) {
        handleUpdateNode(mediaModalNodeId, { media });
      }
      setPendingMediaNewNode(false);
      setMediaModalNodeId(null);
    },
    [
      commitBoardChange,
      getViewportCenterWorld,
      handleUpdateNode,
      mediaModalNodeId,
      pendingMediaNewNode,
    ]
  );

  // Cursor broadcasting
  const handleCursorMove = useCallback(
    (worldPos: { x: number; y: number } | null) => {
      const now = performance.now();
      if (now - cursorThrottleRef.current < 65) return;
      cursorThrottleRef.current = now;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'cursor:move',
            cursor: worldPos,
            selectedNodeId,
          })
        );
      }
    },
    [selectedNodeId]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (!isInput) {
          e.preventDefault();
          if (e.shiftKey) handleRedo();
          else handleUndo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        if (!isInput) {
          e.preventDefault();
          handleRedo();
        }
        return;
      }

      if (isInput) return;

      if (isPresenting) {
        if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          handleExitPresentation();
        } else if (
          e.key === 'ArrowRight' ||
          e.key === 'ArrowDown' ||
          e.key === 'PageDown' ||
          e.key === ' ' ||
          e.key === 'Enter'
        ) {
          e.preventDefault();
          handleStepPresentation(1);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
          e.preventDefault();
          handleStepPresentation(-1);
        }
        return;
      }

      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        handleStartPresentation();
      }
      if (e.key === 'v' || e.key === 'V') setTool('select');
      if (e.key === 'h' || e.key === 'H') setTool('pan');
      if (e.key === 'c' || e.key === 'C') setTool('connect');
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        handleAddFloatingNode();
      }
      if (e.key === 'Tab' && selectedNodeId) {
        e.preventDefault();
        handleSpawnChild(selectedNodeId);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        e.preventDefault();
        handleDeleteNode(selectedNodeId);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdgeId) {
        e.preventDefault();
        handleDeleteEdge(selectedEdgeId);
      }
      if (e.key === '=' || e.key === '+') handleZoomIn();
      if (e.key === '-') handleZoomOut();
      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        handleOrganizeLayout();
      }
      if (e.key === 'Escape') {
        setConnectSourceId(null);
        setSelectedEdgeId(null);
        setTool('select');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleAddFloatingNode,
    handleDeleteEdge,
    handleDeleteNode,
    handleExitPresentation,
    handleOrganizeLayout,
    handleRedo,
    handleSpawnChild,
    handleStartPresentation,
    handleStepPresentation,
    handleUndo,
    handleZoomIn,
    handleZoomOut,
    isPresenting,
    selectedEdgeId,
    selectedNodeId,
  ]);

  // E2EE & Server Access Controls
  const handleToggleE2ee = async (enabled: boolean) => {
    setE2eeEnabled(enabled);
    e2eeEnabledRef.current = enabled;
    if (enabled && !cryptoKey) {
      const b64 = generateRoomKeyBase64();
      const k = await importRawRoomKey(b64);
      const fp = await getKeyFingerprint(k);
      const verifier = await deriveAccessVerifier(roomId, b64);
      setRoomKeyBase64(b64);
      setCryptoKey(k);
      cryptoKeyRef.current = k;
      accessVerifierRef.current = verifier;
      passwordProtectedRef.current = false;
      setKeyFingerprint(fp);
      setHashKey(b64);
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'room:set-access',
            accessVerifier: verifier,
            passwordProtected: false,
          })
        );
      }
    } else if (!enabled) {
      setHashKey(null);
    } else if (enabled && roomKeyBase64) {
      setHashKey(roomKeyBase64);
    }
    await transmitBoardSync(boardRef.current);
  };

  const handleSetPassphrase = async (passphrase: string) => {
    const { key, keyBase64Url, accessVerifier } = await deriveAccessVerifierFromPassphrase(
      passphrase,
      roomId
    );
    const fp = await getKeyFingerprint(key);
    setCryptoKey(key);
    cryptoKeyRef.current = key;
    accessVerifierRef.current = accessVerifier;
    passwordProtectedRef.current = true;
    setRoomKeyBase64(keyBase64Url);
    setKeyFingerprint(fp);
    setE2eeEnabled(true);
    e2eeEnabledRef.current = true;
    // Strip key from URL hash so passphrase stays secret
    setHashKey(null);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'room:set-access',
          accessVerifier,
          passwordProtected: true,
        })
      );
    }
    await transmitBoardSync(boardRef.current);
    showToast('Kata sandi kuat & verifikasi server diterapkan.');
  };

  const handleRotateRandomKey = async () => {
    const b64 = generateRoomKeyBase64();
    const k = await importRawRoomKey(b64);
    const fp = await getKeyFingerprint(k);
    const verifier = await deriveAccessVerifier(roomId, b64);
    setCryptoKey(k);
    cryptoKeyRef.current = k;
    accessVerifierRef.current = verifier;
    passwordProtectedRef.current = false;
    setRoomKeyBase64(b64);
    setKeyFingerprint(fp);
    setHashKey(b64);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'room:set-access',
          accessVerifier: verifier,
          passwordProtected: false,
        })
      );
    }
    await transmitBoardSync(boardRef.current);
    showToast('Kunci enkripsi 256-bit baru dibuat.');
  };

  const handleInviteLoginSubmit = async ({
    name,
    color,
    passphrase,
  }: {
    name: string;
    color: string;
    passphrase: string;
  }): Promise<boolean> => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setDecryptError('Server belum terhubung. Tunggu sebentar lalu coba lagi.');
      return false;
    }

    setDecryptError(null);
    setUserName(name);
    userNameRef.current = name;
    setUserColor(color);
    userColorRef.current = color;

    const { key, keyBase64Url, accessVerifier } = await deriveAccessVerifierFromPassphrase(
      passphrase,
      roomId
    );
    const fp = await getKeyFingerprint(key);

    // Hold candidate credentials until server verifies accessVerifier before sending room:init
    cryptoKeyRef.current = key;
    setCryptoKey(key);
    setRoomKeyBase64(keyBase64Url);
    setKeyFingerprint(fp);
    accessVerifierRef.current = accessVerifier;
    passwordProtectedRef.current = true;

    const verified = await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        if (pendingJoinResolverRef.current === finish) {
          pendingJoinResolverRef.current = null;
        }
        resolve(ok);
      };
      const timeoutId = window.setTimeout(() => finish(false), 10000);
      pendingJoinResolverRef.current = finish;

      ws.send(
        JSON.stringify({
          type: 'room:join',
          roomId,
          clientId,
          name,
          color,
          accessVerifier,
          isInvite: true,
          authAttempt: true,
        })
      );
    });

    if (!verified) {
      accessVerifierRef.current = null;
      return false;
    }

    const url = new URL(window.location.href);
    url.searchParams.delete('invite');
    url.hash = '';
    window.history.replaceState(null, '', url.toString());

    showToast(`Selamat datang, ${name}! Verifikasi server & dekripsi berhasil.`);
    return true;
  };

  const handleCreateOwnRoom = async (keepCurrentCanvas = false) => {
    const newRoomId = `ruang-${crypto.randomUUID().slice(0, 6)}`;
    const freshB64 = generateRoomKeyBase64();
    const imported = await importRawRoomKey(freshB64);
    const fp = await getKeyFingerprint(imported);
    const verifier = await deriveAccessVerifier(newRoomId, freshB64);

    roomExpiredStopReconnectRef.current = false;
    setExpiredRoomNotice(null);
    setSessionWarningBanner(null);
    setRoomLifetime(null);
    setRoomKeyBase64(freshB64);
    setCryptoKey(imported);
    cryptoKeyRef.current = imported;
    accessVerifierRef.current = verifier;
    passwordProtectedRef.current = false;
    setKeyFingerprint(fp);
    setE2eeEnabled(true);
    e2eeEnabledRef.current = true;
    setPendingEncryptedEnvelope(null);
    setIsLockedNeedsPassphrase(false);
    setInviteRoomNotFound(false);
    setCooldownLockedUntil(0);
    setFailedAuthAttempts(0);
    setDecryptError(null);
    if (keepCurrentCanvas) {
      setBoard((prev) => ({ ...prev, id: newRoomId, updatedAt: Date.now() }));
    } else {
      setBoard(buildFromScratchBoard(newRoomId));
    }

    const url = new URL(window.location.href);
    url.searchParams.set('room', newRoomId);
    url.searchParams.delete('invite');
    url.hash = `k=${freshB64}`;
    window.history.replaceState(null, '', url.toString());
    setRoomId(newRoomId);
    showToast(`Ruang baru "${newRoomId}" dibuat.`);
  };

  // Multi-format Export Handler
  const handleExport = async (format: ExportFormat) => {
    setExportingFormat(format);
    try {
      if (format === 'png') await exportAsPng(board, darkMode);
      else if (format === 'pdf') await exportAsPdf(board, darkMode);
      else if (format === 'docx') await exportAsDocx(board);
      else if (format === 'pptx') await exportAsPptx(board, darkMode);
      else if (format === 'md') exportAsMarkdown(board);
      showToast(`Ekspor ${format.toUpperCase()} selesai diunduh.`);
    } catch (err) {
      console.error('Export failed:', err);
      showToast(`Gagal mengekspor ${format.toUpperCase()}.`);
    } finally {
      setExportingFormat(null);
    }
  };

  // Collaboration Profile / Room Switching
  const handleUpdateProfile = (name: string, color: string) => {
    setUserName(name);
    userNameRef.current = name;
    setUserColor(color);
    userColorRef.current = color;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'presence:update', name, color }));
    }
    showToast('Profil kolaborator diperbarui.');
  };

  const handleJoinRoom = async (nextRoomId: string) => {
    roomExpiredStopReconnectRef.current = false;
    setExpiredRoomNotice(null);
    setSessionWarningBanner(null);
    setRoomLifetime(null);
    setInviteRoomNotFound(false);
    setCooldownLockedUntil(0);
    setFailedAuthAttempts(0);
    setDecryptError(null);

    let roomExists = false;
    try {
      const resp = await fetch(`/api/rooms/${encodeURIComponent(nextRoomId)}`);
      if (resp.ok) {
        const info = await resp.json();
        roomExists = Boolean(info?.exists);
      }
    } catch {
      // Fallback to direct WS verification
    }

    const url = new URL(window.location.href);
    url.searchParams.set('room', nextRoomId);

    if (roomExists) {
      // Existing room: require server verification via CollaboratorInviteLogin before room:init
      accessVerifierRef.current = null;
      setIsLockedNeedsPassphrase(true);
      url.searchParams.set('invite', '1');
      url.hash = '';
      window.history.replaceState(null, '', url.toString());
      setRoomId(nextRoomId);
      setShowCollab(false);
      showToast(`Ruang "${nextRoomId}" ditemukan. Verifikasi sandi diperlukan.`);
      return;
    }

    // New room: generate fresh key + accessVerifier so server admits creator
    const freshB64 = generateRoomKeyBase64();
    const imported = await importRawRoomKey(freshB64);
    const fp = await getKeyFingerprint(imported);
    const verifier = await deriveAccessVerifier(nextRoomId, freshB64);

    setRoomKeyBase64(freshB64);
    setCryptoKey(imported);
    cryptoKeyRef.current = imported;
    accessVerifierRef.current = verifier;
    passwordProtectedRef.current = false;
    setKeyFingerprint(fp);
    setE2eeEnabled(true);
    e2eeEnabledRef.current = true;
    setIsLockedNeedsPassphrase(false);
    setBoard(buildFromScratchBoard(nextRoomId));

    url.searchParams.delete('invite');
    url.hash = `k=${freshB64}`;
    window.history.replaceState(null, '', url.toString());
    setRoomId(nextRoomId);
    setShowCollab(false);
    showToast(`Membuat ruang baru: ${nextRoomId}`);
  };

  const handleSetRoomLifetime = (minutes: RoomLifetimeMinutes) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      showToast('WebSocket belum terhubung. Tidak dapat mengatur batas waktu room.');
      return;
    }
    ws.send(
      JSON.stringify({
        type: 'room:set-lifetime',
        lifetimeMinutes: minutes,
      })
    );
  };

  const selectedNode = useMemo(
    () => board.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [board.nodes, selectedNodeId]
  );

  const selectedEdge = useMemo(
    () => board.edges.find((e) => e.id === selectedEdgeId) ?? null,
    [board.edges, selectedEdgeId]
  );

  const mediaModalTargetNode = useMemo(
    () => board.nodes.find((n) => n.id === mediaModalNodeId) ?? null,
    [board.nodes, mediaModalNodeId]
  );

  const { remainingSessionText, sessionUrgency } = useMemo(() => {
    if (!roomLifetime || expiredRoomNotice) {
      return { remainingSessionText: null, sessionUrgency: 'normal' as const };
    }
    const remainingMs = Math.max(0, roomLifetime.expiresAt - sessionNowTick);
    const totalSec = Math.floor(remainingMs / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const formatted =
      hrs > 0
        ? `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
        : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    const urgency: 'normal' | 'warning' | 'critical' =
      remainingMs <= 60_000 ? 'critical' : remainingMs <= 5 * 60_000 ? 'warning' : 'normal';
    return { remainingSessionText: formatted, sessionUrgency: urgency };
  }, [expiredRoomNotice, roomLifetime, sessionNowTick]);

  const expiredModal = expiredRoomNotice && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 shadow-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Sesi Room Kolaborasi Berakhir
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {expiredRoomNotice.roomId} ·{' '}
                {ROOM_LIFETIME_OPTIONS.find((o) => o.value === expiredRoomNotice.lifetimeMinutes)
                  ?.label ?? `${expiredRoomNotice.lifetimeMinutes} menit`}
              </p>
            </div>
          </div>
          {!isLockedNeedsPassphrase && (
            <button
              type="button"
              onClick={() => setExpiredRoomNotice(null)}
              aria-label="Tutup Notifikasi"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          {expiredRoomNotice.reason} Server telah memutus paksa seluruh koneksi WebSocket dan menghapus data room tersebut dari memori pada pukul{' '}
          <strong className="font-mono">
            {new Date(expiredRoomNotice.expiredAt).toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </strong>
          .
        </p>

        <div className="flex flex-col gap-2 pt-1">
          {!isLockedNeedsPassphrase && (
            <button
              type="button"
              onClick={() => handleCreateOwnRoom(true)}
              className="w-full h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors inline-flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Lanjutkan Kanvas Ini di Room Baru</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => handleCreateOwnRoom(false)}
            className="w-full h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-semibold transition-colors inline-flex items-center justify-center gap-2"
          >
            <PlusCircle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Buat Room Kosong Baru (From Scratch)</span>
          </button>
        </div>
      </div>
    </div>
  );

  if (isLockedNeedsPassphrase) {
    return (
      <>
        <CollaboratorInviteLogin
          roomId={roomId}
          initialName={userName}
          initialColor={userColor}
          wsConnected={wsConnected}
          peerCount={Math.max(inviteMetaPeerCount, peers.length)}
          envelopeFingerprint={
            pendingEncryptedEnvelope?.keyFingerprint ?? inviteMetaFingerprint
          }
          decryptError={decryptError}
          cooldownLockedUntil={cooldownLockedUntil}
          failedAttempts={failedAuthAttempts}
          roomNotFound={inviteRoomNotFound}
          darkMode={darkMode}
          onToggleTheme={() => setDarkMode((d) => !d)}
          onSubmitLogin={handleInviteLoginSubmit}
          onCreateOwnRoom={() => handleCreateOwnRoom(false)}
        />
        {expiredModal}
      </>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100">
      {!isPresenting && (
        <TopBar
          title={board.title}
          roomId={roomId}
          peerCount={Math.max(1, peers.length)}
          wsConnected={wsConnected}
          e2eeEnabled={e2eeEnabled}
          darkMode={darkMode}
          canPresent={presentationOrder.length > 0}
          exportingFormat={exportingFormat}
          remainingSessionText={remainingSessionText}
          sessionUrgency={sessionUrgency}
          onChangeTitle={(title) =>
            commitBoardChange((prev) => ({
              ...prev,
              title,
            }))
          }
          onOpenTemplates={() => setShowTemplates(true)}
          onOpenCollaboration={() => setShowCollab(true)}
          onOpenEncryption={() => setShowEncryption(true)}
          onStartPresentation={handleStartPresentation}
          onToggleTheme={() => setDarkMode((d) => !d)}
          onExport={handleExport}
        />
      )}

      {/* Contextual Rich Formatting Dock when a node or connector line is selected */}
      {!isPresenting && (selectedNode || selectedEdge) && (
        <NodeFormattingBar
          node={selectedNode}
          selectedEdge={selectedEdge}
          nodes={board.nodes}
          edges={board.edges}
          activeTextTarget={activeTextTarget}
          onChangeTextTarget={setActiveTextTarget}
          onUpdateNode={handleUpdateNode}
          onUpdateEdgesColor={handleUpdateEdgesColor}
          onDeleteEdge={handleDeleteEdge}
          onDeselectEdge={() => setSelectedEdgeId(null)}
          onSpawnChild={handleSpawnChild}
          onDuplicateNode={handleDuplicateNode}
          onDeleteNode={handleDeleteNode}
          onOpenMediaModal={(nid) => {
            setPendingMediaNewNode(false);
            setMediaModalNodeId(nid);
          }}
        />
      )}

      {/* Left Floating Creation & Navigation Toolbar (Desktop rail / Mobile launcher) */}
      {!isPresenting && (
        <FloatingToolbar
          tool={tool}
          canUndo={past.length > 0}
          canRedo={future.length > 0}
          onSelectTool={(t) => {
            setTool(t);
            if (t !== 'connect') setConnectSourceId(null);
          }}
          onAddFloatingNode={handleAddFloatingNode}
          onAddTableNode={handleAddTableNode}
          onAddMediaNode={() => {
            setPendingMediaNewNode(true);
            setMediaModalNodeId('__new__');
          }}
          onAddStickyNote={handleAddStickyNote}
          onUndo={handleUndo}
          onRedo={handleRedo}
        />
      )}

      {/* Infinite Floating Workspace Canvas */}
      <main className={isPresenting ? 'w-full h-full' : 'w-full h-full pt-14'}>
        <CanvasWorkspace
          nodes={board.nodes}
          edges={board.edges}
          templateId={board.templateId}
          selectedNodeId={selectedNodeId}
          selectedEdgeId={selectedEdgeId}
          connectSourceId={connectSourceId}
          isPresenting={isPresenting}
          tool={tool}
          darkMode={darkMode}
          pan={pan}
          zoom={zoom}
          peers={peers}
          clientId={clientId}
          onChangePanZoom={(nextPan, nextZoom) => {
            setPan(nextPan);
            setZoom(nextZoom);
          }}
          onSelectNode={handleSelectNode}
          onSelectEdge={handleSelectEdge}
          onFocusTextTarget={handleFocusTextTarget}
          onMoveNode={handleMoveNode}
          onUpdateNode={handleUpdateNode}
          onSpawnChild={handleSpawnChild}
          onConnectClick={handleConnectClick}
          onDeleteEdge={handleDeleteEdge}
          onOpenMediaModal={(nid) => {
            setPendingMediaNewNode(false);
            setMediaModalNodeId(nid);
          }}
          onCursorMove={handleCursorMove}
        />
      </main>

      {/* Floating Canvas Minimap */}
      {!isPresenting && (
        <CanvasMinimap
          nodes={board.nodes}
          edges={board.edges}
          selectedNodeId={selectedNodeId}
          pan={pan}
          zoom={zoom}
          darkMode={darkMode}
          onJumpToPan={(nextPan) => setPan(nextPan)}
        />
      )}

      {/* Bottom Floating Bar: Parallel Day/Time Stamp Input + Zoom Out / Zoom In + Rapikan */}
      {!isPresenting && (
        <BottomControlBar
          zoom={zoom}
          hasSelectedNode={Boolean(selectedNodeId)}
          autoOrganize={autoOrganize}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetZoom={handleResetZoom}
          onFitView={handleFitView}
          onInsertDateTimeStamp={handleInsertDateTimeStamp}
          onOrganizeLayout={() => handleOrganizeLayout()}
          onToggleAutoOrganize={handleToggleAutoOrganize}
        />
      )}

      {/* Presentation Mode Minimal Sequential HUD */}
      {isPresenting && (
        <PresentationHud
          currentIndex={presentationIndex}
          totalCount={presentationOrder.length}
          activeTitle={
            presentationIndex >= 0 ? presentationOrder[presentationIndex]?.title ?? '' : ''
          }
          autoPlay={presentationAutoPlay}
          onPrev={() => handleStepPresentation(-1)}
          onNext={() => handleStepPresentation(1)}
          onToggleAutoPlay={() => setPresentationAutoPlay((v) => !v)}
          onFitOverview={() => {
            setPresentationAutoPlay(false);
            handleFitView();
          }}
          onExit={handleExitPresentation}
        />
      )}

      {/* Low-Time Room Expiry Warning Banner */}
      {!isPresenting && sessionWarningBanner && !expiredRoomNotice && (
        <div className="fixed bottom-[76px] md:bottom-20 left-1/2 -translate-x-1/2 z-40 px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/90 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 shadow-lg flex items-center gap-2.5 max-w-[calc(100vw-24px)] text-xs">
          <Clock3 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="font-medium">
            Sisa waktu room{' '}
            <strong className="font-mono">{remainingSessionText}</strong> — koneksi akan diputus &amp; room dihapus otomatis saat habis.
          </span>
          <button
            type="button"
            onClick={() => setSessionWarningBanner(null)}
            aria-label="Tutup Peringatan"
            className="p-0.5 rounded text-amber-700 dark:text-amber-300 hover:bg-amber-200/60 dark:hover:bg-amber-900/60 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Toast Notification (positioned cleanly below formatting bar when active) */}
      {toastMsg && (
        <div
          className={`fixed right-3 sm:right-5 z-50 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-medium shadow-lg border border-slate-700 pointer-events-none max-w-[calc(100vw-24px)] ${
            isPresenting ? 'top-4' : selectedNode || selectedEdge ? 'top-[120px]' : 'top-16'
          }`}
        >
          {toastMsg}
        </div>
      )}

      {/* Modals */}
      {showTemplates && (
        <TemplateModal
          currentTemplateId={board.templateId}
          isFromScratch={board.nodes.length === 0 && board.edges.length === 0}
          onApplyTemplate={handleApplyTemplate}
          onRealignToTemplate={(tplId) => handleOrganizeLayout(tplId)}
          onCreateFromScratch={handleCreateFromScratch}
          onClose={() => setShowTemplates(false)}
        />
      )}

      {showCollab && (
        <CollaborationModal
          roomId={roomId}
          clientId={clientId}
          userName={userName}
          userColor={userColor}
          wsConnected={wsConnected}
          e2eeEnabled={e2eeEnabled}
          roomKeyBase64={roomKeyBase64}
          keyFingerprint={keyFingerprint}
          roomLifetime={roomLifetime}
          peers={peers}
          onUpdateProfile={handleUpdateProfile}
          onJoinRoom={handleJoinRoom}
          onSetPassphrase={handleSetPassphrase}
          onSetLifetime={handleSetRoomLifetime}
          onClose={() => setShowCollab(false)}
        />
      )}

      {showEncryption && (
        <EncryptionModal
          e2eeEnabled={e2eeEnabled}
          keyFingerprint={keyFingerprint}
          onToggleE2ee={handleToggleE2ee}
          onRotateRandomKey={handleRotateRandomKey}
          onOpenCollaboration={() => setShowCollab(true)}
          onClose={() => setShowEncryption(false)}
        />
      )}

      {expiredModal}

      {mediaModalNodeId && (
        <MediaModal
          initialMedia={pendingMediaNewNode ? null : mediaModalTargetNode?.media}
          onSave={handleSaveMedia}
          onClose={() => {
            setPendingMediaNewNode(false);
            setMediaModalNodeId(null);
          }}
        />
      )}
    </div>
  );
}
