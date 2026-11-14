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
import {
  BoardDocument,
  CanvasEdge,
  CanvasNode,
  CollaboratorPresence,
  ConnectorStyle,
  EncryptedEnvelope,
  InteractionTool,
  MediaAttachment,
  TemplateId,
} from './types/canvas';
import {
  decryptPayload,
  deriveKeyFromPassphrase,
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
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [autoOrganize, setAutoOrganize] = useState<boolean>(false);
  const autoOrganizeRef = useRef(autoOrganize);
  autoOrganizeRef.current = autoOrganize;

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

  // E2EE State
  const [e2eeEnabled, setE2eeEnabled] = useState(true);
  const [roomKeyBase64, setRoomKeyBase64] = useState<string | null>(null);
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [keyFingerprint, setKeyFingerprint] = useState<string | null>(null);
  const [pendingEncryptedEnvelope, setPendingEncryptedEnvelope] =
    useState<EncryptedEnvelope | null>(null);
  const [isLockedNeedsPassphrase, setIsLockedNeedsPassphrase] = useState<boolean>(() =>
    isInvitePasswordMode()
  );
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const isLockedRef = useRef(isLockedNeedsPassphrase);
  isLockedRef.current = isLockedNeedsPassphrase;

  // WebSocket Real-time State
  const [wsConnected, setWsConnected] = useState(false);
  const [peers, setPeers] = useState<CollaboratorPresence[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const syncTimerRef = useRef<number | null>(null);
  const cursorThrottleRef = useRef<number>(0);

  // Refs for latest state inside socket callbacks
  const boardRef = useRef(board);
  boardRef.current = board;
  const cryptoKeyRef = useRef(cryptoKey);
  cryptoKeyRef.current = cryptoKey;
  const e2eeEnabledRef = useRef(e2eeEnabled);
  e2eeEnabledRef.current = e2eeEnabled;

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 2600);
  }, []);

  // Sync dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  // Initialize E2EE Key from URL hash or generate fresh key (skip when invited via password gate)
  useEffect(() => {
    let cancelled = false;
    async function initKey() {
      const existingHash = getHashKey();
      if (existingHash) {
        try {
          const imported = await importRawRoomKey(existingHash);
          const fp = await getKeyFingerprint(imported);
          if (!cancelled) {
            setRoomKeyBase64(existingHash);
            setCryptoKey(imported);
            setKeyFingerprint(fp);
            setE2eeEnabled(true);
          }
          return;
        } catch {
          // Fall through to generate a valid key if hash invalid
        }
      }
      if (isInvitePasswordMode()) {
        // Wait for invited collaborator to enter the project password
        return;
      }
      const freshB64 = generateRoomKeyBase64();
      const imported = await importRawRoomKey(freshB64);
      const fp = await getKeyFingerprint(imported);
      if (!cancelled) {
        setRoomKeyBase64(freshB64);
        setCryptoKey(imported);
        setKeyFingerprint(fp);
        setHashKey(freshB64);
        setE2eeEnabled(true);
      }
    }
    initKey();
    return () => {
      cancelled = true;
    };
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

  // Real WebSocket Connection Lifecycle with Auto-Reconnect
  useEffect(() => {
    let unmounted = false;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;
    let reconnectDelay = 1800;

    function connect() {
      if (unmounted) return;
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
          ws.send(
            JSON.stringify({
              type: 'room:join',
              roomId,
              clientId,
              name: userName,
              color: userColor,
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
            if (Array.isArray(msg.peers)) {
              setPeers(msg.peers);
            }
            if (msg.encrypted && msg.encryptedEnvelope) {
              setE2eeEnabled(true);
              await applyIncomingEnvelope(msg.encryptedEnvelope);
            } else if (!msg.encrypted && msg.plainBoard) {
              setE2eeEnabled(false);
              setIsLockedNeedsPassphrase(false);
              setBoard(msg.plainBoard);
            } else if (!isLockedRef.current) {
              // Empty fresh room: seed server with our initial board (only if not waiting at password login)
              await transmitBoardSync(boardRef.current);
            }
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

      ws.onclose = () => {
        if (pingTimer) {
          window.clearInterval(pingTimer);
          pingTimer = null;
        }
        if (unmounted) return;
        setWsConnected(false);
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
  }, [roomId, clientId, applyIncomingEnvelope, transmitBoardSync]);

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
      showToast('Garis penghubung dihapus.');
    },
    [commitBoardChange, showToast]
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
      setSelectedNodeId(nodeId);
      if (isPresenting && nodeId) {
        const target = boardRef.current.nodes.find((n) => n.id === nodeId);
        if (target) focusNodeInViewport(target);
      }
    },
    [focusNodeInViewport, isPresenting]
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
      }
      if (e.key === '=' || e.key === '+') handleZoomIn();
      if (e.key === '-') handleZoomOut();
      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        handleOrganizeLayout();
      }
      if (e.key === 'Escape') {
        setConnectSourceId(null);
        setTool('select');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleAddFloatingNode,
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
    selectedNodeId,
  ]);

  // E2EE Controls
  const handleToggleE2ee = async (enabled: boolean) => {
    setE2eeEnabled(enabled);
    e2eeEnabledRef.current = enabled;
    if (enabled && !cryptoKey) {
      const b64 = generateRoomKeyBase64();
      const k = await importRawRoomKey(b64);
      const fp = await getKeyFingerprint(k);
      setRoomKeyBase64(b64);
      setCryptoKey(k);
      cryptoKeyRef.current = k;
      setKeyFingerprint(fp);
      setHashKey(b64);
    } else if (!enabled) {
      setHashKey(null);
    } else if (enabled && roomKeyBase64) {
      setHashKey(roomKeyBase64);
    }
    await transmitBoardSync(boardRef.current);
  };

  const handleSetPassphrase = async (passphrase: string) => {
    const { key, keyBase64Url } = await deriveKeyFromPassphrase(passphrase, roomId);
    const fp = await getKeyFingerprint(key);
    setCryptoKey(key);
    cryptoKeyRef.current = key;
    setRoomKeyBase64(keyBase64Url);
    setKeyFingerprint(fp);
    setE2eeEnabled(true);
    e2eeEnabledRef.current = true;
    // Strip key from URL hash so passphrase stays secret
    setHashKey(null);
    await transmitBoardSync(boardRef.current);
    showToast('Frasa sandi E2EE diterapkan.');
  };

  const handleRotateRandomKey = async () => {
    const b64 = generateRoomKeyBase64();
    const k = await importRawRoomKey(b64);
    const fp = await getKeyFingerprint(k);
    setCryptoKey(k);
    cryptoKeyRef.current = k;
    setRoomKeyBase64(b64);
    setKeyFingerprint(fp);
    setHashKey(b64);
    await transmitBoardSync(boardRef.current);
    showToast('Kunci enkripsi 256-bit baru dibuat.');
  };

  const handleUnlockWithPassphrase = async (passphrase: string): Promise<boolean> => {
    if (!pendingEncryptedEnvelope) return true;
    try {
      const { key, keyBase64Url } = await deriveKeyFromPassphrase(passphrase, roomId);
      const decrypted = await decryptPayload<BoardDocument>(key, pendingEncryptedEnvelope);
      const fp = await getKeyFingerprint(key);
      setCryptoKey(key);
      cryptoKeyRef.current = key;
      setRoomKeyBase64(keyBase64Url);
      setKeyFingerprint(fp);
      setBoard(decrypted);
      setPendingEncryptedEnvelope(null);
      setIsLockedNeedsPassphrase(false);
      setDecryptError(null);
      showToast('Kanvas berhasil didekripsi!');
      return true;
    } catch {
      setDecryptError('Kata sandi proyek tidak cocok. Periksa kembali frasa sandi undangan Anda.');
      return false;
    }
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
    setUserName(name);
    setUserColor(color);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'presence:update', name, color }));
    }

    if (pendingEncryptedEnvelope) {
      const ok = await handleUnlockWithPassphrase(passphrase);
      if (ok) {
        const url = new URL(window.location.href);
        url.searchParams.delete('invite');
        window.history.replaceState(null, '', url.toString());
      }
      return ok;
    }

    // Room had no encrypted data yet (fresh password-gated room)
    const { key, keyBase64Url } = await deriveKeyFromPassphrase(passphrase, roomId);
    const fp = await getKeyFingerprint(key);
    setCryptoKey(key);
    cryptoKeyRef.current = key;
    setRoomKeyBase64(keyBase64Url);
    setKeyFingerprint(fp);
    setE2eeEnabled(true);
    e2eeEnabledRef.current = true;
    setIsLockedNeedsPassphrase(false);
    setDecryptError(null);

    const url = new URL(window.location.href);
    url.searchParams.delete('invite');
    url.hash = '';
    window.history.replaceState(null, '', url.toString());

    await transmitBoardSync(boardRef.current);
    showToast(`Selamat datang, ${name}! Ruang terenkripsi siap digunakan.`);
    return true;
  };

  const handleCreateOwnRoom = async () => {
    const newRoomId = `ruang-${crypto.randomUUID().slice(0, 6)}`;
    const freshB64 = generateRoomKeyBase64();
    const imported = await importRawRoomKey(freshB64);
    const fp = await getKeyFingerprint(imported);

    setRoomKeyBase64(freshB64);
    setCryptoKey(imported);
    cryptoKeyRef.current = imported;
    setKeyFingerprint(fp);
    setE2eeEnabled(true);
    e2eeEnabledRef.current = true;
    setPendingEncryptedEnvelope(null);
    setIsLockedNeedsPassphrase(false);
    setDecryptError(null);
    setBoard(buildTemplateBoard('mind-mapping', newRoomId));

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
    setUserColor(color);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'presence:update', name, color }));
    }
    showToast('Profil kolaborator diperbarui.');
  };

  const handleJoinRoom = (nextRoomId: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set('room', nextRoomId);
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}?${params.toString()}${window.location.hash}`
    );
    setRoomId(nextRoomId);
    setShowCollab(false);
    showToast(`Bergabung ke ruang: ${nextRoomId}`);
  };

  const selectedNode = useMemo(
    () => board.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [board.nodes, selectedNodeId]
  );

  const mediaModalTargetNode = useMemo(
    () => board.nodes.find((n) => n.id === mediaModalNodeId) ?? null,
    [board.nodes, mediaModalNodeId]
  );

  if (isLockedNeedsPassphrase) {
    return (
      <CollaboratorInviteLogin
        roomId={roomId}
        initialName={userName}
        initialColor={userColor}
        wsConnected={wsConnected}
        peerCount={Math.max(1, peers.length)}
        envelopeFingerprint={pendingEncryptedEnvelope?.keyFingerprint ?? null}
        decryptError={decryptError}
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((d) => !d)}
        onSubmitLogin={handleInviteLoginSubmit}
        onCreateOwnRoom={handleCreateOwnRoom}
      />
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

      {/* Contextual Rich Formatting Dock when a node is selected */}
      {!isPresenting && selectedNode && (
        <NodeFormattingBar
          node={selectedNode}
          onUpdateNode={handleUpdateNode}
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

      {/* Toast Notification (positioned cleanly below formatting bar when active) */}
      {toastMsg && (
        <div
          className={`fixed right-3 sm:right-5 z-50 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-medium shadow-lg border border-slate-700 pointer-events-none max-w-[calc(100vw-24px)] ${
            isPresenting ? 'top-4' : selectedNode ? 'top-[120px]' : 'top-16'
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
          peers={peers}
          onUpdateProfile={handleUpdateProfile}
          onJoinRoom={handleJoinRoom}
          onSetPassphrase={handleSetPassphrase}
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
