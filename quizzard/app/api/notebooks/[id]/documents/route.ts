import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { saveFile } from '@/lib/storage';
import { extractText, ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '@/lib/fileProcessing';
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

    const data = await request.formData();
    const file = data.get('file') as File | null;

    if (!file) return badRequestResponse('No file provided');
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return badRequestResponse('Unsupported file type. Allowed: PDF, DOCX, TXT, MD');
    }
    if (file.size > MAX_FILE_SIZE) {
      return badRequestResponse('File too large. Maximum size is 10MB');
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const { filePath } = await saveFile(notebookId, file.name, buffer);

    let textContent: string | null = null;
    try {
      textContent = await extractText(buffer, file.type);
    } catch (err) {
      console.error('[Document Upload] Text extraction failed:', file.name, file.type, err);
    }

    const document = await db.document.create({
      data: {
        notebookId,
        fileName: file.name,
        filePath,
        fileSize: file.size,
        fileType: file.type,
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
