import JSZip from 'jszip';
import Database from 'better-sqlite3';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync, unlinkSync } from 'fs';
import { randomUUID } from 'crypto';

export interface AnkiCard {
  question: string;
  answer: string;
}

const MAX_DB_SIZE = 100 * 1024 * 1024; // 100MB decompressed database limit
const ALLOWED_DB_NAMES = ['collection.anki2', 'collection.anki21'];

export async function parseAnkiFile(buffer: Buffer): Promise<AnkiCard[]> {
  // Validate ZIP magic bytes (PK signature)
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
    throw new Error('Invalid file: not a valid .apkg archive');
  }

  const zip = await JSZip.loadAsync(buffer);

  // Validate ZIP entries: reject any with path traversal or suspicious paths
  for (const entryPath of Object.keys(zip.files)) {
    if (entryPath.includes('..') || entryPath.startsWith('/') || entryPath.startsWith('\\') || entryPath.includes('\0')) {
      throw new Error('Invalid .apkg file: contains unsafe file paths');
    }
  }

  // Find the SQLite database file (collection.anki2 or collection.anki21)
  const dbFile = zip.file(ALLOWED_DB_NAMES[0]) || zip.file(ALLOWED_DB_NAMES[1]);
  if (!dbFile) throw new Error('Invalid .apkg file: no database found');

  const dbBuffer = await dbFile.async('nodebuffer');

  if (dbBuffer.length > MAX_DB_SIZE) {
    throw new Error('Anki database too large (exceeds 100MB decompressed)');
  }

  // Write to temp file (better-sqlite3 needs a file path)
  const tmpPath = join(tmpdir(), `anki-${randomUUID()}.db`);
  writeFileSync(tmpPath, dbBuffer);

  try {
    const db = new Database(tmpPath, { readonly: true });
    const rows = db.prepare('SELECT flds FROM notes LIMIT 10000').all() as { flds: string }[];
    db.close();

    return rows
      .map((row) => {
        const fields = row.flds.split('\x1f');
        return {
          question: stripHtml(fields[0] || ''),
          answer: stripHtml(fields[1] || ''),
        };
      })
      .filter((card) => card.question.trim() && card.answer.trim());
  } finally {
    unlinkSync(tmpPath);
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}
