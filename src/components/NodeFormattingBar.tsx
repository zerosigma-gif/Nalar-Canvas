import React, { useEffect, useMemo, useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Palette,
  SmilePlus,
  ImagePlus,
  Table2,
  GitBranchPlus,
  Copy,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Spline,
  X,
  ArrowRight,
} from 'lucide-react';
import {
  CanvasEdge,
  CanvasNode,
  FONT_FAMILIES,
  FontFamilyOption,
  NodeTextTarget,
} from '../types/canvas';
import {
  ACCENT_COLORS,
  NODE_SURFACE_COLORS,
  NODE_TEXT_COLORS,
  createDefaultTable,
  resolveBodyStyle,
} from '../utils/templates';
import { SymbolPopover } from './SymbolPopover';

interface NodeFormattingBarProps {
  node: CanvasNode | null;
  selectedEdge: CanvasEdge | null;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  activeTextTarget: NodeTextTarget;
  onChangeTextTarget: (target: NodeTextTarget) => void;
  onUpdateNode: (nodeId: string, patch: Partial<CanvasNode>) => void;
  onUpdateEdgesColor: (edgeIds: string[], color: string, live?: boolean) => void;
  onDeleteEdge: (edgeId: string) => void;
  onDeselectEdge: () => void;
  onSpawnChild: (parentId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onOpenMediaModal: (nodeId: string) => void;
}

const FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 34];
const CONNECTOR_PRESET_COLORS = ['#64748B', ...ACCENT_COLORS];

export const NodeFormattingBar: React.FC<NodeFormattingBarProps> = ({
  node,
  selectedEdge,
  nodes,
  edges,
  activeTextTarget,
  onChangeTextTarget,
  onUpdateNode,
  onUpdateEdgesColor,
  onDeleteEdge,
  onDeselectEdge,
  onSpawnChild,
  onDuplicateNode,
  onDeleteNode,
  onOpenMediaModal,
}) => {
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showEdgeColorMenu, setShowEdgeColorMenu] = useState(false);
  const [showSymbolMenu, setShowSymbolMenu] = useState(false);

  useEffect(() => {
    setShowColorMenu(false);
    setShowEdgeColorMenu(false);
    setShowSymbolMenu(false);
  }, [node?.id, selectedEdge?.id]);

  const nodeTitleMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of nodes) {
      m.set(n.id, n.title || 'Tanpa Judul');
    }
    return m;
  }, [nodes]);

  const connectedEdges = useMemo(() => {
    if (!node) return [];
    return edges.filter((e) => e.sourceId === node.id || e.targetId === node.id);
  }, [edges, node]);

  // Direct Selected Connector Edge Mode
  if (!node && selectedEdge) {
    const activeColor = selectedEdge.color || '#64748B';
    const sourceLabel = nodeTitleMap.get(selectedEdge.sourceId) || 'Node Asal';
    const targetLabel = nodeTitleMap.get(selectedEdge.targetId) || 'Node Tujuan';

    return (
      <div
        className="fixed top-16 left-3 right-3 md:left-[calc(50%+30px)] md:right-auto md:-translate-x-1/2 z-30 mx-auto md:mx-0 w-fit max-w-[calc(100vw-24px)] md:max-w-[calc(100vw-112px)] rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-md"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-2.5 py-1.5 overflow-x-auto">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 shrink-0">
            <Spline className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span className="max-w-[96px] sm:max-w-[140px] truncate">{sourceLabel}</span>
            <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="max-w-[96px] sm:max-w-[140px] truncate">{targetLabel}</span>
          </div>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 shrink-0" />

          {/* Live Color Picker for Selected Connector Line */}
          <label
            className="h-9 md:h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 flex items-center gap-2 cursor-pointer shrink-0 transition-colors"
            title="Pilih Warna Garis Penghubung (Color Picker)"
          >
            <input
              type="color"
              value={activeColor}
              onChange={(e) => onUpdateEdgesColor([selectedEdge.id], e.target.value, true)}
              aria-label="Warna Garis Penghubung"
              className="w-5 h-5 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            <span className="text-[11px] font-mono uppercase text-slate-700 dark:text-slate-200">
              {activeColor}
            </span>
          </label>

          {/* Quick Preset Swatches */}
          <div className="flex items-center gap-1 shrink-0">
            {CONNECTOR_PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onUpdateEdgesColor([selectedEdge.id], c, false)}
                style={{ backgroundColor: c }}
                title={`Ubah warna garis ke ${c}`}
                aria-label={`Ubah warna garis ke ${c}`}
                className={`w-5 h-5 rounded-md border transition-transform hover:scale-110 shrink-0 ${
                  activeColor.toLowerCase() === c.toLowerCase()
                    ? 'ring-2 ring-offset-1 ring-blue-500 border-white dark:ring-offset-slate-900'
                    : 'border-slate-300/60 dark:border-slate-700'
                }`}
              />
            ))}
          </div>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 shrink-0" />

          <button
            type="button"
            onClick={() => onDeleteEdge(selectedEdge.id)}
            title="Hapus Garis Penghubung"
            aria-label="Hapus Garis Penghubung"
            className="w-9 h-9 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onDeselectEdge}
            title="Tutup Bar Garis"
            aria-label="Tutup Bar Garis"
            className="w-9 h-9 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  if (!node) return null;

  const connectedEdgeIds = connectedEdges.map((e) => e.id);
  const primaryEdgeColor = connectedEdges[0]?.color || node.accentColor || '#64748B';
  const activeStyle = activeTextTarget === 'body' ? resolveBodyStyle(node) : node.style;
  const targetLabel = activeTextTarget === 'body' ? 'Isi' : 'Judul';
  const currentAlign = activeStyle.align || 'left';
  const alignLabel =
    currentAlign === 'center' ? 'Tengah' : currentAlign === 'right' ? 'Kanan' : 'Kiri';

  const updateStyle = (patch: Partial<CanvasNode['style']>) => {
    if (activeTextTarget === 'body') {
      const currentBody = resolveBodyStyle(node);
      onUpdateNode(node.id, {
        bodyStyle: { ...currentBody, ...patch },
      });
      return;
    }

    const nextPatch: Partial<CanvasNode> = {
      style: { ...node.style, ...patch },
    };
    if (!node.bodyStyle) {
      nextPatch.bodyStyle = resolveBodyStyle(node);
    }
    onUpdateNode(node.id, nextPatch);
  };

  const handleToggleSymbol = (sym: string) => {
    const exists = node.symbols.includes(sym);
    onUpdateNode(node.id, {
      symbols: exists ? node.symbols.filter((s) => s !== sym) : [...node.symbols, sym],
    });
  };

  const handleClearSymbols = () => {
    if (node.symbols.length > 0) {
      onUpdateNode(node.id, { symbols: [] });
    }
  };

  const handleInsertIntoText = (target: NodeTextTarget, sym: string) => {
    const currentText = target === 'body' ? node.body || '' : node.title || '';
    const escapedNodeId =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(node.id)
        : node.id.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    const selector = `[data-node-id="${escapedNodeId}"] textarea[data-text-target="${target}"]`;
    const textarea = document.querySelector<HTMLTextAreaElement>(selector);

    if (textarea) {
      const start = textarea.selectionStart ?? currentText.length;
      const end = textarea.selectionEnd ?? start;
      const nextText = currentText.slice(0, start) + sym + currentText.slice(end);
      onUpdateNode(node.id, target === 'body' ? { body: nextText } : { title: nextText });
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLTextAreaElement>(selector);
        if (el) {
          const caret = start + sym.length;
          el.setSelectionRange(caret, caret);
        }
      });
      return;
    }

    const nextText = !currentText
      ? sym
      : /\s$/.test(currentText)
      ? `${currentText}${sym}`
      : `${currentText} ${sym}`;
    onUpdateNode(node.id, target === 'body' ? { body: nextText } : { title: nextText });
  };

  const toggleDynamicTable = () => {
    if (node.table) {
      onUpdateNode(node.id, { table: null });
    } else {
      onUpdateNode(node.id, {
        table: createDefaultTable(),
        width: Math.max(node.width, 350),
      });
    }
  };

  return (
    <>
      <div
        className="fixed top-16 left-3 right-3 md:left-[calc(50%+30px)] md:right-auto md:-translate-x-1/2 z-30 mx-auto md:mx-0 w-fit max-w-[calc(100vw-24px)] md:max-w-[calc(100vw-112px)] rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-md"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto">
          {/* Target Selector: Judul vs Isi */}
          <div
            role="group"
            aria-label="Target Pengaturan Teks"
            className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0"
          >
            <button
              type="button"
              onClick={() => onChangeTextTarget('title')}
              aria-pressed={activeTextTarget === 'title'}
              title="Atur jenis huruf, ukuran, perataan & gaya teks Judul node"
              className={`h-8 md:h-7 px-2 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                activeTextTarget === 'title'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Judul
            </button>
            <button
              type="button"
              onClick={() => onChangeTextTarget('body')}
              aria-pressed={activeTextTarget === 'body'}
              title="Atur jenis huruf, ukuran, perataan & gaya teks Isi / Catatan node"
              className={`h-8 md:h-7 px-2 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                activeTextTarget === 'body'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Isi
            </button>
          </div>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-0.5 shrink-0" />

          {/* Font Family */}
          <select
            value={activeStyle.fontFamily}
            onChange={(e) => updateStyle({ fontFamily: e.target.value as FontFamilyOption })}
            title={`Jenis Huruf (${targetLabel})`}
            aria-label={`Jenis Huruf ${targetLabel}`}
            className="h-9 md:h-8 px-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[128px] shrink-0"
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          {/* Font Size */}
          <select
            value={activeStyle.fontSize}
            onChange={(e) => updateStyle({ fontSize: Number(e.target.value) })}
            title={`Ukuran Huruf (${targetLabel})`}
            aria-label={`Ukuran Huruf ${targetLabel}`}
            className="h-9 md:h-8 px-1.5 text-xs font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 shrink-0"
          >
            {FONT_SIZES.map((sz) => (
              <option key={sz} value={sz}>
                {sz}px
              </option>
            ))}
          </select>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-0.5 shrink-0" />

          {/* Bold / Italic / Underline */}
          <button
            type="button"
            onClick={() => updateStyle({ bold: !activeStyle.bold })}
            aria-pressed={activeStyle.bold}
            title={`Tebal (${targetLabel})`}
            aria-label={`Tebal ${targetLabel}`}
            className={`w-9 h-9 md:w-8 md:h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
              activeStyle.bold
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => updateStyle({ italic: !activeStyle.italic })}
            aria-pressed={activeStyle.italic}
            title={`Miring (${targetLabel})`}
            aria-label={`Miring ${targetLabel}`}
            className={`w-9 h-9 md:w-8 md:h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
              activeStyle.italic
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => updateStyle({ underline: !activeStyle.underline })}
            aria-pressed={activeStyle.underline}
            title={`Garis Bawah (${targetLabel})`}
            aria-label={`Garis Bawah ${targetLabel}`}
            className={`w-9 h-9 md:w-8 md:h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
              activeStyle.underline
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Underline className="w-3.5 h-3.5" />
          </button>

          {/* Alignment */}
          <button
            type="button"
            onClick={() => {
              const next =
                currentAlign === 'left'
                  ? 'center'
                  : currentAlign === 'center'
                  ? 'right'
                  : 'left';
              updateStyle({ align: next });
            }}
            title={`Perataan Teks (${targetLabel}): ${alignLabel}`}
            aria-label={`Perataan Teks ${targetLabel}: ${alignLabel}`}
            className="w-9 h-9 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            {currentAlign === 'center' ? (
              <AlignCenter className="w-3.5 h-3.5" />
            ) : currentAlign === 'right' ? (
              <AlignRight className="w-3.5 h-3.5" />
            ) : (
              <AlignLeft className="w-3.5 h-3.5" />
            )}
          </button>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-0.5 shrink-0" />

          {/* Color & Surface Popover Trigger */}
          <button
            type="button"
            onClick={() => {
              setShowColorMenu((v) => !v);
              setShowEdgeColorMenu(false);
              setShowSymbolMenu(false);
            }}
            title={`Warna Huruf (${targetLabel}) & Kartu`}
            aria-label={`Warna Huruf ${targetLabel} dan Kartu`}
            className={`h-9 md:h-8 px-2 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors shrink-0 ${
              showColorMenu
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span
              className="w-3 h-3 rounded-full border border-slate-300"
              style={{ backgroundColor: activeStyle.color }}
            />
          </button>

          {/* Connector Line Color Picker Trigger */}
          <button
            type="button"
            onClick={() => {
              setShowEdgeColorMenu((v) => !v);
              setShowColorMenu(false);
              setShowSymbolMenu(false);
            }}
            title="Warna Garis Penghubung"
            aria-label="Warna Garis Penghubung"
            className={`h-9 md:h-8 px-2 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              showEdgeColorMenu
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Spline className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Garis</span>
            <span
              className="w-3 h-3 rounded-full border border-slate-300 dark:border-slate-600"
              style={{
                backgroundColor: connectedEdges.length > 0 ? primaryEdgeColor : '#94A3B8',
              }}
            />
          </button>

          {/* Insert Symbol Popover Trigger */}
          <button
            type="button"
            onClick={() => {
              setShowSymbolMenu((v) => !v);
              setShowColorMenu(false);
              setShowEdgeColorMenu(false);
            }}
            title="Sisipkan Simbol"
            aria-label="Sisipkan Simbol"
            className={`h-9 md:h-8 px-2 rounded-lg flex items-center gap-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              showSymbolMenu
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <SmilePlus className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Simbol</span>
          </button>

          {/* Visual Media */}
          <button
            type="button"
            onClick={() => {
              setShowColorMenu(false);
              setShowEdgeColorMenu(false);
              setShowSymbolMenu(false);
              onOpenMediaModal(node.id);
            }}
            title="Sematkan Media Visual"
            aria-label="Sematkan Media Visual"
            className={`h-9 md:h-8 px-2 rounded-lg flex items-center gap-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              node.media
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ImagePlus className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Media</span>
          </button>

          {/* Dynamic Table Toggle */}
          <button
            type="button"
            onClick={toggleDynamicTable}
            title="Tambah / Hapus Tabel Dinamis"
            aria-label="Tambah atau Hapus Tabel Dinamis"
            className={`h-9 md:h-8 px-2 rounded-lg flex items-center gap-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              node.table
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Table2 className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Tabel</span>
          </button>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-0.5 shrink-0" />

          {/* Node Actions */}
          <button
            type="button"
            onClick={() => onSpawnChild(node.id)}
            title="Tambah Cabang Anak (Tab)"
            aria-label="Tambah Cabang Anak"
            className="w-9 h-9 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <GitBranchPlus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDuplicateNode(node.id)}
            title="Duplikat Node"
            aria-label="Duplikat Node"
            className="w-9 h-9 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDeleteNode(node.id)}
            title="Hapus Node"
            aria-label="Hapus Node"
            className="w-9 h-9 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Viewport-safe Color & Surface Popover (never clipped by overflow-x-auto) */}
      {showColorMenu && (
        <>
          <div
            className="fixed inset-0 z-30"
            onPointerDown={(e) => {
              e.stopPropagation();
              setShowColorMenu(false);
            }}
          />
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="fixed top-[120px] left-1/2 -translate-x-1/2 w-72 max-w-[calc(100vw-24px)] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-3.5 z-40 space-y-3"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  Warna Huruf ({targetLabel})
                </span>
                <input
                  type="color"
                  value={activeStyle.color || '#0F172A'}
                  onChange={(e) => updateStyle({ color: e.target.value })}
                  className="w-6 h-5 cursor-pointer rounded border-0 bg-transparent"
                  title={`Pilih Warna Huruf ${targetLabel} Kustom`}
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {NODE_TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => updateStyle({ color: c })}
                    style={{ backgroundColor: c }}
                    className={`w-6 h-6 rounded-md border ${
                      (activeStyle.color || '#0F172A').toLowerCase() === c.toLowerCase()
                        ? 'ring-2 ring-blue-500 border-white'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  Warna Latar Kartu
                </span>
                <input
                  type="color"
                  value={node.surfaceColor || '#FFFFFF'}
                  onChange={(e) => onUpdateNode(node.id, { surfaceColor: e.target.value })}
                  className="w-6 h-5 cursor-pointer rounded border-0 bg-transparent"
                  title="Pilih Warna Latar Kartu Kustom"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {NODE_SURFACE_COLORS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    title={s.name}
                    onClick={() => onUpdateNode(node.id, { surfaceColor: s.value })}
                    style={{ backgroundColor: s.value }}
                    className={`w-6 h-6 rounded-md border ${
                      (node.surfaceColor || '#FFFFFF').toLowerCase() === s.value.toLowerCase()
                        ? 'ring-2 ring-blue-500 border-white'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  Aksen Kartu & Cabang
                </span>
                <input
                  type="color"
                  value={node.accentColor || '#2563EB'}
                  onChange={(e) => onUpdateNode(node.id, { accentColor: e.target.value })}
                  className="w-6 h-5 cursor-pointer rounded border-0 bg-transparent"
                  title="Pilih Warna Aksen Kustom"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ACCENT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onUpdateNode(node.id, { accentColor: c })}
                    style={{ backgroundColor: c }}
                    className={`w-6 h-6 rounded-md border ${
                      (node.accentColor || '#2563EB').toLowerCase() === c.toLowerCase()
                        ? 'ring-2 ring-offset-1 ring-blue-500 border-white'
                        : 'border-transparent'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Viewport-safe Connector Line Color Picker Popover */}
      {showEdgeColorMenu && (
        <>
          <div
            className="fixed inset-0 z-30"
            onPointerDown={(e) => {
              e.stopPropagation();
              setShowEdgeColorMenu(false);
            }}
          />
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="fixed top-[120px] left-1/2 -translate-x-1/2 w-80 max-w-[calc(100vw-24px)] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-3.5 z-40 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Spline className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  Warna Garis Penghubung
                </span>
              </div>
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {connectedEdges.length} garis
              </span>
            </div>

            {connectedEdges.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Node ini belum memiliki garis penghubung. Gunakan alat <strong>Hubungkan (C)</strong> atau tombol <strong>+</strong> di kanan node untuk membuat garis terlebih dahulu.
              </p>
            ) : (
              <>
                {/* Bulk color picker for all connected lines of this node */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      {connectedEdges.length > 1
                        ? 'Terapkan ke semua garis node ini'
                        : 'Pilih warna garis'}
                    </span>
                    <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors">
                      <input
                        type="color"
                        value={primaryEdgeColor}
                        onChange={(e) =>
                          onUpdateEdgesColor(connectedEdgeIds, e.target.value, true)
                        }
                        title="Pilih Warna Garis Kustom"
                        aria-label="Pilih Warna Garis Kustom"
                        className="w-5 h-5 cursor-pointer rounded border-0 bg-transparent p-0"
                      />
                      <span className="text-[11px] font-mono uppercase text-slate-700 dark:text-slate-200">
                        {primaryEdgeColor}
                      </span>
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {CONNECTOR_PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => onUpdateEdgesColor(connectedEdgeIds, c, false)}
                        style={{ backgroundColor: c }}
                        title={`Terapkan warna ${c}`}
                        aria-label={`Terapkan warna ${c}`}
                        className={`w-6 h-6 rounded-md border transition-transform hover:scale-105 ${
                          primaryEdgeColor.toLowerCase() === c.toLowerCase()
                            ? 'ring-2 ring-offset-1 ring-blue-500 border-white dark:ring-offset-slate-900'
                            : 'border-slate-300/60 dark:border-slate-700'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Per-edge individual dynamic color pickers */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5 max-h-44 overflow-y-auto">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Ubah Per Garis ({connectedEdges.length})
                  </div>
                  {connectedEdges.map((edge) => {
                    const edgeColor = edge.color || '#64748B';
                    const isOutgoing = edge.sourceId === node.id;
                    const peerTitle =
                      nodeTitleMap.get(isOutgoing ? edge.targetId : edge.sourceId) ||
                      'Node Terkait';

                    return (
                      <div
                        key={edge.id}
                        className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70"
                      >
                        <div className="min-w-0 flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                          <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 shrink-0">
                            {isOutgoing ? 'Ke' : 'Dari'}
                          </span>
                          <span className="truncate font-medium">{peerTitle}</span>
                        </div>
                        <label
                          className="inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                          title={`Ubah warna garis ${isOutgoing ? 'ke' : 'dari'} ${peerTitle}`}
                        >
                          <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400">
                            {edgeColor}
                          </span>
                          <input
                            type="color"
                            value={edgeColor}
                            onChange={(e) =>
                              onUpdateEdgesColor([edge.id], e.target.value, true)
                            }
                            aria-label={`Warna garis ${peerTitle}`}
                            className="w-6 h-5 cursor-pointer rounded border-0 bg-transparent p-0"
                          />
                        </label>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Viewport-safe Symbol Popover (never clipped by overflow-x-auto) */}
      {showSymbolMenu && (
        <>
          <div
            className="fixed inset-0 z-30"
            onPointerDown={(e) => {
              e.stopPropagation();
              setShowSymbolMenu(false);
            }}
          />
          <div className="fixed top-[120px] left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-24px)]">
            <SymbolPopover
              activeSymbols={node.symbols}
              activeTextTarget={activeTextTarget}
              onToggleNodeSymbol={handleToggleSymbol}
              onClearNodeSymbols={handleClearSymbols}
              onInsertIntoText={handleInsertIntoText}
              onClose={() => setShowSymbolMenu(false)}
            />
          </div>
        </>
      )}
    </>
  );
};
