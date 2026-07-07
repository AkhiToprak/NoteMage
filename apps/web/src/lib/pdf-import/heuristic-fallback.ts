import type { DocModelBlock, InlineRun } from './doc-model';
import type { GroundTruthPage } from './ground-truth';

/**
 * A page is "table-dense" when its extracted blocks contain a substantial
 * amount of tabular content (≥ 4 total table rows across all table blocks) —
 * the case where a cheap vision model is most likely to mangle cell content.
 * Ported from the retired pdf-table-escalate.ts (the Anthropic escalation
 * wrapper is gone); the predicate stays for a later phase that reuses it.
 */
export function isTableDensePage(blocks: DocModelBlock[]): boolean {
  let tableRows = 0;
  for (const block of blocks) {
    if (block.type === 'table') tableRows += block.rows.length;
  }
  return tableRows >= 4;
}

/** Math-ish glyphs — operators, relations, brackets, and set/logic symbols the
 *  heuristic extractor can't lay out as math. Deliberately dumb: a raw glyph
 *  ratio, no LaTeX parsing. Used only as a NEGATIVE gate for the L8 prose
 *  fast-path (a math-dense page must go to the vision engine). */
// eslint-disable-next-line no-useless-escape
const MATH_GLYPHS = /[∑∫√≈≠≤≥±×÷^=<>{}\[\]\\]/g;

/**
 * A page reads as "math-dense" when >~3% of its characters are math-ish glyphs.
 * Above that, the deterministic extractor (which emits no math blocks) would
 * mangle formulas, so the prose fast-path must skip the page and let the vision
 * engine handle it. Blank/tiny pages (< 20 chars) are never math-dense.
 */
export function isMathDensePage(blocks: DocModelBlock[]): boolean {
  let total = 0;
  let mathHits = 0;
  for (const block of blocks) {
    for (const text of blockText(block)) {
      total += text.length;
      mathHits += (text.match(MATH_GLYPHS) ?? []).length;
    }
  }
  if (total < 20) return false;
  return mathHits / total > 0.03;
}

/** Every plain-text string reachable inside one block (runs, list items, cells). */
function blockText(block: DocModelBlock): string[] {
  const out: string[] = [];
  const pushRuns = (runs: InlineRun[] | undefined): void => {
    for (const run of runs ?? []) out.push(run.text);
  };
  switch (block.type) {
    case 'heading':
    case 'paragraph':
      pushRuns(block.runs);
      break;
    case 'bulletList':
    case 'orderedList':
      for (const item of block.items) pushRuns(item.runs);
      break;
    case 'table':
      for (const row of block.rows) for (const cell of row) pushRuns(cell);
      break;
    default:
      break;
  }
  return out;
}
import {
  buildRowsForTable,
  detectCanonicalColumns,
  type Line,
  mapToColumn,
  textLinesToParagraphText,
} from './pdfjs-geometry';

/** Bullet glyphs pdfjs emits for unordered list items. */
const BULLET_RE = /^\s*[•●◦▪○■□◆▸▶►‣·*-]\s+/;
/** Leading marker for ordered list items: "1." / "2)" / "a." / "b)". */
const ORDERED_RE = /^\s*(?:\d{1,3}|[a-zA-Z])[.)]\s+/;
/** A line larger than body text by this ratio reads as a heading. */
const HEADING_SIZE_RATIO = 1.15;

function lineText(line: Line): string {
  return line.cells
    .map((cell) => cell.text)
    .join(' ')
    .trim();
}

function roundSize(fontSize: number): number {
  return Math.round(fontSize);
}

/**
 * The body font size — the most common rounded size on the page. Body text
 * is normally the bulk of a page; on a tie the smaller size wins, since
 * body text trends smaller than headings.
 */
function computeBodyFontSize(lines: Line[]): number {
  if (lines.length === 0) return 12;
  const counts = new Map<number, number>();
  for (const line of lines) {
    const size = roundSize(line.fontSize);
    counts.set(size, (counts.get(size) ?? 0) + 1);
  }
  let bestSize = roundSize(lines[0].fontSize);
  let bestCount = 0;
  for (const [size, count] of counts) {
    if (count > bestCount || (count === bestCount && size < bestSize)) {
      bestCount = count;
      bestSize = size;
    }
  }
  return bestSize;
}

/** Heading level from a structural pattern alone (numbering, chapter, all-caps). */
function structuralHeadingLevel(text: string): 1 | 2 | 3 | null {
  if (!text || text.length > 90) return null;
  if (/[a-zäöüß]\.$/.test(text)) return null; // ends like a sentence
  if (/^(?:chapter|kapitel|section|teil|part)\s+[ivxlcdm\d]+/i.test(text)) return 1;
  const numbered = text.match(/^\d+(?:\.\d+){0,2}\.?\s+\S/);
  if (numbered) {
    const depth = (numbered[0].match(/\./g) ?? []).length;
    return Math.min(3, Math.max(1, depth)) as 1 | 2 | 3;
  }
  const letters = text.replace(/[^A-Za-zÄÖÜäöüß]/g, '');
  if (letters.length >= 3 && letters === letters.toUpperCase()) return 2;
  return null;
}

function isHeadingLine(line: Line, bodyFontSize: number): boolean {
  const text = lineText(line);
  if (!text || text.length > 100) return false;
  // Two sentence-ending marks with content between → prose, not a heading.
  if (/[.!?;:].{3,}[.!?;:]/.test(text)) return false;
  if (line.fontSize > bodyFontSize * HEADING_SIZE_RATIO && text.length <= 90) return true;
  // At body size, a leading "1." is far more likely an ordered-list item
  // than a numbered heading — only an unambiguous structural pattern counts.
  if (ORDERED_RE.test(text)) return false;
  return structuralHeadingLevel(text) !== null;
}

/** Map each distinct (larger-than-body) heading font size to a level, biggest first. */
function buildHeadingSizeRank(headingLines: Line[], bodyFontSize: number): Map<number, 1 | 2 | 3> {
  const sizes = [
    ...new Set(
      headingLines
        .filter((line) => line.fontSize > bodyFontSize * HEADING_SIZE_RATIO)
        .map((line) => roundSize(line.fontSize)),
    ),
  ].sort((a, b) => b - a);
  const rank = new Map<number, 1 | 2 | 3>();
  sizes.forEach((size, index) => rank.set(size, Math.min(3, index + 1) as 1 | 2 | 3));
  return rank;
}

function headingLevelFor(line: Line, sizeRank: Map<number, 1 | 2 | 3>): 1 | 2 | 3 {
  return sizeRank.get(roundSize(line.fontSize)) ?? structuralHeadingLevel(lineText(line)) ?? 2;
}

/**
 * The maximal contiguous span of lines whose cells align to ≥2 canonical
 * columns. Returns null when the page has no tabular structure.
 */
function detectTableRegion(
  lines: Line[],
): { start: number; end: number; columns: number[] } | null {
  const columns = detectCanonicalColumns(lines);
  if (columns.length < 2) return null;

  let start = -1;
  let end = -1;
  let count = 0;
  lines.forEach((line, i) => {
    const hits = line.cells.reduce(
      (n, cell) => n + (mapToColumn(cell.startX, columns) !== -1 ? 1 : 0),
      0,
    );
    if (hits >= 2) {
      if (start === -1) start = i;
      end = i;
      count += 1;
    }
  });
  if (count < 2 || start === -1) return null;
  return { start, end, columns };
}

/** The first table line reads as a header when its font runs larger than the rest. */
function guessHeaderRow(regionLines: Line[]): boolean {
  if (regionLines.length < 2) return false;
  const [first, ...rest] = regionLines;
  const avgRest = rest.reduce((sum, line) => sum + line.fontSize, 0) / rest.length;
  return first.fontSize > avgRest * 1.05;
}

function buildTableBlock(regionLines: Line[], columns: number[]): DocModelBlock | null {
  const rows = buildRowsForTable(regionLines, columns);
  if (rows.length === 0) return null;
  const tableRows = rows.map((row) =>
    row.map((cell): InlineRun[] => {
      const text = cell.text.trim();
      return text ? [{ text }] : [];
    }),
  );
  return { type: 'table', headerRow: guessHeaderRow(regionLines), rows: tableRows };
}

/**
 * Deterministic, LLM-free fallback: turn one page's verbatim text geometry
 * into DocModel blocks. The import worker calls this whenever the structure
 * engine throws, so import always produces *something* valid.
 *
 * It works from font-size geometry alone: larger lines become headings,
 * lines led by a bullet/number glyph become lists, canonically-aligned
 * columns become a table, everything else becomes paragraphs. It emits no
 * inline marks, callouts, code blocks or images — there is no geometric
 * signal for those — only headings, paragraphs, lists and tables.
 */
export function groundTruthToBlocks(page: GroundTruthPage): DocModelBlock[] {
  const lines = page.lines;
  if (lines.length === 0) return [];

  // Detect a table region up front; commit to it only if a real table
  // block can be built — otherwise those lines classify as normal content.
  let table: { start: number; end: number; block: DocModelBlock } | null = null;
  const region = detectTableRegion(lines);
  if (region) {
    const block = buildTableBlock(lines.slice(region.start, region.end + 1), region.columns);
    if (block) table = { start: region.start, end: region.end, block };
  }
  const inTable = (index: number): boolean =>
    table !== null && index >= table.start && index <= table.end;

  const nonTableLines = lines.filter((_, i) => !inTable(i));
  const bodyFontSize = computeBodyFontSize(nonTableLines);
  const sizeRank = buildHeadingSizeRank(
    nonTableLines.filter((line) => isHeadingLine(line, bodyFontSize)),
    bodyFontSize,
  );

  const blocks: DocModelBlock[] = [];
  let listKind: 'bullet' | 'ordered' | null = null;
  let listItems: { runs: InlineRun[] }[] = [];
  let paragraphLines: Line[] = [];

  const flushList = (): void => {
    if (listKind && listItems.length > 0) {
      blocks.push(
        listKind === 'bullet'
          ? { type: 'bulletList', items: listItems }
          : { type: 'orderedList', items: listItems },
      );
    }
    listKind = null;
    listItems = [];
  };
  const flushParagraphs = (): void => {
    if (paragraphLines.length > 0) {
      for (const para of textLinesToParagraphText(paragraphLines).split('\n\n')) {
        const trimmed = para.trim();
        if (trimmed) blocks.push({ type: 'paragraph', runs: [{ text: trimmed }] });
      }
      paragraphLines = [];
    }
  };
  const flushAll = (): void => {
    flushList();
    flushParagraphs();
  };

  for (let i = 0; i < lines.length; i++) {
    if (table && i === table.start) {
      flushAll();
      blocks.push(table.block);
      i = table.end;
      continue;
    }

    const line = lines[i];
    const text = lineText(line);
    if (!text) continue;

    if (isHeadingLine(line, bodyFontSize)) {
      flushAll();
      blocks.push({ type: 'heading', level: headingLevelFor(line, sizeRank), runs: [{ text }] });
      continue;
    }

    if (ORDERED_RE.test(text)) {
      if (listKind !== 'ordered') {
        flushList();
        flushParagraphs();
        listKind = 'ordered';
      }
      listItems.push({ runs: [{ text: text.replace(ORDERED_RE, '').trim() }] });
      continue;
    }

    if (BULLET_RE.test(text)) {
      if (listKind !== 'bullet') {
        flushList();
        flushParagraphs();
        listKind = 'bullet';
      }
      listItems.push({ runs: [{ text: text.replace(BULLET_RE, '').trim() }] });
      continue;
    }

    // A normal text line ends any open list but extends the paragraph run.
    flushList();
    paragraphLines.push(line);
  }
  flushAll();

  return blocks;
}
