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

// GET /api/groups — list groups the user is a member of
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const url = new URL(request.url);
    const typeFilter = url.searchParams.get('type'); // "study_group" | "class" | null

    const memberships = await db.studyGroupMember.findMany({
      where: {
        userId,
        status: 'accepted',
        ...(typeFilter ? { group: { type: typeFilter } } : {}),
      },
      include: {
        group: {
          include: {
            _count: {
              select: {
                members: { where: { status: 'accepted' } },
                notebooks: true,
              },
            },
            owner: {
              select: { id: true, name: true, username: true, avatarUrl: true },
            },
            // Include members for DMs so we can show the other user's info
            members: {
              where: { status: 'accepted' },
              select: {
                userId: true,
                user: { select: { id: true, name: true, username: true, avatarUrl: true } },
              },
            },
            // Latest message for unread detection
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { createdAt: true },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const groups = memberships.map((m) => {
      const lastMsg = m.group.messages[0]?.createdAt || null;
      const hasUnread = lastMsg ? (!m.lastReadAt || lastMsg > m.lastReadAt) : false;
      return {
        id: m.group.id,
        name: m.group.name,
        description: m.group.description,
        avatarUrl: m.group.avatarUrl,
        ownerId: m.group.ownerId,
        owner: m.group.owner,
        type: m.group.type,
        role: m.role,
        memberCount: m.group._count.members,
        notebookCount: m.group._count.notebooks,
        members: m.group.members.map((mem) => ({
          userId: mem.userId,
          ...mem.user,
        })),
        hasUnread,
        lastMessageAt: lastMsg?.toISOString() || null,
        joinedAt: m.joinedAt,
        createdAt: m.group.createdAt,
        updatedAt: m.group.updatedAt,
      };
    });

    return successResponse({ groups, count: groups.length });
  } catch {
    return internalErrorResponse();
  }
}

// POST /api/groups — create a new group
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const { name, description, type = 'study_group', otherUserId } = body;

    const validTypes = ['study_group', 'class', 'direct'];
    if (!validTypes.includes(type)) {
      return badRequestResponse('Invalid group type');
    }

    // === DIRECT MESSAGE FLOW ===
    if (type === 'direct') {
      if (!otherUserId || typeof otherUserId !== 'string') {
        return badRequestResponse('otherUserId is required for direct messages');
      }
      if (otherUserId === userId) {
        return badRequestResponse('Cannot create a DM with yourself');
      }

      // Verify the other user exists
      const otherUser = await db.user.findUnique({ where: { id: otherUserId }, select: { id: true } });
      if (!otherUser) return badRequestResponse('User not found');

      // Check for existing DM between these two users
      const existingDM = await db.studyGroup.findFirst({
        where: {
          type: 'direct',
          AND: [
            { members: { some: { userId, status: 'accepted' } } },
            { members: { some: { userId: otherUserId, status: 'accepted' } } },
          ],
        },
        select: { id: true },
      });

      if (existingDM) {
        return successResponse({ id: existingDM.id, existing: true });
      }

      // Create new DM
      const dm = await db.studyGroup.create({
        data: {
          name: 'DM',
          ownerId: userId,
          type: 'direct',
          allowMemberChat: true,
          allowMemberSharing: true,
          allowMemberInvites: false,
          members: {
            createMany: {
              data: [
                { userId, role: 'member', status: 'accepted' },
                { userId: otherUserId, role: 'member', status: 'accepted' },
              ],
            },
          },
        },
      });

      return createdResponse({ id: dm.id, existing: false });
    }

    // === STUDY GROUP / CLASS FLOW ===
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return badRequestResponse('Group name is required');
    }

    if (name.trim().length > 100) {
      return badRequestResponse('Group name must be 100 characters or less');
    }

    const isClass = type === 'class';
    const creatorRole = isClass ? 'teacher' : 'owner';

    const group = await db.studyGroup.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        ownerId: userId,
        type,
        allowMemberChat: !isClass,
        allowMemberSharing: !isClass,
        allowMemberInvites: !isClass,
        members: {
          create: {
            userId,
            role: creatorRole,
          },
        },
      },
      include: {
        owner: {
          select: { id: true, name: true, username: true, avatarUrl: true },
        },
        _count: {
          select: { members: true, notebooks: true },
        },
      },
    });

    return createdResponse({
      id: group.id,
      name: group.name,
      description: group.description,
      avatarUrl: group.avatarUrl,
      ownerId: group.ownerId,
      owner: group.owner,
      memberCount: group._count.members,
      notebookCount: group._count.notebooks,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    });
  } catch {
    return internalErrorResponse();
  }
}
