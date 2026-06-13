import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
  tooManyRequestsResponse,
} from '@/lib/api-response';
import { xlsxToTipTapTableJSON, type SheetData } from '@/lib/contentConverter';
import { extractText } from '@/lib/fileProcessing';
import { downloadFromStorage, validateStoragePath, deleteFile } from '@/lib/storage';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';

type Params = { params: Promise<{ id: string; sectionId: string }> };

// Hard byte cap enforced before XLSX.read — SheetJS decompresses the zip
// container, so an oversized or zip-bombed workbook must be rejected first.
const MAX_XLSX_BYTES = 25 * 1024 * 1024;
// After parse, reject absurd grids (rows * cols) that would blow up memory
// even within the byte cap.
const MAX_TOTAL_CELLS = 1_000_000;

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const rl = await rateLimit(rateLimitKey('file-import', request, userId), 10, 60_000);
    if (!rl.success) {
      return tooManyRequestsResponse(
        'Too many import requests. Please try again later.',
        rl.retryAfterMs
      );
    }

    const { id: notebookId, sectionId } = await params;

    // Verify notebook ownership
    const notebook = await db.notebook.findFirst({
      where: { id: notebookId, userId },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    // Verify section belongs to this notebook
    const section = await db.section.findFirst({
      where: { id: sectionId, notebookId },
    });
    if (!section) return notFoundResponse('Section not found in this notebook');

    // Parse JSON body with storage path
    const { storagePath, title: rawTitle } = await request.json();
    if (!storagePath || !validateStoragePath(storagePath, `temp-imports/${userId}/`)) {
      return badRequestResponse('Invalid or missing storagePath');
    }

    const buffer = await downloadFromStorage(storagePath);

    // Hard byte cap BEFORE XLSX.read — SheetJS inflates the zip container, so
    // an oversized / zip-bombed workbook must be rejected before parsing.
    if (buffer.length > MAX_XLSX_BYTES) {
      await deleteFile(storagePath).catch(() => {});
      return badRequestResponse(
        `File is too large. Maximum is ${Math.floor(MAX_XLSX_BYTES / (1024 * 1024))}MB.`
      );
    }

    // Parse workbook into sheet data
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const sheetsData: SheetData[] = workbook.SheetNames.map((name: string) => {
      const sheet = workbook.Sheets[name];
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false });
      return { name, rows: rows.map((r: string[]) => r.map((c: unknown) => String(c ?? ''))) };
    });

    // Reject absurd grids (rows * widest row) that would explode memory even
    // within the byte cap (a tiny zip can inflate to a huge sparse sheet).
    const totalCells = sheetsData.reduce(
      (sum, sheet) =>
        sum + sheet.rows.reduce((rowSum, row) => rowSum + Math.max(row.length, 1), 0),
      0
    );
    if (totalCells > MAX_TOTAL_CELLS) {
      await deleteFile(storagePath).catch(() => {});
      return badRequestResponse(
        `Spreadsheet is too large. Maximum is ${MAX_TOTAL_CELLS.toLocaleString()} cells.`
      );
    }

    // Convert to TipTap table JSON
    const content = xlsxToTipTapTableJSON(sheetsData) as unknown as Prisma.InputJsonValue;

    // Extract plain text for search index
    const textContent = await extractText(
      buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    // Determine sort order
    const maxOrder = await db.page.aggregate({
      where: { sectionId },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

    // User-chosen title from the organize mask wins; otherwise derive from
    // the storage path filename.
    const customTitle = typeof rawTitle === 'string' ? rawTitle.trim().slice(0, 200) : '';
    const fileName =
      storagePath
        .split('/')
        .pop()
        ?.replace(/\.(xlsx|xls)$/i, '') || 'Excel Import';

    const page = await db.page.create({
      data: {
        sectionId,
        title: customTitle || fileName,
        content,
        textContent,
        sortOrder,
        sourceDocId: null,
      },
    });

    // Clean up temp file from storage
    await deleteFile(storagePath).catch(() => {});

    return createdResponse(page);
  } catch (error) {
    console.error('Excel import error:', error);
    return internalErrorResponse();
  }
}
