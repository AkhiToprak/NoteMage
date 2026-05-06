import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/groups/:id — group details with members and notebooks
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await context.params;

    // Verify the user is a member
    const membership = await db.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId } },
    });

    if (!membership) {
      return forbiddenResponse('You are not a member of this group');
    }

    const group = await db.studyGroup.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true,
            nameStyle: true,
            equippedTitleId: true,
            equippedFrameId: true,
          },
        },
        members: {
          where: { status: 'accepted' },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatarUrl: true,
                nameStyle: true,
                equippedTitleId: true,
                equippedFrameId: true,
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
        notebooks: {
          include: {
            notebook: {
              select: { id: true, name: true, color: true },
            },
          },
          orderBy: { addedAt: 'desc' },
        },
        invitations: {
          where: { status: 'pending' },
          include: {
            invitee: {
              select: {
                id: true,
                name: true,
                username: true,
                avatarUrl: true,
                nameStyle: true,
                equippedTitleId: true,
                equippedFrameId: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!group) {
      return notFoundResponse('Group not found');
    }

    return successResponse({
      id: group.id,
      name: group.name,
      description: group.description,
      avatarUrl: group.avatarUrl,
      ownerId: group.ownerId,
      owner: group.owner,
      type: group.type,
      allowMemberChat: group.allowMemberChat,
      allowMemberSharing: group.allowMemberSharing,
      allowMemberInvites: group.allowMemberInvites,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      members: group.members.map((m) => ({
        id: m.id,
        userId: m.user.id,
        name: m.user.name,
        username: m.user.username,
        avatarUrl: m.user.avatarUrl,
        // Forward cosmetic fields so <UserAvatar>/<UserName> in the DM
        // header, chat byline, and member list all render equipped
        // frame / title / name style correctly.
        nameStyle: m.user.nameStyle,
        equippedTitleId: m.user.equippedTitleId,
        equippedFrameId: m.user.equippedFrameId,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      notebooks: group.notebooks.map((n) => ({
        id: n.id,
        notebookId: n.notebook.id,
        name: n.notebook.name,
        color: n.notebook.color,
        addedById: n.addedById,
        addedAt: n.addedAt,
      })),
      pendingInvites: group.invitations.map((inv) => ({
        id: inv.id,
        invitee: inv.invitee,
        createdAt: inv.createdAt,
      })),
    });
  } catch {
    return internalErrorResponse();
  }
}

// PUT /api/groups/:id — update group name/description (owner/admin only)
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await context.params;

    // Verify the user is owner or admin
    const membership = await db.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId } },
    });

    if (!membership || !['owner', 'admin', 'teacher'].includes(membership.role)) {
      return forbiddenResponse('Only the owner, admin, or teacher can update this group');
    }

    const body = await request.json();
    const { name, description, allowMemberChat, allowMemberSharing, allowMemberInvites } = body;

    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
      return badRequestResponse('Group name cannot be empty');
    }

    if (name && name.trim().length > 100) {
      return badRequestResponse('Group name must be 100 characters or less');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;

    // Permission toggles (only for classes, only by teacher/owner)
    if (allowMemberChat !== undefined && typeof allowMemberChat === 'boolean')
      updateData.allowMemberChat = allowMemberChat;
    if (allowMemberSharing !== undefined && typeof allowMemberSharing === 'boolean')
      updateData.allowMemberSharing = allowMemberSharing;
    if (allowMemberInvites !== undefined && typeof allowMemberInvites === 'boolean')
      updateData.allowMemberInvites = allowMemberInvites;

    if (Object.keys(updateData).length === 0) {
      return badRequestResponse('No fields to update');
    }

    const group = await db.studyGroup.update({
      where: { id },
      data: updateData,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true,
            nameStyle: true,
            equippedTitleId: true,
            equippedFrameId: true,
          },
        },
      },
    });

    return successResponse({
      id: group.id,
      name: group.name,
      description: group.description,
      avatarUrl: group.avatarUrl,
      ownerId: group.ownerId,
      owner: group.owner,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    });
  } catch {
    return internalErrorResponse();
  }
}

// DELETE /api/groups/:id — delete group (owner only)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await context.params;

    // Verify the user is the owner
    const group = await db.studyGroup.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    if (!group) {
      return notFoundResponse('Group not found');
    }

    if (group.ownerId !== userId) {
      return forbiddenResponse('Only the owner can delete this group');
    }

    // Delete all related records and the group
    await db.$transaction([
      db.studyGroupNotebook.deleteMany({ where: { groupId: id } }),
      db.studyGroupMember.deleteMany({ where: { groupId: id } }),
      db.studyGroup.delete({ where: { id } }),
    ]);

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
