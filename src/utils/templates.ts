import {
  BoardDocument,
  CanvasEdge,
  CanvasNode,
  ConnectorStyle,
  DynamicTableData,
  NodeTextStyle,
  StampFormat,
  TemplateId,
} from '../types/canvas';
import { computeTimeframeGrid } from './timeframe';

export const DEFAULT_TEXT_STYLE: NodeTextStyle = {
  fontFamily: 'Plus Jakarta Sans',
  fontSize: 15,
  bold: false,
  italic: false,
  underline: false,
  color: '#0F172A',
  align: 'left',
};

export const DEFAULT_BODY_STYLE: NodeTextStyle = {
  fontFamily: 'Plus Jakarta Sans',
  fontSize: 13,
  bold: false,
  italic: false,
  underline: false,
  color: '#475569',
  align: 'left',
};

export function resolveBodyStyle(node: CanvasNode): NodeTextStyle {
  if (node.bodyStyle) {
    return {
      ...DEFAULT_BODY_STYLE,
      ...node.bodyStyle,
    };
  }
  return {
    ...DEFAULT_BODY_STYLE,
    fontFamily: node.style.fontFamily || DEFAULT_BODY_STYLE.fontFamily,
    fontSize: Math.max(12, (node.style.fontSize || 15) - 2),
    italic: Boolean(node.style.italic),
    underline: Boolean(node.style.underline),
    align: node.style.align || 'left',
  };
}

export function isDarkHexColor(hex?: string | null): boolean {
  if (!hex) return false;
  const cleaned = hex.trim().replace('#', '');
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return false;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

export const NODE_TEXT_COLORS = [
  '#0F172A',
  '#475569',
  '#1E40AF',
  '#047857',
  '#B45309',
  '#B91C1C',
  '#6D28D9',
  '#0F766E',
  '#FFFFFF',
];

export const NODE_SURFACE_COLORS = [
  { name: 'Putih Bersih', value: '#FFFFFF' },
  { name: 'Batu Halus', value: '#F8FAFC' },
  { name: 'Biru Awan', value: '#EFF6FF' },
  { name: 'Zamrud Muda', value: '#ECFDF5' },
  { name: 'Amber Lembut', value: '#FFFBEB' },
  { name: 'Mawar Muda', value: '#FFF1F2' },
  { name: 'Indigo Muda', value: '#EEF2FF' },
  { name: 'Arang Gelap', value: '#1E293B' },
];

export const ACCENT_COLORS = [
  '#2563EB',
  '#059669',
  '#D97706',
  '#DC2626',
  '#7C3AED',
  '#0891B2',
  '#475569',
];

export function formatStamp(date: Date, format: StampFormat): string {
  const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const d = days[date.getDay()];
  const dd = String(date.getDate()).padStart(2, '0');
  const m = months[date.getMonth()];
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');

  switch (format) {
    case 'full':
      return `${d}, ${dd} ${m} ${yyyy} · ${hh}:${mm}`;
    case 'date-time':
      return `${dd}/${String(date.getMonth() + 1).padStart(2, '0')}/${yyyy} ${hh}:${mm}`;
    case 'time-only':
      return `${d} · ${hh}:${mm}`;
    case 'iso':
      return `${yyyy}-${String(date.getMonth() + 1).padStart(2, '0')}-${dd} ${hh}:${mm}`;
  }
}

export function createDefaultTable(): DynamicTableData {
  return {
    columns: [
      { id: 'col-1', name: 'Inisiatif', format: 'text' },
      { id: 'col-2', name: 'Estimasi', format: 'currency' },
      { id: 'col-3', name: 'Progres', format: 'percent' },
      { id: 'col-4', name: 'Siap', format: 'checkbox' },
    ],
    rows: [
      {
        id: 'row-1',
        cells: {
          'col-1': 'Riset Validasi',
          'col-2': '12500000',
          'col-3': '80',
          'col-4': true,
        },
      },
      {
        id: 'row-2',
        cells: {
          'col-1': 'Prototipe Kanvas',
          'col-2': '24000000',
          'col-3': '45',
          'col-4': false,
        },
      },
    ],
  };
}

export function createBlankNode(partial: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: partial.id ?? `node-${crypto.randomUUID().slice(0, 8)}`,
    parentId: partial.parentId ?? null,
    kind: partial.kind ?? 'topic',
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    width: partial.width ?? 248,
    title: partial.title ?? 'Ide Baru',
    body: partial.body ?? '',
    symbols: partial.symbols ?? [],
    timestampStamp: partial.timestampStamp ?? null,
    style: {
      ...DEFAULT_TEXT_STYLE,
      ...(partial.style ?? {}),
    },
    bodyStyle: {
      ...DEFAULT_BODY_STYLE,
      ...(partial.bodyStyle ?? {}),
    },
    surfaceColor: partial.surfaceColor ?? '#FFFFFF',
    accentColor: partial.accentColor ?? '#2563EB',
    collapsed: partial.collapsed ?? false,
    table: partial.table ?? null,
    media: partial.media ?? null,
    meta: partial.meta,
  };
}

export interface TemplateMetadata {
  id: TemplateId;
  name: string;
  subtitle: string;
  description: string;
  connectorStyle: ConnectorStyle;
}

export const TEMPLATE_CATALOG: TemplateMetadata[] = [
  {
    id: 'mind-mapping',
    name: 'Mind Mapping',
    subtitle: 'Percabangan Radial Organik',
    description: 'Memetakan topik inti ke cabang ide utama dan sub-gagasan secara bebas dengan kurva bezier.',
    connectorStyle: 'bezier',
  },
  {
    id: 'fishbone',
    name: 'Fishbone Diagram',
    subtitle: 'Analisis Akar Masalah (Ishikawa)',
    description: 'Menyusun kategori penyebab utama dan faktor turunan menuju pernyataan masalah di kepala tulang ikan.',
    connectorStyle: 'fishbone',
  },
  {
    id: 'tree',
    name: 'Tree Diagram',
    subtitle: 'Hierarki Terstruktur Atas-Bawah',
    description: 'Menguraikan tujuan besar menjadi pilar strategi dan langkah eksekusi dengan garis ortogonal rapi.',
    connectorStyle: 'orthogonal',
  },
  {
    id: 'star-bursting',
    name: 'Star Bursting',
    subtitle: 'Eksplorasi 5W + 1H',
    description: 'Menggali setiap sudut ide lewat enam pertanyaan kritis: Siapa, Apa, Di Mana, Kapan, Mengapa, dan Bagaimana.',
    connectorStyle: 'straight',
  },
  {
    id: 'lotus-blossom',
    name: 'Lotus Blossom Technique',
    subtitle: 'Ekspansi Matriks 8 Kelopak',
    description: 'Mengembangkan 1 gagasan pusat menjadi 8 tema kunci dan mekar menjadi gugus sub-ide terstruktur.',
    connectorStyle: 'straight',
  },
  {
    id: 'timeframe',
    name: 'Timeframe Linimasa',
    subtitle: 'Matriks Bulan, Hari & Jam Otomatis',
    description: 'Menyusun node otomatis ke kolom tanggal dan baris jam dengan garis bingkai pemisah pergantian bulan.',
    connectorStyle: 'straight',
  },
];

function makeNode(
  id: string,
  x: number,
  y: number,
  title: string,
  body: string,
  opts: Partial<CanvasNode> = {}
): CanvasNode {
  return createBlankNode({
    id,
    x,
    y,
    title,
    body,
    ...opts,
  });
}

function makeEdge(
  sourceId: string,
  targetId: string,
  style: ConnectorStyle,
  color = '#64748B',
  label?: string
): CanvasEdge {
  return {
    id: `edge-${sourceId}-${targetId}`,
    sourceId,
    targetId,
    style,
    color,
    label,
  };
}

export function buildTemplateBoard(templateId: TemplateId, existingId?: string): BoardDocument {
  const nowStamp = formatStamp(new Date(), 'full');
  const boardId = existingId ?? `board-${crypto.randomUUID().slice(0, 8)}`;

  if (templateId === 'fishbone') {
    const nodes: CanvasNode[] = [
      makeNode('fb-head', 540, -55, 'Masalah Utama: Adopsi Fitur Baru Rendah', 'Target: tingkatkan aktivasi mingguan dari 24% menjadi 55%.', {
        kind: 'fishbone-head',
        width: 280,
        surfaceColor: '#FFF1F2',
        accentColor: '#DC2626',
        symbols: ['⚑'],
        timestampStamp: nowStamp,
        style: { ...DEFAULT_TEXT_STYLE, fontSize: 16, bold: true, color: '#881337' },
      }),
      makeNode('fb-c1', -320, -290, 'Manusia (Tim & Pengguna)', 'Kurangnya panduan awal untuk kolaborator baru', {
        kind: 'fishbone-cat',
        parentId: 'fb-head',
        width: 230,
        surfaceColor: '#EFF6FF',
        accentColor: '#2563EB',
        symbols: ['◈'],
        meta: { ribDirection: 'top' },
        style: { ...DEFAULT_TEXT_STYLE, bold: true, color: '#1E3A8A' },
      }),
      makeNode('fb-c1a', -540, -190, 'Onboarding terlalu panjang', 'Pengguna berhenti sebelum membuat cabang kedua', {
        parentId: 'fb-c1',
        width: 210,
        accentColor: '#2563EB',
      }),
      makeNode('fb-c2', 80, -290, 'Metode & Alur Kerja', 'Template tidak langsung siap pakai saat ruang dibuka', {
        kind: 'fishbone-cat',
        parentId: 'fb-head',
        width: 230,
        surfaceColor: '#ECFDF5',
        accentColor: '#059669',
        symbols: ['⚙'],
        meta: { ribDirection: 'top' },
        style: { ...DEFAULT_TEXT_STYLE, bold: true, color: '#065F46' },
      }),
      makeNode('fb-c2a', -140, -190, 'Ekspor terpisah dari kanvas', 'Tim butuh ekspor cepat ke PPTX & DOCX', {
        parentId: 'fb-c2',
        width: 210,
        accentColor: '#059669',
      }),
      makeNode('fb-c3', -320, 220, 'Teknologi & Keamanan', 'Sinkronisasi lambat atau kekhawatiran privasi data', {
        kind: 'fishbone-cat',
        parentId: 'fb-head',
        width: 230,
        surfaceColor: '#FFFBEB',
        accentColor: '#D97706',
        symbols: ['⌘'],
        meta: { ribDirection: 'bottom' },
        style: { ...DEFAULT_TEXT_STYLE, bold: true, color: '#92400E' },
      }),
      makeNode('fb-c3a', -540, 120, 'Butuh Enkripsi End-to-End', 'Klien enterprise wajibkan enkripsi sisi klien', {
        parentId: 'fb-c3',
        width: 210,
        accentColor: '#D97706',
      }),
      makeNode('fb-c4', 80, 220, 'Pengukuran & Data', 'Metrik kolaborasi belum terstruktur dalam tabel', {
        kind: 'fishbone-cat',
        parentId: 'fb-head',
        width: 230,
        surfaceColor: '#EEF2FF',
        accentColor: '#7C3AED',
        symbols: ['∑'],
        meta: { ribDirection: 'bottom' },
        style: { ...DEFAULT_TEXT_STYLE, bold: true, color: '#4C1D95' },
        table: {
          columns: [
            { id: 'c1', name: 'Indikator', format: 'text' },
            { id: 'c2', name: 'Baseline', format: 'percent' },
            { id: 'c3', name: 'Target', format: 'percent' },
          ],
          rows: [
            { id: 'r1', cells: { c1: 'Aktivasi H+7', c2: '24', c3: '55' } },
          ],
        },
      }),
    ];
    const edges: CanvasEdge[] = [
      makeEdge('fb-c1', 'fb-head', 'fishbone', '#2563EB'),
      makeEdge('fb-c1', 'fb-c1a', 'fishbone', '#2563EB'),
      makeEdge('fb-c2', 'fb-head', 'fishbone', '#059669'),
      makeEdge('fb-c2', 'fb-c2a', 'fishbone', '#059669'),
      makeEdge('fb-c3', 'fb-head', 'fishbone', '#D97706'),
      makeEdge('fb-c3', 'fb-c3a', 'fishbone', '#D97706'),
      makeEdge('fb-c4', 'fb-head', 'fishbone', '#7C3AED'),
    ];
    return {
      id: boardId,
      title: 'Analisis Fishbone — Adopsi Fitur',
      templateId: 'fishbone',
      nodes,
      edges,
      updatedAt: Date.now(),
    };
  }

  if (templateId === 'tree') {
    const nodes: CanvasNode[] = [
      makeNode('tr-root', -140, -320, 'Visi Produk Q4: Ekosistem Kolaborasi Aman', 'Menyatukan brainstorming visual, data terstruktur, dan dokumen presentasi.', {
        width: 280,
        surfaceColor: '#EFF6FF',
        accentColor: '#2563EB',
        symbols: ['★'],
        timestampStamp: nowStamp,
        style: { ...DEFAULT_TEXT_STYLE, fontSize: 16, bold: true, color: '#1E3A8A' },
      }),
      makeNode('tr-1', -460, -90, '1. Pengalaman Kanvas', 'Navigasi mulus tanpa batas, zoom presisi, dan template instan.', {
        parentId: 'tr-root',
        width: 240,
        accentColor: '#2563EB',
        style: { ...DEFAULT_TEXT_STYLE, bold: true },
      }),
      makeNode('tr-2', -120, -90, '2. Keamanan & Real-time', 'WebSocket multi-pengguna dengan enkripsi AES-GCM 256-bit.', {
        parentId: 'tr-root',
        width: 240,
        surfaceColor: '#ECFDF5',
        accentColor: '#059669',
        style: { ...DEFAULT_TEXT_STYLE, bold: true, color: '#065F46' },
      }),
      makeNode('tr-3', 220, -90, '3. Output & Data Dinamis', 'Tabel fleksibel & ekspor langsung ke PNG, PDF, DOCX, PPTX, MD.', {
        parentId: 'tr-root',
        width: 240,
        surfaceColor: '#FFFBEB',
        accentColor: '#D97706',
        style: { ...DEFAULT_TEXT_STYLE, bold: true, color: '#92400E' },
      }),
      makeNode('tr-1a', -580, 140, 'Tipografi & Simbol Kaya', 'Pilihan 7 jenis huruf, warna kustom, serta sisipan simbol.', {
        parentId: 'tr-1',
        width: 210,
        accentColor: '#2563EB',
      }),
      makeNode('tr-1b', -340, 140, 'Media Visual & Stamp', 'Sematkan gambar visual dan stempel hari/waktu.', {
        parentId: 'tr-1',
        width: 210,
        accentColor: '#2563EB',
      }),
      makeNode('tr-2a', -120, 140, 'Ruang Kolaborasi E2EE', 'Kunci berada di tautan hash lokal, server hanya meneruskan sandi.', {
        parentId: 'tr-2',
        width: 230,
        accentColor: '#059669',
      }),
      makeNode('tr-3a', 190, 140, 'Matriks Anggaran & PIC', 'Kolom dinamis sesuai kebutuhan proyek.', {
        parentId: 'tr-3',
        width: 300,
        accentColor: '#D97706',
        table: createDefaultTable(),
      }),
    ];
    const edges: CanvasEdge[] = [
      makeEdge('tr-root', 'tr-1', 'orthogonal', '#2563EB'),
      makeEdge('tr-root', 'tr-2', 'orthogonal', '#059669'),
      makeEdge('tr-root', 'tr-3', 'orthogonal', '#D97706'),
      makeEdge('tr-1', 'tr-1a', 'orthogonal', '#2563EB'),
      makeEdge('tr-1', 'tr-1b', 'orthogonal', '#2563EB'),
      makeEdge('tr-2', 'tr-2a', 'orthogonal', '#059669'),
      makeEdge('tr-3', 'tr-3a', 'orthogonal', '#D97706'),
    ];
    return {
      id: boardId,
      title: 'Pohon Strategi — Roadmap Produk',
      templateId: 'tree',
      nodes,
      edges,
      updatedAt: Date.now(),
    };
  }

  if (templateId === 'star-bursting') {
    const nodes: CanvasNode[] = [
      makeNode('sb-center', -130, -60, 'Inisiatif: Peluncuran Platform Edukasi Interaktif', 'Gagasan inti yang dievaluasi dengan 6 pertanyaan bintang (5W + 1H).', {
        kind: 'star-center',
        width: 260,
        surfaceColor: '#EFF6FF',
        accentColor: '#2563EB',
        symbols: ['✦'],
        timestampStamp: nowStamp,
        style: { ...DEFAULT_TEXT_STYLE, fontSize: 16, bold: true, color: '#1E3A8A', align: 'center' },
      }),
      makeNode('sb-who', -480, -240, 'SIAPA (Who)?', 'Siapa target pengguna utama, mentor, dan mitra konten kita?', {
        parentId: 'sb-center',
        width: 230,
        surfaceColor: '#ECFDF5',
        accentColor: '#059669',
        symbols: ['◉'],
        style: { ...DEFAULT_TEXT_STYLE, bold: true, color: '#065F46' },
      }),
      makeNode('sb-what', 0 - 115, -340, 'APA (What)?', 'Apa fitur pembeda utama yang paling cepat memberi nilai?', {
        parentId: 'sb-center',
        width: 230,
        surfaceColor: '#EFF6FF',
        accentColor: '#2563EB',
        symbols: ['◆'],
        style: { ...DEFAULT_TEXT_STYLE, bold: true, color: '#1E3A8A' },
      }),
      makeNode('sb-where', 250, -240, 'DI MANA (Where)?', 'Di kanal mana pengguna menemukan dan berkolaborasi?', {
        parentId: 'sb-center',
        width: 230,
        surfaceColor: '#FFFBEB',
        accentColor: '#D97706',
        symbols: ['⌖'],
        style: { ...DEFAULT_TEXT_STYLE, bold: true, color: '#92400E' },
      }),
      makeNode('sb-when', 250, 140, 'KAPAN (When)?', 'Kapan fase beta tertutup dan peluncuran publik dimulai?', {
        parentId: 'sb-center',
        width: 230,
        surfaceColor: '#EEF2FF',
        accentColor: '#7C3AED',
        symbols: ['◷'],
        style: { ...DEFAULT_TEXT_STYLE, bold: true, color: '#4C1D95' },
      }),
      makeNode('sb-why', -115, 240, 'MENGAPA (Why)?', 'Mengapa solusi ini lebih efisien dibanding papan tulis konvensional?', {
        parentId: 'sb-center',
        width: 230,
        surfaceColor: '#FFF1F2',
        accentColor: '#DC2626',
        symbols: ['?'],
        style: { ...DEFAULT_TEXT_STYLE, bold: true, color: '#881337' },
      }),
      makeNode('sb-how', -480, 140, 'BAGAIMANA (How)?', 'Bagaimana alur monetisasi, keamanan E2EE, dan dukungan teknisnya?', {
        parentId: 'sb-center',
        width: 230,
        surfaceColor: '#F8FAFC',
        accentColor: '#0891B2',
        symbols: ['⚡'],
        style: { ...DEFAULT_TEXT_STYLE, bold: true, color: '#155E75' },
      }),
    ];
    const edges: CanvasEdge[] = [
      makeEdge('sb-center', 'sb-who', 'straight', '#059669'),
      makeEdge('sb-center', 'sb-what', 'straight', '#2563EB'),
      makeEdge('sb-center', 'sb-where', 'straight', '#D97706'),
      makeEdge('sb-center', 'sb-when', 'straight', '#7C3AED'),
      makeEdge('sb-center', 'sb-why', 'straight', '#DC2626'),
      makeEdge('sb-center', 'sb-how', 'straight', '#0891B2'),
    ];
    return {
      id: boardId,
      title: 'Star Bursting — Eksplorasi 5W+1H',
      templateId: 'star-bursting',
      nodes,
      edges,
      updatedAt: Date.now(),
    };
  }

  if (templateId === 'lotus-blossom') {
    const coreThemes = [
      { id: 'lb-1', title: '1. Riset Pasar', sub: ['Wawancara 20 user', 'Peta kompetitor'], dx: -360, dy: -260, color: '#2563EB' },
      { id: 'lb-2', title: '2. Desain Produk', sub: ['Kanvas tanpa batas', 'Tipografi adaptif'], dx: 0, dy: -280, color: '#059669' },
      { id: 'lb-3', title: '3. Keamanan E2EE', sub: ['Kunci AES-GCM', 'Audit nol-pengetahuan'], dx: 360, dy: -260, color: '#7C3AED' },
      { id: 'lb-4', title: '4. Kolaborasi Live', sub: ['Kursor real-time', 'Sinkronisasi delta'], dx: -400, dy: 0, color: '#0891B2' },
      { id: 'lb-5', title: '5. Ekspor Dokumen', sub: ['Slide PPTX otomatis', 'Laporan DOCX & PDF'], dx: 400, dy: 0, color: '#D97706' },
      { id: 'lb-6', title: '6. Data Dinamis', sub: ['Tabel kolom kustom', 'Format mata uang'], dx: -360, dy: 260, color: '#DC2626' },
      { id: 'lb-7', title: '7. Pemasaran', sub: ['Studi kasus tim', 'Program komunitas'], dx: 0, dy: 280, color: '#0F766E' },
      { id: 'lb-8', title: '8. Evaluasi KPI', sub: ['Retensi mingguan', 'NPS kolaborator'], dx: 360, dy: 260, color: '#475569' },
    ];

    const nodes: CanvasNode[] = [
      makeNode('lb-core', -120, -55, 'Inti Teratai: Inovasi Studio Ide', '8 kelopak tema strategis yang berkembang menjadi aksi konkret.', {
        kind: 'lotus-core',
        width: 240,
        surfaceColor: '#EFF6FF',
        accentColor: '#2563EB',
        symbols: ['✿'],
        timestampStamp: nowStamp,
        style: { ...DEFAULT_TEXT_STYLE, fontSize: 16, bold: true, color: '#1E3A8A', align: 'center' },
      }),
    ];
    const edges: CanvasEdge[] = [];

    coreThemes.forEach((t) => {
      nodes.push(
        makeNode(t.id, t.dx - 105, t.dy - 45, t.title, t.sub.join(' · '), {
          parentId: 'lb-core',
          width: 210,
          accentColor: t.color,
          style: { ...DEFAULT_TEXT_STYLE, bold: true },
        })
      );
      edges.push(makeEdge('lb-core', t.id, 'straight', t.color));

      // Petal expansion twigs
      const petalOffsetX = t.dx === 0 ? 0 : t.dx > 0 ? 270 : -270;
      const petalOffsetY = t.dy === 0 ? 0 : t.dy > 0 ? 150 : -150;
      const subId = `${t.id}-petal`;
      nodes.push(
        makeNode(subId, t.dx + petalOffsetX - 95, t.dy + petalOffsetY - 35, `Kelopak: ${t.title.slice(3)}`, t.sub[0], {
          parentId: t.id,
          width: 190,
          surfaceColor: '#F8FAFC',
          accentColor: t.color,
        })
      );
      edges.push(makeEdge(t.id, subId, 'straight', t.color));
    });

    return {
      id: boardId,
      title: 'Lotus Blossom — Ekspansi 8 Kelopak',
      templateId: 'lotus-blossom',
      nodes,
      edges,
      updatedAt: Date.now(),
    };
  }

  if (templateId === 'timeframe') {
    const now = new Date();
    const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const yr = endOfCurrentMonth.getFullYear();
    const mo = endOfCurrentMonth.getMonth();
    const lastDay = endOfCurrentMonth.getDate();

    const slot1 = new Date(yr, mo, Math.max(1, lastDay - 1), 9, 0);
    const slot2 = new Date(yr, mo, lastDay, 11, 0);
    const slot3 = new Date(yr, mo, lastDay, 14, 0);
    const slot4 = new Date(yr, mo + 1, 1, 10, 0);
    const slot5 = new Date(yr, mo + 1, 1, 13, 0);
    const slot6 = new Date(yr, mo + 1, 2, 16, 0);

    const rawNodes: CanvasNode[] = [
      makeNode(
        'tf-1',
        0,
        0,
        'Kickoff & Audit Kebutuhan',
        'Finalisasi ruang lingkup tim, dependensi API, serta pembagian peran sprint.',
        {
          width: 248,
          surfaceColor: '#EFF6FF',
          accentColor: '#2563EB',
          symbols: ['◈'],
          timestampStamp: formatStamp(slot1, 'full'),
          style: { ...DEFAULT_TEXT_STYLE, bold: true, color: '#1E3A8A' },
        }
      ),
      makeNode(
        'tf-2',
        0,
        0,
        'Review Desain & Kontrak Data',
        'Validasi prototipe antarmuka dan skema tabel anggaran sebelum pergantian bulan.',
        {
          parentId: 'tf-1',
          width: 248,
          surfaceColor: '#ECFDF5',
          accentColor: '#059669',
          symbols: ['✓'],
          timestampStamp: formatStamp(slot2, 'full'),
          style: { ...DEFAULT_TEXT_STYLE, bold: true, color: '#065F46' },
        }
      ),
      makeNode(
        'tf-3',
        0,
        0,
        'Pembekuan Ruang Lingkup Akhir Bulan',
        'Sinkronisasi daftar deliverables lintas divisi tepat sebelum masuk bulan baru.',
        {
          parentId: 'tf-2',
          width: 248,
          surfaceColor: '#FFFBEB',
          accentColor: '#D97706',
          symbols: ['⚑'],
          timestampStamp: formatStamp(slot3, 'full'),
          style: { ...DEFAULT_TEXT_STYLE, bold: true, color: '#92400E' },
        }
      ),
      makeNode(
        'tf-4',
        0,
        0,
        'Peluncuran Fase Bulan Baru',
        'Aktivasi modul utama hari pertama dan pemantauan metrik kolaborator.',
        {
          parentId: 'tf-3',
          width: 248,
          surfaceColor: '#EEF2FF',
          accentColor: '#7C3AED',
          symbols: ['★'],
          timestampStamp: formatStamp(slot4, 'full'),
          style: { ...DEFAULT_TEXT_STYLE, bold: true, color: '#4C1D95' },
        }
      ),
      makeNode(
        'tf-5',
        0,
        0,
        'Tracking Anggaran & Progres',
        'Evaluasi realisasi target minggu pertama.',
        {
          parentId: 'tf-4',
          width: 290,
          surfaceColor: '#FFFFFF',
          accentColor: '#0891B2',
          timestampStamp: formatStamp(slot5, 'full'),
          table: createDefaultTable(),
        }
      ),
      makeNode(
        'tf-6',
        0,
        0,
        'Retrospektif & Laporan Ekspor',
        'Rangkum hasil sesi ke PDF & Markdown kronologis untuk pemangku kepentingan.',
        {
          parentId: 'tf-5',
          width: 248,
          surfaceColor: '#FFF1F2',
          accentColor: '#DC2626',
          symbols: ['➜'],
          timestampStamp: formatStamp(slot6, 'full'),
          style: { ...DEFAULT_TEXT_STYLE, bold: true, color: '#881337' },
        }
      ),
    ];

    const grid = computeTimeframeGrid(rawNodes, slot1);
    const nodes = rawNodes.map((n) => {
      const pos = grid.nodePositions.get(n.id);
      return pos ? { ...n, x: pos.x, y: pos.y } : n;
    });

    const edges: CanvasEdge[] = [
      makeEdge('tf-1', 'tf-2', 'straight', '#2563EB'),
      makeEdge('tf-2', 'tf-3', 'straight', '#059669'),
      makeEdge('tf-3', 'tf-4', 'straight', '#D97706'),
      makeEdge('tf-4', 'tf-5', 'straight', '#7C3AED'),
      makeEdge('tf-5', 'tf-6', 'straight', '#0891B2'),
    ];

    return {
      id: boardId,
      title: 'Timeframe Linimasa — Peta Kronologis',
      templateId: 'timeframe',
      nodes,
      edges,
      updatedAt: Date.now(),
    };
  }

  // Default: Mind Mapping
  const nodes: CanvasNode[] = [
    makeNode('mm-root', -140, -60, 'Strategi Peluncuran Produk 2026', 'Pusat gagasan kolaborasi tim lintas divisi dengan enkripsi end-to-end.', {
      width: 280,
      surfaceColor: '#EFF6FF',
      accentColor: '#2563EB',
      symbols: ['✦', '◈'],
      timestampStamp: nowStamp,
      style: { ...DEFAULT_TEXT_STYLE, fontSize: 17, bold: true, color: '#1E3A8A' },
    }),
    makeNode('mm-1', -490, -210, 'Riset & Validasi Masalah', 'Identifikasi hambatan pengguna melalui wawancara mendalam & survei.', {
      parentId: 'mm-root',
      width: 240,
      surfaceColor: '#ECFDF5',
      accentColor: '#059669',
      symbols: ['✓'],
      style: { ...DEFAULT_TEXT_STYLE, bold: true, color: '#065F46' },
    }),
    makeNode('mm-1a', -810, -250, 'Segmen Tim Kreatif', 'Butuh kanvas mengambang yang cepat untuk sesi ideasi harian.', {
      parentId: 'mm-1',
      width: 220,
      accentColor: '#059669',
    }),
    makeNode('mm-2', 260, -220, 'Arsitektur & Keamanan', 'Sinkronisasi WebSocket real-time dengan kunci AES-GCM 256-bit.', {
      parentId: 'mm-root',
      width: 245,
      surfaceColor: '#EEF2FF',
      accentColor: '#7C3AED',
      symbols: ['⌘'],
      style: { ...DEFAULT_TEXT_STYLE, bold: true, color: '#4C1D95' },
    }),
    makeNode('mm-3', -490, 120, 'Matriks Anggaran & Jadwal', 'Gunakan kolom tabel dinamis untuk melacak estimasi dan progres.', {
      parentId: 'mm-root',
      width: 340,
      surfaceColor: '#FFFBEB',
      accentColor: '#D97706',
      symbols: ['∑'],
      style: { ...DEFAULT_TEXT_STYLE, bold: true, color: '#92400E' },
      table: createDefaultTable(),
    }),
    makeNode('mm-4', 260, 120, 'Distribusi & Ekspor Materi', 'Ekspor instan menjadi gambar PNG, dokumen PDF, DOCX, PPTX, dan Markdown.', {
      parentId: 'mm-root',
      width: 250,
      surfaceColor: '#FFF1F2',
      accentColor: '#DC2626',
      symbols: ['➜'],
      style: { ...DEFAULT_TEXT_STYLE, bold: true, color: '#881337' },
    }),
  ];

  const edges: CanvasEdge[] = [
    makeEdge('mm-root', 'mm-1', 'bezier', '#059669'),
    makeEdge('mm-1', 'mm-1a', 'bezier', '#059669'),
    makeEdge('mm-root', 'mm-2', 'bezier', '#7C3AED'),
    makeEdge('mm-root', 'mm-3', 'bezier', '#D97706'),
    makeEdge('mm-root', 'mm-4', 'bezier', '#DC2626'),
  ];

  return {
    id: boardId,
    title: 'Mind Map — Peluncuran Produk',
    templateId: 'mind-mapping',
    nodes,
    edges,
    updatedAt: Date.now(),
  };
}

export function buildFromScratchBoard(existingId?: string): BoardDocument {
  return {
    id: existingId ?? `board-${crypto.randomUUID().slice(0, 8)}`,
    title: 'Kanvas Kosong — From Scratch',
    templateId: 'mind-mapping',
    nodes: [],
    edges: [],
    updatedAt: Date.now(),
  };
}
