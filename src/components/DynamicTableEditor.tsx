import React, { useState } from 'react';
import { Plus, Trash2, Columns, Rows, Settings2, Check } from 'lucide-react';
import { ColumnFormat, DynamicColumn, DynamicTableData } from '../types/canvas';
import { COLUMN_FORMAT_OPTIONS, formatCellValue } from '../utils/tableFormat';

interface DynamicTableEditorProps {
  table: DynamicTableData;
  isDarkCard?: boolean;
  onChange: (updated: DynamicTableData) => void;
  onRemoveTable: () => void;
}

export const DynamicTableEditor: React.FC<DynamicTableEditorProps> = ({
  table,
  isDarkCard = false,
  onChange,
  onRemoveTable,
}) => {
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [newColName, setNewColName] = useState('');
  const [newColFormat, setNewColFormat] = useState<ColumnFormat>('text');
  const [showAddCol, setShowAddCol] = useState(false);

  const handleAddColumn = () => {
    const colId = `col-${crypto.randomUUID().slice(0, 6)}`;
    const colName = newColName.trim() || `Kolom ${table.columns.length + 1}`;
    const newCol: DynamicColumn = {
      id: colId,
      name: colName,
      format: newColFormat,
    };
    onChange({
      columns: [...table.columns, newCol],
      rows: table.rows.map((r) => ({
        ...r,
        cells: {
          ...r.cells,
          [colId]: newColFormat === 'checkbox' ? false : '',
        },
      })),
    });
    setNewColName('');
    setNewColFormat('text');
    setShowAddCol(false);
  };

  const handleUpdateColumn = (colId: string, patch: Partial<DynamicColumn>) => {
    onChange({
      ...table,
      columns: table.columns.map((c) => (c.id === colId ? { ...c, ...patch } : c)),
    });
  };

  const handleDeleteColumn = (colId: string) => {
    if (table.columns.length <= 1) return;
    onChange({
      columns: table.columns.filter((c) => c.id !== colId),
      rows: table.rows.map((r) => {
        const nextCells = { ...r.cells };
        delete nextCells[colId];
        return { ...r, cells: nextCells };
      }),
    });
    if (editingColId === colId) setEditingColId(null);
  };

  const handleAddRow = () => {
    const rowId = `row-${crypto.randomUUID().slice(0, 6)}`;
    const cells: Record<string, string | boolean> = {};
    for (const col of table.columns) {
      cells[col.id] = col.format === 'checkbox' ? false : '';
    }
    onChange({
      ...table,
      rows: [...table.rows, { id: rowId, cells }],
    });
  };

  const handleDeleteRow = (rowId: string) => {
    onChange({
      ...table,
      rows: table.rows.filter((r) => r.id !== rowId),
    });
  };

  const handleCellChange = (rowId: string, colId: string, value: string | boolean) => {
    onChange({
      ...table,
      rows: table.rows.map((r) =>
        r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r
      ),
    });
  };

  const borderClass = isDarkCard ? 'border-slate-700' : 'border-slate-200 dark:border-slate-700';
  const headerBg = isDarkCard ? 'bg-slate-800/80 text-slate-200' : 'bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200';
  const cellText = isDarkCard ? 'text-slate-100' : 'text-slate-800 dark:text-slate-100';

  return (
    <div
      className={`mt-2.5 rounded-lg border ${borderClass} overflow-hidden text-xs`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Table Mini Toolbar */}
      <div className={`flex items-center justify-between gap-2 px-2.5 py-1.5 border-b ${borderClass} ${headerBg}`}>
        <span className="font-medium tracking-tight truncate">
          Tabel Dinamis · {table.columns.length} Kolom
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setShowAddCol((v) => !v)}
            className="inline-flex items-center gap-1 px-1.5 py-1 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors font-medium"
            title="Tambah Kolom Dinamis"
          >
            <Columns className="w-3 h-3" />
            <span>+ Kolom</span>
          </button>
          <button
            type="button"
            onClick={handleAddRow}
            className="inline-flex items-center gap-1 px-1.5 py-1 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors font-medium"
            title="Tambah Baris"
          >
            <Rows className="w-3 h-3" />
            <span>+ Baris</span>
          </button>
          <button
            type="button"
            onClick={onRemoveTable}
            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
            title="Hapus Tabel"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Add Column Inline Form */}
      {showAddCol && (
        <div className={`p-2 border-b ${borderClass} bg-blue-50/60 dark:bg-blue-950/30 flex flex-wrap items-center gap-1.5`}>
          <input
            type="text"
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            placeholder="Nama kolom..."
            className="flex-1 min-w-[90px] px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <select
            value={newColFormat}
            onChange={(e) => setNewColFormat(e.target.value as ColumnFormat)}
            className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {COLUMN_FORMAT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAddColumn}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-3 h-3" />
            <span>Tambah</span>
          </button>
        </div>
      )}

      {/* Table Data Grid */}
      <div className="overflow-x-auto max-h-56 overflow-y-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className={`border-b ${borderClass} ${headerBg}`}>
              {table.columns.map((col) => (
                <th
                  key={col.id}
                  className={`px-2 py-1.5 font-semibold border-r last:border-r-0 ${borderClass} min-w-[84px]`}
                >
                  {editingColId === col.id ? (
                    <div className="space-y-1">
                      <input
                        type="text"
                        value={col.name}
                        onChange={(e) => handleUpdateColumn(col.id, { name: e.target.value })}
                        className="w-full px-1.5 py-0.5 text-[11px] rounded border border-blue-400 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      />
                      <div className="flex items-center gap-1">
                        <select
                          value={col.format}
                          onChange={(e) =>
                            handleUpdateColumn(col.id, { format: e.target.value as ColumnFormat })
                          }
                          className="flex-1 px-1 py-0.5 text-[10px] rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                        >
                          {COLUMN_FORMAT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        {table.columns.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteColumn(col.id)}
                            className="p-0.5 text-red-500 hover:text-red-700"
                            title="Hapus Kolom"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingColId(null)}
                          className="p-0.5 text-emerald-600 hover:text-emerald-700"
                          title="Selesai"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-1 group">
                      <span className="truncate">{col.name}</span>
                      <button
                        type="button"
                        onClick={() => setEditingColId(col.id)}
                        className="opacity-50 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                        title="Atur Format & Nama Kolom"
                      >
                        <Settings2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </th>
              ))}
              <th className="w-6 px-1" />
            </tr>
          </thead>
          <tbody>
            {table.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={table.columns.length + 1}
                  className="px-3 py-3 text-center text-slate-400"
                >
                  Belum ada baris. Klik + Baris untuk mengisi data.
                </td>
              </tr>
            ) : (
              table.rows.map((row) => (
                <tr
                  key={row.id}
                  className={`border-b last:border-b-0 ${borderClass} hover:bg-slate-50/70 dark:hover:bg-slate-800/40`}
                >
                  {table.columns.map((col) => {
                    const rawVal = row.cells[col.id];
                    const isNumeric =
                      col.format === 'number' ||
                      col.format === 'currency' ||
                      col.format === 'percent';

                    return (
                      <td
                        key={col.id}
                        className={`px-1.5 py-1 border-r last:border-r-0 ${borderClass} ${cellText}`}
                      >
                        {col.format === 'checkbox' ? (
                          <label className="flex items-center justify-center cursor-pointer py-0.5">
                            <input
                              type="checkbox"
                              checked={Boolean(rawVal)}
                              onChange={(e) =>
                                handleCellChange(row.id, col.id, e.target.checked)
                              }
                              className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer"
                            />
                          </label>
                        ) : col.format === 'date' ? (
                          <input
                            type="date"
                            value={String(rawVal ?? '')}
                            onChange={(e) => handleCellChange(row.id, col.id, e.target.value)}
                            className="w-full bg-transparent text-[11px] tabular-nums focus:outline-none focus:bg-white/70 dark:focus:bg-slate-900 rounded px-1 py-0.5"
                          />
                        ) : col.format === 'status' ? (
                          <select
                            value={String(rawVal ?? 'Rencana')}
                            onChange={(e) => handleCellChange(row.id, col.id, e.target.value)}
                            className="w-full bg-transparent text-[11px] font-medium focus:outline-none focus:bg-white dark:focus:bg-slate-900 rounded px-1 py-0.5"
                          >
                            <option value="Rencana">Rencana</option>
                            <option value="Berjalan">Berjalan</option>
                            <option value="Review">Review</option>
                            <option value="Selesai">Selesai</option>
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={String(rawVal ?? '')}
                            onChange={(e) => handleCellChange(row.id, col.id, e.target.value)}
                            placeholder={col.format === 'currency' ? '0' : 'Isi...'}
                            title={isNumeric ? formatCellValue(col, rawVal) : undefined}
                            className={`w-full bg-transparent text-[11px] focus:outline-none focus:bg-white/80 dark:focus:bg-slate-900 rounded px-1 py-0.5 ${
                              isNumeric ? 'text-right font-mono tabular-nums' : 'text-left'
                            }`}
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className="px-1 text-center">
                    <button
                      type="button"
                      onClick={() => handleDeleteRow(row.id)}
                      className="p-0.5 text-slate-400 hover:text-red-500 transition-colors"
                      title="Hapus Baris"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
