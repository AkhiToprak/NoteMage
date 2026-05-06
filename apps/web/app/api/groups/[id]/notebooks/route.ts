import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  conflictResponse,
  internalErrorResponse,
} from '@/lib/api-response';

// POST /api/groups/:id/notebooks — share a notebook with the group
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: groupId } = await context.params;
    const body = await request.json();
    const { notebookId } = body;

    if (!notebookId || typeof notebookId !== 'string') {
      return badRequestResponse('notebookId is required');
    }

    // Verify the user is a group member
    const membership = await db.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });

    if (!membership) {
      return forbiddenResponse('You are not a member of this group');
    }

    // Verify the user owns the notebook
    const notebook = await db.notebook.findUnique({
      where: { id: notebookId },
      select: { id: true, userId: true, name: true, color: true },
    });

    if (!notebook) {
      return notFoundResponse('Notebook not found');
    }

    if (notebook.userId !== userId) {
      return forbiddenResponse('You can only share notebooks you own');
    }

    // Check if already shared
    const existing = await db.studyGroupNotebook.findUnique({
      where: { groupId_notebookId: { groupId, notebookId } },
    });

    if (existing) {
      return conflictResponse('This notebook is already shared with the group');
    }

    const groupNotebook = await db.studyGroupNotebook.create({
      data: {
        groupId,
        notebookId,
        addedById: userId,
      },
      include: {
        notebook: {
          select: { id: true, name: true, color: true },
        },
      },
    });

    return createdResponse({
      id: groupNotebook.id,
      notebookId: groupNotebook.notebook.id,
      name: groupNotebook.notebook.name,
      color: groupNotebook.notebook.color,
      addedById: groupNotebook.addedById,
      addedAt: groupNotebook.addedAt,
    });
  } catch {
    return internalErrorResponse();
  }
}

// DELETE /api/groups/:id/notebooks — unshare a notebook from the group
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: groupId } = await context.params;
    const body = await request.json();
    const { notebookId } = body;

    if (!notebookId || typeof notebookId !== 'string') {
      return badRequestResponse('notebookId is required');
    }

    // Verify the user is a group member
    const membership = await db.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });

    if (!membership) {
      return forbiddenResponse('You are not a member of this group');
    }

    // Find the shared notebook record
    const groupNotebook = await db.studyGroupNotebook.findUnique({
      where: { groupId_notebookId: { groupId, notebookId } },
    });

    if (!groupNotebook) {
      return notFoundResponse('Notebook is not shared with this group');
    }

    // Must be the one who added it, or an admin/owner
    const isAdder = groupNotebook.addedById === userId;
    const isAdminOrOwner = ['owner', 'admin'].includes(membership.role);

    if (!isAdder && !isAdminOrOwner) {
      return forbiddenResponse(
        'Only the person who shared the notebook or an admin/owner can remove it'
      );
    }

    await db.studyGroupNotebook.delete({
      where: { groupId_notebookId: { groupId, notebookId } },
    });

    return successResponse({ removed: true, notebookId });
  } catch {
    return internalErrorResponse();
  }
}
