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

    const notebook = await db.notebook.findFirst({
      where: { id, userId },
      include: {
        documents: {
          orderBy: { createdAt: 'desc' },
        },
        sections: {
          orderBy: { sortOrder: 'asc' },
          include: {
            pages: {
              orderBy: { sortOrder: 'asc' },
              select: { id: true, title: true },
            },
          },
        },
        _count: {
          select: { chatMessages: true },
        },
      },
    });

    if (!notebook) return notFoundResponse('Notebook not found');

    return successResponse(notebook);
  } catch {
    return internalErrorResponse();
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await params;

    const existing = await db.notebook.findFirst({
      where: { id, userId },
    });
    if (!existing) return notFoundResponse('Notebook not found');

    const body = await request.json();
    const { name, description, subject, color } = body;

    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
      return badRequestResponse('Notebook name cannot be empty');
    }

    const updated = await db.notebook.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(subject !== undefined && { subject: subject?.trim() || null }),
        ...(color !== undefined && { color }),
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

    const existing = await db.notebook.findFirst({
      where: { id, userId },
    });
    if (!existing) return notFoundResponse('Notebook not found');

    await db.notebook.delete({ where: { id } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
