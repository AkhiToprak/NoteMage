import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

/**
 * GET /api/learn/chats — flat list across all the caller's notebooks.
 * Returns the fields the `/learn/chats` sidebar needs to group + sort.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Defensive cap: returns the 200 most-recently-updated chats (safety
    // bound, not user-facing pagination).
    const chats = await db.notebookChat.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        title: true,
        notebookId: true,
        contextPageIds: true,
        contextDocIds: true,
        contextNotebookIds: true,
        createdAt: true,
        updatedAt: true,
        notebook: { select: { id: true, name: true, color: true, kind: true } },
        _count: { select: { messages: true } },
      },
    });

    const data = chats.map((c) => ({
      id: c.id,
      title: c.title,
      primaryNotebookId: c.notebookId,
      primaryNotebookName: c.notebook?.name ?? null,
      primaryNotebookColor: c.notebook?.color ?? null,
      primaryNotebookKind: c.notebook?.kind ?? null,
      contextNotebookIds: c.contextNotebookIds,
      contextPageIds: c.contextPageIds,
      contextDocIds: c.contextDocIds,
      messageCount: c._count.messages,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    return successResponse(data);
  } catch (error) {
    console.error('[learn/chats GET]', error);
    return internalErrorResponse();
  }
}

/**
 * POST /api/learn/chats — create a chat that can draw from multiple notebooks
 * and/or inbox uploads. Pages/docs are validated against user ownership, not
 * a single notebook. primaryNotebookId is derived as the notebook with the
 * most selected pages+docs (tiebreak: most recently touched).
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json().catch(() => ({}));
    const {
      title,
      contextPageIds = [],
      contextDocIds = [],
      sourcePathId,
    } = body as {
      title?: string;
      contextPageIds?: string[];
      contextDocIds?: string[];
      sourcePathId?: string;
    };

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

    // Workstream 4 — seed context from a learning path ("Ask Mage about this
    // lesson"). Resolve the StudyPlan's materialIds into OWNED pages + docs and
    // merge them into the effective context. The materialIds list mixes pages,
    // docs, and set ids (flashcard/quiz) — only page/doc ids match the lookups
    // below; everything else is silently ignored. An unfound / unowned plan id
    // is ignored too (no context added). chat-stream.ts only reads
    // contextPageIds/contextDocIds, so this is what gives the chat real
    // material to draw from.
    let effectivePageIds = [...contextPageIds];
    let effectiveDocIds = [...contextDocIds];
    let pathTitle: string | null = null;

    if (typeof sourcePathId === 'string' && sourcePathId.length > 0) {
      const plan = await db.studyPlan.findFirst({
        where: { id: sourcePathId, userId },
        select: { id: true, title: true, materialIds: true, notebookId: true },
      });
      if (plan) {
        pathTitle = plan.title;
        if (plan.materialIds.length > 0) {
          const [planPages, planDocs] = await Promise.all([
            db.page.findMany({
              where: { id: { in: plan.materialIds }, section: { notebook: { userId } } },
              select: { id: true },
            }),
            db.document.findMany({
              where: { id: { in: plan.materialIds }, notebook: { userId } },
              select: { id: true },
            }),
          ]);
          // Union with anything explicitly passed, dedupe, keep within caps.
          effectivePageIds = Array.from(
            new Set([...effectivePageIds, ...planPages.map((p) => p.id)]),
          ).slice(0, 50);
          effectiveDocIds = Array.from(
            new Set([...effectiveDocIds, ...planDocs.map((d) => d.id)]),
          ).slice(0, 50);
        }
      }
    }

    const chatTitle =
      typeof title === 'string' && title.trim().length > 0
        ? title.trim()
        : (pathTitle ?? 'New Chat');
    if (chatTitle.length > 200) {
      return badRequestResponse('Chat title must be 200 characters or less');
    }

    // Tally notebook membership for every selected page/doc, validating
    // ownership in the same query.
    const tally = new Map<string, number>();

    if (effectivePageIds.length > 0) {
      const pages = await db.page.findMany({
        where: { id: { in: effectivePageIds }, section: { notebook: { userId } } },
        select: { id: true, section: { select: { notebookId: true } } },
      });
      if (pages.length !== effectivePageIds.length) {
        return badRequestResponse('One or more page IDs are invalid');
      }
      for (const p of pages) {
        const nbId = p.section.notebookId;
        tally.set(nbId, (tally.get(nbId) ?? 0) + 1);
      }
    }

    if (effectiveDocIds.length > 0) {
      const docs = await db.document.findMany({
        where: { id: { in: effectiveDocIds }, notebook: { userId } },
        select: { id: true, notebookId: true },
      });
      if (docs.length !== effectiveDocIds.length) {
        return badRequestResponse('One or more document IDs are invalid');
      }
      for (const d of docs) {
        tally.set(d.notebookId, (tally.get(d.notebookId) ?? 0) + 1);
      }
    }

    const contextNotebookIds = Array.from(tally.keys());

    let primaryNotebookId: string | null = null;
    if (contextNotebookIds.length > 0) {
      const nbs = await db.notebook.findMany({
        where: { id: { in: contextNotebookIds } },
        select: { id: true, updatedAt: true },
      });
      const updatedAtById = new Map(nbs.map((n) => [n.id, n.updatedAt.getTime()] as const));
      const sorted = [...tally.entries()].sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        const aUpd = updatedAtById.get(a[0]) ?? 0;
        const bUpd = updatedAtById.get(b[0]) ?? 0;
        return bUpd - aUpd;
      });
      primaryNotebookId = sorted[0][0];
    }

    const chat = await db.notebookChat.create({
      data: {
        userId,
        notebookId: primaryNotebookId,
        title: chatTitle,
        contextPageIds: effectivePageIds,
        contextDocIds: effectiveDocIds,
        contextNotebookIds,
      },
    });

    return createdResponse(chat);
  } catch (error) {
    console.error('[learn/chats POST]', error);
    return internalErrorResponse();
  }
}
