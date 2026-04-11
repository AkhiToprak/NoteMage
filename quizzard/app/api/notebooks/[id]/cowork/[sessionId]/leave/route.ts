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

// POST — leave a co-work session (releases locks, ends session if last participant)
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, sessionId } = await params;

    const session = await db.coWorkSession.findFirst({
      where: { id: sessionId, notebookId, isActive: true },
      select: { id: true, hostId: true },
    });
    if (!session) return notFoundResponse('Session not found or inactive');

    // Host cannot leave — they must end the session (DELETE)
    if (session.hostId === userId) {
      return forbiddenResponse(
        'Host must end the session, not leave. Use DELETE on the session endpoint.'
      );
    }

    // Must be an active participant
    const participant = await db.coWorkParticipant.findFirst({
      where: { sessionId, userId, isActive: true },
    });
    if (!participant) return notFoundResponse('Not an active participant');

    await db.$transaction(async (tx) => {
      // Release all locks held by this user
      await tx.pageLock.deleteMany({
        where: { sessionId, lockedById: userId },
      });

      // Mark participant as left. We deliberately do NOT auto-end the
      // session here, even if the host is the only one left. Ending the
      // session is reserved to the host's explicit DELETE action — a
      // non-host clicking Leave must never kick the host out of their
      // own session. The host is free to sit in an empty session and
      // wait for invitees, or end it themselves when done.
      await tx.coWorkParticipant.update({
        where: { id: participant.id },
        data: { isActive: false, leftAt: new Date() },
      });
    });

    // Real-time broadcast — only the participant_left event. No
    // session_ended here, ever. See the comment above.
    await wsEmit({
      room: `session:${sessionId}`,
      event: 'cowork:participant_left',
      data: { sessionId, userId },
    });

    return successResponse({ left: true });
  } catch {
    return internalErrorResponse();
  }
}
