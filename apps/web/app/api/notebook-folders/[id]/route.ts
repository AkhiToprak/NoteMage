import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await params;

    const folder = await db.notebookFolder.findFirst({
      where: { id, userId },
      include: {
        _count: {
          select: { children: true, notebooks: true },
        },
      },
    });

    if (!folder) return notFoundResponse('Folder not found');

    // Build breadcrumb path by walking up parentId chain
    const breadcrumbs: Array<{ id: string; name: string }> = [];
    let currentId: string | null = folder.id;

    // Walk up the tree (cap at 20 to prevent infinite loops on corrupted data)
    for (let i = 0; i < 20 && currentId; i++) {
      const node: { id: string; name: string; parentId: string | null } | null =
        await db.notebookFolder.findFirst({
          where: { id: currentId, userId },
          select: { id: true, name: true, parentId: true },
        });
      if (!node) break;
      breadcrumbs.unshift({ id: node.id, name: node.name });
      currentId = node.parentId;
    }

    return successResponse({ folder, breadcrumbs });
  } catch {
    return internalErrorResponse();
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await params;

    const existing = await db.notebookFolder.findFirst({
      where: { id, userId },
    });
    if (!existing) return notFoundResponse('Folder not found');

    const body = await request.json();
    const { name, color, parentId } = body;

    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
      return badRequestResponse('Folder name cannot be empty');
    }
    if (name !== undefined && name.trim().length > 100) {
      return badRequestResponse('Folder name must be 100 characters or less');
    }
    if (color !== undefined && color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return badRequestResponse('Color must be a valid hex color (e.g. #8c52ff)');
    }

    // If changing parentId, prevent circular references
    if (parentId !== undefined && parentId !== existing.parentId) {
      if (parentId === id) {
        return badRequestResponse('A folder cannot be its own parent');
      }
      if (parentId) {
        // Walk up from target parent to ensure we don't hit the folder being moved
        let checkId: string | null = parentId;
        for (let i = 0; i < 20 && checkId; i++) {
          if (checkId === id) {
            return badRequestResponse('Cannot move folder into one of its own subfolders');
          }
          const parent = await db.notebookFolder.findFirst({
            where: { id: checkId, userId },
            select: { parentId: true },
          });
          if (!parent) break;
          checkId = parent.parentId;
        }
      }
    }

    const updated = await db.notebookFolder.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(color !== undefined && { color: color || null }),
        ...(parentId !== undefined && { parentId: parentId || null }),
      },
      include: {
        _count: {
          select: { children: true, notebooks: true },
        },
      },
    });

    return successResponse(updated);
  } catch {
    return internalErrorResponse();
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await params;

    const existing = await db.notebookFolder.findFirst({
      where: { id, userId },
    });
    if (!existing) return notFoundResponse('Folder not found');

    // Cascade deletes child folders; notebooks get folderId: null (SetNull)
    await db.notebookFolder.delete({ where: { id } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
