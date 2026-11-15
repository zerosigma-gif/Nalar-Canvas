import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Layers,
  Loader2,
  Presentation,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { TemplateId } from '../types/canvas';
import {
  countImportedNodes,
  DocumentImportResult,
  ImportedIdeaNode,
  readFileAsBase64,
} from '../utils/importDocument';
import { TEMPLATE_CATALOG } from '../utils/templates';

interface ImportModalProps {
  currentTemplateId: TemplateId;
  hasExistingNodes: boolean;
  onConfirmImport: (opts: {
    imported: DocumentImportResult;
    templateId: TemplateId;
    mode: 'replace' | 'merge';
  }) => void;
  onClose: () => void;
}

const ACCEPTED_EXTENSIONS = /\.(docx|pptx|pdf)$/i;

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
    <div className={depth > 0 ? 'pl-4 border-l border-slate-200 dark:border-slate-700 mt-1.5 space-y-1.5' : 'space-y-1.5'}>
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
  currentTemplateId,
  hasExistingNodes,
  onConfirmImport,
  onClose,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [scanMode, setScanMode] = useState<'structural' | 'ai-semantic'>('structural');
  const [targetTemplate, setTargetTemplate] = useState<TemplateId>(currentTemplateId);
  const [applyMode, setApplyMode] = useState<'replace' | 'merge'>(
    hasExistingNodes ? 'replace' : 'replace'
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<DocumentImportResult | null>(null);

  const previewStats = useMemo(() => {
    if (!scanResult) return null;
    return countImportedNodes(scanResult.root);
  }, [scanResult]);

  const handleScanFile = async (file: File, requestedMode: 'structural' | 'ai-semantic') => {
    if (!ACCEPTED_EXTENSIONS.test(file.name)) {
      setErrorMsg('Format berkas belum didukung. Pilih dokumen .docx, .pptx, atau .pdf.');
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
          mimeType: file.type,
          base64,
          mode: requestedMode,
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
    handleScanFile(file, scanMode);
  };

  const handleScanModeChange = (nextMode: 'structural' | 'ai-semantic') => {
    setScanMode(nextMode);
    if (selectedFile) {
      handleScanFile(selectedFile, nextMode);
    }
  };

  const formatBadge = (fmt?: 'docx' | 'pptx' | 'pdf') => {
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
      label: 'Dokumen PDF (.pdf)',
      icon: <FileText className="w-4 h-4 text-red-600" />,
    };
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-xs p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4 shrink-0">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
              Impor Dokumen ke Jaringan Node
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pindai file .docx, .pptx, atau .pdf untuk membangun struktur ide dan cabang pikiran secara otomatis.
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
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {/* Dropzone */}
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
            className={`rounded-xl border-2 border-dashed p-5 sm:p-6 text-center cursor-pointer transition-colors ${
              dragActive
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                : 'border-slate-300 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-600 bg-slate-50/60 dark:bg-slate-950/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.pptx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf"
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
              {selectedFile ? selectedFile.name : 'Pilih atau seret dokumen ke sini'}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {selectedFile
                ? `${formatFileSize(selectedFile.size)} · Klik untuk mengganti dokumen`
                : 'Mendukung Microsoft Word (.docx), PowerPoint (.pptx), dan PDF (.pdf) hingga 14 MB'}
            </div>
          </div>

          {/* Scan Method & Layout Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Metode Pemindaian Dokumen
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleScanModeChange('structural')}
                  className={`min-h-[42px] px-2.5 py-2 rounded-lg border text-left transition-colors ${
                    scanMode === 'structural'
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <FileCode2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Struktural</span>
                  </div>
                  <div className="text-[11px] opacity-75 mt-0.5">Heading, slide & tabel</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleScanModeChange('ai-semantic')}
                  className={`min-h-[42px] px-2.5 py-2 rounded-lg border text-left transition-colors ${
                    scanMode === 'ai-semantic'
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>Semantik AI</span>
                  </div>
                  <div className="text-[11px] opacity-75 mt-0.5">Ringkasan relasi konsep</div>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="import-template-select"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Pola Arsitektur Kanvas
                </label>
                <select
                  id="import-template-select"
                  value={targetTemplate}
                  onChange={(e) => setTargetTemplate(e.target.value as TemplateId)}
                  className="w-full h-10 px-3 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {TEMPLATE_CATALOG.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} — {tpl.subtitle}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {hasExistingNodes && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 px-3.5 py-2.5 bg-slate-50/70 dark:bg-slate-950/40">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                <Layers className="w-4 h-4 text-slate-500 shrink-0" />
                <span>Penempatan pada kanvas saat ini</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setApplyMode('replace')}
                  className={`h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors ${
                    applyMode === 'replace'
                      ? 'bg-slate-900 dark:bg-blue-600 text-white'
                      : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Ganti Kanvas
                </button>
                <button
                  type="button"
                  onClick={() => setApplyMode('merge')}
                  className={`h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors ${
                    applyMode === 'merge'
                      ? 'bg-slate-900 dark:bg-blue-600 text-white'
                      : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Gabung ke Kanvas
                </button>
              </div>
            </div>
          )}

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
              <span>Memindai struktur dokumen & menyusun jaringan node…</span>
            </div>
          )}

          {/* Scanned Node Hierarchy Preview */}
          {scanResult && previewStats && !loading && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {formatBadge(scanResult.format).icon}
                  <span>{formatBadge(scanResult.format).label}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-blue-600 dark:text-blue-400">
                    {scanResult.method === 'ai-semantic' ? 'Analisis AI' : 'Ekstraksi Struktural'}
                  </span>
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {previewStats.nodes} Node · {previewStats.tables} Tabel · {scanResult.pagesOrSlides}{' '}
                  {scanResult.format === 'pptx' ? 'Slide' : 'Hal.'}
                </div>
              </div>

              <div className="p-4 max-h-60 overflow-y-auto">
                <PreviewBranchList node={scanResult.root} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/95 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {scanResult && previewStats
              ? `Siap memetakan ${previewStats.nodes} node ke kanvas`
              : 'Pilih dokumen .docx, .pptx, atau .pdf'}
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
                onConfirmImport({
                  imported: scanResult,
                  templateId: targetTemplate,
                  mode: applyMode,
                });
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
