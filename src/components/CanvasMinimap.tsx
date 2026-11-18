import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Map as MapIcon, Minimize2 } from 'lucide-react';
import { CanvasEdge, CanvasNode } from '../types/canvas';
import { estimateNodeHeight } from '../utils/layout';

interface CanvasMinimapProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedNodeId: string | null;
  pan: { x: number; y: number };
  zoom: number;
  darkMode: boolean;
  onJumpToPan: (nextPan: { x: number; y: number }) => void;
}

const MINIMAP_W = 212;
const MINIMAP_H = 136;
const TOP_BAR_H = 56;
const getBottomBarH = (w: number) => (w < 768 ? 68 : 72);

export const CanvasMinimap: React.FC<CanvasMinimapProps> = ({
  nodes,
  edges,
  selectedNodeId,
  pan,
  zoom,
  darkMode,
  onJumpToPan,
}) => {
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1440,
    h:
      typeof window !== 'undefined'
        ? Math.max(200, window.innerHeight - TOP_BAR_H - getBottomBarH(window.innerWidth))
        : 768,
  }));
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const onResize = () => {
      setViewport({
        w: window.innerWidth,
        h: Math.max(200, window.innerHeight - TOP_BAR_H - getBottomBarH(window.innerWidth)),
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Filter out descendants of collapsed nodes
  const visibleNodes = useMemo(() => {
    const childrenByParent = new Map<string, string[]>();
    for (const n of nodes) {
      if (n.parentId) {
        const arr = childrenByParent.get(n.parentId) ?? [];
        arr.push(n.id);
        childrenByParent.set(n.parentId, arr);
      }
    }
    const hidden = new Set<string>();
    const mark = (pid: string) => {
      for (const k of childrenByParent.get(pid) ?? []) {
        if (!hidden.has(k)) {
          hidden.add(k);
          mark(k);
        }
      }
    };
    for (const n of nodes) {
      if (n.collapsed) mark(n.id);
    }
    return nodes.filter((n) => !hidden.has(n.id));
  }, [nodes]);

  // Current viewport bounds in world coordinates (matching CanvasWorkspace container origin)
  const vpWorld = useMemo(
    () => ({
      x: -pan.x / zoom,
      y: -pan.y / zoom,
      w: viewport.w / zoom,
      h: viewport.h / zoom,
    }),
    [pan.x, pan.y, viewport.w, viewport.h, zoom]
  );

  // World bounding box = union of all visible nodes + current viewport
  const bounds = useMemo(() => {
    let minX = vpWorld.x;
    let minY = vpWorld.y;
    let maxX = vpWorld.x + vpWorld.w;
    let maxY = vpWorld.y + vpWorld.h;

    for (const n of visibleNodes) {
      const h = estimateNodeHeight(n);
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + h);
    }

    const pad = 140;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;

    const worldW = Math.max(400, maxX - minX);
    const worldH = Math.max(300, maxY - minY);
    const scale = Math.min((MINIMAP_W - 16) / worldW, (MINIMAP_H - 16) / worldH);

    const drawnW = worldW * scale;
    const drawnH = worldH * scale;
    const offsetX = (MINIMAP_W - drawnW) / 2 - minX * scale;
    const offsetY = (MINIMAP_H - drawnH) / 2 - minY * scale;

    return { scale, offsetX, offsetY };
  }, [visibleNodes, vpWorld]);

  const nodeMap = useMemo(() => {
    const m = new Map<string, { cx: number; cy: number; h: number; node: CanvasNode }>();
    for (const n of visibleNodes) {
      const h = estimateNodeHeight(n);
      m.set(n.id, {
        cx: n.x + n.width / 2,
        cy: n.y + h / 2,
        h,
        node: n,
      });
    }
    return m;
  }, [visibleNodes]);

  const jumpToClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;

      const worldX = (mx - bounds.offsetX) / bounds.scale;
      const worldY = (my - bounds.offsetY) / bounds.scale;

      const nextPanX = viewport.w / 2 - worldX * zoom;
      const nextPanY = viewport.h / 2 - worldY * zoom;
      onJumpToPan({ x: Math.round(nextPanX), y: Math.round(nextPanY) });
    },
    [bounds.offsetX, bounds.offsetY, bounds.scale, onJumpToPan, viewport.h, viewport.w, zoom]
  );

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        onPointerDown={(e) => e.stopPropagation()}
        title="Buka Minimap Kanvas"
        aria-label="Buka Minimap Kanvas"
        className="fixed bottom-[72px] md:bottom-20 right-3 md:right-4 z-30 w-11 h-11 md:w-10 md:h-10 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-md flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <MapIcon className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed bottom-[72px] md:bottom-20 right-3 md:right-4 z-30 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-md overflow-hidden select-none max-w-[calc(100vw-24px)]"
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-200/80 dark:border-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-1.5">
          <MapIcon className="w-3 h-3 text-blue-600 dark:text-blue-400" />
          <span>Peta Mini · {visibleNodes.length} Node</span>
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Sembunyikan Peta Mini"
          aria-label="Sembunyikan Peta Mini"
          className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <Minimize2 className="w-3 h-3" />
        </button>
      </div>

      <svg
        ref={svgRef}
        width={MINIMAP_W}
        height={MINIMAP_H}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          draggingRef.current = true;
          jumpToClientPoint(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          jumpToClientPoint(e.clientX, e.clientY);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
        className="block cursor-crosshair bg-slate-50/70 dark:bg-slate-950/60"
      >
        {/* Edges */}
        {edges.map((edge) => {
          const s = nodeMap.get(edge.sourceId);
          const t = nodeMap.get(edge.targetId);
          if (!s || !t) return null;
          return (
            <line
              key={edge.id}
              x1={s.cx * bounds.scale + bounds.offsetX}
              y1={s.cy * bounds.scale + bounds.offsetY}
              x2={t.cx * bounds.scale + bounds.offsetX}
              y2={t.cy * bounds.scale + bounds.offsetY}
              stroke={edge.color || (darkMode ? '#475569' : '#94A3B8')}
              strokeOpacity={0.55}
              strokeWidth={1}
            />
          );
        })}

        {/* Nodes */}
        {visibleNodes.map((n) => {
          const info = nodeMap.get(n.id)!;
          const x = n.x * bounds.scale + bounds.offsetX;
          const y = n.y * bounds.scale + bounds.offsetY;
          const w = Math.max(4, n.width * bounds.scale);
          const h = Math.max(3, info.h * bounds.scale);
          const isSelected = n.id === selectedNodeId;

          return (
            <rect
              key={n.id}
              x={x}
              y={y}
              width={w}
              height={h}
              rx={1.5}
              fill={
                isSelected
                  ? '#2563EB'
                  : darkMode
                  ? '#334155'
                  : '#FFFFFF'
              }
              stroke={isSelected ? '#1D4ED8' : n.accentColor || '#64748B'}
              strokeWidth={isSelected ? 1.2 : 0.8}
            />
          );
        })}

        {/* Active Viewport Highlight */}
        <rect
          x={vpWorld.x * bounds.scale + bounds.offsetX}
          y={vpWorld.y * bounds.scale + bounds.offsetY}
          width={Math.max(8, vpWorld.w * bounds.scale)}
          height={Math.max(8, vpWorld.h * bounds.scale)}
          rx={2}
          fill="rgba(37, 99, 235, 0.12)"
          stroke="#2563EB"
          strokeWidth={1.4}
        />
      </svg>
    </div>
  );
};
