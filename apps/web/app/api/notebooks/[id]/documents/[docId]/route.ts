import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { deleteFile } from '@/lib/storage';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ id: string; docId: string }> };

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, docId } = await params;

    // Find document and verify ownership via notebook
    const document = await db.document.findFirst({
      where: {
        id: docId,
        notebookId,
        notebook: { userId },
      },
    });

    if (!document) return notFoundResponse('Document not found');

    await deleteFile(document.filePath);
    await db.document.delete({ where: { id: docId } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
