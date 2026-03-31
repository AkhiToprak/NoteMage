import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  switch (mimeType) {
    case 'application/pdf': {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      await parser.destroy();
      return result.text;
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
