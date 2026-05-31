import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { downloadFromStorage, validateStoragePath } from '@/lib/storage';
import { extractText, ALLOWED_MIME_TYPES } from '@/lib/fileProcessing';
import { checkAndUnlockAchievements } from '@/lib/achievement-checker';
import { getOrCreateInboxNotebook } from '@/lib/inbox';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

/**
 * GET /api/learn/uploads — list ad-hoc uploads sitting in the caller's Inbox
 * notebook. Returns an empty list (no Inbox auto-create) when nothing has
 * been uploaded yet.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const inbox = await db.notebook.findFirst({ where: { userId, kind: 'inbox' } });
    if (!inbox) return successResponse([]);

    const documents = await db.document.findMany({
      where: { notebookId: inbox.id },
      orderBy: { createdAt: 'desc' },
    });

    return successResponse(documents);
  } catch (error) {
    console.error('[learn/uploads GET]', error);
    return internalErrorResponse();
  }
}

/**
 * POST /api/learn/uploads — accept a pre-signed upload from the new chat
 * creator. Creates the user's Inbox notebook on first use and stores the
 * Document there, mirroring `POST /api/notebooks/[id]/documents`.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { storagePath, fileName, fileType } = await request.json();

    if (!storagePath) return badRequestResponse('No storagePath provided');
    if (!ALLOWED_MIME_TYPES.includes(fileType)) {
      return badRequestResponse('Unsupported file type. Allowed: PDF, DOCX, TXT, MD');
    }

    // Resolve the caller's Inbox first so we can scope the storage path to it.
    // The signed-url 'document' purpose emits `documents/<notebookId>/...`, and
    // the chat creator uploads Inbox files under this very notebook — so a path
    // outside `documents/<inbox.id>/` belongs to another notebook/tenant and is
    // rejected (the service-role client bypasses RLS).
    const inbox = await getOrCreateInboxNotebook(userId);

    if (!validateStoragePath(storagePath, `documents/${inbox.id}/`)) {
      return badRequestResponse('Invalid storage path');
    }

    const buffer = await downloadFromStorage(storagePath);

    let textContent: string | null = null;
    try {
      textContent = await extractText(buffer, fileType);
    } catch (err) {
      console.error('[Inbox Upload] Text extraction failed:', fileName, fileType, err);
    }

    const document = await db.document.create({
      data: {
        notebookId: inbox.id,
        fileName,
        filePath: storagePath,
        fileSize: buffer.length,
        fileType,
        textContent,
      },
    });

    checkAndUnlockAchievements(userId).catch(console.error);

    return createdResponse(document);
  } catch (error) {
    console.error('[learn/uploads POST]', error);
    return internalErrorResponse();
  }
}
