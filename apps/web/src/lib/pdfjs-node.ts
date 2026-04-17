import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Absolute URL of the bundled pdfjs worker file. The worker is copied
 * into src/lib/vendor/pdfjs-worker.mjs by the `prebuild` script — a
 * `new URL(..., import.meta.url)` reference is the one pattern that
 * @vercel/nft reliably treats as a static asset dependency, which gets
 * the file shipped into the serverless output.
 *
 * On Vercel the resolved file path lives inside /var/task but may not
 * be a valid ESM specifier (pdfjs does a dynamic import on it). We
 * therefore copy the content to a stable /tmp path on first use and
 * point GlobalWorkerOptions.workerSrc at the file:// URL of that copy.
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

/**
 * Extract plain text from a PDF buffer. Preserves basic paragraph
 * structure by grouping page text and respecting pdfjs `hasEOL`
 * hints between text runs.
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

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    let pageText = '';
    for (const item of content.items as any[]) {
      if (typeof item.str !== 'string') continue;
      pageText += item.str;
      pageText += item.hasEOL ? '\n' : ' ';
    }

    const cleaned = pageText
      .split('\n')
      .map((line) => line.replace(/ +/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (cleaned) pages.push(cleaned);

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
