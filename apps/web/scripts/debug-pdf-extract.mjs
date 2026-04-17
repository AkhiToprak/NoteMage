#!/usr/bin/env node
// Debug helper: dump pdfjs line structure for a given PDF so we can
// tune the table-detection heuristics. Usage:
//   node scripts/debug-pdf-extract.mjs /path/to/file.pdf
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

const pdfPath = process.argv[2];
if (!pdfPath) {
  console.error('Usage: node scripts/debug-pdf-extract.mjs <pdf-path>');
  process.exit(1);
}

const buffer = fs.readFileSync(pdfPath);
const doc = await pdfjsLib.getDocument({
  data: new Uint8Array(buffer),
  disableFontFace: true,
  isEvalSupported: false,
  useSystemFonts: false,
}).promise;

for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const content = await page.getTextContent();
  const items = content.items.filter((it) => typeof it.str === 'string');

  console.log(`\n===== PAGE ${p} (${items.length} items) =====`);
  // Group by rounded y
  const lineMap = new Map();
  for (const it of items) {
    const y = Math.round(it.transform[5]);
    // fuzzy match within ±2
    let key = null;
    for (const k of lineMap.keys()) if (Math.abs(k - y) <= 2) { key = k; break; }
    if (key === null) key = y;
    const arr = lineMap.get(key) || [];
    arr.push(it);
    lineMap.set(key, arr);
  }
  const sorted = Array.from(lineMap.entries()).sort((a, b) => b[0] - a[0]);
  for (const [y, lineItems] of sorted) {
    lineItems.sort((a, b) => a.transform[4] - b.transform[4]);
    const parts = lineItems.map((it) => {
      const x = it.transform[4].toFixed(0);
      const w = (it.width ?? 0).toFixed(0);
      return `[x=${x} w=${w} "${it.str}"]`;
    });
    console.log(`y=${Math.round(y)} :: ${parts.join(' ')}`);
  }
  page.cleanup();
}
await doc.destroy();
