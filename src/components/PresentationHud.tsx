import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Pause,
  Play,
  X,
} from 'lucide-react';

interface PresentationHudProps {
  currentIndex: number;
  totalCount: number;
  activeTitle: string;
  autoPlay: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToggleAutoPlay: () => void;
  onFitOverview: () => void;
  onExit: () => void;
}

export const PresentationHud: React.FC<PresentationHudProps> = ({
  currentIndex,
  totalCount,
  activeTitle,
  autoPlay,
  onPrev,
  onNext,
  onToggleAutoPlay,
  onFitOverview,
  onExit,
}) => {
  const safeTotal = Math.max(1, totalCount);
  const displayStep = totalCount > 0 ? currentIndex + 1 : 0;
  const progressPct = totalCount > 0 ? ((currentIndex + 1) / safeTotal) * 100 : 0;

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-auto max-w-[calc(100vw-24px)] rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden"
    >
      {/* Thin top progress track */}
      <div className="h-1 w-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full bg-blue-600 transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="px-2.5 sm:px-3.5 py-2 flex items-center gap-1.5 sm:gap-2.5">
        <button
          type="button"
          onClick={onPrev}
          disabled={totalCount <= 1}
          title="Node Sebelumnya (←)"
          aria-label="Node Sebelumnya"
          className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors shrink-0"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="min-w-0 px-1 sm:px-2 text-center">
          <div className="text-[11px] font-mono font-semibold tabular-nums text-blue-600 dark:text-blue-400">
            {displayStep} / {totalCount}
          </div>
          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[120px] sm:max-w-[220px]">
            {activeTitle || 'Tanpa Judul'}
          </div>
        </div>

        <button
          type="button"
          onClick={onNext}
          disabled={totalCount <= 1}
          title="Node Berikutnya (→ atau Spasi)"
          aria-label="Node Berikutnya"
          className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors shrink-0"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 shrink-0" />

        <button
          type="button"
          onClick={onToggleAutoPlay}
          disabled={totalCount <= 1}
          title={autoPlay ? 'Jeda Putar Otomatis' : 'Putar Presentasi Otomatis'}
          aria-label={autoPlay ? 'Jeda Putar Otomatis' : 'Putar Presentasi Otomatis'}
          className={`h-10 sm:h-9 px-2.5 rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            autoPlay
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {autoPlay ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span className="hidden md:inline">{autoPlay ? 'Jeda' : 'Otomatis'}</span>
        </button>

        <button
          type="button"
          onClick={onFitOverview}
          title="Lihat Seluruh Peta"
          aria-label="Lihat Seluruh Peta"
          className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onExit}
          title="Keluar Mode Presentasi (Esc)"
          aria-label="Keluar Mode Presentasi"
          className="h-10 sm:h-9 px-2.5 sm:px-3 rounded-xl bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <X className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Keluar</span>
        </button>
      </div>
    </div>
  );
};
