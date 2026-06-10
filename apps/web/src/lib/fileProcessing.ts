import mammoth from 'mammoth';
import { extractPdfText } from '@/lib/pdfjs-node';

// Polyfill DOMMatrix, Path2D, ImageData for serverless environments (Vercel Lambda)
// where @napi-rs/canvas native binaries are unavailable. pdfjs-dist requires these
// globals but only uses them for rendering — text extraction works without them.
if (typeof globalThis.DOMMatrix === 'undefined') {
  const stub = class {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(..._args: any[]) {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  globalThis.DOMMatrix = stub;
  globalThis.DOMPoint = globalThis.DOMPoint ?? stub;
  globalThis.DOMRect = globalThis.DOMRect ?? stub;
  globalThis.Path2D = globalThis.Path2D ?? stub;
  globalThis.ImageData = globalThis.ImageData ?? stub;
}

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

/**
 * Upper bound on the input buffer fed to OOXML parsers. Both `xlsx` (SheetJS)
 * and `mammoth` unzip and parse attacker-controlled archives in-process; the
 * pinned community `xlsx` build in particular has known unpatched
 * prototype-pollution / ReDoS advisories. Bounding the buffer caps the
 * decompression/parse work a single upload can trigger.
 *
 * TODO(security): migrate the spreadsheet path off the community `xlsx`
 * package to a patched SheetJS CDN build (or `exceljs`) and drop this as the
 * primary mitigation.
 */
const MAX_OOXML_BYTES = 25 * 1024 * 1024; // 25 MB

export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  switch (mimeType) {
    case 'application/pdf': {
      // Direct pdfjs-dist path. We control the worker setup ourselves so we
      // avoid pdf-parse's internal nested pdfjs-dist (different version,
      // worker file not traced into the serverless bundle).
      return extractPdfText(buffer);
    }
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      if (buffer.length > MAX_OOXML_BYTES) {
        throw new Error('Document is too large to process (max 25 MB)');
      }
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case 'text/plain':
    case 'text/markdown':
      return buffer.toString('utf-8');
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.ms-excel': {
      // Bound the input before handing it to SheetJS — see MAX_OOXML_BYTES.
      if (buffer.length > MAX_OOXML_BYTES) {
        throw new Error('Spreadsheet is too large to process (max 25 MB)');
      }
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      return workbook.SheetNames.map((name: string) => {
        const sheet = workbook.Sheets[name];
        return XLSX.utils.sheet_to_csv(sheet);
      }).join('\n\n');
    }
    default:
      throw new Error('Unsupported file type');
  }
}
