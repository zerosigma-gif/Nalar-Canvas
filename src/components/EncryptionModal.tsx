import React, { useState } from 'react';
import { ShieldCheck, X, RefreshCw, Users } from 'lucide-react';

interface EncryptionModalProps {
  e2eeEnabled: boolean;
  keyFingerprint: string | null;
  onToggleE2ee: (enabled: boolean) => void;
  onRotateRandomKey: () => Promise<void>;
  onOpenCollaboration: () => void;
  onClose: () => void;
}

export const EncryptionModal: React.FC<EncryptionModalProps> = ({
  e2eeEnabled,
  keyFingerprint,
  onToggleE2ee,
  onRotateRandomKey,
  onOpenCollaboration,
  onClose,
}) => {
  const [rotating, setRotating] = useState(false);

  const handleRotate = async () => {
    setRotating(true);
    try {
      await onRotateRandomKey();
    } finally {
      setRotating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-6 space-y-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Brankas Enkripsi End-to-End
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                AES-GCM 256-bit · PBKDF2 SHA-256
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Enkripsi Proyek Aktif
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Semua node, tabel, dan media dienkripsi di peramban sebelum dikirim.
            </div>
          </div>
          <button
            type="button"
            onClick={() => onToggleE2ee(!e2eeEnabled)}
            className={`h-9 px-3.5 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
              e2eeEnabled
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {e2eeEnabled ? 'Aktif' : 'Nonaktif'}
          </button>
        </div>

        {e2eeEnabled && (
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Sidik Jari Kunci (SHA-256)
              </span>
              <button
                type="button"
                onClick={handleRotate}
                disabled={rotating}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-60"
              >
                <RefreshCw className={`w-3 h-3 ${rotating ? 'animate-spin' : ''}`} />
                <span>Putar Kunci Acak</span>
              </button>
            </div>
            <div className="font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-lg tracking-wider">
              {keyFingerprint || 'Menghitung...'}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Cocokkan sidik jari ini dengan rekan tim untuk memverifikasi kunci enkripsi yang sama.
            </p>
          </div>
        )}

        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Ingin mengatur kata sandi undangan tim?
          </span>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenCollaboration();
            }}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Buka Kolaborasi</span>
          </button>
        </div>
      </div>
    </div>
  );
};

