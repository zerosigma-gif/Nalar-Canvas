import React, { useEffect, useState } from 'react';
import { Copy, Check, Users, RefreshCw, X, KeyRound, Lock, Eye, EyeOff, Clock3 } from 'lucide-react';
import {
  CollaboratorPresence,
  ROOM_LIFETIME_OPTIONS,
  RoomLifetimeInfo,
  RoomLifetimeMinutes,
} from '../types/canvas';
import {
  MAX_PROJECT_PASSWORD_LENGTH,
  MIN_PROJECT_PASSWORD_LENGTH,
  validateProjectPassword,
} from '../utils/passwordPolicy';

interface CollaborationModalProps {
  roomId: string;
  clientId: string;
  isOwner: boolean;
  userName: string;
  userColor: string;
  wsConnected: boolean;
  e2eeEnabled: boolean;
  roomKeyBase64: string | null;
  keyFingerprint: string | null;
  roomLifetime: RoomLifetimeInfo | null;
  peers: CollaboratorPresence[];
  onUpdateProfile: (name: string, color: string) => void;
  onJoinRoom: (nextRoomId: string) => void;
  onSetPassphrase: (passphrase: string) => Promise<void>;
  onSetLifetime: (minutes: RoomLifetimeMinutes) => void;
  onClose: () => void;
}

const USER_COLORS = [
  '#2563EB',
  '#059669',
  '#D97706',
  '#DC2626',
  '#7C3AED',
  '#0891B2',
  '#DB2777',
];

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const CollaborationModal: React.FC<CollaborationModalProps> = ({
  roomId,
  clientId,
  isOwner,
  userName,
  userColor,
  wsConnected,
  e2eeEnabled,
  roomKeyBase64,
  keyFingerprint,
  roomLifetime,
  peers,
  onUpdateProfile,
  onJoinRoom,
  onSetPassphrase,
  onSetLifetime,
  onClose,
}) => {
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const [nameInput, setNameInput] = useState(userName);
  const [colorInput, setColorInput] = useState(userColor);
  const [roomInput, setRoomInput] = useState(roomId);
  const [roomSwitchError, setRoomSwitchError] = useState<string | null>(null);
  const [passphraseInput, setPassphraseInput] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [showInviteKey, setShowInviteKey] = useState(false);
  const [passphraseBusy, setPassphraseBusy] = useState(false);
  const [passphraseFeedback, setPassphraseFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);
  const [copiedFull, setCopiedFull] = useState(false);
  const [copiedPasswordInvite, setCopiedPasswordInvite] = useState(false);

  const policy = validateProjectPassword(passphraseInput);

  const shareUrl = (() => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    url.searchParams.delete('invite');
    if (e2eeEnabled && roomKeyBase64 && window.location.hash.includes('k=')) {
      url.hash = `k=${roomKeyBase64}`;
    } else if (e2eeEnabled && !window.location.hash.includes('k=')) {
      url.searchParams.set('invite', '1');
      url.hash = '';
    } else {
      url.hash = '';
    }
    return url.toString();
  })();

  const hasInviteHashKey = shareUrl.includes('#k=');
  const displayedShareUrl = (() => {
    if (showInviteKey || !hasInviteHashKey) return shareUrl;
    const hashIdx = shareUrl.indexOf('#k=');
    return `${shareUrl.slice(0, hashIdx)}#k=••••••••`;
  })();

  const passwordLoginInviteUrl = (() => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    url.searchParams.set('invite', '1');
    url.hash = '';
    return url.toString();
  })();

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedFull(true);
      setTimeout(() => setCopiedFull(false), 1800);
    } catch {
      // Fallback ignored
    }
  };

  const handleCopyPasswordInvite = async () => {
    try {
      await navigator.clipboard.writeText(passwordLoginInviteUrl);
      setCopiedPasswordInvite(true);
      setTimeout(() => setCopiedPasswordInvite(false), 1800);
    } catch {
      // Fallback ignored
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = nameInput.replace(/[\x00-\x1F\x7F<>]/g, '').trim().slice(0, 40);
    onUpdateProfile(cleaned || 'Kolaborator', colorInput);
  };

  const handleSwitchRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = roomInput.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(cleaned)) {
      setRoomSwitchError(
        'ID ruang harus diawali huruf/angka dan panjang 3-64 karakter (huruf, angka, "-", "_").'
      );
      return;
    }
    setRoomSwitchError(null);
    onJoinRoom(cleaned);
  };

  const handleApplyPassphrase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) return;
    const trimmed = passphraseInput.trim();
    const check = validateProjectPassword(trimmed);
    if (!check.valid) {
      setPassphraseFeedback({
        type: 'err',
        text: check.errors[0] || 'Kata sandi belum memenuhi syarat keamanan.',
      });
      return;
    }
    setPassphraseBusy(true);
    setPassphraseFeedback(null);
    try {
      await onSetPassphrase(trimmed);
      setPassphraseInput('');
      setPassphraseFeedback({
        type: 'ok',
        text: 'Kata sandi kuat diterapkan. Server kini mewajibkan verifikasi sandi ini sebelum mengirim data ruang.',
      });
    } catch {
      setPassphraseFeedback({
        type: 'err',
        text: 'Gagal menerapkan kata sandi proyek.',
      });
    } finally {
      setPassphraseBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <span>Kolaborasi Real-Time</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Status WebSocket:{' '}
              <span
                className={
                  wsConnected
                    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                    : 'text-amber-600 font-semibold'
                }
              >
                {wsConnected ? 'Terhubung Langsung' : 'Menyambung ulang...'}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shareable Encrypted Link */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Tautan Undangan Ruang
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <input
                type="text"
                readOnly
                value={displayedShareUrl}
                className={`w-full h-9 pl-3 ${
                  hasInviteHashKey ? 'pr-9' : 'pr-3'
                } text-xs font-mono leading-normal rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300`}
              />
              {hasInviteHashKey && (
                <button
                  type="button"
                  onClick={() => setShowInviteKey((v) => !v)}
                  aria-label={showInviteKey ? 'Sembunyikan Kunci Tautan' : 'Lihat Kunci Tautan'}
                  title={showInviteKey ? 'Sembunyikan kunci tautan' : 'Tampilkan kunci tautan'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {showInviteKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleCopyInvite}
              className="h-9 px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
            >
              {copiedFull ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedFull ? 'Tersalin' : 'Salin Tautan'}</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Gunakan tautan login sandi agar kolaborator diminta kata sandi saat masuk.
            </p>
            <button
              type="button"
              onClick={handleCopyPasswordInvite}
              className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              {copiedPasswordInvite ? (
                <>
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span>Tautan Login Sandi Tersalin</span>
                </>
              ) : (
                <>
                  <Lock className="w-3 h-3" />
                  <span>Salin Tautan Login Sandi</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Switch / Create Room */}
        <form onSubmit={handleSwitchRoom} className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            ID Ruang Proyek
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={roomInput}
              maxLength={64}
              onChange={(e) => {
                setRoomInput(e.target.value);
                if (roomSwitchError) setRoomSwitchError(null);
              }}
              placeholder="mis. sprint-produk-2026"
              className="flex-1 h-9 px-3 text-xs font-mono leading-normal rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Gabung Ruang</span>
            </button>
          </div>
          {roomSwitchError && (
            <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
              {roomSwitchError}
            </p>
          )}
        </form>

        {/* Room Session Lifetime Selector (30m, 1h, 2h, 24h) */}
        <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5">
              <Clock3 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Batas Masa Hidup Room (Session Lifetime)</span>
            </span>
            {roomLifetime && (
              <span
                className={`text-[11px] font-mono font-semibold tabular-nums ${
                  roomLifetime.expiresAt - nowTick <= 60_000
                    ? 'text-red-600 dark:text-red-400'
                    : roomLifetime.expiresAt - nowTick <= 5 * 60_000
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                Sisa {formatCountdown(roomLifetime.expiresAt - nowTick)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {ROOM_LIFETIME_OPTIONS.map((opt) => {
              const isSelected = roomLifetime?.lifetimeMinutes === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={!wsConnected || !isOwner}
                  onClick={() => onSetLifetime(opt.value)}
                  className={`h-9 px-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                    isSelected
                      ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {!isOwner && (
            <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
              Hanya pembuat ruang yang dapat mengubah masa hidup atau sandi akses ruang.
            </p>
          )}

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            {roomLifetime ? (
              <>
                Berakhir otomatis pada{' '}
                <strong className="text-slate-700 dark:text-slate-200 font-mono">
                  {new Date(roomLifetime.expiresAt).toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {' · '}
                  {new Date(roomLifetime.expiresAt).toLocaleDateString('id-ID', {
                    day: '2-digit',
                    month: 'short',
                  })}
                </strong>
                . Room tetap bertahan selama masa aktif meski sempat kosong; tepat saat tenggat habis seluruh koneksi diputus paksa &amp; room dihapus otomatis.
              </>
            ) : (
              'Pilih batas waktu pemakaian room. Saat tenggat berakhir, seluruh koneksi WebSocket diputus dan room dihapus dari memori server.'
            )}
          </p>
        </div>

        {/* Project Passphrase Setting (E2EE) */}
        <form
          onSubmit={handleApplyPassphrase}
          className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800"
        >
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Frasa Kata Sandi Proyek (E2EE)
            </label>
            {keyFingerprint && (
              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Kunci: {keyFingerprint}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={showPassphrase ? 'text' : 'password'}
                value={passphraseInput}
                disabled={!isOwner}
                maxLength={MAX_PROJECT_PASSWORD_LENGTH}
                onChange={(e) => setPassphraseInput(e.target.value)}
                placeholder={
                  isOwner
                    ? `Minimal ${MIN_PROJECT_PASSWORD_LENGTH} karakter (huruf besar, kecil, angka)`
                    : 'Hanya pembuat ruang yang dapat mengatur sandi'
                }
                className="w-full h-9 pl-8 pr-8 text-xs leading-normal rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                disabled={!isOwner}
                onClick={() => setShowPassphrase((v) => !v)}
                aria-label={showPassphrase ? 'Sembunyikan Sandi' : 'Lihat Sandi'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-50"
              >
                {showPassphrase ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <button
              type="submit"
              disabled={!isOwner || passphraseBusy || !policy.valid}
              className="h-9 px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{passphraseBusy ? 'Menyimpan...' : 'Terapkan Sandi'}</span>
            </button>
          </div>
          {passphraseInput.length > 0 && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1 text-[11px]">
              <span
                className={
                  policy.checks.minLength
                    ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                    : 'text-slate-500 dark:text-slate-400'
                }
              >
                {policy.checks.minLength ? '✓' : '•'} Min. {MIN_PROJECT_PASSWORD_LENGTH} karakter
              </span>
              <span
                className={
                  policy.checks.hasUpper && policy.checks.hasLower
                    ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                    : 'text-slate-500 dark:text-slate-400'
                }
              >
                {policy.checks.hasUpper && policy.checks.hasLower ? '✓' : '•'} Huruf besar &amp; kecil
              </span>
              <span
                className={
                  policy.checks.hasNumber
                    ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                    : 'text-slate-500 dark:text-slate-400'
                }
              >
                {policy.checks.hasNumber ? '✓' : '•'} Mengandung angka
              </span>
              <span
                className={
                  policy.checks.notPredictable
                    ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                    : 'text-red-600 dark:text-red-400 font-medium'
                }
              >
                {policy.checks.notPredictable ? '✓' : '✕'} Bukan pola/tebakan umum
              </span>
            </div>
          )}
          {passphraseFeedback && (
            <p
              className={`text-[11px] font-medium ${
                passphraseFeedback.type === 'ok'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {passphraseFeedback.text}
            </p>
          )}
        </form>

        {/* Identity Settings */}
        <form onSubmit={handleSaveProfile} className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Identitas Kursor Anda
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Nama Anda"
              className="flex-1 min-w-[150px] h-9 px-3 text-xs leading-normal rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex items-center gap-1.5">
              {USER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColorInput(c)}
                  style={{ backgroundColor: c }}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${
                    colorInput === c
                      ? 'border-slate-900 dark:border-white scale-110'
                      : 'border-transparent'
                  }`}
                />
              ))}
            </div>
            <button
              type="submit"
              className="h-9 px-3 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-semibold hover:bg-slate-800 transition-colors shrink-0 whitespace-nowrap"
            >
              Simpan
            </button>
          </div>
        </form>

        {/* Connected Peers */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Kolaborator di Ruang Ini ({peers.length})
          </div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {peers.map((peer) => (
              <div
                key={peer.clientId}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: peer.color }}
                  />
                  <span className="font-medium text-slate-800 dark:text-slate-100 truncate">
                    {peer.name}
                    {peer.clientId === clientId ? ' (Anda)' : ''}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  {peer.cursor ? 'Aktif di kanvas' : 'Terhubung'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
