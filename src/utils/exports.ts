import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { jsPDF } from 'jspdf';
import PptxGenJS from 'pptxgenjs';
import { BoardDocument, CanvasEdge, CanvasNode } from '../types/canvas';
import { formatCellValue } from './tableFormat';
import { resolveBodyStyle } from './templates';
import {
  computeTimeframeGrid,
  groupTimeframeNodesChronologically,
  TimeframeGrid,
} from './timeframe';

function sanitizeFileName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s-_]/g, '')
      .trim()
      .replace(/\s+/g, '-') || 'nalarcanvas-board'
  );
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (!text) return [];
  const paragraphs = text.split('\n');
  const lines: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${current} ${words[i]}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
  }
  return lines;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

interface NodeLayoutBox {
  node: CanvasNode;
  w: number;
  h: number;
  titleLines: string[];
  bodyLines: string[];
  imgEl: HTMLImageElement | null;
}

export async function renderBoardToCanvas(
  doc: BoardDocument,
  darkMode: boolean
): Promise<HTMLCanvasElement> {
  // Preload any attached media images
  const imageMap = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    doc.nodes.map(async (node) => {
      if (node.media?.url) {
        const loaded = await loadImageElement(node.media.url);
        imageMap.set(node.id, loaded);
      }
    })
  );

  // Measure each node box accurately
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d')!;

  const boxes = new Map<string, NodeLayoutBox>();
  for (const node of doc.nodes) {
    const w = node.width || 248;
    const padX = 16;
    const innerW = w - padX * 2;
    const fontFamily = node.style.fontFamily || 'Plus Jakarta Sans';
    const titleSize = Math.max(10, node.style.fontSize || 15);
    const bStyle = resolveBodyStyle(node);
    const bodyFontFamily = bStyle.fontFamily || 'Plus Jakarta Sans';
    const bodySize = Math.max(10, bStyle.fontSize || 13);

    const prefix = node.symbols.length > 0 ? `${node.symbols.join(' ')} ` : '';
    mctx.font = `${node.style.italic ? 'italic ' : ''}${node.style.bold ? '700' : '400'} ${titleSize}px "${fontFamily}", sans-serif`;
    const titleLines = wrapTextLines(mctx, `${prefix}${node.title}`, innerW);

    mctx.font = `${bStyle.italic ? 'italic ' : ''}${bStyle.bold ? '700' : '400'} ${bodySize}px "${bodyFontFamily}", sans-serif`;
    const bodyLines = node.body ? wrapTextLines(mctx, node.body, innerW) : [];

    let h = 16; // top padding
    h += titleLines.length * (titleSize * 1.35);
    if (bodyLines.length > 0) {
      h += 6 + bodyLines.length * (bodySize * 1.45);
    }
    const imgEl = imageMap.get(node.id) ?? null;
    if (node.media?.url) {
      h += 10 + 116; // media preview box
    }
    if (node.table && node.table.columns.length > 0) {
      h += 12 + 28 + node.table.rows.length * 26;
    }
    if (node.timestampStamp) {
      h += 10 + 16;
    }
    h += 14; // bottom padding

    boxes.set(node.id, { node, w, h, titleLines, bodyLines, imgEl });
  }

  // Compute bounding box
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const box of boxes.values()) {
    minX = Math.min(minX, box.node.x);
    minY = Math.min(minY, box.node.y);
    maxX = Math.max(maxX, box.node.x + box.w);
    maxY = Math.max(maxY, box.node.y + box.h);
  }

  const timeframeGrid: TimeframeGrid | null =
    doc.templateId === 'timeframe' ? computeTimeframeGrid(doc.nodes) : null;

  if (timeframeGrid) {
    minX = Math.min(minX, timeframeGrid.originX);
    minY = Math.min(minY, timeframeGrid.originY);
    maxX = Math.max(maxX, timeframeGrid.originX + timeframeGrid.totalWidth);
    maxY = Math.max(maxY, timeframeGrid.originY + timeframeGrid.totalHeight);
  }

  if (!Number.isFinite(minX)) {
    minX = -300;
    minY = -200;
    maxX = 300;
    maxY = 200;
  }

  const margin = 90;
  const headerH = 64;
  const worldW = maxX - minX + margin * 2;
  const worldH = maxY - minY + margin * 2 + headerH;

  const scale = 2; // 2x crisp export
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(4800, Math.max(800, Math.ceil(worldW * scale)));
  canvas.height = Math.min(3600, Math.max(600, Math.ceil(worldH * scale)));

  const ctx = canvas.getContext('2d')!;
  const effectiveScaleX = canvas.width / worldW;
  const effectiveScaleY = canvas.height / worldH;
  const s = Math.min(effectiveScaleX, effectiveScaleY);

  ctx.save();
  ctx.scale(s, s);

  // Background
  ctx.fillStyle = darkMode ? '#0B1120' : '#F8FAFC';
  ctx.fillRect(0, 0, worldW, worldH);

  // Subtle dot grid
  ctx.fillStyle = darkMode ? 'rgba(148, 163, 184, 0.16)' : 'rgba(148, 163, 184, 0.35)';
  for (let gx = 20; gx < worldW; gx += 28) {
    for (let gy = headerH + 12; gy < worldH; gy += 28) {
      ctx.beginPath();
      ctx.arc(gx, gy, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Export header strip
  ctx.fillStyle = darkMode ? '#0F172A' : '#FFFFFF';
  ctx.fillRect(0, 0, worldW, headerH);
  ctx.strokeStyle = darkMode ? '#1E293B' : '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, headerH);
  ctx.lineTo(worldW, headerH);
  ctx.stroke();

  ctx.fillStyle = darkMode ? '#F8FAFC' : '#0F172A';
  ctx.font = '700 18px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(doc.title || 'NalarCanvas', 28, 38);

  ctx.fillStyle = darkMode ? '#94A3B8' : '#64748B';
  ctx.font = '500 12px "JetBrains Mono", monospace';
  const metaText = `${doc.nodes.length} Node · ${doc.edges.length} Koneksi · Diekspor ${new Date().toLocaleDateString('id-ID')}`;
  const metaW = ctx.measureText(metaText).width;
  ctx.fillText(metaText, Math.max(320, worldW - metaW - 28), 37);

  // Translate to world coordinates
  ctx.translate(-minX + margin, -minY + margin + headerH);

  // Draw Timeframe Imaginary Grid behind edges & nodes
  if (timeframeGrid) {
    ctx.save();
    drawRoundedRect(
      ctx,
      timeframeGrid.originX,
      timeframeGrid.originY,
      timeframeGrid.totalWidth,
      timeframeGrid.monthHeaderHeight + timeframeGrid.dayHeaderHeight + timeframeGrid.gridHeight,
      14
    );
    ctx.fillStyle = darkMode ? 'rgba(15, 23, 42, 0.55)' : 'rgba(255, 255, 255, 0.72)';
    ctx.fill();
    ctx.strokeStyle = darkMode ? '#1E293B' : '#CBD5E1';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Corner WAKTU cell
    ctx.fillStyle = darkMode ? 'rgba(30, 41, 59, 0.75)' : 'rgba(241, 245, 249, 0.92)';
    ctx.fillRect(
      timeframeGrid.originX,
      timeframeGrid.originY,
      timeframeGrid.axisWidth,
      timeframeGrid.monthHeaderHeight + timeframeGrid.dayHeaderHeight
    );
    ctx.fillStyle = darkMode ? '#94A3B8' : '#475569';
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      'WAKTU',
      timeframeGrid.originX + timeframeGrid.axisWidth / 2,
      timeframeGrid.originY + (timeframeGrid.monthHeaderHeight + timeframeGrid.dayHeaderHeight) / 2 + 4
    );

    // Month header bands
    timeframeGrid.months.forEach((m, mIdx) => {
      const isAlt = mIdx % 2 === 1;
      ctx.fillStyle = isAlt
        ? darkMode
          ? 'rgba(16, 185, 129, 0.04)'
          : 'rgba(236, 253, 245, 0.3)'
        : darkMode
        ? 'rgba(37, 99, 235, 0.04)'
        : 'rgba(239, 246, 255, 0.3)';
      ctx.fillRect(m.startX, timeframeGrid.gridStartY, m.width, timeframeGrid.gridHeight);

      ctx.fillStyle = isAlt
        ? darkMode
          ? 'rgba(16, 185, 129, 0.16)'
          : 'rgba(236, 253, 245, 0.92)'
        : darkMode
        ? 'rgba(37, 99, 235, 0.18)'
        : 'rgba(239, 246, 255, 0.95)';
      ctx.fillRect(m.startX, timeframeGrid.monthHeaderY, m.width, timeframeGrid.monthHeaderHeight);

      ctx.fillStyle = isAlt
        ? darkMode
          ? '#6EE7B7'
          : '#065F46'
        : darkMode
        ? '#93C5FD'
        : '#1E3A8A';
      ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(m.label.toUpperCase(), m.startX + m.width / 2, timeframeGrid.monthHeaderY + 25);
    });

    // Day columns
    timeframeGrid.days.forEach((col, idx) => {
      ctx.fillStyle = darkMode ? 'rgba(15, 23, 42, 0.48)' : 'rgba(248, 250, 252, 0.88)';
      ctx.fillRect(col.x, timeframeGrid.dayHeaderY, col.width, timeframeGrid.dayHeaderHeight);

      ctx.fillStyle = darkMode ? '#E2E8F0' : '#0F172A';
      ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(col.shortLabel, col.x + col.width / 2, timeframeGrid.dayHeaderY + 26);

      if (idx > 0 && !col.isMonthStart) {
        ctx.save();
        ctx.setLineDash(col.hasGapBefore ? [2, 6] : [5, 5]);
        ctx.strokeStyle = darkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(col.x, timeframeGrid.dayHeaderY);
        ctx.lineTo(col.x, timeframeGrid.gridStartY + timeframeGrid.gridHeight);
        ctx.stroke();
        ctx.restore();
      }
    });

    // Header horizontal dividers
    ctx.strokeStyle = darkMode ? '#334155' : '#CBD5E1';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(timeframeGrid.gridStartX, timeframeGrid.dayHeaderY);
    ctx.lineTo(timeframeGrid.originX + timeframeGrid.totalWidth, timeframeGrid.dayHeaderY);
    ctx.stroke();

    ctx.strokeStyle = darkMode ? '#334155' : '#94A3B8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(timeframeGrid.originX, timeframeGrid.gridStartY);
    ctx.lineTo(timeframeGrid.originX + timeframeGrid.totalWidth, timeframeGrid.gridStartY);
    ctx.stroke();

    // Hour rows & horizontal time lines
    timeframeGrid.hours.forEach((row, rIdx) => {
      if (rIdx > 0) {
        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = darkMode ? 'rgba(148, 163, 184, 0.22)' : 'rgba(148, 163, 184, 0.42)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(timeframeGrid.originX, row.y);
        ctx.lineTo(timeframeGrid.originX + timeframeGrid.totalWidth, row.y);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = darkMode ? '#94A3B8' : '#475569';
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(row.label, timeframeGrid.originX + timeframeGrid.axisWidth / 2, row.y + 26);
    });

    // Axis vertical separator
    ctx.strokeStyle = darkMode ? '#334155' : '#94A3B8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(timeframeGrid.gridStartX, timeframeGrid.originY);
    ctx.lineTo(timeframeGrid.gridStartX, timeframeGrid.gridStartY + timeframeGrid.gridHeight);
    ctx.stroke();

    // Bold Vertical Month-Separator Frame Lines
    timeframeGrid.months.forEach((m, mIdx) => {
      if (mIdx > 0) {
        ctx.strokeStyle = darkMode ? '#60A5FA' : '#2563EB';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(m.startX, timeframeGrid.originY);
        ctx.lineTo(m.startX, timeframeGrid.gridStartY + timeframeGrid.gridHeight);
        ctx.stroke();
      }
    });

    // Unscheduled lane if needed
    if (timeframeGrid.unscheduledLane) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      drawRoundedRect(
        ctx,
        timeframeGrid.gridStartX,
        timeframeGrid.unscheduledLane.y,
        timeframeGrid.totalWidth - timeframeGrid.axisWidth,
        timeframeGrid.unscheduledLane.height,
        12
      );
      ctx.fillStyle = darkMode ? 'rgba(30, 41, 59, 0.35)' : 'rgba(241, 245, 249, 0.72)';
      ctx.fill();
      ctx.strokeStyle = darkMode ? '#475569' : '#94A3B8';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = darkMode ? '#CBD5E1' : '#475569';
      ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(
        timeframeGrid.unscheduledLane.label,
        timeframeGrid.gridStartX + 18,
        timeframeGrid.unscheduledLane.y + 24
      );
    }

    ctx.textAlign = 'left';
    ctx.restore();
  }

  // Draw Fishbone horizontal spine if fishbone template
  if (doc.templateId === 'fishbone') {
    const headBox = Array.from(boxes.values()).find((b) => b.node.kind === 'fishbone-head');
    if (headBox) {
      const spineY = headBox.node.y + headBox.h / 2;
      ctx.strokeStyle = darkMode ? '#64748B' : '#334155';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(minX + 10, spineY);
      ctx.lineTo(headBox.node.x, spineY);
      ctx.stroke();
    }
  }

  // Draw edges
  for (const edge of doc.edges) {
    const src = boxes.get(edge.sourceId);
    const tgt = boxes.get(edge.targetId);
    if (!src || !tgt) continue;

    const sx = src.node.x + src.w / 2;
    const sy = src.node.y + src.h / 2;
    const tx = tgt.node.x + tgt.w / 2;
    const ty = tgt.node.y + tgt.h / 2;

    ctx.strokeStyle = edge.color || '#64748B';
    ctx.lineWidth = 2;
    ctx.beginPath();

    if (edge.style === 'orthogonal') {
      const midY = (sy + ty) / 2;
      ctx.moveTo(sx, src.node.y + src.h);
      ctx.lineTo(sx, midY);
      ctx.lineTo(tx, midY);
      ctx.lineTo(tx, tgt.node.y);
    } else if (edge.style === 'fishbone') {
      if (tgt.node.kind === 'fishbone-head') {
        const spineY = tgt.node.y + tgt.h / 2;
        const joinX = Math.min(tgt.node.x - 30, sx + 90);
        ctx.moveTo(sx, sy);
        ctx.lineTo(joinX, spineY);
      } else {
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
      }
    } else if (edge.style === 'straight') {
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
    } else {
      // Bezier
      const dx = (tx - sx) * 0.5;
      ctx.moveTo(sx, sy);
      ctx.bezierCurveTo(sx + dx, sy, tx - dx, ty, tx, ty);
    }
    ctx.stroke();
  }

  // Draw nodes
  for (const box of boxes.values()) {
    const { node, w, h, titleLines, bodyLines, imgEl } = box;
    const x = node.x;
    const y = node.y;

    // Shadow
    ctx.save();
    ctx.shadowColor = darkMode ? 'rgba(0,0,0,0.45)' : 'rgba(15,23,42,0.08)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;

    drawRoundedRect(ctx, x, y, w, h, 10);
    ctx.fillStyle =
      darkMode && node.surfaceColor === '#FFFFFF' ? '#131C31' : node.surfaceColor || '#FFFFFF';
    ctx.fill();
    ctx.restore();

    // Border
    drawRoundedRect(ctx, x, y, w, h, 10);
    ctx.strokeStyle = node.accentColor || (darkMode ? '#334155' : '#CBD5E1');
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const fontFamily = node.style.fontFamily || 'Plus Jakarta Sans';
    const titleSize = Math.max(10, node.style.fontSize || 15);
    const bStyle = resolveBodyStyle(node);
    const bodyFontFamily = bStyle.fontFamily || 'Plus Jakarta Sans';
    const bodySize = Math.max(10, bStyle.fontSize || 13);
    const isDarkCard = node.surfaceColor === '#1E293B' || (darkMode && node.surfaceColor === '#FFFFFF');
    const textColor =
      isDarkCard && node.style.color === '#0F172A' ? '#F8FAFC' : node.style.color || '#0F172A';
    const bodyTextColor =
      isDarkCard && (bStyle.color === '#475569' || bStyle.color === '#0F172A')
        ? '#CBD5E1'
        : bStyle.color || '#475569';

    let cursorY = y + 16;

    // Title
    const titleAlign = node.style.align || 'left';
    ctx.fillStyle = textColor;
    ctx.font = `${node.style.italic ? 'italic ' : ''}${node.style.bold ? '700' : '400'} ${titleSize}px "${fontFamily}", sans-serif`;
    for (const line of titleLines) {
      cursorY += titleSize * 1.1;
      const lw = ctx.measureText(line).width;
      const lineX =
        titleAlign === 'center'
          ? x + w / 2 - lw / 2
          : titleAlign === 'right'
          ? x + w - 16 - lw
          : x + 16;
      ctx.fillText(line, lineX, cursorY);
      if (node.style.underline) {
        ctx.fillRect(lineX, cursorY + 2, lw, 1.2);
      }
      cursorY += titleSize * 0.25;
    }

    // Body
    if (bodyLines.length > 0) {
      const bodyAlign = bStyle.align || 'left';
      cursorY += 6;
      ctx.fillStyle = bodyTextColor;
      ctx.font = `${bStyle.italic ? 'italic ' : ''}${bStyle.bold ? '700' : '400'} ${bodySize}px "${bodyFontFamily}", sans-serif`;
      for (const line of bodyLines) {
        cursorY += bodySize * 1.15;
        const lw = ctx.measureText(line).width;
        const lineX =
          bodyAlign === 'center'
            ? x + w / 2 - lw / 2
            : bodyAlign === 'right'
            ? x + w - 16 - lw
            : x + 16;
        ctx.fillText(line, lineX, cursorY);
        if (bStyle.underline) {
          ctx.fillRect(lineX, cursorY + 2, lw, 1.1);
        }
        cursorY += bodySize * 0.3;
      }
    }

    // Media
    if (node.media?.url) {
      cursorY += 10;
      const mw = w - 32;
      const mh = 110;
      drawRoundedRect(ctx, x + 16, cursorY, mw, mh, 6);
      ctx.save();
      ctx.clip();
      if (imgEl) {
        ctx.drawImage(imgEl, x + 16, cursorY, mw, mh);
      } else {
        ctx.fillStyle = darkMode ? '#1E293B' : '#E2E8F0';
        ctx.fillRect(x + 16, cursorY, mw, mh);
        ctx.fillStyle = darkMode ? '#94A3B8' : '#64748B';
        ctx.font = '500 11px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(node.media.caption || 'Media Visual Tersemat', x + 26, cursorY + 58);
      }
      ctx.restore();
      cursorY += mh + 6;
    }

    // Dynamic Table
    if (node.table && node.table.columns.length > 0) {
      cursorY += 10;
      const tw = w - 32;
      const cols = node.table.columns;
      const colW = tw / cols.length;

      // Table Header
      ctx.fillStyle = darkMode ? '#1E293B' : '#F1F5F9';
      ctx.fillRect(x + 16, cursorY, tw, 26);
      ctx.strokeStyle = darkMode ? '#334155' : '#CBD5E1';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 16, cursorY, tw, 26);

      ctx.fillStyle = isDarkCard ? '#F1F5F9' : '#1E293B';
      ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
      cols.forEach((col, ci) => {
        ctx.fillText(col.name.slice(0, 14), x + 22 + ci * colW, cursorY + 17);
      });
      cursorY += 26;

      node.table.rows.forEach((row) => {
        ctx.strokeStyle = darkMode ? '#334155' : '#E2E8F0';
        ctx.strokeRect(x + 16, cursorY, tw, 24);
        ctx.fillStyle = isDarkCard ? '#CBD5E1' : '#334155';
        ctx.font = '400 10px "JetBrains Mono", monospace';
        cols.forEach((col, ci) => {
          const val = formatCellValue(col, row.cells[col.id]);
          ctx.fillText(val.slice(0, 14), x + 22 + ci * colW, cursorY + 16);
        });
        cursorY += 24;
      });
    }

    // Timestamp
    if (node.timestampStamp) {
      cursorY += 10;
      ctx.fillStyle = darkMode ? '#94A3B8' : '#64748B';
      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.fillText(`◷ ${node.timestampStamp}`, x + 16, cursorY + 10);
    }
  }

  ctx.restore();
  return canvas;
}

export async function exportAsPng(doc: BoardDocument, darkMode: boolean): Promise<void> {
  const canvas = await renderBoardToCanvas(doc, darkMode);
  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        triggerDownload(blob, `${sanitizeFileName(doc.title)}.png`);
      }
      resolve();
    }, 'image/png');
  });
}

export async function exportAsPdf(doc: BoardDocument, darkMode: boolean): Promise<void> {
  const canvas = await renderBoardToCanvas(doc, darkMode);
  const imgData = canvas.toDataURL('image/png');

  const pdf = new jsPDF({
    orientation: canvas.width >= canvas.height ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [canvas.width * 0.5, canvas.height * 0.5],
  });

  pdf.addImage(imgData, 'PNG', 0, 0, canvas.width * 0.5, canvas.height * 0.5);

  // Page 2+: Structured Outline & Tables (chronological layout when templateId === 'timeframe')
  pdf.addPage('a4', 'portrait');
  let py = 48;
  const ensurePdfSpace = (needed: number) => {
    if (py + needed > 780) {
      pdf.addPage('a4', 'portrait');
      py = 48;
    }
  };

  const renderPdfNodeBlock = (node: CanvasNode, timePrefix?: string, indentX = 40) => {
    ensurePdfSpace(42);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(15, 23, 42);
    const sym = node.symbols.length ? `${node.symbols.join(' ')} ` : '';
    const heading = timePrefix ? `[${timePrefix}] ${sym}${node.title}` : `${sym}${node.title}`;
    const wrappedTitle = pdf.splitTextToSize(heading, 555 - indentX);
    pdf.text(wrappedTitle, indentX, py);
    py += wrappedTitle.length * 14 + 2;

    if (node.body) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(51, 65, 85);
      const wrapped = pdf.splitTextToSize(node.body, 545 - indentX);
      ensurePdfSpace(wrapped.length * 13 + 6);
      pdf.text(wrapped, indentX + 8, py);
      py += wrapped.length * 13 + 4;
    }
    if (node.timestampStamp) {
      ensurePdfSpace(14);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`Stamp: ${node.timestampStamp}`, indentX + 8, py);
      py += 13;
    }
    if (node.table && node.table.columns.length > 0) {
      ensurePdfSpace(26);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(15, 23, 42);
      pdf.text(node.table.columns.map((c) => c.name).join(' | '), indentX + 8, py);
      py += 12;
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(51, 65, 85);
      for (const row of node.table.rows) {
        ensurePdfSpace(14);
        const line = node.table.columns
          .map((c) => formatCellValue(c, row.cells[c.id]))
          .join(' | ');
        pdf.text(line, indentX + 8, py);
        py += 12;
      }
    }
    pdf.setTextColor(15, 23, 42);
    py += 8;
  };

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(15, 23, 42);
  pdf.text(doc.title, 40, py);
  py += 18;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(100, 116, 139);
  pdf.text(`Template: ${doc.templateId} · Total Node: ${doc.nodes.length}`, 40, py);
  py += 24;

  if (doc.templateId === 'timeframe') {
    const report = groupTimeframeNodesChronologically(doc.nodes);
    for (const month of report.months) {
      ensurePdfSpace(52);
      pdf.setFillColor(239, 246, 255);
      pdf.setDrawColor(37, 99, 235);
      pdf.rect(40, py - 13, 515, 22, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(30, 58, 138);
      pdf.text(month.monthLabel.toUpperCase(), 48, py + 2);
      py += 20;

      for (const day of month.days) {
        ensurePdfSpace(34);
        pdf.setDrawColor(203, 213, 225);
        pdf.line(40, py + 4, 555, py + 4);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10.5);
        pdf.setTextColor(15, 23, 42);
        pdf.text(day.dayLabel, 40, py);
        py += 16;

        for (const item of day.items) {
          renderPdfNodeBlock(item.node, item.timeLabel, 50);
        }
      }
      py += 6;
    }

    if (report.unscheduled.length > 0) {
      ensurePdfSpace(40);
      pdf.setFillColor(241, 245, 249);
      pdf.setDrawColor(148, 163, 184);
      pdf.rect(40, py - 13, 515, 22, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(71, 85, 105);
      pdf.text('BELUM TERJADWAL (TANPA STAMP WAKTU)', 48, py + 2);
      py += 20;
      for (const unNode of report.unscheduled) {
        renderPdfNodeBlock(unNode, undefined, 48);
      }
    }
  } else {
    for (const node of doc.nodes) {
      renderPdfNodeBlock(node);
    }
  }

  pdf.save(`${sanitizeFileName(doc.title)}.pdf`);
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array | null {
  try {
    const parts = dataUrl.split(',');
    if (parts.length < 2) return null;
    const binary = atob(parts[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

export async function exportAsDocx(doc: BoardDocument): Promise<void> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      text: doc.title,
      heading: HeadingLevel.TITLE,
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Template: ${doc.templateId} · Diekspor pada ${new Date().toLocaleString('id-ID')}`,
          color: '64748B',
          size: 20,
        }),
      ],
      spacing: { after: 300 },
    }),
  ];

  for (const node of doc.nodes) {
    const symbolPrefix = node.symbols.length ? `${node.symbols.join(' ')} ` : '';
    const hexColor = (node.style.color || '#0F172A').replace('#', '');
    const titleAlignment =
      node.style.align === 'center'
        ? AlignmentType.CENTER
        : node.style.align === 'right'
        ? AlignmentType.RIGHT
        : AlignmentType.LEFT;
    children.push(
      new Paragraph({
        heading: node.parentId ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_1,
        alignment: titleAlignment,
        spacing: { before: 200, after: 80 },
        children: [
          new TextRun({
            text: `${symbolPrefix}${node.title}`,
            font: node.style.fontFamily || 'Plus Jakarta Sans',
            size: Math.max(20, (node.style.fontSize || 15) * 2),
            bold: node.style.bold,
            italics: node.style.italic,
            underline: node.style.underline ? {} : undefined,
            color: hexColor === 'FFFFFF' ? '0F172A' : hexColor,
          }),
        ],
      })
    );

    if (node.body) {
      const bStyle = resolveBodyStyle(node);
      const bodyHexColor = (bStyle.color || '#475569').replace('#', '');
      const bodyAlignment =
        bStyle.align === 'center'
          ? AlignmentType.CENTER
          : bStyle.align === 'right'
          ? AlignmentType.RIGHT
          : AlignmentType.LEFT;
      children.push(
        new Paragraph({
          alignment: bodyAlignment,
          spacing: { after: 100 },
          children: [
            new TextRun({
              text: node.body,
              font: bStyle.fontFamily || 'Plus Jakarta Sans',
              size: Math.max(18, (bStyle.fontSize || 13) * 2),
              bold: bStyle.bold,
              italics: bStyle.italic,
              underline: bStyle.underline ? {} : undefined,
              color: bodyHexColor === 'FFFFFF' ? '334155' : bodyHexColor,
            }),
          ],
        })
      );
    }

    if (node.timestampStamp) {
      children.push(
        new Paragraph({
          spacing: { after: 100 },
          children: [
            new TextRun({
              text: `Stamp Waktu: ${node.timestampStamp}`,
              font: 'JetBrains Mono',
              size: 18,
              color: '64748B',
            }),
          ],
        })
      );
    }

    if (node.media?.url && node.media.url.startsWith('data:image/')) {
      const imgBytes = dataUrlToUint8Array(node.media.url);
      if (imgBytes) {
        const mimeMatch = node.media.url.match(/^data:image\/(png|jpeg|jpg|gif);/);
        const imgType = mimeMatch?.[1] === 'png' ? 'png' : 'jpg';
        children.push(
          new Paragraph({
            spacing: { after: 120 },
            children: [
              new ImageRun({
                data: imgBytes,
                transformation: { width: 380, height: 220 },
                type: imgType,
              }),
            ],
          })
        );
      }
    }

    if (node.table && node.table.columns.length > 0) {
      const headerRow = new TableRow({
        children: node.table.columns.map(
          (col) =>
            new TableCell({
              shading: { fill: 'F1F5F9' },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: col.name, bold: true, size: 20 })],
                }),
              ],
            })
        ),
      });

      const bodyRows = node.table.rows.map(
        (r) =>
          new TableRow({
            children: node.table!.columns.map(
              (col) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: formatCellValue(col, r.cells[col.id]),
                          size: 20,
                        }),
                      ],
                    }),
                  ],
                })
            ),
          })
      );

      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
            left: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
            right: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
          },
          rows: [headerRow, ...bodyRows],
        })
      );
    }
  }

  const wordDoc = new Document({
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(wordDoc);
  triggerDownload(blob, `${sanitizeFileName(doc.title)}.docx`);
}

export async function exportAsPptx(doc: BoardDocument, darkMode: boolean): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = doc.title;

  // Slide 1: Cover + Full Board Snapshot
  const cover = pptx.addSlide();
  cover.background = { color: darkMode ? '0B1120' : 'F8FAFC' };
  cover.addText(doc.title, {
    x: 0.6,
    y: 0.4,
    w: 12.1,
    h: 0.6,
    fontSize: 24,
    bold: true,
    color: darkMode ? 'F8FAFC' : '0F172A',
    fontFace: 'Plus Jakarta Sans',
  });
  cover.addText(`Template: ${doc.templateId} · ${doc.nodes.length} Ide & Cabang`, {
    x: 0.6,
    y: 0.95,
    w: 12.1,
    h: 0.35,
    fontSize: 12,
    color: darkMode ? '94A3B8' : '64748B',
  });

  const canvas = await renderBoardToCanvas(doc, darkMode);
  const boardPng = canvas.toDataURL('image/png');
  cover.addImage({
    data: boardPng,
    x: 0.6,
    y: 1.4,
    w: 12.1,
    h: 5.7,
    sizing: { type: 'contain', w: 12.1, h: 5.7 },
  });

  // Subsequent slides per node (grouped cleanly)
  for (const node of doc.nodes) {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    const sym = node.symbols.length ? `${node.symbols.join(' ')} ` : '';
    const textColor = (node.style.color || '#0F172A').replace('#', '');

    slide.addText(`${sym}${node.title}`, {
      x: 0.7,
      y: 0.5,
      w: 11.9,
      h: 0.7,
      fontSize: Math.max(18, (node.style.fontSize || 15) + 6),
      bold: node.style.bold,
      italic: node.style.italic,
      underline: node.style.underline ? { style: 'sng' } : undefined,
      align: node.style.align || 'left',
      color: textColor === 'FFFFFF' ? '0F172A' : textColor,
      fontFace: node.style.fontFamily || 'Plus Jakarta Sans',
    });

    if (node.body) {
      const bStyle = resolveBodyStyle(node);
      const bodyColor = (bStyle.color || '#334155').replace('#', '');
      slide.addText(node.body, {
        x: 0.7,
        y: 1.35,
        w: node.media?.url ? 6.5 : 11.9,
        h: 1.6,
        fontSize: Math.max(12, bStyle.fontSize || 13),
        bold: bStyle.bold,
        italic: bStyle.italic,
        underline: bStyle.underline ? { style: 'sng' } : undefined,
        align: bStyle.align || 'left',
        fontFace: bStyle.fontFamily || 'Plus Jakarta Sans',
        color: bodyColor === 'FFFFFF' ? '334155' : bodyColor,
        valign: 'top',
      });
    }

    if (node.timestampStamp) {
      slide.addText(`Stamp: ${node.timestampStamp}`, {
        x: 0.7,
        y: 6.7,
        w: 8,
        h: 0.3,
        fontSize: 10,
        color: '64748B',
      });
    }

    if (node.media?.url && node.media.url.startsWith('data:image/')) {
      slide.addImage({
        data: node.media.url,
        x: 7.5,
        y: 1.35,
        w: 5.1,
        h: 3.4,
        sizing: { type: 'contain', w: 5.1, h: 3.4 },
      });
    }

    if (node.table && node.table.columns.length > 0) {
      const tableRows: PptxGenJS.TableRow[] = [
        node.table.columns.map((c) => ({
          text: c.name,
          options: { bold: true, fill: { color: 'F1F5F9' }, color: '0F172A' },
        })),
        ...node.table.rows.map((r) =>
          node.table!.columns.map((c) => ({
            text: formatCellValue(c, r.cells[c.id]),
            options: { color: '334155' },
          }))
        ),
      ];
      slide.addTable(tableRows, {
        x: 0.7,
        y: node.body ? 3.2 : 1.4,
        w: 11.9,
        fontSize: 11,
        border: { pt: 1, color: 'CBD5E1' },
      });
    }
  }

  await pptx.writeFile({ fileName: `${sanitizeFileName(doc.title)}.pptx` });
}

function formatMarkdownNodeDetails(node: CanvasNode, lines: string[]): void {
  if (node.body) {
    const bStyle = resolveBodyStyle(node);
    const formattedBody = node.body
      .split('\n')
      .map((line) => {
        if (!line.trim()) return line;
        let out = line;
        if (bStyle.bold) out = `**${out}**`;
        if (bStyle.italic) out = `*${out}*`;
        if (bStyle.underline) out = `<u>${out}</u>`;
        return out;
      })
      .join('\n');
    lines.push('');
    lines.push(formattedBody);
  }
  if (node.timestampStamp) {
    lines.push('');
    lines.push(`> Stamp Waktu: \`${node.timestampStamp}\``);
  }
  if (node.media?.url) {
    lines.push('');
    lines.push(`![${node.media.caption || node.title}](${node.media.url})`);
  }
  if (node.table && node.table.columns.length > 0) {
    lines.push('');
    lines.push(`| ${node.table.columns.map((c) => c.name).join(' | ')} |`);
    lines.push(`| ${node.table.columns.map(() => '---').join(' | ')} |`);
    for (const row of node.table.rows) {
      const vals = node.table.columns.map((c) => formatCellValue(c, row.cells[c.id]));
      lines.push(`| ${vals.join(' | ')} |`);
    }
  }
  lines.push('');
}

function formatMarkdownStyledTitle(node: CanvasNode): string {
  const sym = node.symbols.length ? `${node.symbols.join(' ')} ` : '';
  let formattedTitle = `${sym}${node.title}`;
  if (node.style.bold) formattedTitle = `**${formattedTitle}**`;
  if (node.style.italic) formattedTitle = `*${formattedTitle}*`;
  if (node.style.underline) formattedTitle = `<u>${formattedTitle}</u>`;
  return formattedTitle;
}

export function buildMarkdownContent(doc: BoardDocument): string {
  const lines: string[] = [];
  lines.push(`# ${doc.title}`);
  lines.push('');
  lines.push(`- **Template:** ${doc.templateId}`);
  lines.push(`- **Total Node:** ${doc.nodes.length}`);
  lines.push(`- **Diekspor:** ${new Date().toLocaleString('id-ID')}`);
  lines.push('');

  if (doc.templateId === 'timeframe') {
    const report = groupTimeframeNodesChronologically(doc.nodes);

    if (report.months.length > 0) {
      lines.push('## Ringkasan Jadwal Linimasa');
      lines.push('');
      lines.push('| Bulan | Tanggal | Jam | Agenda | Ringkasan |');
      lines.push('| --- | --- | --- | --- | --- |');
      for (const month of report.months) {
        for (const day of month.days) {
          for (const item of day.items) {
            const safeTitle = item.node.title.replace(/\|/g, '\\|').replace(/\n+/g, ' ');
            const safeBody = (item.node.body || '-').replace(/\|/g, '\\|').replace(/\n+/g, ' ');
            lines.push(
              `| ${month.monthLabel} | ${day.dayLabel} | ${item.timeLabel} | ${safeTitle} | ${safeBody} |`
            );
          }
        }
      }
      lines.push('');
    }

    for (const month of report.months) {
      lines.push('---');
      lines.push('');
      lines.push(`## ${month.monthLabel}`);
      lines.push('');

      for (const day of month.days) {
        lines.push(`### ${day.dayLabel}`);
        lines.push('');

        for (const item of day.items) {
          lines.push(`#### \`${item.timeLabel}\` — ${formatMarkdownStyledTitle(item.node)}`);
          formatMarkdownNodeDetails(item.node, lines);
        }
      }
    }

    if (report.unscheduled.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## Belum Terjadwal (Tanpa Stamp Waktu)');
      lines.push('');
      for (const unNode of report.unscheduled) {
        lines.push(`### ${formatMarkdownStyledTitle(unNode)}`);
        formatMarkdownNodeDetails(unNode, lines);
      }
    }

    return lines.join('\n');
  }

  const childrenMap = new Map<string | null, CanvasNode[]>();
  const nodeIds = new Set(doc.nodes.map((n) => n.id));
  for (const n of doc.nodes) {
    const pid = n.parentId && nodeIds.has(n.parentId) ? n.parentId : null;
    const arr = childrenMap.get(pid) ?? [];
    arr.push(n);
    childrenMap.set(pid, arr);
  }

  const visited = new Set<string>();
  function renderBranch(node: CanvasNode, depth: number) {
    if (visited.has(node.id)) return;
    visited.add(node.id);

    const headingPrefix = depth === 0 ? '##' : depth === 1 ? '###' : '####';
    const formattedTitle = formatMarkdownStyledTitle(node);

    if (depth <= 2) {
      lines.push(`${headingPrefix} ${formattedTitle}`);
    } else {
      const indent = '  '.repeat(depth - 3);
      lines.push(`${indent}- ${formattedTitle}`);
    }

    formatMarkdownNodeDetails(node, lines);

    const kids = childrenMap.get(node.id) ?? [];
    for (const kid of kids) {
      renderBranch(kid, depth + 1);
    }
  }

  const roots = childrenMap.get(null) ?? [];
  for (const r of roots) {
    renderBranch(r, 0);
  }
  // Any disconnected nodes
  for (const n of doc.nodes) {
    if (!visited.has(n.id)) {
      renderBranch(n, 0);
    }
  }

  return lines.join('\n');
}

export function exportAsMarkdown(doc: BoardDocument): void {
  const markdown = buildMarkdownContent(doc);
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  triggerDownload(blob, `${sanitizeFileName(doc.title)}.md`);
}
