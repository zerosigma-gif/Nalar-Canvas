import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  FileSpreadsheet,
  FileText,
  Loader2,
  Presentation,
  Upload,
  X,
} from 'lucide-react';
import {
  countImportedNodes,
  DocumentImportResult,
  ImportedIdeaNode,
  readFileAsBase64,
} from '../utils/importDocument';

interface ImportModalProps {
  onConfirmImport: (imported: DocumentImportResult) => void;
  onClose: () => void;
}

const ACCEPTED_EXTENSIONS = /\.(pdf|docx|pptx)$/i;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const PreviewBranchList: React.FC<{ node: ImportedIdeaNode; depth?: number }> = ({
  node,
  depth = 0,
}) => {
  return (
    <div
      className={
        depth > 0
          ? 'pl-4 border-l border-slate-200 dark:border-slate-700 mt-1.5 space-y-1.5'
          : 'space-y-1.5'
      }
    >
      <div className="flex items-start gap-2">
        <span
          className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
            depth === 0 ? 'bg-blue-600' : depth === 1 ? 'bg-emerald-500' : 'bg-slate-400'
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 break-words">
            {node.title}
          </div>
          {node.body && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
              {node.body}
            </p>
          )}
          {node.table && (
            <div className="text-[11px] font-mono text-amber-700 dark:text-amber-400 mt-0.5">
              Tabel: {node.table.columns.length} kolom · {node.table.rows.length} baris
            </div>
          )}
        </div>
      </div>

      {depth < 2 &&
        node.children.slice(0, 6).map((child, idx) => (
          <PreviewBranchList key={`${child.title}-${idx}`} node={child} depth={depth + 1} />
        ))}
      {depth < 2 && node.children.length > 6 && (
        <div className="pl-4 text-[11px] text-slate-400">
          +{node.children.length - 6} sub-node lainnya…
        </div>
      )}
    </div>
  );
};

export const ImportModal: React.FC<ImportModalProps> = ({
  onConfirmImport,
  onClose,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<DocumentImportResult | null>(null);

  const previewStats = useMemo(() => {
    if (!scanResult) return null;
    return countImportedNodes(scanResult.root);
  }, [scanResult]);

  const handleScanFile = async (file: File) => {
    if (!ACCEPTED_EXTENSIONS.test(file.name)) {
      setErrorMsg('Format berkas belum didukung. Pilih dokumen .pdf, .docx, atau .pptx.');
      return;
    }
    if (file.size > 14 * 1024 * 1024) {
      setErrorMsg('Ukuran dokumen maksimal 14 MB.');
      return;
    }

    setSelectedFile(file);
    setErrorMsg(null);
    setLoading(true);
    setScanResult(null);

    try {
      const base64 = await readFileAsBase64(file);
      const res = await fetch('/api/import/document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          base64,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.root) {
        throw new Error(data?.error || 'Gagal memindai struktur dokumen.');
      }
      setScanResult(data as DocumentImportResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat memindai dokumen.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleFilePicked = (file?: File | null) => {
    if (!file) return;
    handleScanFile(file);
  };

  const formatBadge = (fmt: 'docx' | 'pptx' | 'pdf') => {
    if (fmt === 'docx') {
      return {
        label: 'Word (.docx)',
        icon: <FileSpreadsheet className="w-4 h-4 text-indigo-600" />,
      };
    }
    if (fmt === 'pptx') {
      return {
        label: 'PowerPoint (.pptx)',
        icon: <Presentation className="w-4 h-4 text-amber-600" />,
      };
    }
    return {
      label: 'PDF (.pdf)',
      icon: <FileText className="w-4 h-4 text-red-600" />,
    };
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-xs p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4 shrink-0">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
              Impor Dokumen
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Masukkan file berformat .pdf, .docx, atau .pptx untuk ditampilkan sebagai jaringan node.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Impor Dokumen"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* Dropzone for .pdf, .docx, .pptx only */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              handleFilePicked(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
              dragActive
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                : 'border-slate-300 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-600 bg-slate-50/60 dark:bg-slate-950/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              onChange={(e) => handleFilePicked(e.target.files?.[0])}
              className="hidden"
            />
            <div className="mx-auto w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-3">
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Upload className="w-5 h-5" />
              )}
            </div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {selectedFile ? selectedFile.name : 'Pilih atau seret dokumen (.pdf, .docx, .pptx)'}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {selectedFile
                ? `${formatFileSize(selectedFile.size)} · Klik untuk mengganti file`
                : 'Hanya mendukung format .pdf, .docx, dan .pptx (maks. 14 MB)'}
            </div>

            <div className="mt-4 flex items-center justify-center gap-3 text-[11px] font-medium text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-red-600" />
                .pdf
              </span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="inline-flex items-center gap-1">
                <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
                .docx
              </span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="inline-flex items-center gap-1">
                <Presentation className="w-3.5 h-3.5 text-amber-600" />
                .pptx
              </span>
            </div>
          </div>

          {/* Error Feedback */}
          {errorMsg && (
            <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 p-3.5 flex items-start gap-2.5 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{errorMsg}</div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-5 flex items-center justify-center gap-2.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>Memindai isi dokumen menjadi jaringan node…</span>
            </div>
          )}

          {/* Scanned Node Hierarchy Preview */}
          {scanResult && previewStats && !loading && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {formatBadge(scanResult.format).icon}
                  <span>{formatBadge(scanResult.format).label}</span>
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {previewStats.nodes} Node · {previewStats.tables} Tabel · {scanResult.pagesOrSlides}{' '}
                  {scanResult.format === 'pptx' ? 'Slide' : 'Hal.'}
                </div>
              </div>

              <div className="p-4 max-h-64 overflow-y-auto">
                <PreviewBranchList node={scanResult.root} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/95 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {scanResult && previewStats
              ? `Siap menampilkan ${previewStats.nodes} node di kanvas`
              : 'Format diterima: .pdf, .docx, .pptx'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 sm:h-9 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={!scanResult || loading}
              onClick={() => {
                if (!scanResult) return;
                onConfirmImport(scanResult);
                onClose();
              }}
              className="h-10 sm:h-9 px-4 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-45 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>Bangun Jaringan Node</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
