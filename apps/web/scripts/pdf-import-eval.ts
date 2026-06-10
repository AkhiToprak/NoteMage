/**
 * P7 PDF-import eval harness — the Gemini quality gate.
 *
 *   pnpm --filter web pdf-import:eval
 *
 * Runs every golden-corpus fixture through the real import pipeline —
 * ground-truth extraction → structure engine → assembler — and writes the
 * resulting Tiptap JSON to `src/lib/pdf-import/__eval_output__/` for human
 * review, then prints a summary table.
 *
 * Engine selection:
 *   - GEMINI_API_KEY set  → the live Gemini structure engine runs; each
 *     page is rendered to a PNG and described by the model. A per-page
 *     engine failure falls back to the deterministic heuristic (as in
 *     production) and is counted in the `fallback` column.
 *   - GEMINI_API_KEY unset → the deterministic heuristic stands in for the
 *     engine on every page. The harness still runs end to end, but the
 *     output reflects geometry only (no inline marks, callouts, figures).
 *
 * ENGINE — DECIDED: single-engine Gemini for every tier. The conditional
 * Claude second engine from the rebuild plan has been dropped (product
 * decision — PDF import stays Gemini-only). This harness is therefore a
 * quality check, not an engine-count gate: run it with GEMINI_API_KEY set
 * and eyeball `__eval_output__/` for the hard fixtures — scanned,
 * table-heavy, callout-heavy, multi-column. If Gemini falls short there the
 * lever is prompt or model tuning, not a second engine. The corpus is
 * synthetic (see scripts/pdf-import-fixtures.ts) — weigh that when judging
 * the scanned and complex-layout results.
 *
 * Env:
 *   GEMINI_API_KEY        enables the live engine
 *   GEMINI_PDF_MODEL      overrides the Gemini model id
 *   PDF_EVAL_MAX_PAGES    pages per fixture sent to the live engine (default 25);
 *                         the heuristic path always processes every page
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
import { assembleTiptap } from '../src/lib/pdf-import/assemble';
import type { DocModelBlock } from '../src/lib/pdf-import/doc-model';
import { geminiEngine } from '../src/lib/pdf-import/engine-gemini';
import {
  extractGroundTruth,
  type GroundTruthPage,
} from '../src/lib/pdf-import/ground-truth';
import { groundTruthToBlocks } from '../src/lib/pdf-import/heuristic-fallback';

const FIXTURE_DIR = fileURLToPath(
  new URL('../src/lib/pdf-import/__fixtures__/', import.meta.url),
);
const OUTPUT_DIR = fileURLToPath(
  new URL('../src/lib/pdf-import/__eval_output__/', import.meta.url),
);

/** The whole golden corpus, in a stable display order. */
const FIXTURES = [
  'clean-text.pdf',
  'multi-column.pdf',
  'callout-heavy.pdf',
  'table-heavy.pdf',
  'image-heavy.pdf',
  'scanned.pdf',
  'german.pdf',
  'giant-200p.pdf',
  'encrypted.pdf',
  'corrupt.pdf',
];

const USE_GEMINI = !!process.env.GEMINI_API_KEY;
const MAX_GEMINI_PAGES = Number(process.env.PDF_EVAL_MAX_PAGES) || 25;

// --- Node-side PDF → PNG rendering -----------------------------------------
// The production worker feeds the engine page PNGs rendered in the browser
// (`pdf-client-render.ts`). This harness runs in Node, so it renders the
// pages itself with pdfjs + @napi-rs/canvas — the same recipe, server-side.

/* eslint-disable @typescript-eslint/no-explicit-any */
const globalAny = globalThis as any;
globalAny.DOMMatrix ??= DOMMatrix;
globalAny.ImageData ??= ImageData;
globalAny.Path2D ??= Path2D;

const standardFontDataUrl = pathToFileURL(
  join(dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')), 'standard_fonts/'),
).href;

/** pdfjs needs a canvas factory in Node — the DOM one is unavailable. */
class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(Math.ceil(width) || 1, Math.ceil(height) || 1);
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(cc: any, width: number, height: number) {
    cc.canvas.width = Math.ceil(width) || 1;
    cc.canvas.height = Math.ceil(height) || 1;
  }
  destroy(cc: any) {
    cc.canvas.width = 0;
    cc.canvas.height = 0;
  }
}

/** Render the first `maxPages` pages of a PDF to PNG buffers, scale 2. */
async function renderPdfToPngs(buffer: Buffer, maxPages: number): Promise<Buffer[]> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl,
    isEvalSupported: false,
    verbosity: 0,
    canvasFactory: new NodeCanvasFactory(),
  }).promise;

  const pngs: Buffer[] = [];
  try {
    const count = Math.min(doc.numPages, maxPages);
    for (let n = 1; n <= count; n += 1) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      pngs.push(canvas.toBuffer('image/png'));
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return pngs;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// --- pipeline ---------------------------------------------------------------

/** One ground-truth page → its verbatim text (mirrors the import worker). */
function pageLinesToText(page: GroundTruthPage): string {
  return page.lines
    .map((line) => line.cells.map((cell) => cell.text).join(' ').trim())
    .filter((text) => text.length > 0)
    .join('\n');
}

interface EvalRow {
  fixture: string;
  mode: string;
  status: string;
  pages: string;
  blocks: number;
  truncated: boolean;
  fallback: number;
}

/** Run one fixture all the way through and write its Tiptap JSON. */
async function evalFixture(name: string): Promise<EvalRow> {
  const buffer = readFileSync(join(FIXTURE_DIR, name));
  const row: EvalRow = {
    fixture: name,
    mode: USE_GEMINI ? 'gemini' : 'heuristic',
    status: 'ok',
    pages: '0',
    blocks: 0,
    truncated: false,
    fallback: 0,
  };

  // Ground truth — a throw means an unreadable / corrupt PDF.
  let ground;
  try {
    ground = await extractGroundTruth(buffer);
  } catch (err) {
    row.status = 'unreadable';
    row.mode = '—';
    console.error(`  ${name}: ${err instanceof Error ? err.message : String(err)}`);
    return row;
  }
  if (ground.encrypted) {
    row.status = 'encrypted';
    row.mode = '—';
    return row;
  }
  if (ground.pageCount === 0) {
    row.status = 'empty';
    row.mode = '—';
    return row;
  }

  // The live engine is page-bounded for cost; the heuristic is free, so it
  // processes every page (this keeps giant-200p's truncation column honest).
  const pageCount = USE_GEMINI
    ? Math.min(ground.pageCount, MAX_GEMINI_PAGES)
    : ground.pageCount;
  row.pages =
    pageCount < ground.pageCount ? `${pageCount}/${ground.pageCount}` : String(pageCount);

  let pageImages: Buffer[] = [];
  if (USE_GEMINI) {
    try {
      pageImages = await renderPdfToPngs(buffer, pageCount);
    } catch (err) {
      console.error(`  ${name}: page render failed, using heuristic —`, err);
    }
  }

  const blocks: DocModelBlock[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    const gtPage = ground.pages[i];
    const image = pageImages[i];
    if (USE_GEMINI && image) {
      try {
        const described = await geminiEngine.describePage({
          pageImageBase64: image.toString('base64'),
          mimeType: 'image/png',
          groundTruthText: pageLinesToText(gtPage),
          isScanned: !ground.hasTextLayer,
          pageNumber: gtPage.pageNumber,
        });
        blocks.push(...described);
      } catch (err) {
        row.fallback += 1;
        blocks.push(...groundTruthToBlocks(gtPage));
        console.error(
          `  ${name} page ${i + 1}: engine fell back to heuristic —`,
          err instanceof Error ? err.message : String(err),
        );
      }
    } else {
      if (USE_GEMINI) row.fallback += 1; // no image → heuristic
      blocks.push(...groundTruthToBlocks(gtPage));
    }
  }

  const { doc, truncated } = assembleTiptap({ blocks });
  row.blocks = blocks.length;
  row.truncated = truncated;

  writeFileSync(
    join(OUTPUT_DIR, `${name}.json`),
    JSON.stringify(doc, null, 2),
    'utf8',
  );
  return row;
}

/** Render the summary as a fixed-width table. */
function printSummary(rows: EvalRow[]): void {
  const head = ['Fixture', 'Mode', 'Status', 'Pages', 'Blocks', 'Truncated', 'Fallback'];
  const data = rows.map((r) => [
    r.fixture,
    r.mode,
    r.status,
    r.pages,
    String(r.blocks),
    r.truncated ? 'yes' : 'no',
    String(r.fallback),
  ]);
  const widths = head.map((h, c) =>
    Math.max(h.length, ...data.map((d) => d[c].length)),
  );
  const line = (cells: string[]): string =>
    cells.map((cell, c) => cell.padEnd(widths[c])).join('  ');

  console.log('');
  console.log(line(head));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const d of data) console.log(line(d));
}

async function main(): Promise<void> {
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(
    USE_GEMINI
      ? `Engine: live Gemini (model ${process.env.GEMINI_PDF_MODEL ?? 'gemini-2.5-flash-lite'}), up to ${MAX_GEMINI_PAGES} pages/fixture`
      : 'Engine: heuristic fallback (set GEMINI_API_KEY to run the live structure engine)',
  );

  const rows: EvalRow[] = [];
  for (const name of FIXTURES) {
    console.log(`Processing ${name}…`);
    rows.push(await evalFixture(name));
  }

  printSummary(rows);
  console.log(`\nTiptap JSON written to ${OUTPUT_DIR}`);
  if (!USE_GEMINI) {
    console.log(
      'NOTE: heuristic-only run. Re-run with GEMINI_API_KEY set to evaluate\n' +
        '      the live Gemini structure engine.',
    );
  }
}

main().catch((err) => {
  console.error('eval harness failed:', err);
  process.exit(1);
});
