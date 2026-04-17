import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

/* eslint-disable @typescript-eslint/no-explicit-any */

let workerConfigured = false;

/**
 * Load pdfjs-dist with an explicit worker path. On Vercel serverless,
 * pdfjs's internal dynamic import() of pdf.worker.mjs fails ("Setting up
 * fake worker failed") because the worker file is not traced into the
 * lambda bundle. We resolve the worker from our own pdfjs-dist install
 * and hand pdfjs an absolute file:// URL, which also forces Next's
 * file tracing (via @vercel/nft) to include the worker module.
 */
async function getPdfjs(): Promise<any> {
  const pdfjsLib: any = await import('pdfjs-dist/legacy/build/pdf.mjs');

  if (!workerConfigured) {
    try {
      const req = createRequire(import.meta.url);
      const workerPath = req.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
      pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
    } catch {
      // If resolution fails the dynamic-import fallback will run; log only.
    }
    workerConfigured = true;
  }

  return pdfjsLib;
}

/**
 * Extract plain text from a PDF buffer using pdfjs-dist directly.
 * Preserves paragraph-ish structure by inserting blank lines between
 * pages and respecting pdfjs's `hasEOL` hint between text runs.
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
      if (item.hasEOL) {
        pageText += '\n';
      } else {
        pageText += ' ';
      }
    }

    // Collapse runs of spaces and trim each line
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
 * Re-export the already-loaded pdfjs module so other helpers (e.g.
 * image extractor) share the same worker setup.
 */
export async function loadPdfjs(): Promise<any> {
  return getPdfjs();
}
