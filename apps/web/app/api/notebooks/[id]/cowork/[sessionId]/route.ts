import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  forbiddenResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { wsEmit } from '@/lib/ws-emit';

type Params = { params: Promise<{ id: string; sessionId: string }> };

// GET — full session state (participants, locks)
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, sessionId } = await params;

    const userSelect = {
      id: true,
      username: true,
      name: true,
      avatarUrl: true,
      nameStyle: true,
      equippedTitleId: true,
      equippedFrameId: true,
    } as const;

    const session = await db.coWorkSession.findFirst({
      where: { id: sessionId, notebookId, isActive: true },
      include: {
        host: { select: userSelect },
        participants: {
          where: { isActive: true },
          include: {
            user: { select: userSelect },
          },
          orderBy: { joinedAt: 'asc' },
        },
        pageLocks: {
          where: { expiresAt: { gt: new Date() } },
          include: {
            lockedBy: { select: userSelect },
          },
        },
      },
    });

    if (!session) return notFoundResponse('Session not found or inactive');

    // Must be a participant or the notebook owner to view
    const isParticipant = session.participants.some((p) => p.userId === userId);
    const notebook = await db.notebook.findUnique({
      where: { id: notebookId },
      select: { userId: true },
    });
    if (!isParticipant && notebook?.userId !== userId) {
      return forbiddenResponse('Not a participant in this session');
    }

    return successResponse({
      id: session.id,
      notebookId: session.notebookId,
      hostId: session.hostId,
      host: session.host,
      isActive: session.isActive,
      createdAt: session.createdAt,
      participants: session.participants.map((p) => ({
        id: p.id,
        userId: p.userId,
        user: p.user,
        joinedAt: p.joinedAt,
      })),
      pageLocks: session.pageLocks.map((l) => ({
        id: l.id,
        pageId: l.pageId,
        lockedBy: l.lockedBy,
        lockedAt: l.lockedAt,
        expiresAt: l.expiresAt,
      })),
    });
  } catch {
    return internalErrorResponse();
  }
}

// DELETE — end session (host only, cleans up all locks)
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, sessionId } = await params;

    const session = await db.coWorkSession.findFirst({
      where: { id: sessionId, notebookId, isActive: true },
      select: { id: true, hostId: true },
    });

    if (!session) return notFoundResponse('Session not found or inactive');
    if (session.hostId !== userId) return forbiddenResponse('Only the host can end the session');

    // End session: delete locks, deactivate participants, mark session inactive
    await db.$transaction(async (tx) => {
      await tx.pageLock.deleteMany({ where: { sessionId } });

      await tx.coWorkParticipant.updateMany({
        where: { sessionId, isActive: true },
        data: { isActive: false, leftAt: new Date() },
      });

      await tx.coWorkSession.update({
        where: { id: sessionId },
        data: { isActive: false, endedAt: new Date() },
      });
    });

    // Real-time broadcast (fire-and-forget)
    await wsEmit({
      room: `session:${sessionId}`,
      event: 'cowork:session_ended',
      data: { sessionId },
    });

    return successResponse({ ended: true });
  } catch {
    return internalErrorResponse();
  }
}
