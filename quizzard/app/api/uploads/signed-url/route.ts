import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { supabase, BUCKET_PRIVATE, BUCKET_PUBLIC } from '@/lib/supabase';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Purpose =
  | 'page-image'
  | 'flashcard-image'
  | 'shared-image'
  | 'avatar'
  | 'group-avatar'
  | 'post-image'
  | 'document'
  | 'section-import'
  | 'flashcard-import';

interface SignedUrlRequestBody {
  purpose: Purpose;
  fileName: string;
  contentType: string;
  notebookId?: string;
  pageId?: string;
  sectionId?: string;
  cardId?: string;
  setId?: string;
  shareId?: string;
  groupId?: string;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getExtensionFromContentType(contentType: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
  };
  return map[contentType] || 'bin';
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return unauthorizedResponse();
    }

    const body: SignedUrlRequestBody = await request.json();
    const { purpose, fileName, contentType } = body;

    if (!purpose || !fileName || !contentType) {
      return badRequestResponse('Missing required fields: purpose, fileName, contentType');
    }

    const validPurposes: Purpose[] = [
      'page-image',
      'flashcard-image',
      'shared-image',
      'avatar',
      'group-avatar',
      'post-image',
      'document',
      'section-import',
      'flashcard-import',
    ];
    if (!validPurposes.includes(purpose)) {
      return badRequestResponse(`Invalid purpose: ${purpose}`);
    }

    const timestamp = Date.now();
    const sanitized = sanitizeFilename(fileName);
    let storagePath: string;
    let bucket: string;

    switch (purpose) {
      case 'page-image': {
        const { notebookId, sectionId, pageId } = body;
        if (!notebookId || !sectionId || !pageId) {
          return badRequestResponse('page-image requires notebookId, sectionId, and pageId');
        }

        const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
        if (!notebook) return notFoundResponse('Notebook not found');

        const section = await db.section.findFirst({ where: { id: sectionId, notebookId } });
        if (!section) return notFoundResponse('Section not found');

        const page = await db.page.findFirst({ where: { id: pageId, sectionId } });
        if (!page) return notFoundResponse('Page not found');

        storagePath = `images/${pageId}/${timestamp}-${sanitized}`;
        bucket = BUCKET_PRIVATE;
        break;
      }

      case 'flashcard-image': {
        const { notebookId, setId, cardId } = body;
        if (!notebookId || !setId || !cardId) {
          return badRequestResponse('flashcard-image requires notebookId, setId, and cardId');
        }

        const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
        if (!notebook) return notFoundResponse('Notebook not found');

        const flashcardSet = await db.flashcardSet.findFirst({ where: { id: setId, notebookId } });
        if (!flashcardSet) return notFoundResponse('Flashcard set not found');

        const card = await db.flashcard.findFirst({ where: { id: cardId, flashcardSetId: setId } });
        if (!card) return notFoundResponse('Flashcard not found');

        storagePath = `flashcard-images/${cardId}/${timestamp}-${sanitized}`;
        bucket = BUCKET_PRIVATE;
        break;
      }

      case 'shared-image': {
        const { shareId } = body;
        if (!shareId) {
          return badRequestResponse('shared-image requires shareId');
        }

        const sharedNotebook = await db.sharedNotebook.findUnique({
          where: { id: shareId },
          select: { id: true, sharedById: true },
        });
        if (!sharedNotebook || sharedNotebook.sharedById !== userId) {
          return notFoundResponse('Shared notebook not found');
        }

        storagePath = `images/shared-${shareId}/${timestamp}-${sanitized}`;
        bucket = BUCKET_PRIVATE;
        break;
      }

      case 'avatar': {
        const ext = getExtensionFromContentType(contentType);
        storagePath = `avatars/${userId}.${ext}`;
        bucket = BUCKET_PUBLIC;
        break;
      }

      case 'group-avatar': {
        const { groupId } = body as SignedUrlRequestBody & { groupId: string };
        if (!groupId) {
          return badRequestResponse('group-avatar requires groupId');
        }
        const ext = getExtensionFromContentType(contentType);
        storagePath = `avatars/group-${groupId}.${ext}`;
        bucket = BUCKET_PUBLIC;
        break;
      }

      case 'post-image': {
        const ext = getExtensionFromContentType(contentType);
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        storagePath = `posts/${userId}-${timestamp}-${randomSuffix}.${ext}`;
        bucket = BUCKET_PUBLIC;
        break;
      }

      case 'document': {
        const { notebookId } = body;
        if (!notebookId) {
          return badRequestResponse('document requires notebookId');
        }

        const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
        if (!notebook) return notFoundResponse('Notebook not found');

        storagePath = `documents/${notebookId}/${timestamp}-${sanitized}`;
        bucket = BUCKET_PRIVATE;
        break;
      }

      case 'section-import': {
        const { notebookId, sectionId } = body;
        if (!notebookId || !sectionId) {
          return badRequestResponse('section-import requires notebookId and sectionId');
        }

        const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
        if (!notebook) return notFoundResponse('Notebook not found');

        const section = await db.section.findFirst({ where: { id: sectionId, notebookId } });
        if (!section) return notFoundResponse('Section not found');

        storagePath = `temp-imports/${userId}/${timestamp}-${sanitized}`;
        bucket = BUCKET_PRIVATE;
        break;
      }

      case 'flashcard-import': {
        const { notebookId } = body;
        if (!notebookId) {
          return badRequestResponse('flashcard-import requires notebookId');
        }

        const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
        if (!notebook) return notFoundResponse('Notebook not found');

        storagePath = `temp-imports/${userId}/${timestamp}-${sanitized}`;
        bucket = BUCKET_PRIVATE;
        break;
      }

      default:
        return badRequestResponse(`Unhandled purpose: ${purpose}`);
    }

    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(storagePath);

    if (error || !data) {
      console.error('Failed to create signed upload URL:', error);
      return internalErrorResponse();
    }

    const responseData: {
      signedUrl: string;
      storagePath: string;
      token: string;
      publicUrl?: string;
    } = {
      signedUrl: data.signedUrl,
      storagePath: data.path,
      token: data.token,
    };

    if (bucket === BUCKET_PUBLIC) {
      const { data: publicUrlData } = supabase.storage
        .from(BUCKET_PUBLIC)
        .getPublicUrl(storagePath);
      responseData.publicUrl = publicUrlData.publicUrl;
    }

    return successResponse(responseData);
  } catch (error) {
    console.error('Signed URL generation error:', error);
    return internalErrorResponse();
  }
}
