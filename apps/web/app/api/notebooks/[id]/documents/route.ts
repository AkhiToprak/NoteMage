import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { downloadFromStorage, validateStoragePath } from '@/lib/storage';
import { extractText, ALLOWED_MIME_TYPES } from '@/lib/fileProcessing';
import { awardXP } from '@/lib/xp';
import { checkAndUnlockAchievements } from '@/lib/achievement-checker';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findFirst({
      where: { id: notebookId, userId },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    const documents = await db.document.findMany({
      where: { notebookId },
      orderBy: { createdAt: 'desc' },
    });

    return successResponse(documents);
  } catch {
    return internalErrorResponse();
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findFirst({
      where: { id: notebookId, userId },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    const { storagePath, fileName, fileType } = await request.json();

    if (!storagePath) return badRequestResponse('No storagePath provided');
    if (!validateStoragePath(storagePath, 'documents/')) {
      return badRequestResponse('Invalid storage path');
    }
    if (!ALLOWED_MIME_TYPES.includes(fileType)) {
      return badRequestResponse('Unsupported file type. Allowed: PDF, DOCX, TXT, MD');
    }

    const buffer = await downloadFromStorage(storagePath);

    let textContent: string | null = null;
    try {
      textContent = await extractText(buffer, fileType);
    } catch (err) {
      console.error('[Document Upload] Text extraction failed:', fileName, fileType, err);
    }

    const document = await db.document.create({
      data: {
        notebookId,
        fileName,
        filePath: storagePath,
        fileSize: buffer.length,
        fileType,
        textContent,
      },
    });

    // Award XP and check achievements (fire-and-forget)
    awardXP(userId, 'document_uploaded').catch(console.error);
    checkAndUnlockAchievements(userId).catch(console.error);

    return createdResponse(document);
  } catch {
    return internalErrorResponse();
  }
}
