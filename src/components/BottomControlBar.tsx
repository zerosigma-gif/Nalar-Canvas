import React, { useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  CalendarClock,
  Check,
  LocateFixed,
  Workflow,
} from 'lucide-react';
import { StampFormat } from '../types/canvas';
import { formatStamp } from '../utils/templates';

interface BottomControlBarProps {
  zoom: number;
  hasSelectedNode: boolean;
  autoOrganize: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitView: () => void;
  onCenterOrigin: () => void;
  onInsertDateTimeStamp: (formattedStamp: string) => void;
  onOrganizeLayout: () => void;
  onToggleAutoOrganize: () => void;
}

function toLocalDateTimeInputValue(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export const BottomControlBar: React.FC<BottomControlBarProps> = ({
  zoom,
  hasSelectedNode,
  autoOrganize,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitView,
  onCenterOrigin,
  onInsertDateTimeStamp,
  onOrganizeLayout,
  onToggleAutoOrganize,
}) => {
  const [dateTimeInput, setDateTimeInput] = useState<string>(() =>
    toLocalDateTimeInputValue(new Date())
  );
  const [stampFormat, setStampFormat] = useState<StampFormat>('full');
  const [stampedFeedback, setStampedFeedback] = useState(false);

  const handleApplyStamp = () => {
    const parsed = dateTimeInput ? new Date(dateTimeInput) : new Date();
    const validDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const formatted = formatStamp(validDate, stampFormat);
    onInsertDateTimeStamp(formatted);
    setStampedFeedback(true);
    setTimeout(() => setStampedFeedback(false), 1200);
  };

  const handleStampNow = () => {
    const now = new Date();
    setDateTimeInput(toLocalDateTimeInputValue(now));
    onInsertDateTimeStamp(formatStamp(now, stampFormat));
    setStampedFeedback(true);
    setTimeout(() => setStampedFeedback(false), 1200);
  };

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-md max-w-[calc(100vw-24px)] overflow-x-auto"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Inline Day & Time Stamp Input Controls (aligned horizontally with Zoom In / Zoom Out) */}
      <div className="flex items-center gap-1.5 shrink-0">
        <CalendarClock className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
        <input
          type="datetime-local"
          value={dateTimeInput}
          onChange={(e) => setDateTimeInput(e.target.value)}
          aria-label="Input Stamp Hari dan Waktu"
          className="h-8 px-2 text-xs font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={stampFormat}
          onChange={(e) => setStampFormat(e.target.value as StampFormat)}
          aria-label="Format Stamp Hari dan Waktu"
          className="h-8 px-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 hidden sm:block"
        >
          <option value="full">Hari, Tgl & Jam</option>
          <option value="date-time">Tgl & Jam</option>
          <option value="time-only">Hari & Jam</option>
          <option value="iso">ISO</option>
        </select>
        <button
          type="button"
          onClick={handleApplyStamp}
          title={
            hasSelectedNode
              ? 'Sisipkan stamp ke node terpilih'
              : 'Buat catatan ide baru dengan stamp ini'
          }
          className="h-8 px-2.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0"
        >
          {stampedFeedback ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400 dark:text-white" />
              <span>Tersemat</span>
            </>
          ) : (
            <span>{hasSelectedNode ? 'Stamp Node' : '+ Stamp'}</span>
          )}
        </button>
        <button
          type="button"
          onClick={handleStampNow}
          title="Gunakan Waktu Saat Ini"
          className="h-8 px-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          Sekarang
        </button>
      </div>

      <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 shrink-0" />

      {/* Parallel Zoom Out & Zoom In Controls */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onZoomOut}
          title="Zoom Out (-)"
          aria-label="Zoom Out"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onResetZoom}
          title="Reset Zoom ke 100%"
          className="h-8 px-2 rounded-lg text-xs font-mono font-semibold tabular-nums text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-w-[52px] text-center"
        >
          {Math.round(zoom * 100)}%
        </button>

        <button
          type="button"
          onClick={onZoomIn}
          title="Zoom In (+)"
          aria-label="Zoom In"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onFitView}
          title="Sesuaikan Seluruh Peta ke Layar"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onCenterOrigin}
          title="Pusatkan ke Titik Awal"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <LocateFixed className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 shrink-0" />

      {/* Template Layout Realignment & Auto-Organize Trigger */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onOrganizeLayout}
          title="Rapikan Tata Letak Semua Node Sesuai Pola Template (L)"
          className="h-8 px-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Workflow className="w-3.5 h-3.5" />
          <span>Rapikan</span>
        </button>
        <button
          type="button"
          aria-pressed={autoOrganize}
          onClick={onToggleAutoOrganize}
          title="Otomatis merapikan cabang saat node baru ditambahkan atau dilipat"
          className={`h-8 px-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
            autoOrganize
              ? 'bg-emerald-600 border-emerald-600 text-white'
              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Auto
        </button>
      </div>
    </div>
  );
};
