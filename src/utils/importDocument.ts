import {
  BoardDocument,
  CanvasEdge,
  CanvasNode,
  ColumnFormat,
  DynamicColumn,
  DynamicRow,
  DynamicTableData,
  TemplateId,
} from '../types/canvas';
import { getConnectorStyleForTemplate, organizeBoardByTemplate } from './layout';
import { ACCENT_COLORS, createBlankNode, DEFAULT_TEXT_STYLE, formatStamp } from './templates';

export interface ImportedTablePayload {
  columns: string[];
  rows: string[][];
}

export interface ImportedIdeaNode {
  title: string;
  body: string;
  table?: ImportedTablePayload | null;
  children: ImportedIdeaNode[];
}

export interface DocumentImportResult {
  fileName: string;
  format: 'docx' | 'pptx' | 'pdf';
  method: 'structural' | 'ai-semantic';
  pagesOrSlides: number;
  root: ImportedIdeaNode;
}

function inferColumnFormat(values: string[]): ColumnFormat {
  const nonEmpty = values.map((v) => v.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return 'text';
  if (nonEmpty.every((v) => /^-?\d+(?:[.,]\d+)?%$/.test(v))) return 'percent';
  if (nonEmpty.every((v) => /^(?:rp|idr|\$|usd)\s*[\d.,]+$/i.test(v))) return 'currency';
  if (nonEmpty.every((v) => /^-?[\d.,]+$/.test(v))) return 'number';
  return 'text';
}

function toDynamicTable(payload?: ImportedTablePayload | null): DynamicTableData | null {
  if (!payload || payload.columns.length === 0) return null;

  const columns: DynamicColumn[] = payload.columns.map((colName, cIdx) => {
    const sampleVals = payload.rows.map((r) => r[cIdx] ?? '');
    return {
      id: `impcol-${crypto.randomUUID().slice(0, 6)}`,
      name: colName || `Kolom ${cIdx + 1}`,
      format: inferColumnFormat(sampleVals),
    };
  });

  const rows: DynamicRow[] = payload.rows.map((rowArr) => {
    const cells: Record<string, string | boolean> = {};
    columns.forEach((col, cIdx) => {
      let val = (rowArr[cIdx] ?? '').trim();
      if (col.format === 'percent') {
        val = val.replace(/%$/, '').replace(',', '.');
      } else if (col.format === 'currency' || col.format === 'number') {
        val = val.replace(/[^0-9.-]/g, '');
      }
      cells[col.id] = val;
    });
    return {
      id: `improw-${crypto.randomUUID().slice(0, 6)}`,
      cells,
    };
  });

  return { columns, rows };
}

export function countImportedNodes(node: ImportedIdeaNode): { nodes: number; tables: number } {
  let nodes = 1;
  let tables = node.table ? 1 : 0;
  for (const child of node.children) {
    const sub = countImportedNodes(child);
    nodes += sub.nodes;
    tables += sub.tables;
  }
  return { nodes, tables };
}

export function buildBoardFromImport(params: {
  imported: DocumentImportResult;
  templateId: TemplateId;
  mode: 'replace' | 'merge';
  existingBoard: BoardDocument;
  roomId: string;
}): BoardDocument {
  const { imported, templateId, mode, existingBoard, roomId } = params;
  const connectorStyle = getConnectorStyleForTemplate(templateId);
  const nowStamp = formatStamp(new Date(), 'full');

  const newNodes: CanvasNode[] = [];
  const newEdges: CanvasEdge[] = [];

  const formatSymbol =
    imported.format === 'docx' ? '▤' : imported.format === 'pptx' ? '▣' : '◧';

  const walk = (
    item: ImportedIdeaNode,
    parentId: string | null,
    depth: number,
    branchIndex: number
  ) => {
    const id = `imp-${crypto.randomUUID().slice(0, 8)}`;
    const accent =
      depth === 0
        ? '#2563EB'
        : ACCENT_COLORS[branchIndex % ACCENT_COLORS.length];

    const tableData = toDynamicTable(item.table);
    const width = tableData
      ? Math.max(300, Math.min(440, tableData.columns.length * 105))
      : depth === 0
      ? 286
      : 256;

    const kind =
      depth === 0
        ? templateId === 'fishbone'
          ? 'fishbone-head'
          : templateId === 'star-bursting'
          ? 'star-center'
          : templateId === 'lotus-blossom'
          ? 'lotus-core'
          : 'topic'
        : depth === 1 && templateId === 'fishbone'
        ? 'fishbone-cat'
        : tableData
        ? 'table'
        : 'topic';

    const surfaceColor =
      depth === 0
        ? '#EFF6FF'
        : depth === 1
        ? '#FFFFFF'
        : '#F8FAFC';

    newNodes.push(
      createBlankNode({
        id,
        parentId,
        kind,
        width,
        title: item.title || 'Topik Impor',
        body: item.body || '',
        symbols: depth === 0 ? [formatSymbol] : [],
        timestampStamp: depth === 0 ? nowStamp : null,
        surfaceColor,
        accentColor: accent,
        table: tableData,
        style: {
          ...DEFAULT_TEXT_STYLE,
          fontSize: depth === 0 ? 16 : depth === 1 ? 15 : 14,
          bold: depth <= 1,
          color: depth === 0 ? '#1E3A8A' : '#0F172A',
        },
        meta:
          depth === 1 && templateId === 'fishbone'
            ? {
                templateRole: 'fishbone-category',
                ribDirection: branchIndex % 2 === 0 ? 'top' : 'bottom',
              }
            : depth === 0
            ? { templateRole: 'root' }
            : undefined,
      })
    );

    if (parentId) {
      newEdges.push({
        id: `edge-${parentId}-${id}`,
        sourceId: parentId,
        targetId: id,
        color: accent,
        style: connectorStyle,
      });
    }

    item.children.forEach((child, cIdx) => {
      walk(child, id, depth + 1, depth === 0 ? cIdx : branchIndex);
    });
  };

  walk(imported.root, null, 0, 0);

  if (mode === 'merge' && existingBoard.nodes.length > 0) {
    const tempImportedBoard = organizeBoardByTemplate(
      {
        id: existingBoard.id,
        title: existingBoard.title,
        templateId,
        nodes: newNodes,
        edges: newEdges,
        updatedAt: Date.now(),
      },
      templateId
    );

    let maxExistingX = -Infinity;
    let avgExistingY = 0;
    for (const n of existingBoard.nodes) {
      maxExistingX = Math.max(maxExistingX, n.x + n.width);
      avgExistingY += n.y;
    }
    avgExistingY = Math.round(avgExistingY / existingBoard.nodes.length);

    let minImpX = Infinity;
    let minImpY = Infinity;
    for (const n of tempImportedBoard.nodes) {
      minImpX = Math.min(minImpX, n.x);
      minImpY = Math.min(minImpY, n.y);
    }

    const shiftX = Math.round(maxExistingX + 180 - (Number.isFinite(minImpX) ? minImpX : 0));
    const shiftY = Math.round(avgExistingY - (Number.isFinite(minImpY) ? minImpY : 0));

    const shiftedNodes = tempImportedBoard.nodes.map((n) => ({
      ...n,
      x: n.x + shiftX,
      y: n.y + shiftY,
    }));

    return {
      ...existingBoard,
      nodes: [...existingBoard.nodes, ...shiftedNodes],
      edges: [...existingBoard.edges, ...tempImportedBoard.edges],
      updatedAt: Date.now(),
    };
  }

  const rawBoard: BoardDocument = {
    id: existingBoard.id || roomId,
    title: imported.root.title || existingBoard.title,
    templateId,
    nodes: newNodes,
    edges: newEdges,
    updatedAt: Date.now(),
  };

  return organizeBoardByTemplate(rawBoard, templateId);
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Gagal membaca berkas.'));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca berkas dokumen.'));
    reader.readAsDataURL(file);
  });
}
