'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Render each page of a PDF to a PNG Blob in the browser using
 * pdfjs-dist. Page images are what the PDF importer feeds into the
 * notebook so the user gets pixel-accurate copies that can be
 * annotated with the existing pen / highlight / callout tools.
 *
 * We keep the scale moderate (2×) — high enough that body text is
 * readable after re-rendering in the editor, low enough that each
 * page stays under ~1–2 MB as PNG.
 */

export interface RenderedPdfPage {
  blob: Blob;
  width: number;
  height: number;
  pageNumber: number;
}

interface RenderOptions {
  scale?: number;
  onProgress?: (info: { current: number; total: number }) => void;
}

let pdfjsLibPromise: Promise<any> | null = null;

async function loadPdfjs(): Promise<any> {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = (async () => {
      // Legacy build works in all modern browsers and matches the
      // worker we copy into /public at next.config.ts load time.
      const lib: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
      lib.GlobalWorkerOptions.workerSrc = '/pdfjs-worker.mjs';
      return lib;
    })();
  }
  return pdfjsLibPromise;
}

export async function renderPdfToPngs(
  file: File,
  options: RenderOptions = {}
): Promise<RenderedPdfPage[]> {
  const scale = options.scale ?? 2;
  const pdfjsLib = await loadPdfjs();

  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    disableFontFace: false,
    isEvalSupported: false,
  }).promise;

  const results: RenderedPdfPage[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not acquire 2D canvas context');

      // Fill background — PDFs have transparent backgrounds and text
      // rendered directly onto a transparent canvas reads black-on-black
      // in dark-themed editors.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport }).promise;

      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('canvas.toBlob returned null'));
        }, 'image/png');
      });

      results.push({
        blob,
        width: canvas.width,
        height: canvas.height,
        pageNumber,
      });
      options.onProgress?.({ current: pageNumber, total: doc.numPages });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  return results;
}
