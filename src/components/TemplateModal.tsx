import React from 'react';
import { X, ArrowRight, Workflow, FilePlus2 } from 'lucide-react';
import { TemplateId } from '../types/canvas';
import { TEMPLATE_CATALOG } from '../utils/templates';

interface TemplateModalProps {
  currentTemplateId: TemplateId;
  onApplyTemplate: (templateId: TemplateId) => void;
  onRealignToTemplate: (templateId: TemplateId) => void;
  onCreateFromScratch: () => void;
  onClose: () => void;
}

const TemplateSchematic: React.FC<{ id: TemplateId }> = ({ id }) => {
  if (id === 'fishbone') {
    return (
      <svg viewBox="0 0 180 90" className="w-full h-24 text-slate-400 dark:text-slate-500">
        <line x1="18" y1="45" x2="132" y2="45" stroke="currentColor" strokeWidth="2.5" />
        <rect x="132" y="33" width="36" height="24" rx="4" fill="#FEE2E2" stroke="#DC2626" strokeWidth="1.5" />
        <line x1="40" y1="15" x2="62" y2="45" stroke="#2563EB" strokeWidth="1.5" />
        <line x1="85" y1="15" x2="107" y2="45" stroke="#059669" strokeWidth="1.5" />
        <line x1="40" y1="75" x2="62" y2="45" stroke="#D97706" strokeWidth="1.5" />
        <line x1="85" y1="75" x2="107" y2="45" stroke="#7C3AED" strokeWidth="1.5" />
        <rect x="20" y="8" width="36" height="12" rx="3" fill="#EFF6FF" stroke="#2563EB" strokeWidth="1" />
        <rect x="65" y="8" width="36" height="12" rx="3" fill="#ECFDF5" stroke="#059669" strokeWidth="1" />
        <rect x="20" y="70" width="36" height="12" rx="3" fill="#FFFBEB" stroke="#D97706" strokeWidth="1" />
        <rect x="65" y="70" width="36" height="12" rx="3" fill="#EEF2FF" stroke="#7C3AED" strokeWidth="1" />
      </svg>
    );
  }
  if (id === 'tree') {
    return (
      <svg viewBox="0 0 180 90" className="w-full h-24">
        <rect x="66" y="10" width="48" height="16" rx="4" fill="#EFF6FF" stroke="#2563EB" strokeWidth="1.5" />
        <path d="M90 26 V38 H35 V50 M90 38 V50 M90 38 H145 V50" fill="none" stroke="#64748B" strokeWidth="1.5" />
        <rect x="15" y="50" width="40" height="14" rx="3" fill="#FFFFFF" stroke="#2563EB" strokeWidth="1.2" />
        <rect x="70" y="50" width="40" height="14" rx="3" fill="#ECFDF5" stroke="#059669" strokeWidth="1.2" />
        <rect x="125" y="50" width="40" height="14" rx="3" fill="#FFFBEB" stroke="#D97706" strokeWidth="1.2" />
      </svg>
    );
  }
  if (id === 'star-bursting') {
    return (
      <svg viewBox="0 0 180 90" className="w-full h-24">
        <g stroke="#94A3B8" strokeWidth="1.2">
          <line x1="90" y1="45" x2="90" y2="14" />
          <line x1="90" y1="45" x2="132" y2="24" />
          <line x1="90" y1="45" x2="132" y2="66" />
          <line x1="90" y1="45" x2="90" y2="76" />
          <line x1="90" y1="45" x2="48" y2="66" />
          <line x1="90" y1="45" x2="48" y2="24" />
        </g>
        <rect x="70" y="36" width="40" height="18" rx="4" fill="#EFF6FF" stroke="#2563EB" strokeWidth="1.5" />
        {[
          [80, 6],
          [124, 17],
          [124, 60],
          [80, 72],
          [34, 60],
          [34, 17],
        ].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="22" height="12" rx="3" fill="#FFFFFF" stroke="#64748B" strokeWidth="1" />
        ))}
      </svg>
    );
  }
  if (id === 'lotus-blossom') {
    return (
      <svg viewBox="0 0 180 90" className="w-full h-24">
        <g stroke="#CBD5E1" strokeWidth="1">
          {[0, 1, 2].map((r) =>
            [0, 1, 2].map((c) => (
              <rect
                key={`${r}-${c}`}
                x={63 + c * 18}
                y={18 + r * 18}
                width="16"
                height="16"
                rx="2"
                fill={r === 1 && c === 1 ? '#DBEAFE' : '#F8FAFC'}
                stroke={r === 1 && c === 1 ? '#2563EB' : '#94A3B8'}
              />
            ))
          )}
        </g>
        <rect x="26" y="37" width="24" height="16" rx="3" fill="#ECFDF5" stroke="#059669" strokeWidth="1" />
        <rect x="130" y="37" width="24" height="16" rx="3" fill="#FFFBEB" stroke="#D97706" strokeWidth="1" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 180 90" className="w-full h-24">
      <path d="M90 45 C65 45, 55 22, 34 22" fill="none" stroke="#059669" strokeWidth="1.8" />
      <path d="M90 45 C65 45, 55 68, 34 68" fill="none" stroke="#D97706" strokeWidth="1.8" />
      <path d="M90 45 C115 45, 125 22, 146 22" fill="none" stroke="#7C3AED" strokeWidth="1.8" />
      <path d="M90 45 C115 45, 125 68, 146 68" fill="none" stroke="#DC2626" strokeWidth="1.8" />
      <rect x="68" y="36" width="44" height="18" rx="5" fill="#EFF6FF" stroke="#2563EB" strokeWidth="1.5" />
      <rect x="12" y="14" width="34" height="14" rx="3" fill="#ECFDF5" stroke="#059669" strokeWidth="1" />
      <rect x="12" y="61" width="34" height="14" rx="3" fill="#FFFBEB" stroke="#D97706" strokeWidth="1" />
      <rect x="134" y="14" width="34" height="14" rx="3" fill="#EEF2FF" stroke="#7C3AED" strokeWidth="1" />
      <rect x="134" y="61" width="34" height="14" rx="3" fill="#FFF1F2" stroke="#DC2626" strokeWidth="1" />
    </svg>
  );
};

export const TemplateModal: React.FC<TemplateModalProps> = ({
  currentTemplateId,
  onApplyTemplate,
  onRealignToTemplate,
  onCreateFromScratch,
  onClose,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-xs p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4 shrink-0">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
              Template Percabangan Brainstorming
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pilih kerangka berpikir untuk menata ulang ide yang ada atau memuat contoh baru ke kanvas.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Menu Template"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TEMPLATE_CATALOG.map((tpl) => {
              const active = tpl.id === currentTemplateId;
              return (
                <div
                  key={tpl.id}
                  className={`text-left rounded-xl border p-4 transition-all flex flex-col justify-between ${
                    active
                      ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/25'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50'
                  }`}
                >
                  <div>
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 mb-3 p-2">
                      <TemplateSchematic id={tpl.id} />
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {tpl.name}
                    </div>
                    <div className="text-[11px] font-medium text-blue-600 dark:text-blue-400 mt-0.5">
                      {tpl.subtitle}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                      {tpl.description}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onRealignToTemplate(tpl.id);
                        onClose();
                      }}
                      className="w-full py-2 px-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <Workflow className="w-3.5 h-3.5" />
                      <span>Susun Node Saat Ini ke Pola Ini</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onApplyTemplate(tpl.id);
                        onClose();
                      }}
                      className="w-full py-2 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium transition-colors inline-flex items-center justify-between whitespace-nowrap"
                    >
                      <span>{active ? 'Muat Ulang Contoh' : 'Muat Contoh Template'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* From Scratch — Blank Empty Canvas */}
            <div className="text-left rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 transition-all flex flex-col justify-between bg-slate-50/60 dark:bg-slate-950/60">
              <div>
                <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 mb-3 p-2">
                  <svg viewBox="0 0 180 90" className="w-full h-24 text-slate-400 dark:text-slate-500">
                    <rect
                      x="22"
                      y="14"
                      width="136"
                      height="62"
                      rx="8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />
                    <circle cx="90" cy="45" r="14" fill="#EFF6FF" stroke="#2563EB" strokeWidth="1.5" />
                    <line x1="84" y1="45" x2="96" y2="45" stroke="#2563EB" strokeWidth="1.8" strokeLinecap="round" />
                    <line x1="90" y1="39" x2="90" y2="51" stroke="#2563EB" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  From Scratch
                </div>
                <div className="text-[11px] font-medium text-blue-600 dark:text-blue-400 mt-0.5">
                  Kanvas Kosong Bebas
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                  Hadirkan kanvas kosong tanpa node maupun garis awal agar Anda bebas menyusun gagasan, tabel, dan koneksi sendiri.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/80 dark:border-slate-800 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onCreateFromScratch();
                    onClose();
                  }}
                  className="w-full py-2 px-2.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-700 text-xs font-semibold transition-colors inline-flex items-center justify-between whitespace-nowrap"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <FilePlus2 className="w-3.5 h-3.5" />
                    <span>Mulai From Scratch</span>
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


