import type {
  BoardDocument,
  CanvasEdge,
  CanvasNode,
  ColumnFormat,
  ConnectorStyle,
  DynamicColumn,
  DynamicRow,
  DynamicTableData,
  FontFamilyOption,
  MediaAttachment,
  NodeKind,
  NodeTextStyle,
  TemplateId,
} from '../types/canvas.ts';

const ROOM_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/;
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,80}$/;
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const DATA_IMAGE_REGEX =
  /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;

const MAX_NODES = 2000;
const MAX_EDGES = 4000;
const MAX_DATA_URL_LENGTH = 2_500_000;
const MAX_HTTPS_URL_LENGTH = 2048;

const ALLOWED_TEMPLATES = new Set<TemplateId>([
  'mind-mapping',
  'fishbone',
  'tree',
  'star-bursting',
  'lotus-blossom',
  'timeframe',
]);

const ALLOWED_NODE_KINDS = new Set<NodeKind>([
  'topic',
  'note',
  'table',
  'media',
  'fishbone-head',
  'fishbone-cat',
  'star-center',
  'lotus-core',
]);

const ALLOWED_FONT_FAMILIES = new Set<FontFamilyOption>([
  'Plus Jakarta Sans',
  'DM Sans',
  'Outfit',
  'Lora',
  'Fraunces',
  'Playfair Display',
  'JetBrains Mono',
]);

const ALLOWED_COLUMN_FORMATS = new Set<ColumnFormat>([
  'text',
  'number',
  'currency',
  'date',
  'status',
  'checkbox',
  'percent',
]);

const ALLOWED_CONNECTOR_STYLES = new Set<ConnectorStyle>([
  'bezier',
  'orthogonal',
  'fishbone',
  'straight',
]);

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function clampFinite(val: unknown, fallback: number, min: number, max: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.min(max, Math.max(min, val));
}

function safeHexColor(val: unknown, fallback: string): string {
  if (typeof val !== 'string') return fallback;
  const trimmed = val.trim();
  return HEX_COLOR_REGEX.test(trimmed) ? trimmed : fallback;
}

function sanitizeSafeId(val: unknown, prefix: string, index: number): string {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (SAFE_ID_REGEX.test(trimmed)) return trimmed;
  }
  return `${prefix}-${index + 1}`;
}

function isPrivateIpv4Tuple(a: number, b: number, c: number, d: number): boolean {
  if (
    [a, b, c, d].some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    return true;
  }
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateOrLocalHostname(rawHostname: string): boolean {
  const host = rawHostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.arpa')
  ) {
    return true;
  }

  // Raw IPv6 literals or IPv4-mapped IPv6 addresses
  if (host.includes(':')) {
    if (host === '::' || host === '::1') return true;
    const mapped = host.match(/^::ffff:(\d+)\.(\d+)\.(\d+)\.(\d+)$/i);
    if (mapped) {
      return isPrivateIpv4Tuple(
        Number(mapped[1]),
        Number(mapped[2]),
        Number(mapped[3]),
        Number(mapped[4])
      );
    }
    if (/^(fc|fd|fe8|fe9|fea|feb)/i.test(host)) return true;
    return true;
  }

  // Require at least one dot for public hostnames (blocks single-label hosts & integer IPs)
  if (!host.includes('.')) return true;

  // Reject pure numeric/hex/octal IPv4 encodings
  const ipv4Match = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    return isPrivateIpv4Tuple(
      Number(ipv4Match[1]),
      Number(ipv4Match[2]),
      Number(ipv4Match[3]),
      Number(ipv4Match[4])
    );
  }

  // Reject hex/octal dotted IP forms like 0x7f.0.0.1 or 0177.0.0.1
  const labels = host.split('.');
  if (labels.every((l) => /^(0x[0-9a-f]+|0[0-7]+|\d+)$/i.test(l))) {
    return true;
  }

  return false;
}

export function isValidMediaUrl(rawUrl: unknown): boolean {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;

  if (trimmed.toLowerCase().startsWith('data:')) {
    if (trimmed.length > MAX_DATA_URL_LENGTH) return false;
    return DATA_IMAGE_REGEX.test(trimmed);
  }

  if (trimmed.length > MAX_HTTPS_URL_LENGTH) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    if (isPrivateOrLocalHostname(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function sanitizeTextStyle(raw: unknown, fallback: NodeTextStyle): NodeTextStyle {
  if (!isPlainObject(raw)) {
    return { ...fallback };
  }
  const fontFamily =
    typeof raw.fontFamily === 'string' &&
    ALLOWED_FONT_FAMILIES.has(raw.fontFamily as FontFamilyOption)
      ? (raw.fontFamily as FontFamilyOption)
      : fallback.fontFamily;
  const align =
    raw.align === 'left' || raw.align === 'center' || raw.align === 'right'
      ? raw.align
      : fallback.align ?? 'left';

  return {
    fontFamily,
    fontSize: clampFinite(raw.fontSize, fallback.fontSize, 8, 72),
    bold: typeof raw.bold === 'boolean' ? raw.bold : fallback.bold,
    italic: typeof raw.italic === 'boolean' ? raw.italic : fallback.italic,
    underline: typeof raw.underline === 'boolean' ? raw.underline : fallback.underline,
    color: safeHexColor(raw.color, fallback.color),
    align,
  };
}

function sanitizeDynamicTable(raw: unknown): DynamicTableData | null {
  if (!isPlainObject(raw)) return null;
  if (!Array.isArray(raw.columns) || !Array.isArray(raw.rows)) return null;

  const columns: DynamicColumn[] = [];
  for (let i = 0; i < Math.min(raw.columns.length, 30); i++) {
    const c = raw.columns[i];
    if (!isPlainObject(c)) continue;
    const id = sanitizeSafeId(c.id, 'col', i);
    const name =
      typeof c.name === 'string' && c.name.trim()
        ? c.name.trim().slice(0, 80)
        : `Kolom ${i + 1}`;
    const format: ColumnFormat =
      typeof c.format === 'string' && ALLOWED_COLUMN_FORMATS.has(c.format as ColumnFormat)
        ? (c.format as ColumnFormat)
        : 'text';
    const col: DynamicColumn = { id, name, format };
    if (typeof c.width === 'number' && Number.isFinite(c.width)) {
      col.width = clampFinite(c.width, 100, 40, 600);
    }
    columns.push(col);
  }

  if (columns.length === 0) return null;

  const rows: DynamicRow[] = [];
  for (let i = 0; i < Math.min(raw.rows.length, 300); i++) {
    const r = raw.rows[i];
    if (!isPlainObject(r)) continue;
    const rowId = sanitizeSafeId(r.id, 'row', i);
    const cells: Record<string, string | boolean> = {};
    const rawCells = isPlainObject(r.cells) ? r.cells : {};
    for (const col of columns) {
      const val = rawCells[col.id];
      if (col.format === 'checkbox') {
        cells[col.id] = Boolean(val);
      } else if (typeof val === 'string') {
        cells[col.id] = val.slice(0, 500);
      } else if (typeof val === 'number' && Number.isFinite(val)) {
        cells[col.id] = String(val);
      } else {
        cells[col.id] = '';
      }
    }
    rows.push({ id: rowId, cells });
  }

  return { columns, rows };
}

function sanitizeMedia(raw: unknown, idx: number): MediaAttachment | null {
  if (!isPlainObject(raw)) return null;
  if (!isValidMediaUrl(raw.url)) return null;
  const aspectRatio =
    raw.aspectRatio === '16:9' ||
    raw.aspectRatio === '4:3' ||
    raw.aspectRatio === '1:1' ||
    raw.aspectRatio === 'auto'
      ? raw.aspectRatio
      : '16:9';
  return {
    id: sanitizeSafeId(raw.id, 'media', idx),
    url: String(raw.url).trim(),
    caption: typeof raw.caption === 'string' ? raw.caption.slice(0, 200) : '',
    aspectRatio,
  };
}

const FALLBACK_TITLE_STYLE: NodeTextStyle = {
  fontFamily: 'Plus Jakarta Sans',
  fontSize: 15,
  bold: false,
  italic: false,
  underline: false,
  color: '#0F172A',
  align: 'left',
};

const FALLBACK_BODY_STYLE: NodeTextStyle = {
  fontFamily: 'Plus Jakarta Sans',
  fontSize: 13,
  bold: false,
  italic: false,
  underline: false,
  color: '#475569',
  align: 'left',
};

export function trySanitizeBoardDocument(
  raw: unknown,
  fallbackRoomId?: string
): BoardDocument | null {
  if (!isPlainObject(raw)) return null;
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return null;
  if (raw.nodes.length > MAX_NODES || raw.edges.length > MAX_EDGES) return null;

  let docId = '';
  if (typeof raw.id === 'string' && ROOM_ID_REGEX.test(raw.id.trim())) {
    docId = raw.id.trim();
  } else if (fallbackRoomId && ROOM_ID_REGEX.test(fallbackRoomId)) {
    docId = fallbackRoomId;
  } else {
    return null;
  }

  const title =
    typeof raw.title === 'string'
      ? raw.title.slice(0, 160)
      : 'Kanvas Kolaborasi';

  const templateId: TemplateId =
    typeof raw.templateId === 'string' && ALLOWED_TEMPLATES.has(raw.templateId as TemplateId)
      ? (raw.templateId as TemplateId)
      : 'mind-mapping';

  const nodes: CanvasNode[] = [];
  const seenNodeIds = new Set<string>();

  for (let i = 0; i < raw.nodes.length; i++) {
    const n = raw.nodes[i];
    if (!isPlainObject(n)) continue;
    let id = sanitizeSafeId(n.id, 'node', i);
    if (seenNodeIds.has(id)) {
      id = `${id.slice(0, 68)}-${i}`;
    }
    seenNodeIds.add(id);

    const parentId =
      typeof n.parentId === 'string' && SAFE_ID_REGEX.test(n.parentId.trim())
        ? n.parentId.trim()
        : null;

    const kind: NodeKind =
      typeof n.kind === 'string' && ALLOWED_NODE_KINDS.has(n.kind as NodeKind)
        ? (n.kind as NodeKind)
        : 'topic';

    const symbols = Array.isArray(n.symbols)
      ? n.symbols
          .filter((s): s is string => typeof s === 'string' && s.length > 0)
          .slice(0, 24)
          .map((s) => s.slice(0, 8))
      : [];

    const timestampStamp =
      typeof n.timestampStamp === 'string' && n.timestampStamp.trim()
        ? n.timestampStamp.trim().slice(0, 64)
        : null;

    const style = sanitizeTextStyle(n.style, FALLBACK_TITLE_STYLE);
    const bodyStyle = isPlainObject(n.bodyStyle)
      ? sanitizeTextStyle(n.bodyStyle, FALLBACK_BODY_STYLE)
      : undefined;

    const meta = isPlainObject(n.meta)
      ? {
          templateRole:
            typeof n.meta.templateRole === 'string'
              ? n.meta.templateRole.slice(0, 64)
              : undefined,
          ribDirection:
            n.meta.ribDirection === 'top' || n.meta.ribDirection === 'bottom'
              ? (n.meta.ribDirection as 'top' | 'bottom')
              : undefined,
        }
      : undefined;

    nodes.push({
      id,
      parentId,
      kind,
      x: clampFinite(n.x, 0, -1_000_000, 1_000_000),
      y: clampFinite(n.y, 0, -1_000_000, 1_000_000),
      width: clampFinite(n.width, 248, 140, 1200),
      title: typeof n.title === 'string' ? n.title.slice(0, 500) : '',
      body: typeof n.body === 'string' ? n.body.slice(0, 10_000) : '',
      symbols,
      timestampStamp,
      style,
      bodyStyle,
      surfaceColor: safeHexColor(n.surfaceColor, '#FFFFFF'),
      accentColor: safeHexColor(n.accentColor, '#2563EB'),
      collapsed: typeof n.collapsed === 'boolean' ? n.collapsed : false,
      table: sanitizeDynamicTable(n.table),
      media: sanitizeMedia(n.media, i),
      meta,
    });
  }

  const edges: CanvasEdge[] = [];
  const seenEdgeIds = new Set<string>();

  for (let i = 0; i < raw.edges.length; i++) {
    const e = raw.edges[i];
    if (!isPlainObject(e)) continue;
    if (
      typeof e.sourceId !== 'string' ||
      typeof e.targetId !== 'string' ||
      !SAFE_ID_REGEX.test(e.sourceId.trim()) ||
      !SAFE_ID_REGEX.test(e.targetId.trim())
    ) {
      continue;
    }

    let id = sanitizeSafeId(e.id, 'edge', i);
    if (seenEdgeIds.has(id)) {
      id = `${id.slice(0, 68)}-${i}`;
    }
    seenEdgeIds.add(id);

    const style: ConnectorStyle =
      typeof e.style === 'string' && ALLOWED_CONNECTOR_STYLES.has(e.style as ConnectorStyle)
        ? (e.style as ConnectorStyle)
        : 'bezier';

    edges.push({
      id,
      sourceId: e.sourceId.trim(),
      targetId: e.targetId.trim(),
      label: typeof e.label === 'string' ? e.label.slice(0, 120) : undefined,
      color:
        typeof e.color === 'string' && HEX_COLOR_REGEX.test(e.color.trim())
          ? e.color.trim()
          : undefined,
      style,
    });
  }

  const updatedAt =
    typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)
      ? raw.updatedAt
      : Date.now();

  return {
    id: docId,
    title,
    templateId,
    nodes,
    edges,
    updatedAt,
  };
}

export function sanitizeBoardDocument(
  raw: unknown,
  fallbackRoomId = 'ruang-kanvas'
): BoardDocument {
  const sanitized = trySanitizeBoardDocument(raw, fallbackRoomId);
  if (sanitized) return sanitized;
  return {
    id: ROOM_ID_REGEX.test(fallbackRoomId) ? fallbackRoomId : 'ruang-kanvas',
    title: 'Kanvas Kosong',
    templateId: 'mind-mapping',
    nodes: [],
    edges: [],
    updatedAt: Date.now(),
  };
}
