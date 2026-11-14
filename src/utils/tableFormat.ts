import { ColumnFormat, DynamicColumn } from '../types/canvas';

export const COLUMN_FORMAT_OPTIONS: { value: ColumnFormat; label: string }[] = [
  { value: 'text', label: 'Teks' },
  { value: 'number', label: 'Angka' },
  { value: 'currency', label: 'Mata Uang (Rp)' },
  { value: 'percent', label: 'Persen (%)' },
  { value: 'date', label: 'Tanggal' },
  { value: 'status', label: 'Status' },
  { value: 'checkbox', label: 'Centang (Ya/Tidak)' },
];

export function formatCellValue(
  col: DynamicColumn,
  raw: string | boolean | undefined
): string {
  if (col.format === 'checkbox') {
    return raw === true || raw === 'true' ? '✓ Ya' : '— Tidak';
  }
  const str = String(raw ?? '').trim();
  if (!str) return '—';

  if (col.format === 'number') {
    const num = Number(str.replace(/[^0-9.-]/g, ''));
    if (!Number.isNaN(num)) {
      return new Intl.NumberFormat('id-ID').format(num);
    }
  }
  if (col.format === 'currency') {
    const num = Number(str.replace(/[^0-9.-]/g, ''));
    if (!Number.isNaN(num)) {
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
      }).format(num);
    }
  }
  if (col.format === 'percent') {
    const num = Number(str.replace(/[^0-9.-]/g, ''));
    if (!Number.isNaN(num)) {
      return `${num}%`;
    }
  }
  return str;
}
