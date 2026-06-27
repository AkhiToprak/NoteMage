'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

/* Client-side capped-text extraction for the anonymous onboarding preview (P1).
 *
 * The point: get a SMALL text slice off the user's material in the browser so a
 * preview can be generated pre-sign-up, while the heavy bytes never leave the
 * device (they go to IndexedDB via onboarding-file-store.ts and are uploaded
 * only after auth). For PDFs we read the text layer of the first few pages with
 * pdfjs — dynamically imported so the heavy lib stays out of the landing bundle
 * and loads only once a file is actually dropped. Plain-text files are read
 * directly; anything else (docx/pptx/images, or a scanned PDF with no text
 * layer) yields '' so the caller falls back to the sample/demo path. */

import {
  PREVIEW_CORPUS_CHARS,
  PREVIEW_PDF_MAX_PAGES,
  NOTES_MAX_CHARS,
  capAtBoundary,
  type CappedCorpus,
} from './onboarding-preview-constants';

let pdfjsLibPromise: Promise<any> | null = null;

async function loadPdfjs(): Promise<any> {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = (async () => {
      // Legacy build works in all modern browsers and matches the worker copied
      // into /public/pdfjs-worker.mjs at next.config.ts load time (same-origin,
      // so it satisfies the `worker-src 'self'` CSP). Identical to the loader in
      // pdf-client-render.ts — keep them in sync if the worker path ever moves.
      const lib: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
      lib.GlobalWorkerOptions.workerSrc = '/pdfjs-worker.mjs';
      return lib;
    })();
  }
  return pdfjsLibPromise;
}

/** Filename → readable title: drop the extension, de-snake/kebab, trim. */
function filenameTitle(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return base || name;
}

async function extractPdf(file: File): Promise<{ text: string; title: string }> {
  const pdfjsLib = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
  }).promise;
  try {
    const meta = await doc.getMetadata().catch(() => null);
    const metaTitle =
      typeof meta?.info?.Title === 'string' ? meta.info.Title.trim() : '';

    const pageCount = Math.min(doc.numPages, PREVIEW_PDF_MAX_PAGES);
    const parts: string[] = [];
    let chars = 0;
    for (let p = 1; p <= pageCount && chars < PREVIEW_CORPUS_CHARS; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const pageText = (content.items as any[])
        .map((it) => (typeof it?.str === 'string' ? it.str : ''))
        .join(' ')
        .replace(/[ \t]{2,}/g, ' ');
      parts.push(pageText);
      chars += pageText.length;
      page.cleanup();
    }
    return { text: parts.join('\n\n'), title: metaTitle || filenameTitle(file.name) };
  } finally {
    await doc.destroy();
  }
}

const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|rtf|html?|json|tex)$/i;

/**
 * Extract a capped, boundary-trimmed text slice from a picked file. Returns an
 * empty `text` (never throws) when the file has no readable text layer — the
 * onboarding funnel treats that as "fall back to the sample path".
 */
export async function extractCappedCorpus(file: File): Promise<CappedCorpus> {
  const title = filenameTitle(file.name);
  try {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    let raw = '';
    let resolvedTitle = title;

    if (isPdf) {
      const r = await extractPdf(file);
      raw = r.text;
      resolvedTitle = r.title;
    } else if (file.type.startsWith('text/') || TEXT_EXT.test(file.name)) {
      raw = await file.text();
    } else {
      // docx / pptx / images / etc. have no browser-readable text layer. The
      // full importer handles them post-auth; the preview falls back to sample.
      return { text: '', title, rawChars: 0, truncated: false };
    }

    const rawChars = raw.length;
    const text = capAtBoundary(raw, PREVIEW_CORPUS_CHARS);
    return { text, title: resolvedTitle, rawChars, truncated: rawChars > text.length };
  } catch (err) {
    console.error('[onboarding-corpus] extraction failed:', err);
    return { text: '', title, rawChars: 0, truncated: false };
  }
}

/**
 * Notes path: pasted text capped the same way as a file (no extraction). The
 * raw paste is bounded first so an enormous paste can't blow up the request.
 */
export function capCorpusText(text: string, title = 'Your notes'): CappedCorpus {
  const raw = (text ?? '').slice(0, NOTES_MAX_CHARS);
  const capped = capAtBoundary(raw, PREVIEW_CORPUS_CHARS);
  return {
    text: capped,
    title: title.trim() || 'Your notes',
    rawChars: (text ?? '').length,
    truncated: (text ?? '').length > capped.length,
  };
}
