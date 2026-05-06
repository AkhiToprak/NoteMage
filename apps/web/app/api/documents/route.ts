import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const documents = await db.document.findMany({
      where: { notebook: { userId } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        fileType: true,
        notebookId: true,
        createdAt: true,
        notebook: { select: { name: true, color: true } },
      },
    });

    return successResponse(documents);
  } catch {
    return internalErrorResponse();
  }
}
