import React, { useState } from 'react';

interface SymbolPopoverProps {
  activeSymbols: string[];
  onToggleNodeSymbol: (symbol: string) => void;
  onInsertIntoText: (symbol: string) => void;
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
  onToggleNodeSymbol,
  onInsertIntoText,
  onClose,
}) => {
  const [mode, setMode] = useState<'badge' | 'text'>('badge');

  return (
    <div
      className="w-72 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg p-3 z-50"
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

      <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg mb-2.5 text-[11px]">
        <button
          type="button"
          onClick={() => setMode('badge')}
          className={`flex-1 py-1 rounded-md font-medium transition-colors ${
            mode === 'badge'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Penanda Node
        </button>
        <button
          type="button"
          onClick={() => setMode('text')}
          className={`flex-1 py-1 rounded-md font-medium transition-colors ${
            mode === 'text'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Ke Teks Judul
        </button>
      </div>

      <div className="space-y-2.5 max-h-60 overflow-y-auto pr-0.5">
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
                    onClick={() =>
                      mode === 'badge' ? onToggleNodeSymbol(sym) : onInsertIntoText(sym)
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
