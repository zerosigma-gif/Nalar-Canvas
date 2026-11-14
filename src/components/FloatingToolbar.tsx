import React from 'react';
import {
  MousePointer2,
  Hand,
  Link2,
  PlusSquare,
  GitBranchPlus,
  Table2,
  ImagePlus,
  StickyNote,
  Undo2,
  Redo2,
  Workflow,
} from 'lucide-react';
import { InteractionTool } from '../types/canvas';

interface FloatingToolbarProps {
  tool: InteractionTool;
  hasSelection: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onSelectTool: (t: InteractionTool) => void;
  onAddFloatingNode: () => void;
  onAddChildNode: () => void;
  onAddTableNode: () => void;
  onAddMediaNode: () => void;
  onAddStickyNote: () => void;
  onOrganizeLayout: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  tool,
  hasSelection,
  canUndo,
  canRedo,
  onSelectTool,
  onAddFloatingNode,
  onAddChildNode,
  onAddTableNode,
  onAddMediaNode,
  onAddStickyNote,
  onOrganizeLayout,
  onUndo,
  onRedo,
}) => {
  return (
    <div
      className="fixed left-4 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1 p-1.5 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-md"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Navigation Tools */}
      <button
        type="button"
        onClick={() => onSelectTool('select')}
        title="Pilih & Pindahkan Node (V)"
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
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
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
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
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
          tool === 'connect'
            ? 'bg-emerald-600 text-white shadow-xs'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <Link2 className="w-4 h-4" />
      </button>

      <div className="w-6 h-px bg-slate-200 dark:bg-slate-700 my-0.5" />

      {/* Node Creation */}
      <button
        type="button"
        onClick={onAddFloatingNode}
        title="Tambah Node Ide Mengambang (N)"
        className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <PlusSquare className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={onAddChildNode}
        disabled={!hasSelection}
        title={
          hasSelection
            ? 'Tambah Cabang Anak dari Node Terpilih (Tab)'
            : 'Pilih node terlebih dahulu untuk membuat cabang anak'
        }
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
          hasSelection
            ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
        }`}
      >
        <GitBranchPlus className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={onAddTableNode}
        title="Tambah Node Tabel Dinamis"
        className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <Table2 className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={onAddMediaNode}
        title="Tambah Node Media Visual"
        className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <ImagePlus className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={onAddStickyNote}
        title="Tambah Catatan Mengambang"
        className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <StickyNote className="w-4 h-4" />
      </button>

      <div className="w-6 h-px bg-slate-200 dark:bg-slate-700 my-0.5" />

      {/* Layout Organize */}
      <button
        type="button"
        onClick={onOrganizeLayout}
        title="Rapikan Tata Letak Sesuai Template (L)"
        className="w-9 h-9 rounded-lg flex items-center justify-center text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
      >
        <Workflow className="w-4 h-4" />
      </button>

      <div className="w-6 h-px bg-slate-200 dark:bg-slate-700 my-0.5" />

      {/* History */}
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        title="Urungkan (Ctrl+Z)"
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
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
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
          canRedo
            ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
        }`}
      >
        <Redo2 className="w-4 h-4" />
      </button>
    </div>
  );
};
