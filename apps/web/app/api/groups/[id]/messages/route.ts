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
import { canPerformAction } from '@/lib/group-permissions';

type RouteContext = { params: Promise<{ id: string }> };

const SENDER_SELECT = {
  id: true,
  name: true,
  username: true,
  avatarUrl: true,
  nameStyle: true,
  equippedTitleId: true,
  equippedFrameId: true,
} as const;

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

    const [messages, otherMembers] = await Promise.all([
      db.groupMessage.findMany({
        where: {
          groupId: id,
          ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        include: {
          sender: { select: SENDER_SELECT },
        },
      }),
      // Fetch all OTHER accepted members' lastReadAt for read status
      db.studyGroupMember.findMany({
        where: { groupId: id, status: 'accepted', userId: { not: userId } },
        select: { lastReadAt: true },
      }),
    ]);

    let nextCursor: string | null = null;
    if (messages.length > limit) {
      const extra = messages.pop()!;
      nextCursor = extra.createdAt.toISOString();
    }

    const totalOthers = otherMembers.length;

    return successResponse({
      messages: messages.map((m) => {
        // Compute read status: how many others have lastReadAt >= message.createdAt
        let status: 'delivered' | 'read' = 'delivered';
        if (totalOthers > 0 && m.senderId === userId) {
          const readCount = otherMembers.filter(
            (om) => om.lastReadAt && om.lastReadAt >= m.createdAt
          ).length;
          if (readCount >= totalOthers) status = 'read';
        }
        return {
          id: m.id,
          groupId: m.groupId,
          senderId: m.senderId,
          sender: m.sender,
          type: m.type,
          content: m.content,
          metadata: m.metadata,
          createdAt: m.createdAt,
          status,
        };
      }),
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

    // Permission check for classes
    const group = await db.studyGroup.findUnique({
      where: { id },
      select: { type: true, allowMemberChat: true },
    });
    if (group && !canPerformAction(group.type, membership.role, group.allowMemberChat)) {
      return forbiddenResponse('Chat is restricted by the teacher');
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

    // Notify all other accepted members (fire-and-forget, non-blocking)
    if (group && message.sender) {
      (async () => {
        try {
          const otherMembers = await db.studyGroupMember.findMany({
            where: { groupId: id, status: 'accepted', userId: { not: userId } },
            select: { userId: true },
          });
          if (otherMembers.length > 0) {
            const groupInfo = await db.studyGroup.findUnique({
              where: { id },
              select: { name: true, type: true },
            });
            const notifType = groupInfo?.type === 'direct' ? 'dm_message' : 'group_message';
            const preview = typeof content === 'string' ? content.trim().slice(0, 50) : '';
            await db.notification.createMany({
              data: otherMembers.map((m) => ({
                userId: m.userId,
                type: notifType,
                data: {
                  groupId: id,
                  groupName: groupInfo?.name || '',
                  senderName: message.sender?.name || message.sender?.username || 'Someone',
                  senderUsername: message.sender?.username || '',
                  messagePreview: preview,
                },
              })),
            });
          }
        } catch {
          /* notification failure should not break message sending */
        }
      })();
    }

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
