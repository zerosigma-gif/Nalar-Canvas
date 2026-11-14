import React, { useState } from 'react';
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
} from 'lucide-react';
import {
  CanvasNode,
  FONT_FAMILIES,
  FontFamilyOption,
} from '../types/canvas';
import {
  ACCENT_COLORS,
  NODE_SURFACE_COLORS,
  NODE_TEXT_COLORS,
  createDefaultTable,
} from '../utils/templates';
import { SymbolPopover } from './SymbolPopover';

interface NodeFormattingBarProps {
  node: CanvasNode;
  onUpdateNode: (nodeId: string, patch: Partial<CanvasNode>) => void;
  onSpawnChild: (parentId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onOpenMediaModal: (nodeId: string) => void;
}

const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20, 24, 28, 34];

export const NodeFormattingBar: React.FC<NodeFormattingBarProps> = ({
  node,
  onUpdateNode,
  onSpawnChild,
  onDuplicateNode,
  onDeleteNode,
  onOpenMediaModal,
}) => {
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showSymbolMenu, setShowSymbolMenu] = useState(false);

  const updateStyle = (patch: Partial<CanvasNode['style']>) => {
    onUpdateNode(node.id, {
      style: { ...node.style, ...patch },
    });
  };

  const handleToggleSymbol = (sym: string) => {
    const exists = node.symbols.includes(sym);
    onUpdateNode(node.id, {
      symbols: exists ? node.symbols.filter((s) => s !== sym) : [...node.symbols, sym],
    });
  };

  const handleInsertIntoTitle = (sym: string) => {
    onUpdateNode(node.id, {
      title: `${node.title} ${sym}`.trim(),
    });
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
          {/* Font Family */}
          <select
            value={node.style.fontFamily}
            onChange={(e) => updateStyle({ fontFamily: e.target.value as FontFamilyOption })}
            title="Jenis Huruf"
            aria-label="Jenis Huruf"
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
            value={node.style.fontSize}
            onChange={(e) => updateStyle({ fontSize: Number(e.target.value) })}
            title="Ukuran Huruf"
            aria-label="Ukuran Huruf"
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
            onClick={() => updateStyle({ bold: !node.style.bold })}
            title="Tebal (Bold)"
            aria-label="Tebal"
            className={`w-9 h-9 md:w-8 md:h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
              node.style.bold
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => updateStyle({ italic: !node.style.italic })}
            title="Miring (Italic)"
            aria-label="Miring"
            className={`w-9 h-9 md:w-8 md:h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
              node.style.italic
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => updateStyle({ underline: !node.style.underline })}
            title="Garis Bawah (Underline)"
            aria-label="Garis Bawah"
            className={`w-9 h-9 md:w-8 md:h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
              node.style.underline
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
                node.style.align === 'left' || !node.style.align
                  ? 'center'
                  : node.style.align === 'center'
                  ? 'right'
                  : 'left';
              updateStyle({ align: next });
            }}
            title="Perataan Teks"
            aria-label="Perataan Teks"
            className="w-9 h-9 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            {node.style.align === 'center' ? (
              <AlignCenter className="w-3.5 h-3.5" />
            ) : node.style.align === 'right' ? (
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
              setShowSymbolMenu(false);
            }}
            title="Warna Huruf & Kartu"
            aria-label="Warna Huruf dan Kartu"
            className={`h-9 md:h-8 px-2 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors shrink-0 ${
              showColorMenu
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span
              className="w-3 h-3 rounded-full border border-slate-300"
              style={{ backgroundColor: node.style.color }}
            />
          </button>

          {/* Insert Symbol Popover Trigger */}
          <button
            type="button"
            onClick={() => {
              setShowSymbolMenu((v) => !v);
              setShowColorMenu(false);
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
                  Warna Huruf
                </span>
                <input
                  type="color"
                  value={node.style.color}
                  onChange={(e) => updateStyle({ color: e.target.value })}
                  className="w-6 h-5 cursor-pointer rounded border-0 bg-transparent"
                  title="Pilih Warna Huruf Kustom"
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
                      node.style.color === c
                        ? 'ring-2 ring-blue-500 border-white'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Warna Latar Kartu
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
                      node.surfaceColor === s.value
                        ? 'ring-2 ring-blue-500 border-white'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Aksen Garis & Cabang
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ACCENT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onUpdateNode(node.id, { accentColor: c })}
                    style={{ backgroundColor: c }}
                    className={`w-6 h-6 rounded-md border ${
                      node.accentColor === c
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
              onToggleNodeSymbol={handleToggleSymbol}
              onInsertIntoText={handleInsertIntoTitle}
              onClose={() => setShowSymbolMenu(false)}
            />
          </div>
        </>
      )}
    </>
  );
};
