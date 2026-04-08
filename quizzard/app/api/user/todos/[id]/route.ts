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
import { checkAndUnlockAchievements } from '@/lib/achievement-checker';

type Params = { params: Promise<{ id: string }> };

/**
 * PUT – Update a todo (toggle completed or edit text). Verify ownership.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await params;

    const existing = await db.todo.findFirst({ where: { id, userId } });
    if (!existing) return notFoundResponse('Todo not found');

    const body = await request.json().catch(() => null);
    if (!body) return badRequestResponse('Invalid JSON body');

    const { completed, text } = body as { completed?: boolean; text?: string };

    const data: { completed?: boolean; text?: string } = {};
    if (typeof completed === 'boolean') data.completed = completed;
    if (typeof text === 'string') {
      if (!text.trim()) return badRequestResponse('Text cannot be empty');
      if (text.length > 200) return badRequestResponse('Text must be 200 characters or less');
      data.text = text.trim();
    }

    const updated = await db.todo.update({ where: { id }, data });

    // Check "Time for a break!" achievement when completing a todo
    if (data.completed === true) {
      checkAndUnlockAchievements(userId).catch(console.error);
    }

    return successResponse(updated);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * DELETE – Delete a todo. Verify ownership.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await params;

    const existing = await db.todo.findFirst({ where: { id, userId } });
    if (!existing) return notFoundResponse('Todo not found');

    await db.todo.delete({ where: { id } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
