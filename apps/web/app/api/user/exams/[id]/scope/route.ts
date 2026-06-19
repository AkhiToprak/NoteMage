import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import {
  authorizeScopeItems,
  loadExamScopeView,
  parseScopeItems,
  replaceExamScope,
} from '@/lib/exam-scope';

type Params = { params: Promise<{ id: string }> };

/**
 * GET – the exam's current scope (resolved to titles) plus the pickable
 * candidates (all the user's paths + the backing notebook's content) for the
 * scope-editing UI. Mage Revolution Phase 5.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await params;
    const view = await loadExamScopeView(userId, id);
    if (!view) return notFoundResponse('Exam not found');

    return successResponse(view);
  } catch (error) {
    console.error('[exams/:id/scope GET]', error);
    return internalErrorResponse();
  }
}

/**
 * PUT – replace the exam's scope. Body: `{ items: { itemType, itemId }[] }`.
 * Every referenced id is RE-AUTHORIZED against the user before it's stored;
 * unowned/unknown refs are dropped. Returns the refreshed scope view.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await params;

    // Ownership of the exam itself gates everything below.
    const before = await loadExamScopeView(userId, id);
    if (!before) return notFoundResponse('Exam not found');

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return badRequestResponse('Invalid JSON body');

    const requested = parseScopeItems((body as { items?: unknown }).items);
    const authorized = await authorizeScopeItems(userId, requested);
    await replaceExamScope(id, authorized);

    const view = await loadExamScopeView(userId, id);
    if (!view) return notFoundResponse('Exam not found');
    return successResponse(view);
  } catch (error) {
    console.error('[exams/:id/scope PUT]', error);
    return internalErrorResponse();
  }
}
