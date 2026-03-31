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
          select: { id: true, name: true, username: true, avatarUrl: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, username: true, avatarUrl: true },
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
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      members: group.members.map((m) => ({
        id: m.id,
        userId: m.user.id,
        name: m.user.name,
        username: m.user.username,
        avatarUrl: m.user.avatarUrl,
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

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return forbiddenResponse('Only the owner or an admin can update this group');
    }

    const body = await request.json();
    const { name, description } = body;

    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
      return badRequestResponse('Group name cannot be empty');
    }

    if (name && name.trim().length > 100) {
      return badRequestResponse('Group name must be 100 characters or less');
    }

    const updateData: Record<string, string | null> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;

    if (Object.keys(updateData).length === 0) {
      return badRequestResponse('No fields to update');
    }

    const group = await db.studyGroup.update({
      where: { id },
      data: updateData,
      include: {
        owner: {
          select: { id: true, name: true, username: true, avatarUrl: true },
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
