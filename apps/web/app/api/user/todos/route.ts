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

/**
 * GET – List all todos for the current user, ordered by createdAt desc.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const todos = await db.todo.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return successResponse(todos);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * POST – Create a new todo.
 * Body: { text }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json().catch(() => null);
    if (!body) return badRequestResponse('Invalid JSON body');

    const { text } = body as { text?: string };
    if (!text || !text.trim()) return badRequestResponse('Text is required');
    if (text.length > 200) return badRequestResponse('Text must be 200 characters or less');

    const todo = await db.todo.create({
      data: { userId, text: text.trim() },
    });

    return createdResponse(todo);
  } catch {
    return internalErrorResponse();
  }
}
