import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ id: string; chatId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, chatId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const chat = await db.notebookChat.findFirst({
      where: { id: chatId, notebookId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!chat) return notFoundResponse('Chat not found');

    return successResponse(chat);
  } catch {
    return internalErrorResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, chatId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const chat = await db.notebookChat.findFirst({ where: { id: chatId, notebookId } });
    if (!chat) return notFoundResponse('Chat not found');

    const body = await request.json().catch(() => ({}));
    const { title, contextPageIds, contextDocIds } = body as {
      title?: string;
      contextPageIds?: string[];
      contextDocIds?: string[];
    };

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return badRequestResponse('Chat title cannot be empty');
      }
      if (title.trim().length > 200) {
        return badRequestResponse('Chat title must be 200 characters or less');
      }
    }

    // Validate IDs are arrays of strings and belong to this notebook
    if (contextPageIds !== undefined) {
      if (!Array.isArray(contextPageIds) || contextPageIds.some((id) => typeof id !== 'string')) {
        return badRequestResponse('contextPageIds must be an array of strings');
      }
      if (contextPageIds.length > 0) {
        const validPageCount = await db.page.count({
          where: { id: { in: contextPageIds }, section: { notebookId } },
        });
        if (validPageCount !== contextPageIds.length) {
          return badRequestResponse('One or more page IDs are invalid');
        }
      }
    }

    if (contextDocIds !== undefined) {
      if (!Array.isArray(contextDocIds) || contextDocIds.some((id) => typeof id !== 'string')) {
        return badRequestResponse('contextDocIds must be an array of strings');
      }
      if (contextDocIds.length > 0) {
        const validDocCount = await db.document.count({
          where: { id: { in: contextDocIds }, notebookId },
        });
        if (validDocCount !== contextDocIds.length) {
          return badRequestResponse('One or more document IDs are invalid');
        }
      }
    }

    const updated = await db.notebookChat.update({
      where: { id: chatId },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(contextPageIds !== undefined && { contextPageIds }),
        ...(contextDocIds !== undefined && { contextDocIds }),
      },
    });

    return successResponse(updated);
  } catch {
    return internalErrorResponse();
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, chatId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const chat = await db.notebookChat.findFirst({ where: { id: chatId, notebookId } });
    if (!chat) return notFoundResponse('Chat not found');

    await db.notebookChat.delete({ where: { id: chatId } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
