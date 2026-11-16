export type FontFamilyOption =
  | 'Plus Jakarta Sans'
  | 'DM Sans'
  | 'Outfit'
  | 'Lora'
  | 'Fraunces'
  | 'Playfair Display'
  | 'JetBrains Mono';

export const FONT_FAMILIES: { label: string; value: FontFamilyOption; category: string }[] = [
  { label: 'Plus Jakarta Sans', value: 'Plus Jakarta Sans', category: 'Sans' },
  { label: 'DM Sans', value: 'DM Sans', category: 'Sans' },
  { label: 'Outfit', value: 'Outfit', category: 'Geometris' },
  { label: 'Lora', value: 'Lora', category: 'Serif' },
  { label: 'Fraunces', value: 'Fraunces', category: 'Editorial' },
  { label: 'Playfair Display', value: 'Playfair Display', category: 'Klasik' },
  { label: 'JetBrains Mono', value: 'JetBrains Mono', category: 'Mono' },
];

export type NodeTextTarget = 'title' | 'body';

export interface NodeTextStyle {
  fontFamily: FontFamilyOption;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  align?: 'left' | 'center' | 'right';
}

export type ColumnFormat =
  | 'text'
  | 'number'
  | 'currency'
  | 'date'
  | 'status'
  | 'checkbox'
  | 'percent';

export interface DynamicColumn {
  id: string;
  name: string;
  format: ColumnFormat;
  width?: number;
}

export interface DynamicRow {
  id: string;
  cells: Record<string, string | boolean>;
}

export interface DynamicTableData {
  columns: DynamicColumn[];
  rows: DynamicRow[];
}

export interface MediaAttachment {
  id: string;
  url: string;
  caption?: string;
  aspectRatio?: '16:9' | '4:3' | '1:1' | 'auto';
}

export type NodeKind =
  | 'topic'
  | 'note'
  | 'table'
  | 'media'
  | 'fishbone-head'
  | 'fishbone-cat'
  | 'star-center'
  | 'lotus-core';

export interface CanvasNode {
  id: string;
  parentId?: string | null;
  kind: NodeKind;
  x: number;
  y: number;
  width: number;
  title: string;
  body: string;
  symbols: string[];
  timestampStamp?: string | null;
  style: NodeTextStyle;
  bodyStyle?: NodeTextStyle;
  surfaceColor: string;
  accentColor: string;
  collapsed?: boolean;
  table?: DynamicTableData | null;
  media?: MediaAttachment | null;
  meta?: {
    templateRole?: string;
    ribDirection?: 'top' | 'bottom';
  };
}

export type ConnectorStyle = 'bezier' | 'orthogonal' | 'fishbone' | 'straight';

export interface CanvasEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  color?: string;
  style: ConnectorStyle;
}

export type TemplateId =
  | 'mind-mapping'
  | 'fishbone'
  | 'tree'
  | 'star-bursting'
  | 'lotus-blossom';

export interface BoardDocument {
  id: string;
  title: string;
  templateId: TemplateId;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  updatedAt: number;
}

export interface CollaboratorPresence {
  clientId: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number } | null;
  selectedNodeId?: string | null;
  lastSeen: number;
}

export interface EncryptedEnvelope {
  encrypted: true;
  iv: string;
  ciphertext: string;
  keyFingerprint: string;
  updatedAt: number;
}

export type InteractionTool = 'select' | 'pan' | 'connect';

export type StampFormat = 'full' | 'date-time' | 'time-only' | 'iso';

export type RoomLifetimeMinutes = 30 | 60 | 120 | 1440;

export const ROOM_LIFETIME_OPTIONS: { value: RoomLifetimeMinutes; label: string; shortLabel: string }[] = [
  { value: 30, label: '30 Menit', shortLabel: '30m' },
  { value: 60, label: '1 Jam', shortLabel: '1j' },
  { value: 120, label: '2 Jam', shortLabel: '2j' },
  { value: 1440, label: '24 Jam', shortLabel: '24j' },
];

export interface RoomLifetimeInfo {
  lifetimeMinutes: RoomLifetimeMinutes;
  createdAt: number;
  expiresAt: number;
}
