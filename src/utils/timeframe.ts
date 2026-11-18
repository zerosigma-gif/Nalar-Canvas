import type { CanvasNode } from '../types/canvas';

export const ID_MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
] as const;

export const ID_MONTH_LONG = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

export const ID_DAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'] as const;

const MONTH_INDEX_MAP: Record<string, number> = {
  jan: 0,
  januari: 0,
  feb: 1,
  februari: 1,
  mar: 2,
  maret: 2,
  apr: 3,
  april: 3,
  mei: 4,
  may: 4,
  jun: 5,
  juni: 5,
  jul: 6,
  juli: 6,
  agu: 7,
  agustus: 7,
  aug: 7,
  sep: 8,
  september: 8,
  okt: 9,
  oktober: 9,
  oct: 9,
  nov: 10,
  november: 10,
  des: 11,
  desember: 11,
  dec: 11,
};

export interface ParsedNodeTimestamp {
  date: Date;
  year: number;
  month: number; // 0..11
  day: number; // 1..31
  hour: number; // 0..23
  minute: number; // 0..59
  dayKey: string; // YYYY-MM-DD
  monthKey: string; // YYYY-MM
  timeLabel: string; // HH:mm
  hasExplicitDate: boolean;
  epochMs: number;
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function toDayKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

export function toMonthKey(year: number, month: number): string {
  return `${year}-${pad2(month + 1)}`;
}

export function estimateTimeframeCardHeight(node: CanvasNode): number {
  const width = Math.max(180, node.width || 248);
  const innerW = Math.max(120, width - 32);
  const titleSize = Math.max(11, node.style.fontSize || 15);
  const charsPerTitleLine = Math.max(12, Math.floor(innerW / (titleSize * 0.56)));
  const titleLines = Math.max(1, Math.ceil((node.title || 'Ide').length / charsPerTitleLine));

  let h = 28 + titleLines * Math.ceil(titleSize * 1.38);

  if (node.body && node.body.trim().length > 0) {
    const fallbackBodySize = Math.max(12, (node.style.fontSize || 15) - 2);
    const bodySize = Math.max(10, node.bodyStyle?.fontSize ?? fallbackBodySize);
    const charsPerBodyLine = Math.max(16, Math.floor(innerW / (bodySize * 0.54)));
    const paragraphs = node.body.split('\n');
    let bodyLines = 0;
    for (const p of paragraphs) {
      bodyLines += Math.max(1, Math.ceil(p.length / charsPerBodyLine));
    }
    h += 8 + bodyLines * Math.ceil(bodySize * 1.45);
  }

  if (node.media?.url) {
    h += 140;
  }

  if (node.table && node.table.columns.length > 0) {
    h += 58 + node.table.rows.length * 30;
  }

  if (node.timestampStamp) {
    h += 30;
  }

  return Math.max(92, h);
}

/**
 * Parses all StampFormat values produced by templates.ts:
 * - 'full':      "Sel, 17 Nov 2026 · 16:23"
 * - 'date-time': "17/11/2026 16:23"
 * - 'time-only': "Sel · 16:23"
 * - 'iso':       "2026-11-17 16:23" or "2026-11-17T16:23"
 */
export function parseTimestampStamp(
  stamp: string | null | undefined,
  fallbackDate?: Date
): ParsedNodeTimestamp | null {
  if (!stamp || typeof stamp !== 'string') return null;
  const raw = stamp.trim();
  if (!raw) return null;

  const ref = fallbackDate && !Number.isNaN(fallbackDate.getTime()) ? fallbackDate : new Date();

  const buildResult = (
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    hasExplicitDate: boolean
  ): ParsedNodeTimestamp | null => {
    if (month < 0 || month > 11 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }
    const date = new Date(year, month, day, hour, minute, 0, 0);
    if (Number.isNaN(date.getTime())) return null;
    return {
      date,
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      dayKey: toDayKey(date.getFullYear(), date.getMonth(), date.getDate()),
      monthKey: toMonthKey(date.getFullYear(), date.getMonth()),
      timeLabel: `${pad2(date.getHours())}:${pad2(date.getMinutes())}`,
      hasExplicitDate,
      epochMs: date.getTime(),
    };
  };

  // 1. ISO: YYYY-MM-DD[ T]HH:mm
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2}))?/);
  if (isoMatch) {
    return buildResult(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3]),
      isoMatch[4] ? Number(isoMatch[4]) : 9,
      isoMatch[5] ? Number(isoMatch[5]) : 0,
      true
    );
  }

  // 2. Date-time slash: DD/MM/YYYY[ HH:mm]
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (slashMatch) {
    return buildResult(
      Number(slashMatch[3]),
      Number(slashMatch[2]) - 1,
      Number(slashMatch[1]),
      slashMatch[4] ? Number(slashMatch[4]) : 9,
      slashMatch[5] ? Number(slashMatch[5]) : 0,
      true
    );
  }

  // 3. Full Indonesian format: "[Sel, ]17 Nov 2026[ · 16:23]"
  const fullMatch = raw.match(
    /^(?:[A-Za-z]+,\s*)?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:[\s·,-]+(\d{1,2}):(\d{2}))?/
  );
  if (fullMatch) {
    const mIdx = MONTH_INDEX_MAP[fullMatch[2].toLowerCase()];
    if (mIdx !== undefined) {
      return buildResult(
        Number(fullMatch[3]),
        mIdx,
        Number(fullMatch[1]),
        fullMatch[4] ? Number(fullMatch[4]) : 9,
        fullMatch[5] ? Number(fullMatch[5]) : 0,
        true
      );
    }
  }

  // 4. Time-only format: "Sel · 16:23" or "16:23"
  const timeOnlyMatch = raw.match(/^(?:[A-Za-z]+[\s·,-]+)?(\d{1,2}):(\d{2})$/);
  if (timeOnlyMatch) {
    return buildResult(
      ref.getFullYear(),
      ref.getMonth(),
      ref.getDate(),
      Number(timeOnlyMatch[1]),
      Number(timeOnlyMatch[2]),
      false
    );
  }

  // 5. Fallback Date.parse
  const nativeParsed = new Date(raw);
  if (!Number.isNaN(nativeParsed.getTime())) {
    return buildResult(
      nativeParsed.getFullYear(),
      nativeParsed.getMonth(),
      nativeParsed.getDate(),
      nativeParsed.getHours(),
      nativeParsed.getMinutes(),
      true
    );
  }

  return null;
}

export interface TimeframeDayColumn {
  key: string;
  date: Date;
  year: number;
  month: number;
  day: number;
  weekdayShort: string;
  shortLabel: string;
  monthKey: string;
  monthLabel: string;
  colIndex: number;
  x: number;
  width: number;
  isMonthStart: boolean;
  hasGapBefore: boolean;
}

export interface TimeframeMonthSpan {
  key: string;
  label: string;
  year: number;
  month: number;
  startX: number;
  width: number;
  startColIndex: number;
  endColIndex: number;
}

export interface TimeframeHourRow {
  hour: number;
  label: string;
  rowIndex: number;
  y: number;
  height: number;
}

export interface TimeframeGrid {
  originX: number;
  originY: number;
  monthHeaderY: number;
  monthHeaderHeight: number;
  dayHeaderY: number;
  dayHeaderHeight: number;
  axisWidth: number;
  gridStartX: number;
  gridStartY: number;
  totalWidth: number;
  gridHeight: number;
  totalHeight: number;
  days: TimeframeDayColumn[];
  months: TimeframeMonthSpan[];
  hours: TimeframeHourRow[];
  unscheduledLane: {
    y: number;
    height: number;
    label: string;
  } | null;
  nodePositions: Map<string, { x: number; y: number }>;
  parsedByNodeId: Map<string, ParsedNodeTimestamp>;
}

const ORIGIN_X = -560;
const ORIGIN_Y = -360;
const AXIS_WIDTH = 92;
const MONTH_HEADER_H = 40;
const DAY_HEADER_H = 44;
const DEFAULT_COL_WIDTH = 296;
const CELL_PAD_X = 22;
const CELL_PAD_Y = 18;
const SLOT_STACK_GAP = 16;
const MIN_ROW_HEIGHT = 148;

export function computeTimeframeGrid(
  nodes: CanvasNode[],
  referenceDate?: Date
): TimeframeGrid {
  // 1. Identify explicit dates first so time-only stamps anchor cleanly to board dates
  const initialExplicitDates: Date[] = [];
  for (const n of nodes) {
    const p = parseTimestampStamp(n.timestampStamp);
    if (p && p.hasExplicitDate) {
      initialExplicitDates.push(p.date);
    }
  }
  initialExplicitDates.sort((a, b) => a.getTime() - b.getTime());

  const anchorDate = initialExplicitDates[0] ?? referenceDate ?? new Date();
  const parsedByNodeId = new Map<string, ParsedNodeTimestamp>();
  const unscheduledNodes: CanvasNode[] = [];

  for (const n of nodes) {
    const parsed = parseTimestampStamp(n.timestampStamp, anchorDate);
    if (parsed) {
      parsedByNodeId.set(n.id, parsed);
    } else {
      unscheduledNodes.push(n);
    }
  }

  // 2. Determine day range
  const dayDateMap = new Map<string, Date>();
  for (const p of parsedByNodeId.values()) {
    dayDateMap.set(p.dayKey, new Date(p.year, p.month, p.day, 0, 0, 0, 0));
  }

  const sortedActiveDates = Array.from(dayDateMap.values()).sort(
    (a, b) => a.getTime() - b.getTime()
  );

  const selectedDayDates: { date: Date; hasGapBefore: boolean }[] = [];

  if (sortedActiveDates.length === 0) {
    // Default 5-day calendar window centered around anchorDate
    const base = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate());
    for (let offset = -1; offset <= 3; offset++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
      selectedDayDates.push({ date: d, hasGapBefore: false });
    }
  } else {
    const first = sortedActiveDates[0];
    const last = sortedActiveDates[sortedActiveDates.length - 1];
    const spanDays = Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1;

    if (spanDays <= 18) {
      // Continuous calendar columns from first day to last day (plus at least 4 columns total)
      const totalDays = Math.max(4, spanDays);
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
        selectedDayDates.push({ date: d, hasGapBefore: false });
      }
    } else {
      // Sparse multi-month roadmap: include active dates (and 1 day after/before if only 1 active day in a cluster)
      // without creating dozens of empty columns
      const activeKeySet = new Set(sortedActiveDates.map((d) => toDayKey(d.getFullYear(), d.getMonth(), d.getDate())));
      let prevDate: Date | null = null;
      for (const d of sortedActiveDates) {
        const diff = prevDate ? Math.round((d.getTime() - prevDate.getTime()) / 86_400_000) : 0;
        if (prevDate && diff > 1 && diff <= 3) {
          for (let step = 1; step < diff; step++) {
            const bridge = new Date(prevDate.getFullYear(), prevDate.getMonth(), prevDate.getDate() + step);
            const bKey = toDayKey(bridge.getFullYear(), bridge.getMonth(), bridge.getDate());
            if (!activeKeySet.has(bKey)) {
              selectedDayDates.push({ date: bridge, hasGapBefore: false });
              activeKeySet.add(bKey);
            }
          }
          selectedDayDates.push({ date: d, hasGapBefore: false });
        } else {
          selectedDayDates.push({ date: d, hasGapBefore: Boolean(prevDate && diff > 3) });
        }
        prevDate = d;
      }
    }
  }

  // 3. Determine hour range
  let minHour = 9;
  let maxHour = 17;
  if (parsedByNodeId.size > 0) {
    const parsedHours = Array.from(parsedByNodeId.values()).map((p) => p.hour);
    minHour = Math.max(0, Math.min(...parsedHours, 8));
    maxHour = Math.min(23, Math.max(...parsedHours, minHour + 4));
  }
  const hourList: number[] = [];
  for (let h = minHour; h <= maxHour; h++) {
    hourList.push(h);
  }

  // 4. Bucket nodes into (dayKey, hour) slots to compute dynamic cell widths & row heights
  const slotMap = new Map<string, CanvasNode[]>();
  const colMaxWidth = new Map<string, number>();

  for (const n of nodes) {
    const parsed = parsedByNodeId.get(n.id);
    if (!parsed) continue;
    const slotKey = `${parsed.dayKey}__${parsed.hour}`;
    const arr = slotMap.get(slotKey) ?? [];
    arr.push(n);
    slotMap.set(slotKey, arr);

    const cardW = Math.max(200, n.width || 248);
    colMaxWidth.set(parsed.dayKey, Math.max(colMaxWidth.get(parsed.dayKey) ?? 0, cardW));
  }

  // Sort nodes inside each slot by minute ascending, then existing order
  for (const arr of slotMap.values()) {
    arr.sort((a, b) => {
      const pa = parsedByNodeId.get(a.id)!;
      const pb = parsedByNodeId.get(b.id)!;
      if (pa.minute !== pb.minute) return pa.minute - pb.minute;
      return a.x - b.x;
    });
  }

  // Compute day columns with exact x & width
  const gridStartX = ORIGIN_X + AXIS_WIDTH;
  const gridStartY = ORIGIN_Y + MONTH_HEADER_H + DAY_HEADER_H;

  let cursorX = gridStartX;
  const days: TimeframeDayColumn[] = selectedDayDates.map((entry, idx) => {
    const d = entry.date;
    const key = toDayKey(d.getFullYear(), d.getMonth(), d.getDate());
    const colW = Math.max(DEFAULT_COL_WIDTH, (colMaxWidth.get(key) ?? 248) + CELL_PAD_X * 2);
    const prev = idx > 0 ? selectedDayDates[idx - 1].date : null;
    const isMonthStart = !prev || prev.getMonth() !== d.getMonth() || prev.getFullYear() !== d.getFullYear();

    const col: TimeframeDayColumn = {
      key,
      date: d,
      year: d.getFullYear(),
      month: d.getMonth(),
      day: d.getDate(),
      weekdayShort: ID_DAY_SHORT[d.getDay()],
      shortLabel: `${ID_DAY_SHORT[d.getDay()]}, ${pad2(d.getDate())} ${ID_MONTH_SHORT[d.getMonth()]}`,
      monthKey: toMonthKey(d.getFullYear(), d.getMonth()),
      monthLabel: `${ID_MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`,
      colIndex: idx,
      x: cursorX,
      width: colW,
      isMonthStart,
      hasGapBefore: entry.hasGapBefore,
    };
    cursorX += colW;
    return col;
  });

  // Group contiguous columns into Month frames
  const months: TimeframeMonthSpan[] = [];
  for (const col of days) {
    const lastMonth = months[months.length - 1];
    if (lastMonth && lastMonth.key === col.monthKey) {
      lastMonth.width += col.width;
      lastMonth.endColIndex = col.colIndex;
    } else {
      months.push({
        key: col.monthKey,
        label: col.monthLabel,
        year: col.year,
        month: col.month,
        startX: col.x,
        width: col.width,
        startColIndex: col.colIndex,
        endColIndex: col.colIndex,
      });
    }
  }

  // Compute hour rows with dynamic height based on tallest stack in any column of that hour
  let cursorY = gridStartY;
  const hours: TimeframeHourRow[] = hourList.map((hour, rIdx) => {
    let maxSlotStackH = 0;
    for (const col of days) {
      const slotNodes = slotMap.get(`${col.key}__${hour}`);
      if (!slotNodes || slotNodes.length === 0) continue;
      let stackH = 0;
      slotNodes.forEach((sn, sIdx) => {
        stackH += estimateTimeframeCardHeight(sn);
        if (sIdx > 0) stackH += SLOT_STACK_GAP;
      });
      maxSlotStackH = Math.max(maxSlotStackH, stackH);
    }

    const rowH = Math.max(MIN_ROW_HEIGHT, maxSlotStackH > 0 ? maxSlotStackH + CELL_PAD_Y * 2 : MIN_ROW_HEIGHT);
    const row: TimeframeHourRow = {
      hour,
      label: `${pad2(hour)}:00`,
      rowIndex: rIdx,
      y: cursorY,
      height: rowH,
    };
    cursorY += rowH;
    return row;
  });

  const gridHeight = cursorY - gridStartY;
  const gridWidth = cursorX - gridStartX;

  // 5. Assign exact coordinates for scheduled nodes inside their Day Column x Hour Row cell
  const colByKey = new Map(days.map((c) => [c.key, c]));
  const rowByHour = new Map(hours.map((r) => [r.hour, r]));
  const nodePositions = new Map<string, { x: number; y: number }>();

  for (const [slotKey, slotNodes] of slotMap.entries()) {
    const [dayKey, hourStr] = slotKey.split('__');
    const col = colByKey.get(dayKey);
    const row = rowByHour.get(Number(hourStr));
    if (!col || !row) continue;

    let itemY = row.y + CELL_PAD_Y;
    for (const sn of slotNodes) {
      const cardW = sn.width || 248;
      const centeredX = Math.round(col.x + Math.max(CELL_PAD_X, (col.width - cardW) / 2));
      nodePositions.set(sn.id, {
        x: centeredX,
        y: Math.round(itemY),
      });
      itemY += estimateTimeframeCardHeight(sn) + SLOT_STACK_GAP;
    }
  }

  // 6. Optional unscheduled lane below the grid if any nodes lack a timestampStamp
  let unscheduledLane: TimeframeGrid['unscheduledLane'] = null;
  let totalHeight = MONTH_HEADER_H + DAY_HEADER_H + gridHeight;

  if (unscheduledNodes.length > 0) {
    const laneTop = cursorY + 24;
    let maxUnschedH = 120;
    let ux = gridStartX + CELL_PAD_X;
    let uy = laneTop + 42;
    const laneMaxRight = Math.max(gridStartX + gridWidth - 20, gridStartX + 960);

    for (const un of unscheduledNodes) {
      const uw = un.width || 248;
      const uh = estimateTimeframeCardHeight(un);
      if (ux + uw > laneMaxRight && ux > gridStartX + CELL_PAD_X) {
        ux = gridStartX + CELL_PAD_X;
        uy += maxUnschedH + 20;
        maxUnschedH = 120;
      }
      nodePositions.set(un.id, { x: Math.round(ux), y: Math.round(uy) });
      ux += uw + 24;
      maxUnschedH = Math.max(maxUnschedH, uh);
    }

    const laneHeight = uy - laneTop + maxUnschedH + 24;
    unscheduledLane = {
      y: laneTop,
      height: laneHeight,
      label: 'Belum Terjadwal (Tambahkan Stamp Waktu agar masuk otomatis ke kolom grid)',
    };
    totalHeight = laneTop + laneHeight - ORIGIN_Y;
  }

  return {
    originX: ORIGIN_X,
    originY: ORIGIN_Y,
    monthHeaderY: ORIGIN_Y,
    monthHeaderHeight: MONTH_HEADER_H,
    dayHeaderY: ORIGIN_Y + MONTH_HEADER_H,
    dayHeaderHeight: DAY_HEADER_H,
    axisWidth: AXIS_WIDTH,
    gridStartX,
    gridStartY,
    totalWidth: AXIS_WIDTH + gridWidth,
    gridHeight,
    totalHeight,
    days,
    months,
    hours,
    unscheduledLane,
    nodePositions,
    parsedByNodeId,
  };
}

export interface TimeframeAgendaItem {
  node: CanvasNode;
  parsed: ParsedNodeTimestamp;
  timeLabel: string;
}

export interface TimeframeDayGroup {
  dayKey: string;
  dayLabel: string;
  items: TimeframeAgendaItem[];
}

export interface TimeframeMonthGroup {
  monthKey: string;
  monthLabel: string;
  days: TimeframeDayGroup[];
}

export interface TimeframeChronologicalReport {
  months: TimeframeMonthGroup[];
  unscheduled: CanvasNode[];
}

export function groupTimeframeNodesChronologically(
  nodes: CanvasNode[],
  referenceDate?: Date
): TimeframeChronologicalReport {
  const grid = computeTimeframeGrid(nodes, referenceDate);
  const scheduled: { node: CanvasNode; parsed: ParsedNodeTimestamp }[] = [];
  const unscheduled: CanvasNode[] = [];

  for (const n of nodes) {
    const parsed = grid.parsedByNodeId.get(n.id);
    if (parsed) {
      scheduled.push({ node: n, parsed });
    } else {
      unscheduled.push(n);
    }
  }

  scheduled.sort((a, b) => {
    if (a.parsed.epochMs !== b.parsed.epochMs) {
      return a.parsed.epochMs - b.parsed.epochMs;
    }
    if (Math.abs(a.node.y - b.node.y) > 20) return a.node.y - b.node.y;
    return a.node.x - b.node.x;
  });

  const months: TimeframeMonthGroup[] = [];
  const monthMap = new Map<string, TimeframeMonthGroup>();
  const dayMap = new Map<string, TimeframeDayGroup>();

  for (const entry of scheduled) {
    const { node, parsed } = entry;
    let mGroup = monthMap.get(parsed.monthKey);
    if (!mGroup) {
      mGroup = {
        monthKey: parsed.monthKey,
        monthLabel: `${ID_MONTH_LONG[parsed.month]} ${parsed.year}`,
        days: [],
      };
      monthMap.set(parsed.monthKey, mGroup);
      months.push(mGroup);
    }

    let dGroup = dayMap.get(parsed.dayKey);
    if (!dGroup) {
      const weekday = ID_DAY_SHORT[parsed.date.getDay()];
      dGroup = {
        dayKey: parsed.dayKey,
        dayLabel: `${weekday}, ${pad2(parsed.day)} ${ID_MONTH_LONG[parsed.month]} ${parsed.year}`,
        items: [],
      };
      dayMap.set(parsed.dayKey, dGroup);
      mGroup.days.push(dGroup);
    }

    dGroup.items.push({
      node,
      parsed,
      timeLabel: parsed.timeLabel,
    });
  }

  unscheduled.sort((a, b) => {
    if (Math.abs(a.y - b.y) > 20) return a.y - b.y;
    return a.x - b.x;
  });

  return { months, unscheduled };
}
