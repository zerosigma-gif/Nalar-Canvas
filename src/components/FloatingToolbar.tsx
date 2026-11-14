import React, { useState } from 'react';
import {
  MousePointer2,
  Hand,
  Link2,
  PlusSquare,
  Table2,
  ImagePlus,
  StickyNote,
  Undo2,
  Redo2,
  Wrench,
  X,
} from 'lucide-react';
import { InteractionTool } from '../types/canvas';

interface FloatingToolbarProps {
  tool: InteractionTool;
  canUndo: boolean;
  canRedo: boolean;
  onSelectTool: (t: InteractionTool) => void;
  onAddFloatingNode: () => void;
  onAddTableNode: () => void;
  onAddMediaNode: () => void;
  onAddStickyNote: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  tool,
  canUndo,
  canRedo,
  onSelectTool,
  onAddFloatingNode,
  onAddTableNode,
  onAddMediaNode,
  onAddStickyNote,
  onUndo,
  onRedo,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const ActiveToolIcon =
    tool === 'pan' ? Hand : tool === 'connect' ? Link2 : MousePointer2;

  return (
    <>
      {/* Desktop & Laptop Left Tool Rail (anchored safely below TopBar & above BottomControlBar) */}
      <div
        className="hidden md:flex fixed left-4 top-20 z-30 flex-col items-center gap-1 p-1.5 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-md max-h-[calc(100vh-176px)] overflow-y-auto"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onSelectTool('select')}
          title="Pilih & Pindahkan Node (V)"
          aria-label="Pilih & Pindahkan Node"
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
            tool === 'select'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <MousePointer2 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onSelectTool('pan')}
          title="Geser Kanvas / Pan (H atau Spasi+Seret)"
          aria-label="Geser Kanvas"
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
            tool === 'pan'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Hand className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onSelectTool('connect')}
          title="Hubungkan Dua Node (C)"
          aria-label="Hubungkan Dua Node"
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
            tool === 'connect'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Link2 className="w-4 h-4" />
        </button>

        <div className="w-6 h-px bg-slate-200 dark:bg-slate-700 my-0.5 shrink-0" />

        <button
          type="button"
          onClick={onAddFloatingNode}
          title="Tambah Node Ide Mengambang (N)"
          aria-label="Tambah Node Ide Mengambang"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
        >
          <PlusSquare className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onAddTableNode}
          title="Tambah Node Tabel Dinamis"
          aria-label="Tambah Node Tabel Dinamis"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
        >
          <Table2 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onAddMediaNode}
          title="Tambah Node Media Visual"
          aria-label="Tambah Node Media Visual"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
        >
          <ImagePlus className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onAddStickyNote}
          title="Tambah Catatan Mengambang"
          aria-label="Tambah Catatan Mengambang"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
        >
          <StickyNote className="w-4 h-4" />
        </button>

        <div className="w-6 h-px bg-slate-200 dark:bg-slate-700 my-0.5 shrink-0" />

        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title="Urungkan (Ctrl+Z)"
          aria-label="Urungkan"
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
            canUndo
              ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
          }`}
        >
          <Undo2 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title="Ulangi (Ctrl+Y)"
          aria-label="Ulangi"
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
            canRedo
              ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
          }`}
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>

      {/* Mobile Floating Tool Launcher & Popover (bottom-left thumb zone, clear of BottomControlBar & Minimap) */}
      <div
        className="md:hidden fixed bottom-[72px] left-3 z-30"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 z-20"
              onClick={() => setMobileOpen(false)}
            />
            <div className="relative z-30 mb-2 w-64 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-xl p-3 space-y-3">
              <div>
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Mode Interaksi
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectTool('select');
                      setMobileOpen(false);
                    }}
                    className={`min-h-[44px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                      tool === 'select'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <MousePointer2 className="w-4 h-4" />
                    <span>Pilih</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectTool('pan');
                      setMobileOpen(false);
                    }}
                    className={`min-h-[44px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                      tool === 'pan'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <Hand className="w-4 h-4" />
                    <span>Geser</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectTool('connect');
                      setMobileOpen(false);
                    }}
                    className={`min-h-[44px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                      tool === 'connect'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <Link2 className="w-4 h-4" />
                    <span>Hubung</span>
                  </button>
                </div>
              </div>

              <div>
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Tambah ke Kanvas
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onAddFloatingNode();
                      setMobileOpen(false);
                    }}
                    className="min-h-[44px] px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100 flex items-center gap-2"
                  >
                    <PlusSquare className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Ide Baru</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onAddTableNode();
                      setMobileOpen(false);
                    }}
                    className="min-h-[44px] px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100 flex items-center gap-2"
                  >
                    <Table2 className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Tabel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onAddMediaNode();
                      setMobileOpen(false);
                    }}
                    className="min-h-[44px] px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100 flex items-center gap-2"
                  >
                    <ImagePlus className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Media</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onAddStickyNote();
                      setMobileOpen(false);
                    }}
                    className="min-h-[44px] px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100 flex items-center gap-2"
                  >
                    <StickyNote className="w-4 h-4 text-violet-600 shrink-0" />
                    <span>Catatan</span>
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="flex-1 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>Urungkan</span>
                </button>
                <button
                  type="button"
                  onClick={onRedo}
                  disabled={!canRedo}
                  className="flex-1 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                  <span>Ulangi</span>
                </button>
              </div>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Buka Alat Kanvas"
          aria-expanded={mobileOpen}
          className={`h-11 px-3 rounded-xl border shadow-md backdrop-blur-md inline-flex items-center gap-2 text-xs font-semibold transition-colors ${
            mobileOpen
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'bg-white/95 dark:bg-slate-900/95 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100'
          }`}
        >
          {mobileOpen ? (
            <X className="w-4 h-4" />
          ) : (
            <ActiveToolIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          )}
          <span className="inline-flex items-center gap-1">
            <Wrench className="w-3.5 h-3.5 opacity-70" />
            <span>Alat</span>
          </span>
        </button>
      </div>
    </>
  );
};

