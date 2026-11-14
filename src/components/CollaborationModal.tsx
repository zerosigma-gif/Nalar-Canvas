import React, { useState } from 'react';
import { Copy, Check, Users, RefreshCw, X } from 'lucide-react';
import { CollaboratorPresence } from '../types/canvas';

interface CollaborationModalProps {
  roomId: string;
  clientId: string;
  userName: string;
  userColor: string;
  wsConnected: boolean;
  e2eeEnabled: boolean;
  roomKeyBase64: string | null;
  peers: CollaboratorPresence[];
  onUpdateProfile: (name: string, color: string) => void;
  onJoinRoom: (nextRoomId: string) => void;
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

export const CollaborationModal: React.FC<CollaborationModalProps> = ({
  roomId,
  clientId,
  userName,
  userColor,
  wsConnected,
  e2eeEnabled,
  roomKeyBase64,
  peers,
  onUpdateProfile,
  onJoinRoom,
  onClose,
}) => {
  const [nameInput, setNameInput] = useState(userName);
  const [colorInput, setColorInput] = useState(userColor);
  const [roomInput, setRoomInput] = useState(roomId);
  const [copiedFull, setCopiedFull] = useState(false);

  const shareUrl = (() => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    if (e2eeEnabled && roomKeyBase64) {
      url.hash = `k=${roomKeyBase64}`;
    } else {
      url.hash = '';
    }
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

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile(nameInput.trim() || 'Kolaborator', colorInput);
  };

  const handleSwitchRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = roomInput.trim().replace(/[^a-zA-Z0-9-_]/g, '');
    if (cleaned) {
      onJoinRoom(cleaned);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto"
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
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Tautan Undangan Ruang {e2eeEnabled ? '(Termasuk Kunci E2EE di Hash Lokal)' : ''}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300"
            />
            <button
              type="button"
              onClick={handleCopyInvite}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors inline-flex items-center gap-1.5 shrink-0"
            >
              {copiedFull ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedFull ? 'Tersalin' : 'Salin Tautan'}</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Bagian <code className="font-mono">#k=...</code> tidak pernah dikirim ke server — hanya dibaca oleh peramban rekan tim Anda.
          </p>
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
              onChange={(e) => setRoomInput(e.target.value)}
              placeholder="mis. sprint-produk-2026"
              className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Gabung Ruang</span>
            </button>
          </div>
        </form>

        {/* Identity Settings */}
        <form onSubmit={handleSaveProfile} className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Identitas Kursor Anda
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Nama Anda"
              className="flex-1 min-w-[160px] px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="px-3 py-2 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
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
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
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
