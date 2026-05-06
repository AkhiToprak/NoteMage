import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseAnkiFile } from '@/lib/anki-parser';
import { downloadFromStorage, validateStoragePath, deleteFile } from '@/lib/storage';
import {
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ id: string }> };

const MAX_CARDS = 20000;
const QUESTION_HEADERS = ['question', 'front', 'term'];
const ANSWER_HEADERS = ['answer', 'back', 'definition'];

/**
 * POST – import flashcard set from CSV, Excel, or Anki (.apkg)
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const { storagePath, fileName, title: titleOverride, sectionId } = await request.json();

    if (!storagePath) return badRequestResponse('storagePath is required');
    if (!validateStoragePath(storagePath, 'temp-imports/')) {
      return badRequestResponse('Invalid storage path');
    }

    const buffer = await downloadFromStorage(storagePath);

    const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';

    let cards: { question: string; answer: string }[] = [];
    let source = 'import';

    if (ext === 'apkg') {
      // Anki import
      cards = await parseAnkiFile(buffer);
      source = 'anki';
    } else if (['csv', 'xlsx', 'xls'].includes(ext)) {
      // CSV / Excel import via xlsx library
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) return badRequestResponse('File contains no sheets');

      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      if (rows.length === 0) return badRequestResponse('File contains no data');

      // Detect question/answer columns
      const headers = Object.keys(rows[0]);
      let qCol: string | null = null;
      let aCol: string | null = null;

      for (const h of headers) {
        const lower = h.toLowerCase().trim();
        if (!qCol && QUESTION_HEADERS.includes(lower)) qCol = h;
        if (!aCol && ANSWER_HEADERS.includes(lower)) aCol = h;
      }

      // Fallback: first two columns
      if (!qCol && headers.length >= 1) qCol = headers[0];
      if (!aCol && headers.length >= 2) aCol = headers[1];

      if (!qCol || !aCol)
        return badRequestResponse('Could not determine question and answer columns');

      cards = rows
        .map((row) => ({
          question: String(row[qCol!] ?? '').trim(),
          answer: String(row[aCol!] ?? '').trim(),
        }))
        .filter((c) => c.question && c.answer);
    } else {
      return badRequestResponse(
        `Unsupported file format: .${ext}. Use .csv, .xlsx, .xls, or .apkg`
      );
    }

    if (cards.length === 0) return badRequestResponse('No valid flashcards found in file');

    if (cards.length > MAX_CARDS) {
      return badRequestResponse(`Too many cards. Maximum is ${MAX_CARDS} per import.`);
    }

    // Derive title from filename if not provided
    const title = titleOverride?.trim() || (fileName || 'Imported Set').replace(/\.[^.]+$/, '');

    // Validate sectionId if provided
    if (sectionId) {
      const section = await db.section.findFirst({ where: { id: sectionId, notebookId } });
      if (!section) return badRequestResponse('Section not found in this notebook');
    }

    const set = await db.flashcardSet.create({
      data: {
        notebookId,
        title,
        source,
        sectionId: sectionId || null,
        chatId: null,
        messageId: null,
        flashcards: {
          create: cards.map((c, i) => ({
            question: c.question,
            answer: c.answer,
            sortOrder: i,
          })),
        },
      },
      include: { flashcards: true },
    });

    // Clean up temp file from storage
    await deleteFile(storagePath).catch(() => {});

    return createdResponse(set);
  } catch (err) {
    console.error('Flashcard import error:', err);
    return internalErrorResponse();
  }
}
