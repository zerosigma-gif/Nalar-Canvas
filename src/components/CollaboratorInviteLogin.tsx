import React, { useEffect, useState } from 'react';
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
  Clock3,
} from 'lucide-react';
import {
  MIN_PROJECT_PASSWORD_LENGTH,
  validateLoginPasswordFormat,
} from '../utils/passwordPolicy';

interface CollaboratorInviteLoginProps {
  roomId: string;
  initialName: string;
  initialColor: string;
  wsConnected: boolean;
  peerCount: number;
  envelopeFingerprint: string | null;
  decryptError: string | null;
  cooldownLockedUntil: number;
  failedAttempts: number;
  roomNotFound: boolean;
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

function formatCooldownSeconds(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const CollaboratorInviteLogin: React.FC<CollaboratorInviteLoginProps> = ({
  roomId,
  initialName,
  initialColor,
  wsConnected,
  peerCount,
  envelopeFingerprint,
  decryptError,
  cooldownLockedUntil,
  failedAttempts,
  roomNotFound,
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
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (cooldownLockedUntil <= Date.now()) return;
    setNowTick(Date.now());
    const timer = window.setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      if (now >= cooldownLockedUntil) {
        window.clearInterval(timer);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [cooldownLockedUntil]);

  const remainingCooldownSec =
    cooldownLockedUntil > nowTick
      ? Math.max(1, Math.ceil((cooldownLockedUntil - nowTick) / 1000))
      : 0;
  const isCooldownActive = remainingCooldownSec > 0;

  const dotColor = darkMode ? 'rgba(148, 163, 184, 0.16)' : 'rgba(100, 116, 139, 0.24)';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCooldownActive || submitting || roomNotFound) return;
    setLocalError(null);

    const sanitizedName = name.replace(/[\x00-\x1F\x7F<>]/g, '').trim().slice(0, 40);
    if (!sanitizedName) {
      setLocalError('Masukkan nama tampilan kolaborator yang valid (tanpa karakter "<" atau ">").');
      return;
    }

    const formatError = validateLoginPasswordFormat(passphrase);
    if (formatError) {
      setLocalError(formatError);
      return;
    }

    setSubmitting(true);
    try {
      const ok = await onSubmitLogin({
        name: sanitizedName,
        color,
        passphrase: passphrase.trim(),
      });
      if (!ok) {
        setPassphrase('');
      }
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
              {roomNotFound ? 'Ruang Kolaborasi Tidak Tersedia' : 'Masuk Undangan Kolaborasi'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {roomNotFound
                ? 'Ruang proyek ini belum dibuat, telah kedaluwarsa, atau sudah dihapus dari memori server.'
                : 'Akses ruang diverifikasi di server sebelum data kanvas dikirimkan. Masukkan nama tampilan dan kata sandi proyek yang tepat.'}
            </p>

            {/* Unboxed Metadata Line */}
            <div className="pt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums">
              <span className="inline-flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-100">
                <Lock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                {roomId}
              </span>
              {!roomNotFound && (
                <>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="w-3 h-3 text-slate-400" />
                    {peerCount} kolaborator
                  </span>
                </>
              )}
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
              <span className={wsConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'}>
                {wsConnected ? 'Server siap' : 'Menghubungkan...'}
              </span>
            </div>

            {envelopeFingerprint && !roomNotFound && (
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Sidik jari enkripsi: {envelopeFingerprint}
              </div>
            )}
          </div>

          {!roomNotFound ? (
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
                  maxLength={40}
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
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="invite-password"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Kata Sandi Proyek (Min. {MIN_PROJECT_PASSWORD_LENGTH} Karakter)
                  </label>
                  {failedAttempts > 0 && (
                    <span className="text-[11px] font-mono tabular-nums text-amber-600 dark:text-amber-400">
                      Percobaan gagal: {failedAttempts}x
                    </span>
                  )}
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="invite-password"
                    type={showPassword ? 'text' : 'password'}
                    value={passphrase}
                    disabled={isCooldownActive || submitting}
                    maxLength={128}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder={
                      isCooldownActive
                        ? `Terkunci sementara (${remainingCooldownSec} detik)...`
                        : `Masukkan kata sandi proyek (min. ${MIN_PROJECT_PASSWORD_LENGTH} karakter)`
                    }
                    autoFocus={!isCooldownActive}
                    className="w-full h-10 pl-9 pr-10 text-sm leading-normal rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 dark:disabled:bg-slate-800/80 disabled:text-slate-500 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    disabled={isCooldownActive}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Sembunyikan Kata Sandi' : 'Lihat Kata Sandi'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-40"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {isCooldownActive && (
                  <div
                    role="status"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-800 dark:text-amber-200"
                  >
                    <Clock3 className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                      Jeda keamanan aktif. Kolom kata sandi dapat diisi kembali dalam{' '}
                      <strong className="font-mono tabular-nums">
                        {formatCooldownSeconds(remainingCooldownSec)}
                      </strong>
                      .
                    </span>
                  </div>
                )}
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
                disabled={submitting || isCooldownActive || !wsConnected}
                className="w-full h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <span>
                  {isCooldownActive
                    ? `Tunggu ${formatCooldownSeconds(remainingCooldownSec)}...`
                    : submitting
                    ? 'Memverifikasi di Server...'
                    : 'Verifikasi & Masuk Ruang'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              {activeError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 dark:border-amber-900/70 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-200"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{activeError}</span>
                </div>
              )}
              <button
                type="button"
                onClick={onCreateOwnRoom}
                className="w-full h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Buat Ruang Kanvas Baru</span>
              </button>
            </div>
          )}

          {!roomNotFound && (
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
          )}
        </div>
      </main>
    </div>
  );
};
