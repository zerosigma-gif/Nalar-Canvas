import React, { useState } from 'react';
import {
  Download,
  FileImage,
  FileText,
  FileSpreadsheet,
  Presentation,
  FileCode2,
  Lock,
  LockOpen,
  Sun,
  Moon,
  ChevronDown,
  Menu,
  X,
  LayoutGrid,
  Users,
} from 'lucide-react';

export type ExportFormat = 'png' | 'pdf' | 'docx' | 'pptx' | 'md';

interface TopBarProps {
  title: string;
  roomId: string;
  peerCount: number;
  wsConnected: boolean;
  e2eeEnabled: boolean;
  darkMode: boolean;
  canPresent: boolean;
  exportingFormat: ExportFormat | null;
  onChangeTitle: (nextTitle: string) => void;
  onOpenTemplates: () => void;
  onOpenCollaboration: () => void;
  onOpenEncryption: () => void;
  onStartPresentation: () => void;
  onToggleTheme: () => void;
  onExport: (format: ExportFormat) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  title,
  roomId,
  peerCount,
  wsConnected,
  e2eeEnabled,
  darkMode,
  canPresent,
  exportingFormat,
  onChangeTitle,
  onOpenTemplates,
  onOpenCollaboration,
  onOpenEncryption,
  onStartPresentation,
  onToggleTheme,
  onExport,
}) => {
  const [exportOpen, setExportOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const exportOptions: {
    id: ExportFormat;
    label: string;
    desc: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'png',
      label: 'Gambar PNG',
      desc: 'Kanvas resolusi tinggi (2x)',
      icon: <FileImage className="w-4 h-4 text-blue-600" />,
    },
    {
      id: 'pdf',
      label: 'Dokumen PDF',
      desc: 'Peta visual + ringkasan & tabel',
      icon: <FileText className="w-4 h-4 text-red-600" />,
    },
    {
      id: 'docx',
      label: 'Word (.docx)',
      desc: 'Hierarki ide, format teks & tabel',
      icon: <FileSpreadsheet className="w-4 h-4 text-indigo-600" />,
    },
    {
      id: 'pptx',
      label: 'PowerPoint (.pptx)',
      desc: 'Slide presentasi siap tayang',
      icon: <Presentation className="w-4 h-4 text-amber-600" />,
    },
    {
      id: 'md',
      label: 'Markdown (.md)',
      desc: 'Struktur teks & tabel GFM',
      icon: <FileCode2 className="w-4 h-4 text-emerald-600" />,
    },
  ];

  return (
    <header className="fixed top-0 inset-x-0 h-14 z-40 px-3 sm:px-5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 md:gap-6">
      {/* Zone 1: Brand Wordmark + Project Title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 md:flex-initial">
        <span className="text-sm sm:text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
          NalarCanvas
        </span>
        <span className="text-slate-300 dark:text-slate-700 select-none shrink-0">/</span>
        <input
          type="text"
          value={title}
          onChange={(e) => onChangeTitle(e.target.value)}
          aria-label="Judul Proyek"
          className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 rounded-md px-2 h-8 leading-normal focus:outline-none w-full max-w-[140px] sm:max-w-[190px] lg:max-w-[220px] min-w-0 truncate"
        />
      </div>

      {/* Zone 2: Concise Navigation Links (tablet/laptop/desktop single-line) */}
      <nav className="hidden md:flex items-center gap-4 lg:gap-6 text-sm font-medium text-slate-600 dark:text-slate-300 shrink-0">
        <button
          type="button"
          onClick={onOpenTemplates}
          className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1"
        >
          Template
        </button>
        <button
          type="button"
          onClick={onOpenCollaboration}
          className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 inline-flex items-center gap-1.5"
        >
          <span>Kolaborasi</span>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            · {wsConnected ? `${peerCount} aktif` : 'offline'}
            <span className="hidden xl:inline"> ({roomId})</span>
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenEncryption}
          className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 inline-flex items-center gap-1.5"
        >
          {e2eeEnabled ? (
            <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <LockOpen className="w-3.5 h-3.5 text-amber-600" />
          )}
          <span>{e2eeEnabled ? 'Enkripsi E2EE' : 'Tanpa Enkripsi'}</span>
        </button>
      </nav>

      {/* Zone 3: Mobile Menu + Theme + Primary Export CTA */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 relative">
        {/* Mobile navigation menu trigger */}
        <div className="md:hidden relative">
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen((v) => !v);
              setExportOpen(false);
            }}
            aria-label="Menu Workspace"
            aria-expanded={mobileMenuOpen}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

          {mobileMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMobileMenuOpen(false)}
              />
              <div className="fixed top-14 right-3 left-3 sm:left-auto sm:w-72 mt-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-2 z-50 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenTemplates();
                  }}
                  className="w-full min-h-[44px] px-3 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors flex items-center justify-between gap-3"
                >
                  <span className="inline-flex items-center gap-2.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                    <LayoutGrid className="w-4 h-4 text-blue-600" />
                    <span>Template Percabangan</span>
                  </span>
                  <span className="text-[11px] text-slate-400">5 pola</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenCollaboration();
                  }}
                  className="w-full min-h-[44px] px-3 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors flex items-center justify-between gap-3"
                >
                  <span className="inline-flex items-center gap-2.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span>Kolaborasi Real-Time</span>
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {wsConnected ? `${peerCount} aktif` : 'offline'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenEncryption();
                  }}
                  className="w-full min-h-[44px] px-3 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors flex items-center justify-between gap-3"
                >
                  <span className="inline-flex items-center gap-2.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {e2eeEnabled ? (
                      <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <LockOpen className="w-4 h-4 text-amber-600" />
                    )}
                    <span>Keamanan E2EE</span>
                  </span>
                  <span
                    className={`text-[11px] font-medium ${
                      e2eeEnabled
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600'
                    }`}
                  >
                    {e2eeEnabled ? 'Aktif' : 'Nonaktif'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onStartPresentation();
                  }}
                  className="w-full min-h-[44px] px-3 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors flex items-center justify-between gap-3"
                >
                  <span className="inline-flex items-center gap-2.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                    <Presentation className="w-4 h-4 text-blue-600" />
                    <span>Mode Presentasi</span>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {canPresent ? 'Fokus berurutan' : 'Kosong'}
                  </span>
                </button>
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onStartPresentation}
          title="Mode Presentasi (P) — Sembunyikan semua toolbar & fokus node berurutan"
          className={`hidden md:inline-flex h-9 px-3 rounded-lg border text-xs font-semibold transition-colors items-center gap-1.5 whitespace-nowrap shrink-0 ${
            canPresent
              ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
              : 'border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500'
          }`}
        >
          <Presentation className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>Presentasi</span>
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          title={darkMode ? 'Mode Terang' : 'Mode Gelap'}
          aria-label="Ganti Tema"
          className="w-10 h-10 md:w-9 md:h-9 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setExportOpen((v) => !v);
              setMobileMenuOpen(false);
            }}
            className="h-10 md:h-9 px-2.5 sm:px-3.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>
              {exportingFormat ? `${exportingFormat.toUpperCase()}...` : 'Ekspor'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 opacity-80" />
          </button>

          {exportOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setExportOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-24px)] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-50">
                {exportOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setExportOpen(false);
                      onExport(opt.id);
                    }}
                    className="w-full px-3.5 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors flex items-start gap-3"
                  >
                    <div className="mt-0.5 shrink-0">{opt.icon}</div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {opt.label}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {opt.desc}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

