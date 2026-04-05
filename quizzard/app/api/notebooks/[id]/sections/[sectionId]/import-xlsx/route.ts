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
} from '@/lib/api-response';
import { xlsxToTipTapTableJSON, type SheetData } from '@/lib/contentConverter';
import { extractText } from '@/lib/fileProcessing';
import { downloadFromStorage, validateStoragePath, deleteFile } from '@/lib/storage';

type Params = { params: Promise<{ id: string; sectionId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

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
    const { storagePath } = await request.json();
    if (!storagePath || !validateStoragePath(storagePath, 'temp-imports/')) {
      return badRequestResponse('Invalid or missing storagePath');
    }

    const buffer = await downloadFromStorage(storagePath);

    // Parse workbook into sheet data
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const sheetsData: SheetData[] = workbook.SheetNames.map((name: string) => {
      const sheet = workbook.Sheets[name];
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false });
      return { name, rows: rows.map((r: string[]) => r.map((c: unknown) => String(c ?? ''))) };
    });

    // Convert to TipTap table JSON
    const content = xlsxToTipTapTableJSON(sheetsData) as unknown as Prisma.InputJsonValue;

    // Extract plain text for search index
    const textContent = await extractText(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // Determine sort order
    const maxOrder = await db.page.aggregate({
      where: { sectionId },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

    // Derive title from storage path filename
    const fileName = storagePath.split('/').pop()?.replace(/\.(xlsx|xls)$/i, '') || 'Excel Import';

    const page = await db.page.create({
      data: {
        sectionId,
        title: fileName,
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
