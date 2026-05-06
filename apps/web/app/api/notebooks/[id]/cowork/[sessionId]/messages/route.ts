import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  createdResponse,
  unauthorizedResponse,
  notFoundResponse,
  forbiddenResponse,
  badRequestResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { wsEmit } from '@/lib/ws-emit';

type Params = { params: Promise<{ id: string; sessionId: string }> };

const MAX_MESSAGE_LEN = 2000;
const HISTORY_LIMIT = 50;

/**
 * GET /api/notebooks/[id]/cowork/[sessionId]/messages
 *
 * Returns the most recent `HISTORY_LIMIT` messages for a cowork session,
 * ordered ascending so the client can render them top-to-bottom directly.
 *
 * Auth: caller must be an active participant of the session.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, sessionId } = await params;

    // Verify session exists and is active for this notebook
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

    // Fetch the latest HISTORY_LIMIT messages, then reverse to ascending
    const recent = await db.coWorkMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      include: {
        user: {
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

    const messages = recent.reverse().map((m) => ({
      id: m.id,
      sessionId: m.sessionId,
      userId: m.userId,
      username: m.user.username,
      avatarUrl: m.user.avatarUrl,
      text: m.text,
      createdAt: m.createdAt.toISOString(),
    }));

    return successResponse({ messages });
  } catch {
    return internalErrorResponse();
  }
}

/**
 * POST /api/notebooks/[id]/cowork/[sessionId]/messages
 *
 * Persist a chat message and broadcast it to all session participants via
 * the ws-server's `/emit` endpoint.
 *
 * Auth: caller must be an active participant.
 *
 * Body: { text: string }
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, sessionId } = await params;

    const body = await request.json().catch(() => ({}));
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return badRequestResponse('Empty message');
    if (text.length > MAX_MESSAGE_LEN) {
      return badRequestResponse(`Message too long (max ${MAX_MESSAGE_LEN} chars)`);
    }

    // Verify session + active participation
    const session = await db.coWorkSession.findFirst({
      where: { id: sessionId, notebookId, isActive: true },
      select: { id: true },
    });
    if (!session) return notFoundResponse('Session not found or inactive');

    const participant = await db.coWorkParticipant.findFirst({
      where: { sessionId, userId, isActive: true },
      select: { id: true },
    });
    if (!participant) return forbiddenResponse('Not an active participant');

    // Persist
    const message = await db.coWorkMessage.create({
      data: {
        sessionId,
        userId,
        text,
      },
      include: {
        user: {
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

    const payload = {
      id: message.id,
      sessionId: message.sessionId,
      userId: message.userId,
      username: message.user.username,
      avatarUrl: message.user.avatarUrl,
      text: message.text,
      createdAt: message.createdAt.toISOString(),
    };

    // Fan out to all sockets in the session room (fire-and-forget)
    await wsEmit({
      room: `session:${sessionId}`,
      event: 'cowork:message',
      data: payload,
    });

    return createdResponse(payload);
  } catch {
    return internalErrorResponse();
  }
}
