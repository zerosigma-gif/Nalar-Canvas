import { GoogleGenAI, Type } from '@google/genai';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import path from 'path';
import { pathToFileURL } from 'url';

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

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    });
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanFileBaseName(fileName: string): string {
  return fileName.replace(/\.(docx|pptx|pdf)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Dokumen Impor';
}

function truncateTitle(text: string, maxLen = 96): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen - 1).trim()}…`;
}

function splitLongTextToTitleAndBody(text: string): { title: string; body: string } {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 72) {
    return { title: cleaned, body: '' };
  }
  const colonIdx = cleaned.indexOf(':');
  if (colonIdx > 4 && colonIdx <= 60) {
    return {
      title: cleaned.slice(0, colonIdx).trim(),
      body: cleaned.slice(colonIdx + 1).trim(),
    };
  }
  const sentenceEnd = cleaned.search(/[.!?]\s/);
  if (sentenceEnd > 8 && sentenceEnd <= 78) {
    return {
      title: cleaned.slice(0, sentenceEnd + 1).trim(),
      body: cleaned.slice(sentenceEnd + 2).trim(),
    };
  }
  return {
    title: truncateTitle(cleaned, 64),
    body: cleaned,
  };
}

function appendBodyText(node: ImportedIdeaNode, text: string): void {
  const clean = text.trim();
  if (!clean) return;
  if (!node.body) {
    node.body = clean;
  } else if (node.body.length < 480) {
    node.body = `${node.body}\n${clean}`;
  } else if (node.children.length < 10) {
    const split = splitLongTextToTitleAndBody(clean);
    node.children.push({
      title: split.title,
      body: split.body,
      children: [],
    });
  }
}

function attachTableToNode(node: ImportedIdeaNode, table: ImportedTablePayload): void {
  if (table.columns.length === 0) return;
  if (!node.table) {
    node.table = table;
  } else {
    node.children.push({
      title: 'Tabel Data',
      body: `${table.columns.length} kolom · ${table.rows.length} baris`,
      table,
      children: [],
    });
  }
}

function normalizeTreeLimits(root: ImportedIdeaNode): ImportedIdeaNode {
  const clampNode = (node: ImportedIdeaNode, depth: number): ImportedIdeaNode => {
    const trimmedTitle = truncateTitle(node.title || 'Topik', 90);
    const trimmedBody = node.body.trim().slice(0, 650);
    const children =
      depth >= 4
        ? []
        : node.children
            .filter((c) => c.title.trim() || c.body.trim() || c.table)
            .slice(0, depth === 0 ? 16 : 12)
            .map((c) => clampNode(c, depth + 1));

    return {
      title: trimmedTitle,
      body: trimmedBody,
      table: node.table ?? null,
      children,
    };
  };

  return clampNode(root, 0);
}

// ============================================================================
// 1. DOCX PARSER (mammoth HTML -> Headings, Lists, Paragraphs & Tables)
// ============================================================================
function extractHtmlTable(tableHtml: string): ImportedTablePayload | null {
  const rowMatches = Array.from(tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
  if (rowMatches.length === 0) return null;

  const matrix: string[][] = [];
  for (const rMatch of rowMatches) {
    const cellMatches = Array.from(rMatch[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi));
    const cells = cellMatches.map((c) => stripTags(c[1]).replace(/\n+/g, ' ').trim());
    if (cells.some((c) => c.length > 0)) {
      matrix.push(cells);
    }
  }
  if (matrix.length === 0) return null;

  const maxCols = Math.min(8, Math.max(...matrix.map((r) => r.length)));
  if (maxCols <= 0) return null;

  const rawHeader = matrix[0];
  const columns = Array.from({ length: maxCols }, (_, i) => rawHeader[i]?.trim() || `Kolom ${i + 1}`);
  const rows = matrix
    .slice(1, 21)
    .map((r) => Array.from({ length: maxCols }, (_, i) => r[i] ?? ''));

  return { columns, rows };
}

function findMatchingCloseTag(html: string, startIndex: number, tagName: string): number {
  const openRe = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  const closeRe = new RegExp(`</${tagName}>`, 'gi');
  let depth = 1;
  let pos = startIndex;

  while (pos < html.length && depth > 0) {
    openRe.lastIndex = pos;
    closeRe.lastIndex = pos;
    const nextOpen = openRe.exec(html);
    const nextClose = closeRe.exec(html);
    if (!nextClose) return html.length;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      pos = openRe.lastIndex;
    } else {
      depth--;
      pos = closeRe.lastIndex;
      if (depth === 0) return nextClose.index;
    }
  }
  return html.length;
}

function parseListItems(listHtml: string): ImportedIdeaNode[] {
  const items: ImportedIdeaNode[] = [];
  let idx = 0;

  while (idx < listHtml.length) {
    const liOpen = /<li\b[^>]*>/i.exec(listHtml.slice(idx));
    if (!liOpen) break;
    const contentStart = idx + liOpen.index + liOpen[0].length;
    const contentEnd = findMatchingCloseTag(listHtml, contentStart, 'li');
    const inner = listHtml.slice(contentStart, contentEnd);

    // Separate nested sub-lists from direct text
    const nestedMatch = /<(ul|ol)\b[^>]*>/i.exec(inner);
    let ownTextHtml = inner;
    const children: ImportedIdeaNode[] = [];

    if (nestedMatch) {
      ownTextHtml = inner.slice(0, nestedMatch.index);
      const subTag = nestedMatch[1].toLowerCase();
      const subStart = nestedMatch.index + nestedMatch[0].length;
      const subEnd = findMatchingCloseTag(inner, subStart, subTag);
      children.push(...parseListItems(inner.slice(subStart, subEnd)));
    }

    const clean = stripTags(ownTextHtml);
    if (clean) {
      const split = splitLongTextToTitleAndBody(clean);
      items.push({
        title: split.title,
        body: split.body,
        children,
      });
    } else if (children.length > 0) {
      items.push(...children);
    }

    idx = contentEnd + 5;
  }

  return items;
}

async function parseDocxBuffer(
  buffer: Buffer,
  fileName: string
): Promise<{ root: ImportedIdeaNode; pagesOrSlides: number; rawText: string }> {
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.imgElement(async () => ({ src: '' })),
      ignoreEmptyParagraphs: true,
    }
  );
  const html = result.value || '';
  const rootTitle = cleanFileBaseName(fileName);
  const root: ImportedIdeaNode = {
    title: rootTitle,
    body: 'Hasil pemindaian arsitektur ide dari dokumen Word (.docx).',
    children: [],
  };

  // Tokenize top-level blocks in order
  interface HtmlBlock {
    type: 'heading' | 'table' | 'list' | 'paragraph';
    level?: number;
    html: string;
  }
  const blocks: HtmlBlock[] = [];
  let cursor = 0;

  while (cursor < html.length) {
    const nextTag = /<(h[1-6]|table|ul|ol|p)\b[^>]*>/i.exec(html.slice(cursor));
    if (!nextTag) break;
    const tagStart = cursor + nextTag.index;
    const tagName = nextTag[1].toLowerCase();
    const contentStart = tagStart + nextTag[0].length;
    const contentEnd = findMatchingCloseTag(html, contentStart, tagName);
    const innerHtml = html.slice(contentStart, contentEnd);

    if (tagName.startsWith('h')) {
      blocks.push({ type: 'heading', level: Number(tagName[1]), html: innerHtml });
    } else if (tagName === 'table') {
      blocks.push({ type: 'table', html: innerHtml });
    } else if (tagName === 'ul' || tagName === 'ol') {
      blocks.push({ type: 'list', html: innerHtml });
    } else {
      blocks.push({ type: 'paragraph', html: innerHtml });
    }

    cursor = contentEnd + tagName.length + 3;
  }

  const hasHeadings = blocks.some((b) => b.type === 'heading');
  const stack: { level: number; node: ImportedIdeaNode }[] = [{ level: 0, node: root }];
  const looseParagraphs: string[] = [];

  for (const block of blocks) {
    if (block.type === 'heading') {
      const headingText = stripTags(block.html);
      if (!headingText) continue;
      const lvl = block.level ?? 1;
      while (stack.length > 1 && stack[stack.length - 1].level >= lvl) {
        stack.pop();
      }
      const parent = stack[stack.length - 1].node;
      const newNode: ImportedIdeaNode = {
        title: truncateTitle(headingText, 86),
        body: '',
        children: [],
      };
      parent.children.push(newNode);
      stack.push({ level: lvl, node: newNode });
    } else if (block.type === 'table') {
      const tbl = extractHtmlTable(block.html);
      if (tbl) {
        attachTableToNode(stack[stack.length - 1].node, tbl);
      }
    } else if (block.type === 'list') {
      const listNodes = parseListItems(block.html);
      const current = stack[stack.length - 1].node;
      current.children.push(...listNodes);
    } else {
      const text = stripTags(block.html);
      if (!text) continue;
      if (hasHeadings) {
        appendBodyText(stack[stack.length - 1].node, text);
      } else {
        looseParagraphs.push(text);
      }
    }
  }

  // If the first heading was the sole H1 title, promote its children cleanly
  if (root.children.length === 1 && root.children[0].children.length > 0 && !root.table) {
    const onlyChild = root.children[0];
    root.title = onlyChild.title;
    root.body = onlyChild.body || root.body;
    root.table = onlyChild.table ?? null;
    root.children = onlyChild.children;
  }

  // If document had no headings at all, turn paragraphs into structured idea nodes
  if (!hasHeadings && looseParagraphs.length > 0) {
    if (looseParagraphs[0].length <= 80 && looseParagraphs.length > 1) {
      root.title = looseParagraphs[0];
      looseParagraphs.shift();
    }
    looseParagraphs.slice(0, 14).forEach((para) => {
      const split = splitLongTextToTitleAndBody(para);
      root.children.push({
        title: split.title,
        body: split.body,
        children: [],
      });
    });
  }

  const rawText = stripTags(html);
  const estPages = Math.max(1, Math.ceil(rawText.length / 1800));
  return { root: normalizeTreeLimits(root), pagesOrSlides: estPages, rawText };
}

// ============================================================================
// 2. PPTX PARSER (JSZip OOXML -> Slide Order, Titles, Bullet Levels, Notes & Tables)
// ============================================================================
function extractXmlTextRuns(xmlFragment: string): string {
  const texts = Array.from(xmlFragment.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi)).map((m) =>
    decodeEntities(m[1])
  );
  return texts.join('').replace(/\s+/g, ' ').trim();
}

function extractPptxParagraphs(xmlFragment: string): { level: number; text: string }[] {
  const paras: { level: number; text: string }[] = [];
  const pMatches = Array.from(xmlFragment.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/gi));
  for (const pm of pMatches) {
    const text = extractXmlTextRuns(pm[1]);
    if (!text) continue;
    const lvlMatch = /<a:pPr\b[^>]*\blvl="(\d+)"/i.exec(pm[1]);
    const level = lvlMatch ? Number(lvlMatch[1]) : 0;
    paras.push({ level, text });
  }
  return paras;
}

function extractPptxTables(slideXml: string): ImportedTablePayload[] {
  const tables: ImportedTablePayload[] = [];
  const tblMatches = Array.from(slideXml.matchAll(/<a:tbl\b[^>]*>([\s\S]*?)<\/a:tbl>/gi));
  for (const tm of tblMatches) {
    const rowsMatrix: string[][] = [];
    const trMatches = Array.from(tm[1].matchAll(/<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/gi));
    for (const tr of trMatches) {
      const tcMatches = Array.from(tr[1].matchAll(/<a:tc\b[^>]*>([\s\S]*?)<\/a:tc>/gi));
      const cells = tcMatches.map((tc) =>
        extractPptxParagraphs(tc[1])
          .map((p) => p.text)
          .join(' ')
          .trim()
      );
      if (cells.some((c) => c.length > 0)) {
        rowsMatrix.push(cells);
      }
    }
    if (rowsMatrix.length > 0) {
      const maxCols = Math.min(8, Math.max(...rowsMatrix.map((r) => r.length)));
      const columns = Array.from(
        { length: maxCols },
        (_, i) => rowsMatrix[0][i]?.trim() || `Kolom ${i + 1}`
      );
      const rows = rowsMatrix
        .slice(1, 21)
        .map((r) => Array.from({ length: maxCols }, (_, i) => r[i] ?? ''));
      tables.push({ columns, rows });
    }
  }
  return tables;
}

async function resolveOrderedSlidePaths(zip: JSZip): Promise<string[]> {
  const presXml = await zip.file('ppt/presentation.xml')?.async('string');
  const relsXml = await zip.file('ppt/_rels/presentation.xml.rels')?.async('string');

  if (presXml && relsXml) {
    const idToTarget = new Map<string, string>();
    for (const rel of relsXml.matchAll(/<Relationship\b([^>]+?)\/?>/gi)) {
      const attrs = rel[1];
      const idM = /\bId="([^"]+)"/i.exec(attrs);
      const targetM = /\bTarget="([^"]+)"/i.exec(attrs);
      if (idM && targetM) {
        const cleanTarget = targetM[1].replace(/^\/?ppt\//i, '').replace(/^\.\//, '');
        idToTarget.set(idM[1], `ppt/${cleanTarget}`);
      }
    }
    const ordered: string[] = [];
    for (const sld of presXml.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"[^>]*\/?>/gi)) {
      const target = idToTarget.get(sld[1]);
      if (target && zip.file(target)) {
        ordered.push(target);
      }
    }
    if (ordered.length > 0) return ordered;
  }

  return Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/i.test(f))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
      return na - nb;
    });
}

async function parsePptxBuffer(
  buffer: Buffer,
  fileName: string
): Promise<{ root: ImportedIdeaNode; pagesOrSlides: number; rawText: string }> {
  const zip = await JSZip.loadAsync(buffer);
  const slidePaths = await resolveOrderedSlidePaths(zip);
  if (slidePaths.length === 0) {
    throw new Error('File .pptx tidak memiliki slide yang dapat dibaca.');
  }

  const rootTitle = cleanFileBaseName(fileName);
  const root: ImportedIdeaNode = {
    title: rootTitle,
    body: `Struktur presentasi PowerPoint (${slidePaths.length} slide).`,
    children: [],
  };

  const allTextChunks: string[] = [];

  for (let i = 0; i < slidePaths.length; i++) {
    const slidePath = slidePaths[i];
    const slideXml = (await zip.file(slidePath)?.async('string')) ?? '';
    const slideNum = i + 1;

    let slideTitle = '';
    let slideSubtitle = '';
    const bodyParas: { level: number; text: string }[] = [];

    const spMatches = Array.from(slideXml.matchAll(/<p:sp\b[^>]*>([\s\S]*?)<\/p:sp>/gi));
    for (const sp of spMatches) {
      const phMatch = /<p:ph\b([^>]*)\/?>/i.exec(sp[1]);
      const phType = phMatch ? (/\btype="([^"]+)"/i.exec(phMatch[1])?.[1] ?? '').toLowerCase() : '';
      const paras = extractPptxParagraphs(sp[1]);
      if (paras.length === 0) continue;

      if (phType === 'title' || phType === 'ctrtitle') {
        slideTitle = paras.map((p) => p.text).join(' ').trim();
      } else if (phType === 'subtitle') {
        slideSubtitle = paras.map((p) => p.text).join('\n').trim();
      } else if (phType !== 'sldnum' && phType !== 'ftr' && phType !== 'dt') {
        bodyParas.push(...paras);
      }
    }

    if (!slideTitle && bodyParas.length > 0 && bodyParas[0].text.length <= 85) {
      slideTitle = bodyParas.shift()!.text;
    }

    // Speaker notes lookup
    let notesText = '';
    const slideBase = path.posix.basename(slidePath);
    const relPath = `ppt/slides/_rels/${slideBase}.rels`;
    const slideRels = await zip.file(relPath)?.async('string');
    if (slideRels) {
      const notesMatch = /Target="([^"]*notesSlide\d+\.xml)"/i.exec(slideRels);
      if (notesMatch) {
        const resolvedNotes = path.posix.normalize(
          path.posix.join('ppt/slides', notesMatch[1])
        );
        const notesXml = await zip.file(resolvedNotes)?.async('string');
        if (notesXml) {
          const noteLines: string[] = [];
          for (const sp of notesXml.matchAll(/<p:sp\b[^>]*>([\s\S]*?)<\/p:sp>/gi)) {
            const phType = /\btype="([^"]+)"/i.exec(sp[1])?.[1]?.toLowerCase() ?? '';
            if (phType === 'sldnum' || phType === 'sldimg') continue;
            const ps = extractPptxParagraphs(sp[1]).map((p) => p.text);
            noteLines.push(...ps);
          }
          notesText = noteLines.join('\n').trim();
        }
      }
    }

    const slideTables = extractPptxTables(slideXml);
    const combinedBody = [slideSubtitle, notesText ? `Catatan: ${notesText}` : '']
      .filter(Boolean)
      .join('\n\n');

    allTextChunks.push(
      `Slide ${slideNum}: ${slideTitle}\n${bodyParas.map((p) => p.text).join('\n')}\n${combinedBody}`
    );

    // If Slide 1 is purely a cover slide, promote its title to root
    if (
      i === 0 &&
      slideTitle &&
      bodyParas.length === 0 &&
      slideTables.length === 0 &&
      slidePaths.length > 1
    ) {
      root.title = truncateTitle(slideTitle, 86);
      root.body = combinedBody || root.body;
      continue;
    }

    const slideNode: ImportedIdeaNode = {
      title: truncateTitle(slideTitle || `Slide ${slideNum}`, 86),
      body: combinedBody,
      children: [],
    };

    // Nest bullet levels cleanly under the slide node
    let lastLvl0: ImportedIdeaNode | null = null;
    for (const para of bodyParas) {
      const split = splitLongTextToTitleAndBody(para.text);
      const itemNode: ImportedIdeaNode = {
        title: split.title,
        body: split.body,
        children: [],
      };
      if (para.level > 0 && lastLvl0) {
        lastLvl0.children.push(itemNode);
      } else {
        slideNode.children.push(itemNode);
        lastLvl0 = itemNode;
      }
    }

    slideTables.forEach((tbl) => attachTableToNode(slideNode, tbl));
    root.children.push(slideNode);
  }

  return {
    root: normalizeTreeLimits(root),
    pagesOrSlides: slidePaths.length,
    rawText: allTextChunks.join('\n\n'),
  };
}

// ============================================================================
// 3. PDF PARSER (pdfjs-dist -> Font-Size & Line Hierarchy + Scanned Fallback)
// ============================================================================
interface PdfTextLine {
  page: number;
  text: string;
  fontSize: number;
}

async function extractPdfLines(
  buffer: Buffer
): Promise<{ numPages: number; lines: PdfTextLine[]; rawText: string }> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const workerPath = path.resolve(
    process.cwd(),
    'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'
  );
  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    verbosity: 0,
  });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;
  const maxPages = Math.min(numPages, 60);
  const allLines: PdfTextLine[] = [];

  for (let p = 1; p <= maxPages; p++) {
    const page = await pdfDoc.getPage(p);
    const content = await page.getTextContent();
    const rows: { y: number; items: { x: number; str: string; size: number }[] }[] = [];

    for (const rawItem of content.items) {
      if (!('str' in rawItem) || !rawItem.str || !rawItem.str.trim()) continue;
      const tr = rawItem.transform as number[];
      const x = tr?.[4] ?? 0;
      const y = tr?.[5] ?? 0;
      const size = Math.max(
        6,
        Math.round(Math.hypot(tr?.[2] ?? 0, tr?.[3] ?? 0) || rawItem.height || 11)
      );

      let matchedRow = rows.find((r) => Math.abs(r.y - y) <= Math.max(3.5, size * 0.45));
      if (!matchedRow) {
        matchedRow = { y, items: [] };
        rows.push(matchedRow);
      }
      matchedRow.items.push({ x, str: rawItem.str, size });
    }

    // Top-to-bottom on page (PDF Y origin is bottom-left)
    rows.sort((a, b) => b.y - a.y);

    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x);
      const lineText = row.items
        .map((it) => it.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!lineText) continue;
      // Skip standalone page number footers
      if (/^(?:page\s+|halaman\s+|hal\.?\s*)?\d{1,3}$/i.test(lineText)) continue;

      const avgSize =
        row.items.reduce((acc, it) => acc + it.size * it.str.length, 0) /
        Math.max(1, row.items.reduce((acc, it) => acc + it.str.length, 0));

      allLines.push({
        page: p,
        text: lineText,
        fontSize: Number(avgSize.toFixed(1)),
      });
    }
  }

  await loadingTask.destroy();

  const rawText = allLines.map((l) => l.text).join('\n');
  return { numPages, lines: allLines, rawText };
}

function buildPdfStructuralTree(
  fileName: string,
  numPages: number,
  lines: PdfTextLine[]
): ImportedIdeaNode {
  const root: ImportedIdeaNode = {
    title: cleanFileBaseName(fileName),
    body: `Dokumen PDF (${numPages} halaman).`,
    children: [],
  };

  if (lines.length === 0) return root;

  const sortedSizes = [...lines.map((l) => l.fontSize)].sort((a, b) => a - b);
  const medianSize = sortedSizes[Math.floor(sortedSizes.length * 0.5)] || 11;

  // Detect document title if line 1-2 is significantly larger
  let startIdx = 0;
  if (lines[0].fontSize >= medianSize * 1.35 && lines[0].text.length <= 100) {
    root.title = truncateTitle(lines[0].text, 88);
    startIdx = 1;
  }

  const stack: { level: number; node: ImportedIdeaNode }[] = [{ level: 0, node: root }];
  let hasHeadings = false;
  let bodyBuffer = '';

  const flushBuffer = () => {
    const trimmed = bodyBuffer.trim();
    bodyBuffer = '';
    if (!trimmed) return;
    appendBodyText(stack[stack.length - 1].node, trimmed);
  };

  for (let i = startIdx; i < lines.length; i++) {
    const { text, fontSize } = lines[i];
    const isNumberedMajor = /^(?:BAB\s+[IVX0-9]+|CHAPTER\s+\d+|\d+\.\s+[A-Z])/.test(text) && text.length <= 85;
    const isNumberedSub = /^\d+\.\d+(?:\.\d+)?\s+/.test(text) && text.length <= 85;
    const isAllCapsHeading =
      text.length >= 4 &&
      text.length <= 64 &&
      /[A-Z]/.test(text) &&
      text === text.toUpperCase() &&
      !/^\d/.test(text);
    const isBullet = /^(?:[•▪◦●○\-–*]|\d+[.)]|[a-zA-Z][.)])\s+/.test(text);

    if (fontSize >= medianSize * 1.26 || isNumberedMajor || isAllCapsHeading) {
      flushBuffer();
      hasHeadings = true;
      while (stack.length > 1 && stack[stack.length - 1].level >= 1) stack.pop();
      const h1Node: ImportedIdeaNode = {
        title: truncateTitle(text, 86),
        body: '',
        children: [],
      };
      root.children.push(h1Node);
      stack.push({ level: 1, node: h1Node });
    } else if ((fontSize >= medianSize * 1.1 && text.length <= 90) || isNumberedSub) {
      flushBuffer();
      hasHeadings = true;
      while (stack.length > 1 && stack[stack.length - 1].level >= 2) stack.pop();
      const h2Node: ImportedIdeaNode = {
        title: truncateTitle(text, 86),
        body: '',
        children: [],
      };
      stack[stack.length - 1].node.children.push(h2Node);
      stack.push({ level: 2, node: h2Node });
    } else if (isBullet) {
      flushBuffer();
      const cleanBullet = text.replace(/^(?:[•▪◦●○\-–*]|\d+[.)]|[a-zA-Z][.)])\s+/, '').trim();
      if (cleanBullet) {
        const split = splitLongTextToTitleAndBody(cleanBullet);
        stack[stack.length - 1].node.children.push({
          title: split.title,
          body: split.body,
          children: [],
        });
      }
    } else {
      bodyBuffer = bodyBuffer ? `${bodyBuffer} ${text}` : text;
      if (bodyBuffer.length > 260 && /[.!?]$/.test(text)) {
        flushBuffer();
      }
    }
  }
  flushBuffer();

  // If no headings and few bullets were detected, chunk lines per page cleanly
  if (!hasHeadings && root.children.length === 0) {
    root.body = `Ringkasan halaman dari dokumen PDF (${numPages} halaman).`;
    const byPage = new Map<number, string[]>();
    for (let i = startIdx; i < lines.length; i++) {
      const arr = byPage.get(lines[i].page) ?? [];
      arr.push(lines[i].text);
      byPage.set(lines[i].page, arr);
    }
    Array.from(byPage.entries())
      .slice(0, 14)
      .forEach(([pageNum, pLines]) => {
        const joined = pLines.join(' ').trim();
        const split = splitLongTextToTitleAndBody(joined);
        root.children.push({
          title: `Halaman ${pageNum}: ${truncateTitle(split.title, 54)}`,
          body: joined.slice(0, 520),
          children: [],
        });
      });
  }

  return normalizeTreeLimits(root);
}

// ============================================================================
// 4. OPTIONAL GEMINI AI SEMANTIC EXTRACTION (for Scanned PDFs or AI Mode)
// ============================================================================
async function extractTreeWithGemini(opts: {
  fileName: string;
  rawText?: string;
  pdfBuffer?: Buffer;
}): Promise<ImportedIdeaNode> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY belum dikonfigurasi di server untuk pemindaian AI atau PDF hasil scan gambar.'
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const instruction =
    'Anda adalah arsitek pengetahuan. Ekstrak dokumen ini menjadi peta pikiran (mind map) hierarkis dalam bahasa dokumen aslinya (atau Bahasa Indonesia yang jelas). ' +
    'Hasilkan 1 rootTitle utama, summary singkat, serta 3-8 cabang utama (branches), masing-masing dapat memiliki sub-ide (children) dan ringkasan isi yang padat serta informatif.';

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (opts.pdfBuffer) {
    parts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: opts.pdfBuffer.toString('base64'),
      },
    });
    parts.push({ text: `${instruction}\nNama file: ${opts.fileName}` });
  } else {
    const trimmed = (opts.rawText || '').slice(0, 32000);
    parts.push({
      text: `${instruction}\nNama file: ${opts.fileName}\n\nIsi Dokumen:\n${trimmed}`,
    });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: { parts },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          rootTitle: { type: Type.STRING },
          summary: { type: Type.STRING },
          branches: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                body: { type: Type.STRING },
                children: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      body: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const jsonStr = (response.text ?? '{}').trim();
  const parsed = JSON.parse(jsonStr) as {
    rootTitle?: string;
    summary?: string;
    branches?: Array<{
      title?: string;
      body?: string;
      children?: Array<{ title?: string; body?: string }>;
    }>;
  };

  const root: ImportedIdeaNode = {
    title: parsed.rootTitle?.trim() || cleanFileBaseName(opts.fileName),
    body: parsed.summary?.trim() || '',
    children: (parsed.branches ?? []).map((b) => ({
      title: b.title?.trim() || 'Cabang Ide',
      body: b.body?.trim() || '',
      children: (b.children ?? []).map((c) => ({
        title: c.title?.trim() || 'Sub-Ide',
        body: c.body?.trim() || '',
        children: [],
      })),
    })),
  };

  return normalizeTreeLimits(root);
}

// ============================================================================
// MAIN DOCUMENT ENTRYPOINT
// ============================================================================
export async function parseUploadedDocument(params: {
  fileName: string;
  base64: string;
  mode?: 'structural' | 'ai-semantic';
}): Promise<DocumentImportResult> {
  const { fileName, base64, mode = 'structural' } = params;
  const extMatch = fileName.toLowerCase().match(/\.(docx|pptx|pdf)$/);
  if (!extMatch) {
    throw new Error('Format file tidak didukung. Gunakan file .docx, .pptx, atau .pdf.');
  }

  const format = extMatch[1] as 'docx' | 'pptx' | 'pdf';
  const cleanB64 = base64.includes(',') ? base64.split(',').pop() || '' : base64;
  const buffer = Buffer.from(cleanB64, 'base64');

  if (buffer.length === 0) {
    throw new Error('File yang diunggah kosong.');
  }

  if (format === 'docx') {
    const parsed = await parseDocxBuffer(buffer, fileName);
    if (mode === 'ai-semantic' && parsed.rawText.trim().length > 20) {
      const aiRoot = await extractTreeWithGemini({ fileName, rawText: parsed.rawText });
      return {
        fileName,
        format,
        method: 'ai-semantic',
        pagesOrSlides: parsed.pagesOrSlides,
        root: aiRoot,
      };
    }
    return {
      fileName,
      format,
      method: 'structural',
      pagesOrSlides: parsed.pagesOrSlides,
      root: parsed.root,
    };
  }

  if (format === 'pptx') {
    const parsed = await parsePptxBuffer(buffer, fileName);
    if (mode === 'ai-semantic' && parsed.rawText.trim().length > 20) {
      const aiRoot = await extractTreeWithGemini({ fileName, rawText: parsed.rawText });
      return {
        fileName,
        format,
        method: 'ai-semantic',
        pagesOrSlides: parsed.pagesOrSlides,
        root: aiRoot,
      };
    }
    return {
      fileName,
      format,
      method: 'structural',
      pagesOrSlides: parsed.pagesOrSlides,
      root: parsed.root,
    };
  }

  // PDF handling
  const { numPages, lines, rawText } = await extractPdfLines(buffer);
  const hasSelectableText = rawText.replace(/\s+/g, '').length >= 40;

  if (!hasSelectableText) {
    // Scanned / image-only PDF: attempt Gemini multimodal extraction if available
    if (process.env.GEMINI_API_KEY && buffer.length <= 14 * 1024 * 1024) {
      const aiRoot = await extractTreeWithGemini({ fileName, pdfBuffer: buffer });
      return {
        fileName,
        format: 'pdf',
        method: 'ai-semantic',
        pagesOrSlides: numPages,
        root: aiRoot,
      };
    }
    throw new Error(
      'PDF ini tampak seperti hasil scan gambar tanpa teks yang dapat diseleksi. Gunakan PDF berbasis teks atau aktifkan pemindaian AI dengan GEMINI_API_KEY.'
    );
  }

  if (mode === 'ai-semantic') {
    const aiRoot = await extractTreeWithGemini({ fileName, rawText });
    return {
      fileName,
      format: 'pdf',
      method: 'ai-semantic',
      pagesOrSlides: numPages,
      root: aiRoot,
    };
  }

  return {
    fileName,
    format: 'pdf',
    method: 'structural',
    pagesOrSlides: numPages,
    root: buildPdfStructuralTree(fileName, numPages, lines),
  };
}
