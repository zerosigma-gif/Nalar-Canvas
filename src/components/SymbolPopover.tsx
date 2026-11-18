import React, { useState } from 'react';
import { NodeTextTarget } from '../types/canvas';

export type SymbolInsertMode = 'badge' | 'content';

interface SymbolPopoverProps {
  activeSymbols: string[];
  activeTextTarget?: NodeTextTarget;
  onToggleNodeSymbol: (symbol: string) => void;
  onClearNodeSymbols?: () => void;
  onInsertIntoText: (target: NodeTextTarget, symbol: string) => void;
  onClose: () => void;
}

const SYMBOL_GROUPS: { label: string; items: string[] }[] = [
  {
    label: 'Ide & Prioritas',
    items: ['★', '✦', '⚡', '⚑', '✓', '✕', '!', '?', '◉', '✿', '⌘', '◈'],
  },
  {
    label: 'Panah & Alur',
    items: ['→', '←', '↑', '↓', '↔', '➜', '↗', '↘', '↺', '↻', '⇒', '⇔'],
  },
  {
    label: 'Logika & Matematika',
    items: ['∑', '∆', '≈', '≠', '≤', '≥', '∞', '±', '×', '÷', '∈', '∀'],
  },
  {
    label: 'Bentuk & Penanda',
    items: ['■', '□', '▲', '△', '●', '○', '◆', '◇', '◷', '⌖', '§', '¶'],
  },
];

export const SymbolPopover: React.FC<SymbolPopoverProps> = ({
  activeSymbols,
  activeTextTarget = 'title',
  onToggleNodeSymbol,
  onClearNodeSymbols,
  onInsertIntoText,
  onClose,
}) => {
  const [mode, setMode] = useState<SymbolInsertMode>(() =>
    activeTextTarget === 'body' ? 'content' : 'badge'
  );

  const handleSymbolClick = (sym: string) => {
    if (mode === 'badge') {
      onToggleNodeSymbol(sym);
    } else {
      onInsertIntoText(activeTextTarget, sym);
    }
  };

  return (
    <div
      className="w-80 max-w-[calc(100vw-24px)] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg p-3 z-50"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
          Sisipkan Simbol
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-1"
        >
          Tutup
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Target Penyisipan Simbol"
        className="grid grid-cols-2 items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg mb-2.5 text-[11px]"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'badge'}
          onClick={() => setMode('badge')}
          className={`py-1 px-2 rounded-md font-medium transition-colors whitespace-nowrap truncate ${
            mode === 'badge'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Penanda Node
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'content'}
          onClick={() => setMode('content')}
          className={`py-1 px-2 rounded-md font-medium transition-colors whitespace-nowrap truncate ${
            mode === 'content'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Isi Node
        </button>
      </div>

      {mode === 'badge' && activeSymbols.length > 0 && (
        <div className="mb-2.5 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1 min-w-0">
            {activeSymbols.map((sym, idx) => (
              <button
                key={`${sym}-${idx}`}
                type="button"
                onClick={() => onToggleNodeSymbol(sym)}
                title={`Hapus penanda ${sym}`}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 hover:border-red-400 hover:text-red-600 transition-colors"
              >
                <span>{sym}</span>
                <span className="text-[10px] opacity-60">×</span>
              </button>
            ))}
          </div>
          {onClearNodeSymbols && (
            <button
              type="button"
              onClick={onClearNodeSymbols}
              className="text-[10px] font-medium text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 shrink-0"
            >
              Bersihkan
            </button>
          )}
        </div>
      )}

      <div className="space-y-2.5 max-h-[min(17.5rem,calc(100dvh-260px))] overflow-y-auto pr-0.5">
        {SYMBOL_GROUPS.map((grp) => (
          <div key={grp.label}>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              {grp.label}
            </div>
            <div className="grid grid-cols-6 gap-1">
              {grp.items.map((sym) => {
                const isSelected = mode === 'badge' && activeSymbols.includes(sym);
                return (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => handleSymbolClick(sym)}
                    title={
                      mode === 'badge'
                        ? isSelected
                          ? `Hapus penanda ${sym}`
                          : `Tambah penanda ${sym}`
                        : activeTextTarget === 'body'
                        ? `Sisipkan ${sym} ke Isi Pembahasan`
                        : `Sisipkan ${sym} ke Judul Node`
                    }
                    className={`h-8 rounded-md text-sm flex items-center justify-center transition-colors border ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-700 dark:text-blue-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    {sym}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
