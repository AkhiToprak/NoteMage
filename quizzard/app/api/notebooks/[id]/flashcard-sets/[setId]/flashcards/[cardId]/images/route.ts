import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { downloadFromStorage, validateStoragePath } from '@/lib/storage';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ id: string; setId: string; cardId: string }> };

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

function validateImageMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;
  // GIF: 47 49 46
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return true;
  // WebP: RIFF....WEBP
  if (buffer.length >= 12 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return true;
  return false;
}

function mimeFromExtension(fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return ext ? map[ext] ?? null : null;
}

/**
 * POST – register a direct-uploaded image for a flashcard (front or back side)
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId, cardId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const flashcardSet = await db.flashcardSet.findFirst({ where: { id: setId, notebookId } });
    if (!flashcardSet) return notFoundResponse('Flashcard set not found');

    const card = await db.flashcard.findFirst({ where: { id: cardId, flashcardSetId: setId } });
    if (!card) return notFoundResponse('Flashcard not found');

    const { storagePath, fileName, side } = await request.json();

    if (!storagePath || !validateStoragePath(storagePath, 'flashcard-images/')) {
      return badRequestResponse('Invalid or missing storagePath');
    }

    if (!side || (side !== 'front' && side !== 'back')) {
      return badRequestResponse('Side must be "front" or "back"');
    }

    const contentType = mimeFromExtension(fileName || '');
    if (!contentType || !ALLOWED_TYPES.includes(contentType)) {
      return badRequestResponse('Invalid file type. Allowed: PNG, JPEG, GIF, WebP');
    }

    // Determine next sortOrder for this side
    const lastImage = await db.flashcardImage.findFirst({
      where: { flashcardId: cardId, side },
      orderBy: { sortOrder: 'desc' },
    });
    const nextSortOrder = (lastImage?.sortOrder ?? -1) + 1;

    // Download from storage for magic byte validation
    const buffer = await downloadFromStorage(storagePath);

    if (!validateImageMagicBytes(buffer)) {
      return badRequestResponse('Invalid image file');
    }

    const image = await db.flashcardImage.create({
      data: {
        flashcardId: cardId,
        side,
        fileName: fileName || 'image',
        filePath: storagePath,
        fileSize: buffer.length,
        mimeType: contentType,
        sortOrder: nextSortOrder,
      },
    });

    return createdResponse({
      id: image.id,
      side: image.side,
      fileName: image.fileName,
      fileSize: image.fileSize,
      mimeType: image.mimeType,
      sortOrder: image.sortOrder,
      url: `/api/uploads/flashcard-images/${image.id}`,
      createdAt: image.createdAt,
    });
  } catch {
    return internalErrorResponse();
  }
}

/**
 * GET – list all images for a flashcard
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId, cardId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const flashcardSet = await db.flashcardSet.findFirst({ where: { id: setId, notebookId } });
    if (!flashcardSet) return notFoundResponse('Flashcard set not found');

    const card = await db.flashcard.findFirst({ where: { id: cardId, flashcardSetId: setId } });
    if (!card) return notFoundResponse('Flashcard not found');

    const images = await db.flashcardImage.findMany({
      where: { flashcardId: cardId },
      orderBy: { sortOrder: 'asc' },
    });

    return successResponse(
      images.map((img) => ({
        id: img.id,
        side: img.side,
        fileName: img.fileName,
        fileSize: img.fileSize,
        mimeType: img.mimeType,
        sortOrder: img.sortOrder,
        url: `/api/uploads/flashcard-images/${img.id}`,
        createdAt: img.createdAt,
      }))
    );
  } catch {
    return internalErrorResponse();
  }
}
