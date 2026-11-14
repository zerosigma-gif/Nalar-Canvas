import React, { useState } from 'react';
import { Lock, ShieldCheck, KeyRound, X, RefreshCw } from 'lucide-react';

interface EncryptionModalProps {
  e2eeEnabled: boolean;
  keyFingerprint: string | null;
  isLockedNeedsPassphrase: boolean;
  decryptError: string | null;
  onToggleE2ee: (enabled: boolean) => void;
  onSetPassphrase: (passphrase: string) => Promise<void>;
  onRotateRandomKey: () => Promise<void>;
  onUnlockWithPassphrase: (passphrase: string) => Promise<boolean>;
  onClose: () => void;
}

export const EncryptionModal: React.FC<EncryptionModalProps> = ({
  e2eeEnabled,
  keyFingerprint,
  isLockedNeedsPassphrase,
  decryptError,
  onToggleE2ee,
  onSetPassphrase,
  onRotateRandomKey,
  onUnlockWithPassphrase,
  onClose,
}) => {
  const [passphrase, setPassphrase] = useState('');
  const [unlockInput, setUnlockInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleApplyPassphrase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passphrase.trim().length < 4) {
      setStatusMsg('Kata sandi minimal 4 karakter.');
      return;
    }
    setBusy(true);
    setStatusMsg(null);
    try {
      await onSetPassphrase(passphrase.trim());
      setPassphrase('');
      setStatusMsg('Kunci AES-GCM 256-bit baru diterapkan dan papan disinkronkan terenkripsi.');
    } finally {
      setBusy(false);
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockInput.trim()) return;
    setBusy(true);
    try {
      const ok = await onUnlockWithPassphrase(unlockInput.trim());
      if (ok) {
        setUnlockInput('');
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs p-4"
      onClick={isLockedNeedsPassphrase ? undefined : onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
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
          {!isLockedNeedsPassphrase && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {isLockedNeedsPassphrase ? (
          <form onSubmit={handleUnlock} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
              Ruang kolaborasi ini terenkripsi end-to-end. Masukkan frasa sandi proyek atau buka melalui tautan undangan lengkap dengan kunci hash untuk mendekripsi kanvas.
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Frasa Sandi Dekripsi Proyek
              </label>
              <input
                type="password"
                value={unlockInput}
                onChange={(e) => setUnlockInput(e.target.value)}
                placeholder="Masukkan frasa sandi ruang..."
                autoFocus
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {decryptError && (
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                {decryptError}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
            >
              {busy ? 'Mendekripsi...' : 'Buka & Dekripsi Kanvas'}
            </button>
          </form>
        ) : (
          <>
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Enkripsi Proyek Aktif
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Semua node, tabel & media dienkripsi sebelum keluar dari peramban.
                </div>
              </div>
              <button
                type="button"
                onClick={() => onToggleE2ee(!e2eeEnabled)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  e2eeEnabled
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-300'
                }`}
              >
                {e2eeEnabled ? 'Aktif' : 'Nonaktif'}
              </button>
            </div>

            {e2eeEnabled && (
              <>
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Sidik Jari Kunci (SHA-256)
                    </span>
                    <button
                      type="button"
                      onClick={onRotateRandomKey}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Putar Kunci Acak</span>
                    </button>
                  </div>
                  <div className="font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-lg tracking-wider">
                    {keyFingerprint || 'Menghitung...'}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Cocokkan kode sidik jari ini dengan rekan tim untuk memverifikasi enkripsi ujung-ke-ujung yang sama.
                  </p>
                </div>

                <form onSubmit={handleApplyPassphrase} className="space-y-2.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Atur Frasa Sandi Kustom (Opsional)
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        placeholder="Frasa sandi tim (min. 4 karakter)"
                        className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-3 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors inline-flex items-center gap-1 shrink-0"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Terapkan</span>
                    </button>
                  </div>
                  {statusMsg && (
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      {statusMsg}
                    </p>
                  )}
                </form>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
