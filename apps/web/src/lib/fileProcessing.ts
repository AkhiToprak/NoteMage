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

export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  switch (mimeType) {
    case 'application/pdf': {
      // Direct pdfjs-dist path. We control the worker setup ourselves so we
      // avoid pdf-parse's internal nested pdfjs-dist (different version,
      // worker file not traced into the serverless bundle).
      return extractPdfText(buffer);
    }
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case 'text/plain':
    case 'text/markdown':
      return buffer.toString('utf-8');
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.ms-excel': {
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
