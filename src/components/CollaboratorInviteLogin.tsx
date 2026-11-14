import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Moon,
  ShieldCheck,
  Sun,
  Users,
  AlertCircle,
  ArrowRight,
  PlusCircle,
} from 'lucide-react';

interface CollaboratorInviteLoginProps {
  roomId: string;
  initialName: string;
  initialColor: string;
  wsConnected: boolean;
  peerCount: number;
  envelopeFingerprint: string | null;
  decryptError: string | null;
  darkMode: boolean;
  onToggleTheme: () => void;
  onSubmitLogin: (params: {
    name: string;
    color: string;
    passphrase: string;
  }) => Promise<boolean>;
  onCreateOwnRoom: () => void;
}

const CURSOR_COLORS = [
  '#2563EB',
  '#059669',
  '#D97706',
  '#DC2626',
  '#7C3AED',
  '#0891B2',
  '#DB2777',
];

export const CollaboratorInviteLogin: React.FC<CollaboratorInviteLoginProps> = ({
  roomId,
  initialName,
  initialColor,
  wsConnected,
  peerCount,
  envelopeFingerprint,
  decryptError,
  darkMode,
  onToggleTheme,
  onSubmitLogin,
  onCreateOwnRoom,
}) => {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [passphrase, setPassphrase] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dotColor = darkMode ? 'rgba(148, 163, 184, 0.16)' : 'rgba(100, 116, 139, 0.24)';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const trimmedPass = passphrase.trim();
    if (trimmedPass.length < 4) {
      setLocalError('Masukkan kata sandi proyek minimal 4 karakter.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmitLogin({
        name: name.trim() || 'Kolaborator',
        color,
        passphrase: trimmedPass,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const activeError = localError || decryptError;

  return (
    <div
      style={{
        backgroundImage: `radial-gradient(circle, ${dotColor} 1.15px, transparent 1.15px)`,
        backgroundSize: '28px 28px',
      }}
      className="min-h-screen w-full bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 flex flex-col"
    >
      {/* Clean Minimal Header */}
      <header className="h-14 px-6 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/80 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md">
        <span className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
          NalarCanvas
        </span>
        <button
          type="button"
          onClick={onToggleTheme}
          title={darkMode ? 'Mode Terang' : 'Mode Gelap'}
          aria-label="Ganti Tema"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </header>

      {/* Centered Login Card */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg p-6 sm:p-7 space-y-6">
          {/* Header & Room Context */}
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Masuk Undangan Kolaborasi
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Ruang brainstorming ini dilindungi enkripsi end-to-end. Masukkan nama tampilan dan kata sandi proyek untuk mendekripsi kanvas.
            </p>

            {/* Unboxed Metadata Line */}
            <div className="pt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums">
              <span className="inline-flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-100">
                <Lock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                {roomId}
              </span>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
              <span className="inline-flex items-center gap-1">
                <Users className="w-3 h-3 text-slate-400" />
                {peerCount} kolaborator
              </span>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
              <span className={wsConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'}>
                {wsConnected ? 'Server siap' : 'Menghubungkan...'}
              </span>
            </div>

            {envelopeFingerprint && (
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Sidik jari enkripsi: {envelopeFingerprint}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Collaborator Name */}
            <div className="space-y-1.5">
              <label
                htmlFor="invite-name"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Nama Tampilan Kolaborator
              </label>
              <input
                id="invite-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama Anda di kanvas"
                className="w-full h-10 px-3 text-sm leading-normal rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Cursor Color */}
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Warna Kursor Kolaborasi
              </span>
              <div className="flex items-center gap-2">
                {CURSOR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Pilih warna ${c}`}
                    style={{ backgroundColor: c }}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${
                      color === c
                        ? 'border-slate-900 dark:border-white scale-110'
                        : 'border-transparent opacity-80 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Project Password / Passphrase Input */}
            <div className="space-y-1.5">
              <label
                htmlFor="invite-password"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Kata Sandi Proyek
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="invite-password"
                  type={showPassword ? 'text' : 'password'}
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Masukkan kata sandi undangan proyek"
                  autoFocus
                  className="w-full h-10 pl-9 pr-10 text-sm leading-normal rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Sembunyikan Kata Sandi' : 'Lihat Kata Sandi'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Accessible Error Message */}
            {activeError && (
              <div
                role="alert"
                className="flex items-start gap-2 p-3 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{activeError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <span>{submitting ? 'Memverifikasi & Mendekripsi...' : 'Masuk ke Ruang Kerja'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Tidak punya sandi ruang ini?
            </span>
            <button
              type="button"
              onClick={onCreateOwnRoom}
              className="text-xs font-semibold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 inline-flex items-center gap-1 whitespace-nowrap"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Buat Ruang Baru</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
