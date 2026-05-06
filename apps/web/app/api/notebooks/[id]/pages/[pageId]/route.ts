import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { deletePageImages } from '@/lib/storage';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { awardXP } from '@/lib/xp';
import { checkAndUnlockAchievements } from '@/lib/achievement-checker';
import { isEffectivelyEmptyTiptapDoc } from '@/lib/tiptap-is-empty';

type Params = { params: Promise<{ id: string; pageId: string }> };

/**
 * GET — read page content.
 *
 * Access rules (in order):
 *   1. The notebook owner can always read.
 *   2. An active participant in an active cowork session on this
 *      notebook can also read. This is the critical path for joiners
 *      who arrive via `?cowork=<sessionId>` on a notebook they don't own.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, pageId } = await params;

    // Path 1: notebook owner — fastest, most common case.
    let page = await db.page.findFirst({
      where: {
        id: pageId,
        section: {
          notebookId,
          notebook: { userId },
        },
      },
      include: { images: true },
    });

    if (!page) {
      // Path 2: active cowork participant. We don't care which session
      // id the client is using — any active session on this notebook
      // where the caller is an active participant is enough.
      const participant = await db.coWorkParticipant.findFirst({
        where: {
          userId,
          isActive: true,
          session: {
            notebookId,
            isActive: true,
          },
        },
        select: { id: true },
      });

      if (participant) {
        page = await db.page.findFirst({
          where: {
            id: pageId,
            section: { notebookId },
          },
          include: { images: true },
        });
      }
    }

    if (!page) return notFoundResponse('Page not found');

    return successResponse(page);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * PUT — update page content.
 *
 * Same access rules as GET: notebook owner, or active cowork participant
 * on any active session in this notebook. PageLock enforcement happens
 * separately via /cowork/[sessionId]/lock/[pageId] and is checked by
 * the client — the PUT endpoint itself only gates READ/WRITE ability,
 * not who owns the lock.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, pageId } = await params;

    // Award XP and check achievements (fire-and-forget)
    awardXP(userId, 'page_edited').catch(console.error);
    checkAndUnlockAchievements(userId).catch(console.error);

    let existing = await db.page.findFirst({
      where: {
        id: pageId,
        section: {
          notebookId,
          notebook: { userId },
        },
      },
    });

    if (!existing) {
      // Cowork participant fallback.
      const participant = await db.coWorkParticipant.findFirst({
        where: {
          userId,
          isActive: true,
          session: { notebookId, isActive: true },
        },
        select: { id: true },
      });
      if (participant) {
        existing = await db.page.findFirst({
          where: { id: pageId, section: { notebookId } },
        });
      }
    }

    if (!existing) return notFoundResponse('Page not found');

    const body = await request.json();
    const { title, content, textContent, sortOrder } = body;

    // Input validation — prevent resource exhaustion
    if (title !== undefined && (typeof title !== 'string' || title.length > 500)) {
      return badRequestResponse('Title must be a string under 500 characters');
    }
    if (content !== undefined && typeof content !== 'object') {
      return badRequestResponse('Content must be a JSON object');
    }
    // Content size limit — split by page type. TipTap text pages should
    // never need more than 500KB; anything larger is almost certainly a
    // runaway edit. Canvas pages are a different shape entirely — they
    // embed base64 image dataURLs inside `content.files` and store
    // dense stroke arrays with per-point pressure values, so a
    // legitimate canvas with a couple of photos or a complex drawing
    // will easily cross 500KB. The cap here (10MB) matches the upper
    // bound we've observed in real notebooks and stays well under
    // Postgres' jsonb hard limits.
    const maxContentBytes = existing.pageType === 'canvas' ? 10 * 1024 * 1024 : 500_000;
    if (content !== undefined && JSON.stringify(content).length > maxContentBytes) {
      return badRequestResponse('Content exceeds maximum size');
    }
    if (textContent !== undefined && typeof textContent !== 'string') {
      return badRequestResponse('Text content must be a string');
    }
    if (textContent !== undefined && textContent.length > 500_000) {
      return badRequestResponse('Text content exceeds maximum size');
    }
    if (sortOrder !== undefined && (typeof sortOrder !== 'number' || !Number.isFinite(sortOrder))) {
      return badRequestResponse('Sort order must be a finite number');
    }

    // Data-loss guard: refuse to overwrite a non-empty text page's content
    // with an effectively empty TipTap document. An unhydrated editor (or
    // any transient reset) serialises to {type:'doc',content:[{type:'paragraph'}]}
    // which is a valid object but would nuke the page. We've seen this happen
    // in cowork sessions. The client has its own gate on hydration, this is
    // the last line of defence at the API boundary.
    //
    // Only applies to text pages — canvas pages can legitimately save
    // a "cleared" doc if the user wiped the drawing layer, and the canvas
    // content shape isn't a TipTap doc anyway.
    if (
      content !== undefined &&
      existing.pageType === 'text' &&
      isEffectivelyEmptyTiptapDoc(content) &&
      !isEffectivelyEmptyTiptapDoc(existing.content)
    ) {
      return badRequestResponse(
        'Refused to overwrite non-empty page with empty document. This is always a bug on the client side — please reload the page and try again.'
      );
    }

    const updated = await db.page.update({
      where: { id: pageId },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(textContent !== undefined && { textContent }),
        ...(sortOrder !== undefined && { sortOrder }),
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

    const { id: notebookId, pageId } = await params;

    const existing = await db.page.findFirst({
      where: {
        id: pageId,
        section: {
          notebookId,
          notebook: { userId },
        },
      },
    });
    if (!existing) return notFoundResponse('Page not found');

    // Clean up image files from disk before deleting DB record
    await deletePageImages(pageId);
    await db.page.delete({ where: { id: pageId } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
