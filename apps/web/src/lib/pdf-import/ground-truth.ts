import { buildLines, type Line, type PdfTextItem } from './pdfjs-geometry';
import { loadPdfjs } from '@/lib/pdfjs-node';

/**
 * One PDF page's verbatim text geometry. `lines` are top-down visual
 * lines (see `pdfjs-geometry.ts`); `width` and `height` are the page's
 * dimensions in PDF user units at scale 1, so a later stage can map a
 * line's `y` back to a page region (header, footer, body).
 */
export interface GroundTruthPage {
  /** 1-based page number. */
  pageNumber: number;
  width: number;
  height: number;
  lines: Line[];
}

/**
 * The verbatim text layer of a whole PDF, plus the two facts the import
 * pipeline branches on: whether the file is password-protected, and
 * whether it carries an extractable text layer at all. A scanned PDF
 * has no text layer — the structure engine must transcribe from the
 * rendered page image instead.
 */
export interface GroundTruth {
  pageCount: number;
  encrypted: boolean;
  hasTextLayer: boolean;
  pages: GroundTruthPage[];
}

/**
 * A PDF whose pages average fewer non-whitespace text items than this is
 * treated as scanned. A genuine digital PDF yields dozens-to-hundreds of
 * items per page; a scanned image page yields close to zero.
 */
const SCANNED_AVG_TEXT_ITEMS_THRESHOLD = 5;

function isPasswordException(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: unknown }).name === 'PasswordException'
  );
}

/**
 * Extract the verbatim text-layer geometry of a PDF — no LLM, no
 * structure inference. This is the deterministic ground truth the
 * structure engine is anchored to.
 *
 * A password-protected PDF cannot be opened: pdfjs rejects with a
 * `PasswordException`, which is caught and reported as `encrypted: true`
 * with no pages (the caller fails the job with a friendly message). A
 * corrupt PDF rejects with a different error, which propagates to the
 * caller's try/catch.
 */
export async function extractGroundTruth(buffer: Buffer): Promise<GroundTruth> {
  const pdfjsLib = await loadPdfjs();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
  });

  let doc;
  try {
    doc = await loadingTask.promise;
  } catch (err) {
    if (isPasswordException(err)) {
      return { pageCount: 0, encrypted: true, hasTextLayer: false, pages: [] };
    }
    throw err;
  }

  try {
    const pageCount: number = doc.numPages;
    const pages: GroundTruthPage[] = [];
    let totalTextItems = 0;

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();

      const items = (content.items as PdfTextItem[]).filter(
        (item) => typeof item.str === 'string' && item.str.trim().length > 0,
      );
      totalTextItems += items.length;

      pages.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        lines: buildLines(items),
      });

      page.cleanup();
    }

    const avgTextItems = pageCount > 0 ? totalTextItems / pageCount : 0;
    const hasTextLayer = pageCount > 0 && avgTextItems >= SCANNED_AVG_TEXT_ITEMS_THRESHOLD;

    return { pageCount, encrypted: false, hasTextLayer, pages };
  } finally {
    await doc.destroy();
  }
}
