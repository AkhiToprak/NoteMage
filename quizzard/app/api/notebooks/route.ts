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

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const notebooks = await db.notebook.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { documents: true, sections: true },
        },
        sections: {
          select: {
            _count: { select: { pages: true } },
          },
        },
      },
    });

    // Add total pages count to each notebook
    const enriched = notebooks.map((nb) => {
      const totalPages = nb.sections.reduce((sum, s) => sum + s._count.pages, 0);
      const { sections: _sections, ...rest } = nb;
      return { ...rest, _count: { ...rest._count, pages: totalPages } };
    });

    return successResponse(enriched);
  } catch {
    return internalErrorResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const { name, description, subject, color } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return badRequestResponse('Notebook name is required');
    }

    const notebook = await db.notebook.create({
      data: {
        userId,
        name: name.trim(),
        description: description?.trim() || null,
        subject: subject?.trim() || null,
        color: color || '#8c52ff',
      },
    });

    return createdResponse(notebook);
  } catch {
    return internalErrorResponse();
  }
}
