import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { loadPathForUser, serializePath } from '@/lib/path-loader';

// Phase 10.3 — single-plan GET. Returns the full annotated tree
// (phases → slots → activities + unlock / completion flags). The same
// shape the SSE `done` event emits, so the client can hydrate the
// detail view from either path without a second round-trip.

type Params = { params: Promise<{ planId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { planId } = await params;
    const plan = await loadPathForUser(userId, planId);
    if (!plan) return notFoundResponse('Path not found');

    return successResponse(serializePath(plan));
  } catch (error) {
    console.error('[learn/paths/[planId] GET]', error);
    return internalErrorResponse();
  }
}
