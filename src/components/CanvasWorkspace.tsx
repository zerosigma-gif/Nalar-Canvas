import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  CanvasEdge,
  CanvasNode,
  CollaboratorPresence,
  InteractionTool,
  TemplateId,
} from '../types/canvas';
import { CanvasNodeCard } from './CanvasNodeCard';

interface CanvasWorkspaceProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  templateId: TemplateId;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  connectSourceId: string | null;
  isPresenting?: boolean;
  tool: InteractionTool;
  darkMode: boolean;
  pan: { x: number; y: number };
  zoom: number;
  peers: CollaboratorPresence[];
  clientId: string;
  onChangePanZoom: (pan: { x: number; y: number }, zoom: number) => void;
  onSelectNode: (nodeId: string | null) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onMoveNode: (nodeId: string, x: number, y: number, commit?: boolean) => void;
  onUpdateNode: (nodeId: string, patch: Partial<CanvasNode>) => void;
  onSpawnChild: (parentId: string) => void;
  onConnectClick: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onOpenMediaModal: (nodeId: string) => void;
  onCursorMove: (worldPos: { x: number; y: number } | null) => void;
}

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({
  nodes,
  edges,
  templateId,
  selectedNodeId,
  selectedEdgeId,
  connectSourceId,
  isPresenting = false,
  tool,
  darkMode,
  pan,
  zoom,
  peers,
  clientId,
  onChangePanZoom,
  onSelectNode,
  onSelectEdge,
  onMoveNode,
  onUpdateNode,
  onSpawnChild,
  onConnectClick,
  onDeleteEdge,
  onOpenMediaModal,
  onCursorMove,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [hoveredDeleteEdgeId, setHoveredDeleteEdgeId] = useState<string | null>(null);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);

  const dragRef = useRef<
    | {
        mode: 'pan';
        startX: number;
        startY: number;
        origPanX: number;
        origPanY: number;
      }
    | {
        mode: 'node';
        nodeId: string;
        startX: number;
        startY: number;
        origNodeX: number;
        origNodeY: number;
      }
    | null
  >(null);

  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{
    initialDist: number;
    initialZoom: number;
    worldCenter: { x: number; y: number };
  } | null>(null);

  // Track keyboard Space for temporary pan
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        setSpacePressed(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Compute collapsed subtrees so hidden descendants do not render
  const { visibleNodes, childCounts } = useMemo(() => {
    const childrenByParent = new Map<string, string[]>();
    for (const n of nodes) {
      if (n.parentId) {
        const arr = childrenByParent.get(n.parentId) ?? [];
        arr.push(n.id);
        childrenByParent.set(n.parentId, arr);
      }
    }

    const hiddenIds = new Set<string>();
    const markHidden = (parentId: string) => {
      const kids = childrenByParent.get(parentId) ?? [];
      for (const k of kids) {
        if (!hiddenIds.has(k)) {
          hiddenIds.add(k);
          markHidden(k);
        }
      }
    };

    for (const n of nodes) {
      if (n.collapsed) {
        markHidden(n.id);
      }
    }

    const counts = new Map<string, number>();
    for (const [pid, kids] of childrenByParent.entries()) {
      counts.set(pid, kids.length);
    }

    return {
      visibleNodes: nodes.filter((n) => !hiddenIds.has(n.id)),
      childCounts: counts,
    };
  }, [nodes]);

  const visibleNodeMap = useMemo(() => {
    const m = new Map<string, CanvasNode>();
    for (const n of visibleNodes) m.set(n.id, n);
    return m;
  }, [visibleNodes]);

  const toWorldCoords = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const offsetX = rect ? clientX - rect.left : clientX;
      const offsetY = rect ? clientY - rect.top : clientY;
      return {
        x: (offsetX - pan.x) / zoom,
        y: (offsetY - pan.y) / zoom,
      };
    },
    [pan.x, pan.y, zoom]
  );

  const handleWheel = (e: React.WheelEvent) => {
    // Ctrl/Meta + Wheel OR standard wheel zooms smoothly centered on cursor
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 0) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = containerRef.current?.getBoundingClientRect();
        const cx = rect ? e.clientX - rect.left : e.clientX;
        const cy = rect ? e.clientY - rect.top : e.clientY;
        const factor = e.deltaY < 0 ? 1.09 : 0.92;
        const nextZoom = Math.min(2.5, Math.max(0.25, zoom * factor));
        const scaleChange = nextZoom / zoom;
        onChangePanZoom(
          {
            x: cx - (cx - pan.x) * scaleChange,
            y: cy - (cy - pan.y) * scaleChange,
          },
          nextZoom
        );
      } else {
        // Trackpad / mouse pan
        onChangePanZoom(
          {
            x: pan.x - e.deltaX,
            y: pan.y - e.deltaY,
          },
          zoom
        );
      }
    }
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointersRef.current.size === 2) {
        const pts = Array.from(activePointersRef.current.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        pinchRef.current = {
          initialDist: Math.max(10, dist),
          initialZoom: zoom,
          worldCenter: toWorldCoords(midX, midY),
        };
        dragRef.current = null;
        return;
      }
    }

    const isMiddle = e.button === 1;
    if (tool === 'pan' || spacePressed || isMiddle) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsDraggingCanvas(true);
      dragRef.current = {
        mode: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
      };
      return;
    }

    if (e.button === 0) {
      if (!isPresenting) {
        onSelectNode(null);
        onSelectEdge(null);
      }
      // Allow dragging empty canvas to pan smoothly
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsDraggingCanvas(true);
      dragRef.current = {
        mode: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
      };
    }
  };

  const handleStartNodeDrag = useCallback(
    (e: React.PointerEvent, nodeId: string) => {
      if (isPresenting) return;
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      containerRef.current?.setPointerCapture(e.pointerId);
      setIsDraggingCanvas(true);
      dragRef.current = {
        mode: 'node',
        nodeId,
        startX: e.clientX,
        startY: e.clientY,
        origNodeX: node.x,
        origNodeY: node.y,
      };
    },
    [isPresenting, nodes]
  );

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' && activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointersRef.current.size === 2 && pinchRef.current) {
        const pts = Array.from(activePointersRef.current.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        const rect = containerRef.current?.getBoundingClientRect();
        const offsetX = rect ? midX - rect.left : midX;
        const offsetY = rect ? midY - rect.top : midY;
        const nextZoom = Math.min(
          2.5,
          Math.max(0.25, pinchRef.current.initialZoom * (dist / pinchRef.current.initialDist))
        );
        onChangePanZoom(
          {
            x: offsetX - pinchRef.current.worldCenter.x * nextZoom,
            y: offsetY - pinchRef.current.worldCenter.y * nextZoom,
          },
          nextZoom
        );
        return;
      }
    }

    const worldPos = toWorldCoords(e.clientX, e.clientY);
    onCursorMove(worldPos);

    const active = dragRef.current;
    if (!active) return;

    if (active.mode === 'pan') {
      const dx = e.clientX - active.startX;
      const dy = e.clientY - active.startY;
      onChangePanZoom({ x: active.origPanX + dx, y: active.origPanY + dy }, zoom);
    } else if (active.mode === 'node') {
      const dx = (e.clientX - active.startX) / zoom;
      const dy = (e.clientY - active.startY) / zoom;
      onMoveNode(active.nodeId, Math.round(active.origNodeX + dx), Math.round(active.origNodeY + dy), false);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') {
      activePointersRef.current.delete(e.pointerId);
      if (activePointersRef.current.size < 2) {
        pinchRef.current = null;
      }
    }

    setIsDraggingCanvas(false);
    const active = dragRef.current;
    if (!active) return;
    if (active.mode === 'node') {
      const dx = (e.clientX - active.startX) / zoom;
      const dy = (e.clientY - active.startY) / zoom;
      onMoveNode(active.nodeId, Math.round(active.origNodeX + dx), Math.round(active.origNodeY + dy), true);
    }
    dragRef.current = null;
  };

  // Compute Fishbone horizontal spine if active template is fishbone
  const fishboneSpine = useMemo(() => {
    if (templateId !== 'fishbone') return null;
    const head = visibleNodes.find((n) => n.kind === 'fishbone-head');
    if (!head) return null;
    let minX = head.x - 750;
    for (const n of visibleNodes) {
      minX = Math.min(minX, n.x - 60);
    }
    const y = head.y + 52;
    return { x1: minX, x2: head.x, y };
  }, [templateId, visibleNodes]);

  const gridSize = 28 * zoom;
  const dotColor = darkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(100, 116, 139, 0.26)';

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => onCursorMove(null)}
      style={{
        backgroundImage: `radial-gradient(circle, ${dotColor} 1.15px, transparent 1.15px)`,
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
      className={`relative w-full h-full overflow-hidden touch-none bg-slate-50 dark:bg-[#0B1120] ${
        tool === 'pan' || spacePressed
          ? 'cursor-grab active:cursor-grabbing'
          : tool === 'connect'
          ? 'cursor-crosshair'
          : 'cursor-default'
      }`}
    >
      {/* Transformed Infinite World Layer */}
      <div
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
        className={`absolute top-0 left-0 w-0 h-0 will-change-transform ${
          isPresenting && !isDraggingCanvas ? 'transition-transform duration-500 ease-out' : ''
        }`}
      >
        {/* SVG Edges Layer */}
        <svg
          className="overflow-visible pointer-events-none"
          width="1"
          height="1"
        >
          {/* Fishbone central spine */}
          {fishboneSpine && (
            <line
              x1={fishboneSpine.x1}
              y1={fishboneSpine.y}
              x2={fishboneSpine.x2}
              y2={fishboneSpine.y}
              stroke={darkMode ? '#64748B' : '#334155'}
              strokeWidth={3}
              strokeLinecap="round"
            />
          )}

          {edges.map((edge) => {
            const src = visibleNodeMap.get(edge.sourceId);
            const tgt = visibleNodeMap.get(edge.targetId);
            if (!src || !tgt) return null;

            const sx = src.x + src.width / 2;
            const sy = src.y + 54;
            const tx = tgt.x + tgt.width / 2;
            const ty = tgt.y + 54;

            let pathD = '';
            let midX = (sx + tx) / 2;
            let midY = (sy + ty) / 2;

            if (edge.style === 'orthogonal') {
              const srcBottom = src.y + 92;
              const tgtTop = tgt.y;
              const elbowY = (srcBottom + tgtTop) / 2;
              pathD = `M ${sx} ${srcBottom} V ${elbowY} H ${tx} V ${tgtTop}`;
              midX = (sx + tx) / 2;
              midY = elbowY;
            } else if (edge.style === 'fishbone') {
              if (tgt.kind === 'fishbone-head' && fishboneSpine) {
                const spineY = fishboneSpine.y;
                const joinX = Math.min(tgt.x - 36, sx + 95);
                pathD = `M ${sx} ${sy} L ${joinX} ${spineY}`;
                midX = (sx + joinX) / 2;
                midY = (sy + spineY) / 2;
              } else {
                pathD = `M ${sx} ${sy} L ${tx} ${ty}`;
              }
            } else if (edge.style === 'straight') {
              pathD = `M ${sx} ${sy} L ${tx} ${ty}`;
            } else {
              // Organic mind-map Bezier curve
              const dx = (tx - sx) * 0.5;
              pathD = `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
            }

            const isHovered = hoveredEdgeId === edge.id;
            const isDeleteHovered = hoveredDeleteEdgeId === edge.id;
            const isSelectedEdge = selectedEdgeId === edge.id;
            const edgeStrokeColor = edge.color || '#64748B';

            return (
              <g key={edge.id} className="pointer-events-auto">
                {/* Wide hit target for easy edge hover & selection */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={16}
                  className={isPresenting ? 'pointer-events-none' : 'cursor-pointer'}
                  onMouseEnter={() => setHoveredEdgeId(edge.id)}
                  onMouseLeave={() => setHoveredEdgeId(null)}
                  onPointerDown={(e) => {
                    if (!isPresenting && tool !== 'pan' && !spacePressed && e.button === 0) {
                      e.stopPropagation();
                    }
                  }}
                  onClick={(e) => {
                    if (!isPresenting && tool !== 'pan' && !spacePressed) {
                      e.stopPropagation();
                      onSelectEdge(edge.id);
                    }
                  }}
                />
                {/* Soft color halo when connector line is selected */}
                {isSelectedEdge && !isDeleteHovered && (
                  <path
                    d={pathD}
                    fill="none"
                    stroke={edgeStrokeColor}
                    strokeOpacity={0.28}
                    strokeWidth={8}
                    strokeLinecap="round"
                    className="pointer-events-none"
                  />
                )}
                <path
                  d={pathD}
                  fill="none"
                  stroke={isDeleteHovered ? '#EF4444' : edgeStrokeColor}
                  strokeWidth={isDeleteHovered || isSelectedEdge ? 3.2 : isHovered ? 2.8 : 2}
                  strokeLinecap="round"
                  className="transition-colors pointer-events-none"
                />
                {/* Always-accessible line trash can icon button on connecting line (hidden during presentation) */}
                {!isPresenting && (
                  <g
                    role="button"
                    tabIndex={0}
                    aria-label="Hapus garis penghubung"
                    transform={`translate(${midX}, ${midY}) scale(${isDeleteHovered ? 1.12 : 1})`}
                    style={{ pointerEvents: 'all' }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteEdge(edge.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onDeleteEdge(edge.id);
                      }
                    }}
                    onMouseEnter={() => setHoveredDeleteEdgeId(edge.id)}
                    onMouseLeave={() => setHoveredDeleteEdgeId(null)}
                    className="cursor-pointer"
                  >
                    <title>Hapus garis penghubung</title>
                    <circle r={16} fill="transparent" />
                    <circle
                      r={11}
                      fill={isDeleteHovered ? '#EF4444' : darkMode ? '#0F172A' : '#FFFFFF'}
                      stroke={isDeleteHovered ? '#DC2626' : darkMode ? '#991B1B' : '#FCA5A5'}
                      strokeWidth={1.4}
                    />
                    <g
                      fill="none"
                      stroke={isDeleteHovered ? '#FFFFFF' : '#EF4444'}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M-4.5 -2.8 H4.5" />
                      <path d="M-1.8 -2.8 V-4.2 C-1.8 -4.55 -1.55 -4.8 -1.2 -4.8 H1.2 C1.55 -4.8 1.8 -4.55 1.8 -4.2 V-2.8" />
                      <path d="M-3.4 -2.8 L-2.85 3.9 C-2.8 4.4 -2.38 4.8 -1.85 4.8 H1.85 C2.38 4.8 2.8 4.4 2.85 3.9 L3.4 -2.8" />
                      <line x1="-1.1" y1="-0.6" x2="-1.1" y2="2.6" />
                      <line x1="1.1" y1="-0.6" x2="1.1" y2="2.6" />
                    </g>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* Nodes Layer */}
        {visibleNodes.map((node) => {
          const remoteSelectors = peers.filter(
            (p) => p.clientId !== clientId && p.selectedNodeId === node.id
          );
          return (
            <CanvasNodeCard
              key={node.id}
              node={node}
              isSelected={selectedNodeId === node.id}
              isConnectSource={connectSourceId === node.id}
              isPresenting={isPresenting}
              tool={tool}
              zoom={zoom}
              darkMode={darkMode}
              childCount={childCounts.get(node.id) ?? 0}
              remoteSelectors={remoteSelectors}
              onSelect={(id) => onSelectNode(id)}
              onStartDrag={handleStartNodeDrag}
              onUpdateNode={onUpdateNode}
              onSpawnChild={onSpawnChild}
              onConnectClick={onConnectClick}
              onOpenMediaModal={onOpenMediaModal}
            />
          );
        })}

        {/* Live Collaborator Cursors */}
        {peers
          .filter((p) => p.clientId !== clientId && p.cursor)
          .map((peer) => (
            <div
              key={peer.clientId}
              style={{
                transform: `translate3d(${peer.cursor!.x}px, ${peer.cursor!.y}px, 0)`,
              }}
              className="absolute top-0 left-0 pointer-events-none z-50 transition-transform duration-75"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" className="drop-shadow-xs">
                <path
                  d="M2 2 L15 7.5 L9.5 9.5 L7.5 15 Z"
                  fill={peer.color}
                  stroke="#FFFFFF"
                  strokeWidth="1.2"
                />
              </svg>
              <div
                style={{ backgroundColor: peer.color }}
                className="ml-3 -mt-1 px-2 py-0.5 rounded text-[11px] font-medium text-white whitespace-nowrap shadow-xs"
              >
                {peer.name}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};
