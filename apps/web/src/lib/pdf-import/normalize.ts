// Guardrail G3 — pre-Zod shape normalization for model-emitted DocModel blocks.
//
// The strict `docModelSchema` rejects unknown keys and mis-typed fields, and
// Flash-Lite (the PDF engine) drifts frequently: it wraps table cells, adds
// stray `type` keys to runs, emits captions as bare strings, gives `checked`
// as "true", nests a single child object where an array belongs, or splits a
// blockquote into `children`. Each of these fails the strict schema and —
// after one failed repair — loses the whole page to the heuristic fallback
// (which can't produce callouts, task lists, figures or blockquotes at all).
//
// This step coerces well-meaning drift into the canonical shape BEFORE
// validation. It only ever drops unknown keys or re-shapes existing content —
// it never invents text.

import type { InlineRun } from './doc-model';

const BOOL_RUN_KEYS = [
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'highlight',
  'subscript',
  'superscript',
] as const;

/** Keys the strict schema allows per block type — everything else is dropped. */
const BLOCK_KEYS: Record<string, readonly string[]> = {
  heading: ['type', 'level', 'runs'],
  paragraph: ['type', 'runs'],
  callout: ['type', 'variant', 'children'],
  bulletList: ['type', 'items'],
  orderedList: ['type', 'items'],
  taskList: ['type', 'items'],
  table: ['type', 'rows', 'headerRow'],
  codeBlock: ['type', 'lang', 'code'],
  blockquote: ['type', 'runs'],
  image: ['type', 'ref', 'bbox', 'caption'],
  math: ['type', 'latex', 'display', 'caption'],
  horizontalRule: ['type'],
};

/** Model-favoured admonition labels mapped onto the schema's variant enum. */
const CALLOUT_VARIANT_SYNONYMS: Record<string, string> = {
  error: 'danger',
  critical: 'danger',
  caution: 'warning',
  warn: 'warning',
  important: 'note',
  hint: 'tip',
  done: 'success',
  check: 'success',
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whitelist a run object to the strict schema's keys, dropping stray ones
 *  (e.g. a `type:"text"` the model adds) and type-mismatched flags. */
function cleanRun(obj: Record<string, unknown>): InlineRun {
  const run: InlineRun = { text: typeof obj.text === 'string' ? obj.text : '' };
  for (const key of BOOL_RUN_KEYS) {
    if (typeof obj[key] === 'boolean') run[key] = obj[key] as boolean;
  }
  if (typeof obj.link === 'string') run.link = obj.link;
  return run;
}

/** Recursively flatten any cell/inline shape into a flat list of inline runs. */
function collectRuns(node: unknown, out: InlineRun[]): void {
  if (node == null) return;
  if (typeof node === 'string') {
    if (node.length > 0) out.push({ text: node });
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectRuns(child, out);
    return;
  }
  if (isObject(node)) {
    if (Array.isArray(node.runs)) {
      collectRuns(node.runs, out);
      return;
    }
    if (Array.isArray(node.content)) {
      collectRuns(node.content, out);
      return;
    }
    if (typeof node.text === 'string') {
      out.push(cleanRun(node));
      return;
    }
  }
  // Unknown shape → drop it (the strict schema would have rejected it anyway).
}

/** Coerce one table cell of any drifted shape into a bare `InlineRun[]`. */
export function normalizeTableCell(cell: unknown): InlineRun[] {
  const runs: InlineRun[] = [];
  collectRuns(cell, runs);
  return runs;
}

/** Re-derive a block's `runs` from whatever inline shape it carries. */
function normalizeRunsKey(block: Record<string, unknown>): void {
  const runs: InlineRun[] = [];
  if ('runs' in block) collectRuns(block.runs, runs);
  else if ('content' in block) collectRuns(block.content, runs);
  else if (typeof block.text === 'string') collectRuns(block.text, runs);
  block.runs = runs;
}

/** Coerce a drifted caption (bare string, wrapped object) to `InlineRun[]`,
 *  or remove the key entirely when nothing usable remains. */
function normalizeCaption(block: Record<string, unknown>): void {
  if (!('caption' in block)) return;
  const runs: InlineRun[] = [];
  collectRuns(block.caption, runs);
  if (runs.length > 0) block.caption = runs;
  else delete block.caption;
}

/** Truthiness coercion for `checked` drift: "true", "yes", 1, "x"… */
function coerceChecked(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    return ['true', 'yes', 'checked', 'done', 'x', '1'].includes(value.toLowerCase());
  }
  return undefined;
}

const LIST_TYPES = new Set(['bulletList', 'orderedList', 'taskList']);

/** Coerce one list item of any drifted shape into `{ runs, checked?, children? }`. */
function normalizeListItem(item: unknown): Record<string, unknown> {
  if (typeof item === 'string') {
    return { runs: item.length > 0 ? [{ text: item }] : [] };
  }
  if (!isObject(item)) return { runs: [] };

  const out: Record<string, unknown> = {};
  const runs: InlineRun[] = [];
  if ('runs' in item) collectRuns(item.runs, runs);
  else if ('content' in item) collectRuns(item.content, runs);
  else if (typeof item.text === 'string') collectRuns(item, runs);
  out.runs = runs;

  const checked = coerceChecked(item.checked);
  if (checked !== undefined) out.checked = checked;

  let children: unknown = item.children;
  if (isObject(children)) children = [children];
  if (Array.isArray(children)) {
    const lists = children.filter(
      (c): c is Record<string, unknown> => isObject(c) && LIST_TYPES.has(String(c.type)),
    );
    for (const list of lists) normalizeListBlock(list);
    if (lists.length > 0) out.children = lists;
  }
  return out;
}

/** Coerce a bullet/ordered/task list block in place. */
function normalizeListBlock(block: Record<string, unknown>): void {
  let items: unknown = block.items;
  if (isObject(items) && Array.isArray((items as Record<string, unknown>).items)) {
    items = (items as Record<string, unknown>).items;
  }
  block.items = Array.isArray(items) ? items.map(normalizeListItem) : [];
}

/** Coerce a callout block in place: variant synonyms + child blocks. */
function normalizeCalloutBlock(block: Record<string, unknown>): void {
  if (typeof block.variant === 'string') {
    const lower = block.variant.toLowerCase();
    block.variant = CALLOUT_VARIANT_SYNONYMS[lower] ?? lower;
  }

  let children: unknown = block.children;
  if (isObject(children)) children = [children];
  if (!Array.isArray(children)) {
    block.children = [];
    return;
  }
  const normalized: Record<string, unknown>[] = [];
  for (const child of children) {
    if (typeof child === 'string') {
      if (child.length > 0) normalized.push({ type: 'paragraph', runs: [{ text: child }] });
      continue;
    }
    if (!isObject(child)) continue;
    if (LIST_TYPES.has(String(child.type))) {
      normalizeListBlock(child);
      stripStrayKeys(child);
      normalized.push(child);
      continue;
    }
    // The schema only allows paragraphs and lists inside a callout. A heading
    // or blockquote the model put there is demoted to a paragraph so its text
    // survives; anything without inline content is dropped.
    const runs: InlineRun[] = [];
    collectRuns(child, runs);
    if (runs.length > 0) normalized.push({ type: 'paragraph', runs });
  }
  block.children = normalized;
}

/** Coerce a heading block in place: numeric-string levels, clamped to 1–3. */
function normalizeHeadingBlock(block: Record<string, unknown>): void {
  normalizeRunsKey(block);
  const level = Number(block.level);
  block.level = Number.isFinite(level) ? Math.min(3, Math.max(1, Math.round(level))) : 2;
}

/** Coerce a math block in place: `$`-wrapped latex, drifted display flag. */
function normalizeMathBlock(block: Record<string, unknown>): void {
  const latex = typeof block.latex === 'string' ? block.latex : '';
  block.latex = latex.trim().replace(/^\$+/, '').replace(/\$+$/, '').trim();
  if (typeof block.display !== 'boolean') {
    if (typeof block.display === 'string') {
      block.display = ['true', 'block', 'display', 'yes'].includes(block.display.toLowerCase());
    } else {
      block.display = true;
    }
  }
  normalizeCaption(block);
}

/** Coerce an image block in place: numeric-string bbox values, percent-scale
 *  (0–100) values rescaled to fractions, an `[x, y, w, h]`-style bbox
 *  reinterpreted as corners, + caption. Pixel-scale values (>100) are left
 *  untouched — only the crop stage knows the page dimensions to divide by. */
function normalizeImageBlock(block: Record<string, unknown>): void {
  if (Array.isArray(block.bbox)) {
    let bbox = block.bbox.slice(0, 4).map((v) => Number(v));
    if (bbox.length === 4 && bbox.every((v) => Number.isFinite(v))) {
      // Percent-scale drift: the contract is 0–1 fractions, so any value
      // above 1 (but within 100) means the model thought in percent.
      if (bbox.some((v) => v > 1) && bbox.every((v) => v <= 100)) {
        bbox = bbox.map((v) => v / 100);
      }
      if (bbox.every((v) => v <= 1.2)) {
        const [x0, y0] = bbox;
        let [, , x1, y1] = bbox;
        // Degenerate when read as corners but plausible as width/height →
        // the model emitted [x, y, w, h]; convert to [x0, y0, x1, y1].
        if ((x1 <= x0 || y1 <= y0) && x1 > 0 && y1 > 0 && x0 + x1 <= 1.2 && y0 + y1 <= 1.2) {
          x1 = x0 + x1;
          y1 = y0 + y1;
        }
        bbox = [x0, y0, x1, y1].map((v) => Math.min(1, Math.max(0, v)));
      }
      // Pixel-scale values (>100) fall through unclamped for the crop stage.
    }
    block.bbox = bbox;
  }
  if (typeof block.ref === 'number') block.ref = String(block.ref);
  normalizeCaption(block);
}

/** Coerce a code block in place: missing lang → null, content-derived code. */
function normalizeCodeBlock(block: Record<string, unknown>): void {
  if (block.lang === undefined) block.lang = null;
  if (typeof block.code !== 'string') {
    const runs: InlineRun[] = [];
    collectRuns(block.code ?? block.content, runs);
    block.code = runs.map((run) => run.text).join('\n');
  }
}

/** Drop keys the strict schema would reject for this block type. */
function stripStrayKeys(block: Record<string, unknown>): void {
  const allowed = BLOCK_KEYS[String(block.type)];
  if (!allowed) return;
  for (const key of Object.keys(block)) {
    if (!allowed.includes(key)) delete block[key];
  }
}

/** Coerce a single `table` block in place: rows → cells → bare run arrays, and
 *  a defaulted `headerRow` when the model omitted it. */
function normalizeTableBlock(block: Record<string, unknown>): void {
  let rows: unknown = block.rows;
  // Some outputs wrap rows under {rows:{rows:[…]}} or give a single row object.
  if (isObject(rows) && Array.isArray((rows as Record<string, unknown>).rows)) {
    rows = (rows as Record<string, unknown>).rows;
  }
  if (!Array.isArray(rows)) {
    block.rows = [];
    if (typeof block.headerRow !== 'boolean') block.headerRow = false;
    return;
  }

  block.rows = rows.map((row) => {
    let cells: unknown = row;
    if (isObject(row) && Array.isArray((row as Record<string, unknown>).cells)) {
      cells = (row as Record<string, unknown>).cells;
    }
    if (!Array.isArray(cells)) {
      // A whole row given as a single value → treat it as one cell.
      return [normalizeTableCell(cells)];
    }
    return cells.map(normalizeTableCell);
  });

  if (typeof block.headerRow !== 'boolean') {
    // Most extracted tables lead with a header; default true only for multi-row
    // tables so a single-row table isn't mislabeled.
    block.headerRow = (block.rows as unknown[]).length > 1;
  }
}

/**
 * Normalize one block, returning zero or more replacement blocks. Most blocks
 * normalize in place and return themselves; a blockquote the model split into
 * `children`/`paragraphs` expands into one blockquote per line (the assembler
 * merges consecutive blockquotes back into a single quote box).
 */
function normalizeBlock(block: unknown): Record<string, unknown>[] {
  if (typeof block === 'string') {
    return block.trim().length > 0 ? [{ type: 'paragraph', runs: [{ text: block }] }] : [];
  }
  if (!isObject(block)) return [];

  switch (block.type) {
    case 'table':
      normalizeTableBlock(block);
      break;
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      normalizeListBlock(block);
      break;
    case 'heading':
      normalizeHeadingBlock(block);
      break;
    case 'paragraph':
      normalizeRunsKey(block);
      break;
    case 'callout':
      normalizeCalloutBlock(block);
      break;
    case 'blockquote': {
      const lines: unknown = Array.isArray(block.children)
        ? block.children
        : Array.isArray((block as Record<string, unknown>).paragraphs)
          ? (block as Record<string, unknown>).paragraphs
          : null;
      if (Array.isArray(lines)) {
        const quotes = lines
          .map((line) => {
            const runs: InlineRun[] = [];
            collectRuns(line, runs);
            return { type: 'blockquote', runs };
          })
          .filter((quote) => quote.runs.length > 0);
        if (quotes.length > 0) return quotes;
      }
      normalizeRunsKey(block);
      break;
    }
    case 'image':
      normalizeImageBlock(block);
      break;
    case 'math':
      normalizeMathBlock(block);
      break;
    case 'codeBlock':
      normalizeCodeBlock(block);
      break;
  }
  stripStrayKeys(block);
  return [block];
}

/**
 * Normalize drifted shapes in a parsed DocModel (or bare block array) BEFORE
 * Zod validation. Re-shapes blocks (and may expand one block into several),
 * then returns the normalized value: the same wrapper object with its `blocks`
 * replaced, or a new array when a bare array was passed.
 */
export function normalizeDocModelShape(raw: unknown): unknown {
  if (Array.isArray(raw)) {
    return raw.flatMap(normalizeBlock);
  }
  if (isObject(raw) && Array.isArray(raw.blocks)) {
    raw.blocks = raw.blocks.flatMap(normalizeBlock);
    return raw;
  }
  return raw;
}
