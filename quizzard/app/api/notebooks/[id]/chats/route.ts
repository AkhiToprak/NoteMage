import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
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

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const chats = await db.notebookChat.findMany({
      where: { notebookId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        contextPageIds: true,
        contextDocIds: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });

    return successResponse(chats);
  } catch {
    return internalErrorResponse();
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const body = await request.json().catch(() => ({}));
    const { title, contextPageIds = [], contextDocIds = [] } = body as {
      title?: string;
      contextPageIds?: string[];
      contextDocIds?: string[];
    };

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return badRequestResponse('Chat title cannot be empty');
    }

    if (title.trim().length > 200) {
      return badRequestResponse('Chat title must be 200 characters or less');
    }

    // Validate IDs are arrays of strings with size limits
    if (!Array.isArray(contextPageIds) || contextPageIds.some((id) => typeof id !== 'string')) {
      return badRequestResponse('contextPageIds must be an array of strings');
    }
    if (contextPageIds.length > 50) {
      return badRequestResponse('Cannot reference more than 50 pages');
    }
    if (!Array.isArray(contextDocIds) || contextDocIds.some((id) => typeof id !== 'string')) {
      return badRequestResponse('contextDocIds must be an array of strings');
    }
    if (contextDocIds.length > 50) {
      return badRequestResponse('Cannot reference more than 50 documents');
    }

    // Validate all page IDs belong to this notebook
    if (contextPageIds.length > 0) {
      const validPageCount = await db.page.count({
        where: { id: { in: contextPageIds }, section: { notebookId } },
      });
      if (validPageCount !== contextPageIds.length) {
        return badRequestResponse('One or more page IDs are invalid');
      }
    }

    // Validate all document IDs belong to this notebook
    if (contextDocIds.length > 0) {
      const validDocCount = await db.document.count({
        where: { id: { in: contextDocIds }, notebookId },
      });
      if (validDocCount !== contextDocIds.length) {
        return badRequestResponse('One or more document IDs are invalid');
      }
    }

    const chat = await db.notebookChat.create({
      data: {
        notebookId,
        title: title.trim(),
        contextPageIds,
        contextDocIds,
      },
    });

    return createdResponse(chat);
  } catch {
    return internalErrorResponse();
  }
}
