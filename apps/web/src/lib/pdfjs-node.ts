import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { TipTapNode } from '@/lib/contentConverter';
import {
  buildLines,
  buildRowsForTable,
  detectCanonicalColumns,
  mapToColumn,
  textLinesToParagraphText,
  type Cell,
  type Line,
  type PdfTextItem,
} from './pdf-import/pdfjs-geometry';

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

// Filter repeated page-header / page-footer items by their vertical
// position on the page. These are usually in the top 8% or bottom 5%.
const HEADER_MARGIN_FRACTION = 0.08;
const FOOTER_MARGIN_FRACTION = 0.05;

// Hard cap on pages processed on the legacy text-extraction path. A crafted
// PDF can advertise a huge page count and pin CPU here; bound the loop so a
// single oversized document can't run away (well above any real document).
const MAX_PAGES = 1000;

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
 * Process one page: filter header/footer items, build lines, detect
 * the canonical column layout, and peel off table regions. Non-table
 * regions flow through the text → pdfTextToTipTapJSON pipeline.
 */
async function processPage(
  page: any,
  pdfTextToTipTapJSON: (t: string) => any
): Promise<TipTapNode[]> {
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
      const text = row
        .map((c) => c.text)
        .filter(Boolean)
        .join(' — ');
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

  const pageCount = Math.min(doc.numPages, MAX_PAGES);
  for (let p = 1; p <= pageCount; p++) {
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

  const pageCount = Math.min(doc.numPages, MAX_PAGES);
  for (let p = 1; p <= pageCount; p++) {
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
