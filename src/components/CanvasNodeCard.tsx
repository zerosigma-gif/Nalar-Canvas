import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  GitBranchPlus,
  ImageOff,
  Link2,
  Pencil,
  Check,
} from 'lucide-react';
import {
  CanvasNode,
  CollaboratorPresence,
  DynamicTableData,
  InteractionTool,
  NodeTextTarget,
} from '../types/canvas';
import { isDarkHexColor, resolveBodyStyle } from '../utils/templates';
import { DynamicTableEditor } from './DynamicTableEditor';

interface CanvasNodeCardProps {
  node: CanvasNode;
  isSelected: boolean;
  isConnectSource: boolean;
  isPresenting?: boolean;
  tool: InteractionTool;
  zoom: number;
  childCount: number;
  remoteSelectors: CollaboratorPresence[];
  onSelect: (nodeId: string, multi?: boolean) => void;
  onFocusTextTarget?: (nodeId: string, target: NodeTextTarget) => void;
  onStartDrag: (e: React.PointerEvent, nodeId: string) => void;
  onUpdateNode: (nodeId: string, patch: Partial<CanvasNode>) => void;
  onSpawnChild: (parentId: string) => void;
  onConnectClick: (nodeId: string) => void;
  onOpenMediaModal: (nodeId: string) => void;
}

export const CanvasNodeCard: React.FC<CanvasNodeCardProps> = ({
  node,
  isSelected,
  isConnectSource,
  isPresenting = false,
  tool,
  childCount,
  remoteSelectors,
  onSelect,
  onFocusTextTarget,
  onStartDrag,
  onUpdateNode,
  onSpawnChild,
  onConnectClick,
  onOpenMediaModal,
}) => {
  const [editing, setEditing] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const bodyInputRef = useRef<HTMLTextAreaElement>(null);
  const pendingEditTargetRef = useRef<NodeTextTarget>('title');

  useEffect(() => {
    setImgFailed(false);
  }, [node.media?.url]);

  useEffect(() => {
    if (!isSelected && editing) {
      setEditing(false);
    }
  }, [isSelected, editing]);

  useEffect(() => {
    if (editing) {
      if (pendingEditTargetRef.current === 'body' && bodyInputRef.current) {
        bodyInputRef.current.focus();
      } else {
        titleInputRef.current?.focus();
      }
    }
  }, [editing]);

  useEffect(() => {
    if (!editing || !titleInputRef.current) return;
    const el = titleInputRef.current;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [editing, node.title, node.style.fontSize, node.style.fontFamily, node.width]);

  const resolvedBg = node.surfaceColor || '#FFFFFF';
  const isDarkCard = isDarkHexColor(resolvedBg);
  const resolvedTextColor = node.style.color || '#0F172A';
  const bodyStyle = resolveBodyStyle(node);
  const resolvedBodyColor = bodyStyle.color || '#475569';

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isPresenting) {
      e.stopPropagation();
      onSelect(node.id, false);
      return;
    }
    if (tool === 'pan') return;
    e.stopPropagation();
    if (tool === 'connect') {
      onConnectClick(node.id);
      return;
    }
    onSelect(node.id, e.shiftKey);
    if (!editing) {
      onStartDrag(e, node.id);
    }
  };

  const handleTableChange = (updated: DynamicTableData) => {
    onUpdateNode(node.id, { table: updated });
  };

  const peerBorderColor = remoteSelectors[0]?.color;

  return (
    <div
      data-node-id={node.id}
      style={{
        transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
        width: `${node.width}px`,
        backgroundColor: resolvedBg,
        borderColor: isSelected
          ? '#2563EB'
          : isConnectSource
          ? '#059669'
          : peerBorderColor || node.accentColor || '#CBD5E1',
      }}
      onPointerDown={handlePointerDown}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!isPresenting) {
          pendingEditTargetRef.current = 'title';
          onSelect(node.id, false);
          setEditing(true);
        }
      }}
      className={`group absolute top-0 left-0 rounded-xl border transition-all duration-300 select-none ${
        isPresenting
          ? 'cursor-pointer'
          : tool === 'connect'
          ? 'cursor-crosshair'
          : editing
          ? 'cursor-text'
          : 'cursor-grab active:cursor-grabbing'
      } ${
        isPresenting
          ? isSelected
            ? 'ring-4 ring-blue-500/45 shadow-xl z-30 opacity-100'
            : 'shadow-sm z-10 opacity-50 hover:opacity-85'
          : isSelected
          ? 'ring-2 ring-blue-500/35 shadow-md z-20'
          : 'shadow-sm hover:shadow-md z-10'
      }`}
    >
      {/* Remote collaborator selection label */}
      {remoteSelectors.length > 0 && (
        <div
          className="absolute -top-6 left-2 flex items-center gap-1.5 text-[11px] font-medium px-1.5 py-0.5 rounded text-white pointer-events-none whitespace-nowrap"
          style={{ backgroundColor: remoteSelectors[0].color }}
        >
          <span>{remoteSelectors.map((p) => p.name).join(', ')}</span>
        </div>
      )}

      {/* Top accent hairline bar */}
      <div
        className="h-1 w-full rounded-t-[10px]"
        style={{ backgroundColor: node.accentColor || '#2563EB' }}
      />

      <div className="p-3.5">
        {/* Header row: Symbols + Title + Quick Edit */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {node.symbols.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 mb-1 text-sm leading-none">
                {node.symbols.map((sym, idx) => (
                  <span
                    key={`${sym}-${idx}`}
                    className={`inline-flex items-center justify-center px-1 py-0.5 rounded ${
                      isDarkCard
                        ? 'bg-slate-800/80 text-slate-100'
                        : 'bg-slate-100/80 text-slate-800'
                    }`}
                  >
                    {sym}
                  </span>
                ))}
              </div>
            )}

            {editing ? (
              <textarea
                ref={titleInputRef}
                rows={1}
                value={node.title}
                onFocus={() => onFocusTextTarget?.(node.id, 'title')}
                onChange={(e) => onUpdateNode(node.id, { title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    setEditing(false);
                  }
                  if (e.key === 'Escape') setEditing(false);
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onFocusTextTarget?.(node.id, 'title');
                }}
                style={{
                  fontFamily: `"${node.style.fontFamily}", sans-serif`,
                  fontSize: `${node.style.fontSize}px`,
                  fontWeight: node.style.bold ? 700 : 400,
                  fontStyle: node.style.italic ? 'italic' : 'normal',
                  textDecoration: node.style.underline ? 'underline' : 'none',
                  color: resolvedTextColor,
                  textAlign: node.style.align || 'left',
                }}
                className={`w-full leading-snug break-words border border-blue-400 rounded px-1.5 py-0.5 focus:outline-none resize-none overflow-hidden ${
                  isDarkCard ? 'bg-slate-950/60' : 'bg-white/85'
                }`}
              />
            ) : (
              <div
                style={{
                  fontFamily: `"${node.style.fontFamily}", sans-serif`,
                  fontSize: `${node.style.fontSize}px`,
                  fontWeight: node.style.bold ? 700 : 400,
                  fontStyle: node.style.italic ? 'italic' : 'normal',
                  textDecoration: node.style.underline ? 'underline' : 'none',
                  color: resolvedTextColor,
                  textAlign: node.style.align || 'left',
                }}
                className="leading-snug break-words"
              >
                {node.title || 'Tanpa Judul'}
              </div>
            )}
          </div>

          {!isPresenting && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (!editing) {
                  pendingEditTargetRef.current = 'title';
                  onSelect(node.id, false);
                }
                setEditing((v) => !v);
              }}
              className={`p-1 rounded-md text-slate-400 transition-opacity shrink-0 ${
                isDarkCard
                  ? 'hover:text-slate-200 hover:bg-slate-800'
                  : 'hover:text-slate-700 hover:bg-slate-100'
              } ${
                isSelected || editing
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
              }`}
              title={editing ? 'Selesai Edit' : 'Edit Teks'}
              aria-label={editing ? 'Selesai Edit' : 'Edit Teks'}
            >
              {editing ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Pencil className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {/* Body text */}
        {editing ? (
          <textarea
            ref={bodyInputRef}
            value={node.body}
            rows={3}
            onFocus={() => onFocusTextTarget?.(node.id, 'body')}
            onChange={(e) => onUpdateNode(node.id, { body: e.target.value })}
            onPointerDown={(e) => {
              e.stopPropagation();
              onFocusTextTarget?.(node.id, 'body');
            }}
            placeholder="Tambahkan catatan ide, deskripsi, atau detail..."
            style={{
              fontFamily: `"${bodyStyle.fontFamily}", sans-serif`,
              fontSize: `${bodyStyle.fontSize}px`,
              fontWeight: bodyStyle.bold ? 700 : 400,
              fontStyle: bodyStyle.italic ? 'italic' : 'normal',
              textDecoration: bodyStyle.underline ? 'underline' : 'none',
              color: resolvedBodyColor,
              textAlign: bodyStyle.align || 'left',
            }}
            className={`mt-2 w-full border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y ${
              isDarkCard
                ? 'bg-slate-950/60 border-slate-700 placeholder:text-slate-500'
                : 'bg-white/85 border-slate-300 placeholder:text-slate-400'
            }`}
          />
        ) : (
          node.body && (
            <p
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (!isPresenting) {
                  pendingEditTargetRef.current = 'body';
                  onFocusTextTarget?.(node.id, 'body');
                  setEditing(true);
                }
              }}
              style={{
                fontFamily: `"${bodyStyle.fontFamily}", sans-serif`,
                fontSize: `${bodyStyle.fontSize}px`,
                fontWeight: bodyStyle.bold ? 700 : 400,
                fontStyle: bodyStyle.italic ? 'italic' : 'normal',
                textDecoration: bodyStyle.underline ? 'underline' : 'none',
                color: resolvedBodyColor,
                textAlign: bodyStyle.align || 'left',
              }}
              className="mt-1.5 leading-relaxed whitespace-pre-wrap break-words"
            >
              {node.body}
            </p>
          )
        )}

        {/* Attached Visual Media */}
        {node.media?.url && (
          <div
            className={`mt-2.5 rounded-lg overflow-hidden border cursor-pointer ${
              isDarkCard ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-100'
            }`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onOpenMediaModal(node.id);
            }}
          >
            {imgFailed ? (
              <div className="h-28 flex flex-col items-center justify-center gap-1.5 text-slate-400 px-3 text-center">
                <ImageOff className="w-5 h-5" />
                <span className="text-[11px] font-medium truncate max-w-full">
                  {node.media.caption || 'Gambar tidak dapat dimuat'}
                </span>
              </div>
            ) : (
              <img
                src={node.media.url}
                alt={node.media.caption || node.title}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-full max-h-44 object-cover"
              />
            )}
            {node.media.caption && (
              <div
                className={`px-2.5 py-1 text-[11px] border-t truncate ${
                  isDarkCard
                    ? 'text-slate-300 bg-slate-900/85 border-slate-800'
                    : 'text-slate-600 bg-white/85 border-slate-200'
                }`}
              >
                {node.media.caption}
              </div>
            )}
          </div>
        )}

        {/* Dynamic Table */}
        {node.table && (
          <DynamicTableEditor
            table={node.table}
            isDarkCard={isDarkCard}
            onChange={handleTableChange}
            onRemoveTable={() => onUpdateNode(node.id, { table: null })}
          />
        )}

        {/* Footer metadata: Timestamp stamp + child collapse */}
        {(node.timestampStamp || childCount > 0) && (
          <div
            className={`mt-2.5 pt-2 border-t flex items-center justify-between gap-2 text-[11px] ${
              isDarkCard ? 'border-slate-700/80 text-slate-300' : 'border-slate-200/80 text-slate-500'
            }`}
          >
            <span className="font-mono tabular-nums truncate">
              {node.timestampStamp ? `◷ ${node.timestampStamp}` : ''}
            </span>

            {childCount > 0 && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateNode(node.id, { collapsed: !node.collapsed });
                }}
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-medium tabular-nums shrink-0 ${
                  isDarkCard ? 'hover:bg-slate-700/60' : 'hover:bg-slate-200/60'
                }`}
                title={node.collapsed ? 'Bentangkan Cabang' : 'Lipat Cabang'}
              >
                {node.collapsed ? (
                  <>
                    <ChevronRight className="w-3 h-3" />
                    <span>+{childCount}</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    <span>{childCount}</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Floating Quick-Branch & Connect Handles on Hover/Selection */}
      {!isPresenting && (
        <>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onSpawnChild(node.id);
            }}
            title="Tambah Cabang Ide Anak"
            className={`absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 shadow-sm flex items-center justify-center text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all ${
              isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100'
            }`}
          >
            <GitBranchPlus className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onConnectClick(node.id);
            }}
            title="Hubungkan ke Node Lain"
            className={`absolute left-1/2 -bottom-3.5 -translate-x-1/2 w-7 h-7 rounded-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 shadow-sm flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all ${
              isConnectSource
                ? 'opacity-100 bg-emerald-600 text-white border-emerald-600'
                : isSelected || tool === 'connect'
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
};
