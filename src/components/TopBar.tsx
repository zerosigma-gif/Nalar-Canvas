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
} from 'lucide-react';

export type ExportFormat = 'png' | 'pdf' | 'docx' | 'pptx' | 'md';

interface TopBarProps {
  title: string;
  roomId: string;
  peerCount: number;
  wsConnected: boolean;
  e2eeEnabled: boolean;
  darkMode: boolean;
  exportingFormat: ExportFormat | null;
  onChangeTitle: (nextTitle: string) => void;
  onOpenTemplates: () => void;
  onOpenCollaboration: () => void;
  onOpenEncryption: () => void;
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
  exportingFormat,
  onChangeTitle,
  onOpenTemplates,
  onOpenCollaboration,
  onOpenEncryption,
  onToggleTheme,
  onExport,
}) => {
  const [exportOpen, setExportOpen] = useState(false);

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
    <header className="fixed top-0 inset-x-0 h-14 z-40 px-5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-8">
      {/* Zone 1: Brand Wordmark + Project Title */}
      <div className="flex items-center gap-3 min-w-0 shrink-0">
        <span className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
          NalarCanvas
        </span>
        <span className="text-slate-300 dark:text-slate-700 select-none">/</span>
        <input
          type="text"
          value={title}
          onChange={(e) => onChangeTitle(e.target.value)}
          aria-label="Judul Proyek"
          className="text-sm font-medium text-slate-800 dark:text-slate-200 bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 rounded-md px-2 py-1 focus:outline-none max-w-[210px] truncate"
        />
      </div>

      {/* Zone 2: Concise Navigation Links (single-line) */}
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
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
            · {wsConnected ? `${peerCount} aktif` : 'offline'} ({roomId})
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

      {/* Zone 3: Theme + Primary Export CTA */}
      <div className="flex items-center gap-2 shrink-0 relative">
        <button
          type="button"
          onClick={onOpenTemplates}
          className="md:hidden px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0"
        >
          Template
        </button>
        <button
          type="button"
          onClick={onToggleTheme}
          title={darkMode ? 'Mode Terang' : 'Mode Gelap'}
          aria-label="Ganti Tema"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setExportOpen((v) => !v)}
            className="px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exportingFormat ? `Mengekspor ${exportingFormat.toUpperCase()}...` : 'Ekspor'}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-80" />
          </button>

          {exportOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setExportOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-64 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-50">
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
