/**
 * Pure geometry helpers for the PDF text layer — visual-line grouping,
 * canonical-column detection, table-row assembly, and paragraph reflow.
 *
 * Extracted from `pdfjs-node.ts` so the structured PDF-import pipeline
 * (`ground-truth.ts`) and the legacy DOCX/dialog extractor share one
 * implementation. Nothing here touches the pdfjs runtime or Tiptap —
 * every function operates on already-extracted positioned text items.
 */

/** A positioned text item as returned by pdfjs `getTextContent()`. */
export interface PdfTextItem {
  str: string;
  /** 6-number affine matrix; [0] ≈ font size, [4] = x, [5] = y. */
  transform: number[];
  width: number;
  height: number;
}

export interface Cell {
  text: string;
  startX: number;
  endX: number;
}

export interface Line {
  y: number;
  fontSize: number;
  cells: Cell[];
}

const COLUMN_X_TOLERANCE = 12;

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
export function buildLines(items: PdfTextItem[]): Line[] {
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
export function detectCanonicalColumns(lines: Line[]): number[] {
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
export function mapToColumn(x: number, columns: number[]): number {
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

/**
 * True when `prev` ends with a hyphen following a lowercase letter and
 * `next` begins with a lowercase letter — a word broken across a line or
 * cell boundary that should be rejoined by dropping the hyphen.
 */
function isSoftHyphenJoin(prev: string, next: string): boolean {
  return /[a-zäöüß]-$/.test(prev) && /^[a-zäöüß]/.test(next);
}

function appendToCell(cell: Cell, text: string): void {
  if (isSoftHyphenJoin(cell.text, text)) {
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
export function buildRowsForTable(lines: Line[], columns: number[]): Cell[][] {
  const rows: Cell[][] = [];
  let currentRow: Cell[] | null = null;

  const newRow = (): Cell[] => columns.map(() => ({ text: '', startX: 0, endX: 0 }));

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

/**
 * Convert a run of non-tabular lines into paragraph-style text, which
 * is then handed to pdfTextToTipTapJSON for heading / bullet / chrome
 * handling.
 */
export function textLinesToParagraphText(lines: Line[]): string {
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
      if (isSoftHyphenJoin(current, row.text)) {
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
  return paragraph.replace(/(?:\b[A-ZÄÖÜ] ){2,}[A-ZÄÖÜ]\b/g, (match) => match.replace(/ /g, ''));
}
