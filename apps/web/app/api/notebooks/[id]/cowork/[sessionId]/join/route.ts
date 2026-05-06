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

// POST — join a co-work session
//
// Gating: caller must be either
//   1. the host (always allowed), or
//   2. an active member of the StudyGroup passed in the request body
//      (for invites coming from group/class/DM chats), or
//   3. an accepted friend of the host (legacy fallback — covers invites
//      shared via notification or direct link before the chat feature
//      existed).
//
// Join is idempotent: if the caller is already an active participant,
// we return success without touching the DB and still broadcast so
// subscribers refresh their participant list.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, sessionId } = await params;

    // Verify session exists and is active
    const session = await db.coWorkSession.findFirst({
      where: { id: sessionId, notebookId, isActive: true },
      select: { id: true, hostId: true },
    });
    if (!session) return notFoundResponse('Session not found or inactive');

    // Gate: host OR shared-group member OR friend of host
    if (session.hostId !== userId) {
      const body = await request.json().catch(() => ({}));
      const groupId =
        typeof (body as { groupId?: unknown }).groupId === 'string'
          ? (body as { groupId: string }).groupId
          : null;

      let allowed = false;

      if (groupId) {
        const [callerMembership, hostMembership] = await Promise.all([
          db.studyGroupMember.findUnique({
            where: { groupId_userId: { groupId, userId } },
          }),
          db.studyGroupMember.findUnique({
            where: { groupId_userId: { groupId, userId: session.hostId } },
          }),
        ]);
        allowed = callerMembership?.status === 'accepted' && hostMembership?.status === 'accepted';
      }

      if (!allowed) {
        const friendship = await db.friendship.findFirst({
          where: {
            status: 'accepted',
            OR: [
              { requesterId: userId, addresseeId: session.hostId },
              { requesterId: session.hostId, addresseeId: userId },
            ],
          },
        });
        allowed = !!friendship;
      }

      if (!allowed) {
        return forbiddenResponse('You do not have access to this session');
      }
    }

    // Idempotent join — if the caller is already active, we still
    // re-broadcast so any out-of-sync participant bar refreshes.
    const existingParticipant = await db.coWorkParticipant.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });

    if (existingParticipant) {
      if (!existingParticipant.isActive) {
        await db.coWorkParticipant.update({
          where: { id: existingParticipant.id },
          data: { isActive: true, leftAt: null },
        });
      }
    } else {
      await db.coWorkParticipant.create({
        data: { sessionId, userId },
      });
    }

    // Real-time broadcast — fetch the user we just (re)joined to enrich the
    // payload, so subscribers can render avatars/names without a follow-up
    // fetch.
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        avatarUrl: true,
        nameStyle: true,
        equippedTitleId: true,
        equippedFrameId: true,
      },
    });
    if (user) {
      await wsEmit({
        room: `session:${sessionId}`,
        event: 'cowork:participant_joined',
        data: { sessionId, user },
      });
    }

    return successResponse({ joined: true });
  } catch {
    return internalErrorResponse();
  }
}
