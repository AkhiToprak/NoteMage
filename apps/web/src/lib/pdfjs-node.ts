import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { TipTapNode } from '@/lib/contentConverter';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Absolute URL of the bundled pdfjs worker file. Copied into
 * src/lib/vendor/pdfjs-worker.mjs at next.config.ts load time — the
 * `new URL(..., import.meta.url)` reference is the pattern @vercel/nft
 * reliably traces as a static asset dependency.
 */
const WORKER_URL = new URL('./vendor/pdfjs-worker.mjs', import.meta.url);

let workerTmpPath: string | null = null;

function ensureWorkerOnDisk(): string {
  if (workerTmpPath && fs.existsSync(workerTmpPath)) return workerTmpPath;

  const srcPath = fileURLToPath(WORKER_URL);
  const destPath = path.join(os.tmpdir(), 'pdfjs-pdf.worker.mjs');
  if (!fs.existsSync(destPath)) {
    fs.copyFileSync(srcPath, destPath);
  }
  workerTmpPath = destPath;
  return destPath;
}

let workerConfigured = false;

async function getPdfjs(): Promise<any> {
  const pdfjsLib: any = await import('pdfjs-dist/legacy/build/pdf.mjs');

  if (!workerConfigured) {
    try {
      const workerPath = ensureWorkerOnDisk();
      pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[pdfjs-node] Failed to set worker src:', err);
    }
    workerConfigured = true;
  }

  return pdfjsLib;
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface Cell {
  text: string;
  startX: number;
  endX: number;
}

interface Line {
  y: number;
  fontSize: number;
  cells: Cell[];
}

const COLUMN_X_TOLERANCE = 12;

// Filter repeated page-header / page-footer items by their vertical
// position on the page. These are usually in the top 8% or bottom 5%.
const HEADER_MARGIN_FRACTION = 0.08;
const FOOTER_MARGIN_FRACTION = 0.05;

/**
 * Group pdfjs items on a single visual line into cells. The key move
 * here is treating a whitespace-only item whose width is clearly wider
 * than a real space glyph as a column separator — PDFs often render
 * tabular layouts by inserting a giant " " between columns rather than
 * by using actual table structure.
 */
function buildLineCells(lineItems: PdfTextItem[]): { cells: Cell[]; fontSize: number } {
  lineItems.sort((a, b) => a.transform[4] - b.transform[4]);
  const cells: Cell[] = [];
  let current: Cell | null = null;
  let maxFontSize = 0;

  const pushCurrent = () => {
    if (!current) return;
    const text = current.text.replace(/\s+/g, ' ').trim();
    if (text) cells.push({ ...current, text });
    current = null;
  };

  for (const item of lineItems) {
    const x = item.transform[4];
    const w = item.width ?? 0;
    const fontSize = Math.abs(item.transform[0] || item.height || 10);
    if (fontSize > maxFontSize) maxFontSize = fontSize;

    // A whitespace-only item that's substantially wider than a glyph
    // is column padding. These appear everywhere in tabular PDFs.
    const isPaddingSpace = /^\s+$/.test(item.str) && w > fontSize * 0.8;
    if (isPaddingSpace) {
      pushCurrent();
      continue;
    }

    if (!current) {
      if (/^\s*$/.test(item.str)) continue;
      current = { text: item.str, startX: x, endX: x + w };
      continue;
    }

    const gap = x - current.endX;
    const charWidth = item.str.length > 0 ? w / item.str.length : fontSize * 0.5;

    // Gap is much bigger than a reasonable word gap → column boundary.
    if (gap > charWidth * 4 || gap > fontSize * 2.2) {
      pushCurrent();
      current = { text: item.str, startX: x, endX: x + w };
      continue;
    }

    if (gap > charWidth * 0.3 && !/\s$/.test(current.text) && !/^\s/.test(item.str)) {
      current.text += ' ';
    }
    current.text += item.str;
    current.endX = x + w;
  }
  pushCurrent();

  return { cells, fontSize: maxFontSize };
}

/**
 * Group positioned items into visual lines by y-coordinate, top-down.
 */
function buildLines(items: PdfTextItem[]): Line[] {
  const lineMap = new Map<number, PdfTextItem[]>();
  const LINE_Y_TOLERANCE = 2;
  for (const item of items) {
    if (!item.str) continue;
    const y = item.transform[5];
    let key: number | null = null;
    for (const existingKey of lineMap.keys()) {
      if (Math.abs(existingKey - y) <= LINE_Y_TOLERANCE) {
        key = existingKey;
        break;
      }
    }
    if (key === null) key = y;
    const bucket = lineMap.get(key);
    if (bucket) bucket.push(item);
    else lineMap.set(key, [item]);
  }

  const sortedEntries = Array.from(lineMap.entries()).sort((a, b) => b[0] - a[0]);

  const lines: Line[] = [];
  for (const [y, lineItems] of sortedEntries) {
    const { cells, fontSize } = buildLineCells(lineItems);
    if (cells.length === 0) continue;
    lines.push({ y, fontSize, cells });
  }
  return lines;
}

/**
 * Compute canonical column-start x-positions for a page — x-coordinates
 * used by cells on at least 2 different multi-cell lines. Single-cell
 * lines contribute a secondary vote so standalone labels and bullet
 * indents don't get confused for columns.
 */
function detectCanonicalColumns(lines: Line[]): number[] {
  const clusters: { x: number; count: number }[] = [];

  const vote = (x: number, weight = 1) => {
    for (const c of clusters) {
      if (Math.abs(c.x - x) < COLUMN_X_TOLERANCE) {
        c.x = (c.x * c.count + x * weight) / (c.count + weight);
        c.count += weight;
        return;
      }
    }
    clusters.push({ x, count: weight });
  };

  for (const line of lines) {
    const weight = line.cells.length >= 2 ? 2 : 1;
    for (const cell of line.cells) vote(cell.startX, weight);
  }

  return clusters
    .filter((c) => c.count >= 3)
    .map((c) => c.x)
    .sort((a, b) => a - b);
}

/** Nearest column index for a given x, or -1 if none is within tolerance. */
function mapToColumn(x: number, columns: number[]): number {
  let bestIdx = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < columns.length; i++) {
    const d = Math.abs(x - columns[i]);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestDist < COLUMN_X_TOLERANCE ? bestIdx : -1;
}

function appendToCell(cell: Cell, text: string): void {
  const endsWithSoftHyphen = /[a-zäöüß]-$/.test(cell.text);
  const nextStartsLower = /^[a-zäöüß]/.test(text);
  if (endsWithSoftHyphen && nextStartsLower) {
    cell.text = cell.text.slice(0, -1) + text;
  } else if (cell.text) {
    cell.text += ' ' + text;
  } else {
    cell.text = text;
  }
}

/**
 * Build one table's rows from a stretch of lines against a set of
 * canonical columns. A line with ≥ 2 canonical-column hits starts a
 * new row; a line with 1 canonical-column hit folds into whichever
 * column of the current row it matches (continuation of wrapped cell
 * content, or a sub-label in the same cell).
 */
function buildRowsForTable(lines: Line[], columns: number[]): Cell[][] {
  const rows: Cell[][] = [];
  let currentRow: Cell[] | null = null;

  const newRow = (): Cell[] =>
    columns.map(() => ({ text: '', startX: 0, endX: 0 }));

  for (const line of lines) {
    const hits = new Map<number, Cell>();
    for (const cell of line.cells) {
      const colIdx = mapToColumn(cell.startX, columns);
      if (colIdx === -1) {
        // Extra cell that doesn't map to any canonical column —
        // attach to the nearest column on its left (right-aligned
        // sub-column like "4. Semester" after "10 Lektionen").
        let leftIdx = -1;
        for (let i = 0; i < columns.length; i++) {
          if (columns[i] <= cell.startX) leftIdx = i;
        }
        if (leftIdx !== -1) {
          const existing = hits.get(leftIdx);
          if (existing) appendToCell(existing, cell.text);
          else hits.set(leftIdx, { ...cell });
        }
        continue;
      }
      const existing = hits.get(colIdx);
      if (existing) appendToCell(existing, cell.text);
      else hits.set(colIdx, { ...cell });
    }

    if (hits.size === 0) continue;

    if (hits.size >= 2 || !currentRow) {
      if (currentRow) rows.push(currentRow);
      currentRow = newRow();
      for (const [idx, cell] of hits) currentRow[idx] = cell;
    } else {
      // Single-column continuation of the current row.
      for (const [idx, cell] of hits) {
        const target = currentRow[idx];
        appendToCell(target, cell.text);
        if (!target.startX) target.startX = cell.startX;
        target.endX = Math.max(target.endX, cell.endX);
      }
    }
  }

  if (currentRow) rows.push(currentRow);
  return rows;
}

function makeTableNode(rows: Cell[][], columnCount: number): TipTapNode {
  const tableRows: TipTapNode[] = rows.map((row, rowIdx) => {
    // Normalize to the target column count (pad with empties).
    const cellNodes: TipTapNode[] = [];
    for (let c = 0; c < columnCount; c++) {
      const text = (row[c]?.text ?? '').trim();
      cellNodes.push({
        type: rowIdx === 0 ? 'tableHeader' : 'tableCell',
        attrs: { colspan: 1, rowspan: 1, colwidth: null },
        content: [
          {
            type: 'paragraph',
            content: text ? [{ type: 'text', text }] : undefined,
          },
        ],
      });
    }
    return { type: 'tableRow', content: cellNodes };
  });

  return { type: 'table', content: tableRows };
}

/**
 * Convert a run of non-tabular lines into paragraph-style text, which
 * is then handed to pdfTextToTipTapJSON for heading / bullet / chrome
 * handling.
 */
function textLinesToParagraphText(lines: Line[]): string {
  if (lines.length === 0) return '';

  const rows = lines.map((l) => ({
    y: l.y,
    fontSize: l.fontSize,
    text: l.cells.map((c) => c.text).join(' '),
  }));

  const paragraphs: string[] = [];
  let current = rows[0].text;
  let prev = rows[0];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const gap = prev.y - row.y;
    const expectedLeading = Math.max(prev.fontSize, row.fontSize) * 1.25;

    if (gap > expectedLeading * 1.6) {
      paragraphs.push(current);
      current = row.text;
    } else {
      const endsWithSoftHyphen = /[a-zäöüß]-$/.test(current);
      const nextStartsLower = /^[a-zäöüß]/.test(row.text);
      if (endsWithSoftHyphen && nextStartsLower) {
        current = current.slice(0, -1) + row.text;
      } else {
        current += ' ' + row.text;
      }
    }
    prev = row;
  }
  if (current) paragraphs.push(current);

  return paragraphs.map(collapseLetterSpacing).join('\n\n');
}

/**
 * Conservative post-process that fixes fully letter-spaced sequences
 * ("T E C H N I K" → "TECHNIK"). Does NOT fuse a lone cap onto the
 * following word — that false-positived on "FÜR DIE".
 */
function collapseLetterSpacing(paragraph: string): string {
  return paragraph.replace(/(?:\b[A-ZÄÖÜ] ){2,}[A-ZÄÖÜ]\b/g, (match) =>
    match.replace(/ /g, '')
  );
}

/**
 * Process one page: filter header/footer items, build lines, detect
 * the canonical column layout, and peel off table regions. Non-table
 * regions flow through the text → pdfTextToTipTapJSON pipeline.
 */
async function processPage(page: any, pdfTextToTipTapJSON: (t: string) => any): Promise<TipTapNode[]> {
  const viewport = page.getViewport({ scale: 1 });
  const pageHeight: number = viewport.height;
  const content = await page.getTextContent();

  const headerCutoff = pageHeight * (1 - HEADER_MARGIN_FRACTION);
  const footerCutoff = pageHeight * FOOTER_MARGIN_FRACTION;

  const items = (content.items as any[]).filter((it) => {
    if (typeof it.str !== 'string' || !it.str.trim()) return false;
    const y = it.transform[5];
    if (y >= headerCutoff) return false;
    if (y <= footerCutoff) return false;
    return true;
  }) as PdfTextItem[];

  const lines = buildLines(items);
  if (lines.length === 0) return [];

  const canonicalColumns = detectCanonicalColumns(lines);
  const nodes: TipTapNode[] = [];

  // If there aren't at least two canonical columns, skip table detection
  // entirely and run the text path over all lines.
  if (canonicalColumns.length < 2) {
    const text = textLinesToParagraphText(lines);
    const doc = pdfTextToTipTapJSON(text);
    for (const n of doc.content) nodes.push(n);
    return nodes;
  }

  // Walk the page lines. Anything before the first line with ≥ 2
  // canonical-column hits stays as text. From there on, we're inside a
  // table region until we hit either the end of the page or a run of
  // lines that don't touch any canonical column.
  let i = 0;
  let textBuffer: Line[] = [];
  let tableBuffer: Line[] = [];

  const flushText = () => {
    if (textBuffer.length === 0) return;
    const text = textLinesToParagraphText(textBuffer);
    textBuffer = [];
    if (!text.trim()) return;
    const doc = pdfTextToTipTapJSON(text);
    for (const n of doc.content) nodes.push(n);
  };

  const flushTable = () => {
    if (tableBuffer.length === 0) return;
    const rows = buildRowsForTable(tableBuffer, canonicalColumns);
    tableBuffer = [];
    if (rows.length >= 2) {
      nodes.push(makeTableNode(rows, canonicalColumns.length));
    } else if (rows.length === 1) {
      // Degenerate: one row reads more naturally as text.
      const row = rows[0];
      const text = row.map((c) => c.text).filter(Boolean).join(' — ');
      if (text.trim()) {
        const doc = pdfTextToTipTapJSON(text);
        for (const n of doc.content) nodes.push(n);
      }
    }
  };

  const lineHasColumnHit = (line: Line): number => {
    let hits = 0;
    for (const cell of line.cells) {
      if (mapToColumn(cell.startX, canonicalColumns) !== -1) hits++;
    }
    return hits;
  };

  let inTable = false;
  let nonHitStreak = 0;
  while (i < lines.length) {
    const line = lines[i];
    const hits = lineHasColumnHit(line);

    if (!inTable) {
      if (hits >= 2) {
        flushText();
        tableBuffer.push(line);
        inTable = true;
        nonHitStreak = 0;
      } else {
        textBuffer.push(line);
      }
    } else {
      if (hits >= 1) {
        tableBuffer.push(line);
        nonHitStreak = 0;
      } else {
        nonHitStreak++;
        // Two consecutive non-hits → table ended.
        if (nonHitStreak >= 2) {
          flushTable();
          inTable = false;
          textBuffer.push(line);
        } else {
          // Isolated non-hit might be a sub-heading inside a cell;
          // keep it as part of the table buffer but mark it.
          tableBuffer.push(line);
        }
      }
    }
    i++;
  }
  flushTable();
  flushText();

  return nodes;
}

/**
 * Main structured extractor. Returns TipTap nodes that preserve
 * table structure, paragraph structure, and flat text.
 */
export async function extractPdfTipTapNodes(buffer: Buffer): Promise<TipTapNode[]> {
  const { pdfTextToTipTapJSON } = await import('@/lib/contentConverter');

  const pdfjsLib = await getPdfjs();
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;

  const allNodes: TipTapNode[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const pageNodes = await processPage(page, pdfTextToTipTapJSON);
    for (const n of pageNodes) allNodes.push(n);
    page.cleanup();
  }

  await doc.destroy();
  return allNodes;
}

/**
 * Plain-text extractor used for the search/textContent field. Renders
 * tables as "cell | cell | cell" lines so their words stay searchable.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjsLib = await getPdfjs();

  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;

  const pages: string[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const pageHeight: number = viewport.height;
    const headerCutoff = pageHeight * (1 - HEADER_MARGIN_FRACTION);
    const footerCutoff = pageHeight * FOOTER_MARGIN_FRACTION;

    const content = await page.getTextContent();
    const items = (content.items as any[]).filter((it) => {
      if (typeof it.str !== 'string' || !it.str.trim()) return false;
      const y = it.transform[5];
      return y < headerCutoff && y > footerCutoff;
    }) as PdfTextItem[];

    const lines = buildLines(items);
    if (lines.length === 0) {
      page.cleanup();
      continue;
    }

    const canonicalColumns = detectCanonicalColumns(lines);
    if (canonicalColumns.length < 2) {
      const text = textLinesToParagraphText(lines);
      if (text) pages.push(text);
    } else {
      const rows = buildRowsForTable(lines, canonicalColumns);
      if (rows.length >= 2) {
        pages.push(rows.map((r) => r.map((c) => c.text).join(' | ')).join('\n'));
      } else {
        pages.push(textLinesToParagraphText(lines));
      }
    }

    page.cleanup();
  }

  await doc.destroy();
  return pages.join('\n\n');
}

/**
 * Shared pdfjs loader — other helpers (image extractor) reuse this so
 * the worker is configured exactly once per lambda instance.
 */
export async function loadPdfjs(): Promise<any> {
  return getPdfjs();
}
