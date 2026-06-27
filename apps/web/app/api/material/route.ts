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
import { checkAndUnlockAchievements } from '@/lib/achievement-checker';

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const where = { userId };

    const notebooks = await db.studyContainer.findMany({
      where,
      // Phase 9 — the Inbox notebook (kind='inbox') pins to the top of the
      // notebooks list so ad-hoc chat uploads are always discoverable. Among
      // standard notebooks, the existing "most recently modified first" rule
      // is preserved. `kind` is sorted ascending because 'inbox' < 'standard'.
      orderBy: [{ kind: 'asc' }, { updatedAt: 'desc' }],
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
    if (name.trim().length > 100) {
      return badRequestResponse('Notebook name must be 100 characters or less');
    }
    if (description && description.length > 500) {
      return badRequestResponse('Description must be 500 characters or less');
    }
    if (subject && subject.length > 100) {
      return badRequestResponse('Subject must be 100 characters or less');
    }
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return badRequestResponse('Color must be a valid hex color (e.g. #8c52ff)');
    }

    const notebook = await db.studyContainer.create({
      data: {
        userId,
        name: name.trim(),
        description: description?.trim() || null,
        subject: subject?.trim() || null,
        color: color || '#8c52ff',
      },
    });

    checkAndUnlockAchievements(userId).catch(console.error);

    return createdResponse(notebook);
  } catch {
    return internalErrorResponse();
  }
}
