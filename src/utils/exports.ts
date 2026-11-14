import {
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
    const titleSize = Math.max(13, node.style.fontSize || 15);
    const bodySize = Math.max(12, titleSize - 2);

    const prefix = node.symbols.length > 0 ? `${node.symbols.join(' ')} ` : '';
    mctx.font = `${node.style.italic ? 'italic ' : ''}${node.style.bold ? '700' : '600'} ${titleSize}px "${fontFamily}", sans-serif`;
    const titleLines = wrapTextLines(mctx, `${prefix}${node.title}`, innerW);

    mctx.font = `${node.style.italic ? 'italic ' : ''}400 ${bodySize}px "${fontFamily}", sans-serif`;
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
    const titleSize = Math.max(13, node.style.fontSize || 15);
    const bodySize = Math.max(12, titleSize - 2);
    const isDarkCard = node.surfaceColor === '#1E293B' || (darkMode && node.surfaceColor === '#FFFFFF');
    const textColor =
      isDarkCard && node.style.color === '#0F172A' ? '#F8FAFC' : node.style.color || '#0F172A';

    let cursorY = y + 16;

    // Title
    ctx.fillStyle = textColor;
    ctx.font = `${node.style.italic ? 'italic ' : ''}${node.style.bold ? '700' : '600'} ${titleSize}px "${fontFamily}", sans-serif`;
    for (const line of titleLines) {
      cursorY += titleSize * 1.1;
      ctx.fillText(line, x + 16, cursorY);
      if (node.style.underline) {
        const lw = ctx.measureText(line).width;
        ctx.fillRect(x + 16, cursorY + 2, lw, 1.2);
      }
      cursorY += titleSize * 0.25;
    }

    // Body
    if (bodyLines.length > 0) {
      cursorY += 6;
      ctx.fillStyle = isDarkCard ? '#CBD5E1' : '#475569';
      ctx.font = `${node.style.italic ? 'italic ' : ''}400 ${bodySize}px "${fontFamily}", sans-serif`;
      for (const line of bodyLines) {
        cursorY += bodySize * 1.15;
        ctx.fillText(line, x + 16, cursorY);
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

  // Page 2: Structured Outline & Tables
  pdf.addPage('a4', 'portrait');
  let py = 48;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text(doc.title, 40, py);
  py += 20;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(`Template: ${doc.templateId} · Total Node: ${doc.nodes.length}`, 40, py);
  py += 24;

  for (const node of doc.nodes) {
    if (py > 770) {
      pdf.addPage('a4', 'portrait');
      py = 48;
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    const sym = node.symbols.length ? `${node.symbols.join(' ')} ` : '';
    pdf.text(`${sym}${node.title}`, 40, py);
    py += 15;

    if (node.body) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      const wrapped = pdf.splitTextToSize(node.body, 510);
      pdf.text(wrapped, 48, py);
      py += wrapped.length * 13 + 4;
    }
    if (node.timestampStamp) {
      pdf.setFontSize(9);
      pdf.text(`Stamp: ${node.timestampStamp}`, 48, py);
      py += 13;
    }
    if (node.table && node.table.columns.length > 0) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text(node.table.columns.map((c) => c.name).join(' | '), 48, py);
      py += 12;
      pdf.setFont('helvetica', 'normal');
      for (const row of node.table.rows) {
        if (py > 780) {
          pdf.addPage('a4', 'portrait');
          py = 48;
        }
        const line = node.table.columns
          .map((c) => formatCellValue(c, row.cells[c.id]))
          .join(' | ');
        pdf.text(line, 48, py);
        py += 12;
      }
    }
    py += 8;
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
    children.push(
      new Paragraph({
        heading: node.parentId ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_1,
        spacing: { before: 200, after: 80 },
        children: [
          new TextRun({
            text: `${symbolPrefix}${node.title}`,
            font: node.style.fontFamily || 'Plus Jakarta Sans',
            size: Math.max(22, (node.style.fontSize || 15) * 2),
            bold: node.style.bold || !node.parentId,
            italics: node.style.italic,
            underline: node.style.underline ? {} : undefined,
            color: hexColor === 'FFFFFF' ? '0F172A' : hexColor,
          }),
        ],
      })
    );

    if (node.body) {
      children.push(
        new Paragraph({
          spacing: { after: 100 },
          children: [
            new TextRun({
              text: node.body,
              font: node.style.fontFamily || 'Plus Jakarta Sans',
              size: Math.max(20, (node.style.fontSize || 14) * 1.8),
              italics: node.style.italic,
              underline: node.style.underline ? {} : undefined,
              color: '334155',
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
      fontSize: Math.max(20, (node.style.fontSize || 16) + 6),
      bold: node.style.bold || true,
      italic: node.style.italic,
      underline: node.style.underline ? { style: 'sng' } : undefined,
      color: textColor === 'FFFFFF' ? '0F172A' : textColor,
      fontFace: node.style.fontFamily || 'Plus Jakarta Sans',
    });

    if (node.body) {
      slide.addText(node.body, {
        x: 0.7,
        y: 1.35,
        w: node.media?.url ? 6.5 : 11.9,
        h: 1.6,
        fontSize: 15,
        color: '334155',
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

export function exportAsMarkdown(doc: BoardDocument): void {
  const lines: string[] = [];
  lines.push(`# ${doc.title}`);
  lines.push('');
  lines.push(`- **Template:** ${doc.templateId}`);
  lines.push(`- **Total Node:** ${doc.nodes.length}`);
  lines.push(`- **Diekspor:** ${new Date().toLocaleString('id-ID')}`);
  lines.push('');

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
    const sym = node.symbols.length ? `${node.symbols.join(' ')} ` : '';
    let formattedTitle = `${sym}${node.title}`;
    if (node.style.bold) formattedTitle = `**${formattedTitle}**`;
    if (node.style.italic) formattedTitle = `*${formattedTitle}*`;
    if (node.style.underline) formattedTitle = `<u>${formattedTitle}</u>`;

    if (depth <= 2) {
      lines.push(`${headingPrefix} ${formattedTitle}`);
    } else {
      const indent = '  '.repeat(depth - 3);
      lines.push(`${indent}- ${formattedTitle}`);
    }

    if (node.body) {
      lines.push('');
      lines.push(node.body);
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

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  triggerDownload(blob, `${sanitizeFileName(doc.title)}.md`);
}
