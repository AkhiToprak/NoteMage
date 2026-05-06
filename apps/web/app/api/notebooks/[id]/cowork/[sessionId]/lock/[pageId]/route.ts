import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  forbiddenResponse,
  conflictResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { wsEmit } from '@/lib/ws-emit';

type Params = { params: Promise<{ id: string; sessionId: string; pageId: string }> };

const LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes

async function cleanExpiredLocks(sessionId: string) {
  await db.pageLock.deleteMany({
    where: { sessionId, expiresAt: { lt: new Date() } },
  });
}

// POST — lock a page (or refresh existing lock). 409 if locked by someone else.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, sessionId, pageId } = await params;

    // Verify session is active and belongs to this notebook
    const session = await db.coWorkSession.findFirst({
      where: { id: sessionId, notebookId, isActive: true },
      select: { id: true },
    });
    if (!session) return notFoundResponse('Session not found or inactive');

    // Verify user is an active participant
    const participant = await db.coWorkParticipant.findFirst({
      where: { sessionId, userId, isActive: true },
      select: { id: true },
    });
    if (!participant) return forbiddenResponse('Not an active participant');

    // Verify page belongs to this notebook
    const page = await db.page.findFirst({
      where: { id: pageId },
      select: { id: true, section: { select: { notebookId: true } } },
    });
    if (!page || page.section.notebookId !== notebookId) {
      return notFoundResponse('Page not found in this notebook');
    }

    // Clean expired locks first
    await cleanExpiredLocks(sessionId);

    // Per-user lock limit — max 5 concurrent locks
    const userLockCount = await db.pageLock.count({
      where: { sessionId, lockedById: userId },
    });
    if (userLockCount >= 5) {
      return conflictResponse('You cannot lock more than 5 pages at once');
    }

    const expiresAt = new Date(Date.now() + LOCK_DURATION_MS);

    // Check if page is already locked
    const existingLock = await db.pageLock.findUnique({
      where: { sessionId_pageId: { sessionId, pageId } },
      include: {
        lockedBy: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
            nameStyle: true,
            equippedTitleId: true,
            equippedFrameId: true,
          },
        },
      },
    });

    if (existingLock) {
      if (existingLock.lockedById === userId) {
        // Refresh own lock
        const updated = await db.pageLock.update({
          where: { id: existingLock.id },
          data: { expiresAt, lockedAt: new Date() },
        });
        return successResponse({
          id: updated.id,
          pageId,
          lockedById: userId,
          expiresAt: updated.expiresAt,
          refreshed: true,
        });
      }

      // Locked by someone else — check if expired
      if (existingLock.expiresAt > new Date()) {
        return conflictResponse(`Page is locked by ${existingLock.lockedBy.username}`);
      }

      // Expired lock — take over
      const updated = await db.pageLock.update({
        where: { id: existingLock.id },
        data: { lockedById: userId, lockedAt: new Date(), expiresAt },
      });
      return successResponse({
        id: updated.id,
        pageId,
        lockedById: userId,
        expiresAt: updated.expiresAt,
        takenOver: true,
      });
    }

    // Create new lock — catch unique constraint race condition
    try {
      const lock = await db.pageLock.create({
        data: {
          sessionId,
          pageId,
          lockedById: userId,
          expiresAt,
        },
      });

      // Real-time broadcast (fire-and-forget)
      await wsEmit({
        room: `session:${sessionId}`,
        event: 'cowork:page_locked',
        data: {
          sessionId,
          pageId,
          lockedById: userId,
          expiresAt: lock.expiresAt.toISOString(),
        },
      });

      return successResponse({
        id: lock.id,
        pageId,
        lockedById: userId,
        expiresAt: lock.expiresAt,
      });
    } catch (err: unknown) {
      // P2002 = unique constraint violation — another request locked this page concurrently
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        return conflictResponse('Page was locked by another user just now');
      }
      throw err;
    }
  } catch {
    return internalErrorResponse();
  }
}

// DELETE — release a lock (must be lock holder)
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, sessionId, pageId } = await params;

    // Verify session exists and is active for this notebook
    const session = await db.coWorkSession.findFirst({
      where: { id: sessionId, notebookId, isActive: true },
      select: { id: true },
    });
    if (!session) return notFoundResponse('Session not found or inactive');

    const lock = await db.pageLock.findUnique({
      where: { sessionId_pageId: { sessionId, pageId } },
    });
    if (!lock) return notFoundResponse('No lock on this page');
    if (lock.lockedById !== userId) return forbiddenResponse('You do not hold this lock');

    await db.pageLock.delete({ where: { id: lock.id } });

    // Real-time broadcast (fire-and-forget)
    await wsEmit({
      room: `session:${sessionId}`,
      event: 'cowork:page_unlocked',
      data: { sessionId, pageId, releasedById: userId },
    });

    return successResponse({ released: true });
  } catch {
    return internalErrorResponse();
  }
}
