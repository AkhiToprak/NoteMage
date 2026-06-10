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

type Params = { params: Promise<{ chatId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { chatId } = await params;

    const chat = await db.notebookChat.findFirst({
      where: { id: chatId, userId },
      include: {
        notebook: { select: { id: true, name: true, color: true, kind: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!chat) return notFoundResponse('Chat not found');

    return successResponse(chat);
  } catch (error) {
    console.error('[learn/chats/:chatId GET]', error);
    return internalErrorResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { chatId } = await params;
    const chat = await db.notebookChat.findFirst({ where: { id: chatId, userId } });
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

    const tally = new Map<string, number>();
    let recomputeContext = false;

    if (contextPageIds !== undefined) {
      if (!Array.isArray(contextPageIds) || contextPageIds.some((id) => typeof id !== 'string')) {
        return badRequestResponse('contextPageIds must be an array of strings');
      }
      if (contextPageIds.length > 50) {
        return badRequestResponse('Cannot reference more than 50 pages');
      }
      if (contextPageIds.length > 0) {
        const pages = await db.page.findMany({
          where: { id: { in: contextPageIds }, section: { notebook: { userId } } },
          select: { id: true, section: { select: { notebookId: true } } },
        });
        if (pages.length !== contextPageIds.length) {
          return badRequestResponse('One or more page IDs are invalid');
        }
        for (const p of pages) {
          const nbId = p.section.notebookId;
          tally.set(nbId, (tally.get(nbId) ?? 0) + 1);
        }
      }
      recomputeContext = true;
    }

    if (contextDocIds !== undefined) {
      if (!Array.isArray(contextDocIds) || contextDocIds.some((id) => typeof id !== 'string')) {
        return badRequestResponse('contextDocIds must be an array of strings');
      }
      if (contextDocIds.length > 50) {
        return badRequestResponse('Cannot reference more than 50 documents');
      }
      if (contextDocIds.length > 0) {
        const docs = await db.document.findMany({
          where: { id: { in: contextDocIds }, notebook: { userId } },
          select: { id: true, notebookId: true },
        });
        if (docs.length !== contextDocIds.length) {
          return badRequestResponse('One or more document IDs are invalid');
        }
        for (const d of docs) {
          tally.set(d.notebookId, (tally.get(d.notebookId) ?? 0) + 1);
        }
      }
      recomputeContext = true;
    }

    let derivedNotebookIds: string[] | undefined;
    let derivedPrimaryNotebookId: string | null | undefined;

    if (recomputeContext) {
      // If only one of the arrays was patched, we still need to count items
      // from the other array against the existing tally to keep the primary
      // notebook accurate.
      if (contextPageIds === undefined && chat.contextPageIds.length > 0) {
        const pages = await db.page.findMany({
          where: { id: { in: chat.contextPageIds } },
          select: { id: true, section: { select: { notebookId: true } } },
        });
        for (const p of pages) {
          const nbId = p.section.notebookId;
          tally.set(nbId, (tally.get(nbId) ?? 0) + 1);
        }
      }
      if (contextDocIds === undefined && chat.contextDocIds.length > 0) {
        const docs = await db.document.findMany({
          where: { id: { in: chat.contextDocIds } },
          select: { id: true, notebookId: true },
        });
        for (const d of docs) {
          tally.set(d.notebookId, (tally.get(d.notebookId) ?? 0) + 1);
        }
      }

      derivedNotebookIds = Array.from(tally.keys());

      if (derivedNotebookIds.length === 0) {
        derivedPrimaryNotebookId = null;
      } else {
        const nbs = await db.notebook.findMany({
          where: { id: { in: derivedNotebookIds } },
          select: { id: true, updatedAt: true },
        });
        const updatedAtById = new Map(nbs.map((n) => [n.id, n.updatedAt.getTime()] as const));
        const sorted = [...tally.entries()].sort((a, b) => {
          if (b[1] !== a[1]) return b[1] - a[1];
          const aUpd = updatedAtById.get(a[0]) ?? 0;
          const bUpd = updatedAtById.get(b[0]) ?? 0;
          return bUpd - aUpd;
        });
        derivedPrimaryNotebookId = sorted[0][0];
      }
    }

    const updated = await db.notebookChat.update({
      where: { id: chatId },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(contextPageIds !== undefined && { contextPageIds }),
        ...(contextDocIds !== undefined && { contextDocIds }),
        ...(derivedNotebookIds !== undefined && { contextNotebookIds: derivedNotebookIds }),
        ...(derivedPrimaryNotebookId !== undefined && { notebookId: derivedPrimaryNotebookId }),
      },
    });

    return successResponse(updated);
  } catch (error) {
    console.error('[learn/chats/:chatId PATCH]', error);
    return internalErrorResponse();
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { chatId } = await params;
    const chat = await db.notebookChat.findFirst({ where: { id: chatId, userId } });
    if (!chat) return notFoundResponse('Chat not found');

    await db.notebookChat.delete({ where: { id: chatId } });

    return successResponse({ deleted: true });
  } catch (error) {
    console.error('[learn/chats/:chatId DELETE]', error);
    return internalErrorResponse();
  }
}
