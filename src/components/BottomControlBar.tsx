import React, { useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  CalendarClock,
  Check,
  Workflow,
  X,
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
  onInsertDateTimeStamp,
  onOrganizeLayout,
  onToggleAutoOrganize,
}) => {
  const [dateTimeInput, setDateTimeInput] = useState<string>(() =>
    toLocalDateTimeInputValue(new Date())
  );
  const [stampFormat, setStampFormat] = useState<StampFormat>('full');
  const [stampedFeedback, setStampedFeedback] = useState(false);
  const [mobileStampOpen, setMobileStampOpen] = useState(false);

  const handleApplyStamp = () => {
    const parsed = dateTimeInput ? new Date(dateTimeInput) : new Date();
    const validDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const formatted = formatStamp(validDate, stampFormat);
    onInsertDateTimeStamp(formatted);
    setStampedFeedback(true);
    setTimeout(() => setStampedFeedback(false), 1200);
    setMobileStampOpen(false);
  };

  const handleStampNow = () => {
    const now = new Date();
    setDateTimeInput(toLocalDateTimeInputValue(now));
    onInsertDateTimeStamp(formatStamp(now, stampFormat));
    setStampedFeedback(true);
    setTimeout(() => setStampedFeedback(false), 1200);
    setMobileStampOpen(false);
  };

  return (
    <>
      {/* Mobile Stamp Popover (only shown when Stamp button is tapped on < md) */}
      {mobileStampOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-30"
            onPointerDown={(e) => {
              e.stopPropagation();
              setMobileStampOpen(false);
            }}
          />
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="md:hidden fixed bottom-[64px] left-1/2 -translate-x-1/2 w-[calc(100vw-24px)] max-w-sm rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-xl p-3.5 z-40 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                <CalendarClock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Stamp Hari & Waktu</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileStampOpen(false)}
                aria-label="Tutup Stamp"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <input
                type="datetime-local"
                value={dateTimeInput}
                onChange={(e) => setDateTimeInput(e.target.value)}
                aria-label="Input Stamp Hari dan Waktu"
                className="w-full h-10 px-3 text-xs font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={stampFormat}
                onChange={(e) => setStampFormat(e.target.value as StampFormat)}
                aria-label="Format Stamp Hari dan Waktu"
                className="w-full h-10 px-3 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="full">Hari, Tanggal & Jam</option>
                <option value="date-time">Tanggal & Jam</option>
                <option value="time-only">Hari & Jam</option>
                <option value="iso">ISO Timestamp</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleApplyStamp}
                className="flex-1 h-10 px-3 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors"
              >
                {hasSelectedNode ? 'Sematkan ke Node' : '+ Buat Node Stamp'}
              </button>
              <button
                type="button"
                onClick={handleStampNow}
                className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                Sekarang
              </button>
            </div>
          </div>
        </>
      )}

      {/* Main Bottom Floating Control Bar */}
      <div
        className="fixed bottom-3 md:bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-md max-w-[calc(100vw-16px)] md:max-w-[calc(100vw-32px)] overflow-x-auto"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Mobile Stamp Trigger (< md) */}
        <button
          type="button"
          onClick={() => setMobileStampOpen((v) => !v)}
          aria-label="Stamp Hari dan Waktu"
          aria-expanded={mobileStampOpen}
          className={`md:hidden h-10 px-2.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            mobileStampOpen || stampedFeedback
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100'
          }`}
        >
          {stampedFeedback ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <CalendarClock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          )}
          <span>Stamp</span>
        </button>

        {/* Desktop / Laptop Inline Day & Time Stamp Controls (>= md, aligned horizontally with Zoom In / Zoom Out) */}
        <div className="hidden md:flex items-center gap-1.5 shrink-0">
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
            className="hidden lg:block h-8 px-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button
            type="button"
            onClick={onZoomOut}
            title="Zoom Out (-)"
            aria-label="Zoom Out"
            className="w-9 h-10 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onResetZoom}
            title="Reset Zoom ke 100%"
            className="h-10 md:h-8 px-1.5 sm:px-2 rounded-lg text-xs font-mono font-semibold tabular-nums text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-w-[44px] sm:min-w-[50px] text-center"
          >
            {Math.round(zoom * 100)}%
          </button>

          <button
            type="button"
            onClick={onZoomIn}
            title="Zoom In (+)"
            aria-label="Zoom In"
            className="w-9 h-10 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onFitView}
            title="Sesuaikan Seluruh Peta ke Layar"
            aria-label="Sesuaikan Seluruh Peta ke Layar"
            className="w-9 h-10 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 shrink-0" />

        {/* Template Layout Realignment & Auto-Organize Trigger */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onOrganizeLayout}
            title="Rapikan Tata Letak Semua Node Sesuai Pola Template (L)"
            aria-label="Rapikan Tata Letak"
            className="h-10 md:h-8 px-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Workflow className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Rapikan</span>
          </button>
          <button
            type="button"
            aria-pressed={autoOrganize}
            onClick={onToggleAutoOrganize}
            title="Otomatis merapikan cabang saat node baru ditambahkan atau dilipat"
            className={`h-10 md:h-8 px-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
              autoOrganize
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Auto
          </button>
        </div>
      </div>
    </>
  );
};
