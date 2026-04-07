import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  forbiddenResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type RouteContext = { params: Promise<{ id: string }> };

const SENDER_SELECT = { id: true, name: true, username: true, avatarUrl: true } as const;

// GET /api/groups/:id/messages — paginated messages (newest first)
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await context.params;

    const membership = await db.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId } },
    });
    if (!membership || membership.status !== 'accepted') {
      return forbiddenResponse('You are not a member of this group');
    }

    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '30', 10) || 30, 50);

    const messages = await db.groupMessage.findMany({
      where: {
        groupId: id,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        sender: { select: SENDER_SELECT },
      },
    });

    let nextCursor: string | null = null;
    if (messages.length > limit) {
      const extra = messages.pop()!;
      nextCursor = extra.createdAt.toISOString();
    }

    return successResponse({
      messages: messages.map((m) => ({
        id: m.id,
        groupId: m.groupId,
        senderId: m.senderId,
        sender: m.sender,
        type: m.type,
        content: m.content,
        metadata: m.metadata,
        createdAt: m.createdAt,
      })),
      nextCursor,
    });
  } catch {
    return internalErrorResponse();
  }
}

// POST /api/groups/:id/messages — send a message
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await context.params;

    const membership = await db.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId } },
    });
    if (!membership || membership.status !== 'accepted') {
      return forbiddenResponse('You are not a member of this group');
    }

    const body = await request.json();
    const { content, type = 'text', metadata } = body;

    if (type === 'text') {
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return badRequestResponse('Message content is required');
      }
      if (content.trim().length > 2000) {
        return badRequestResponse('Message must be 2000 characters or less');
      }
    }

    const message = await db.groupMessage.create({
      data: {
        groupId: id,
        senderId: userId,
        type,
        content: typeof content === 'string' ? content.trim() : content,
        metadata: metadata || undefined,
      },
      include: {
        sender: { select: SENDER_SELECT },
      },
    });

    return successResponse({
      id: message.id,
      groupId: message.groupId,
      senderId: message.senderId,
      sender: message.sender,
      type: message.type,
      content: message.content,
      metadata: message.metadata,
      createdAt: message.createdAt,
    });
  } catch {
    return internalErrorResponse();
  }
}
