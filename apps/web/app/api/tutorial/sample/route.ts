// POST /api/tutorial/sample — materialize a guided-tutorial sample subject into
// the caller's account (a real Notebook + StudyPlan), idempotently and with zero
// AI cost. Returns the ids needed to deep-link the handoff into the real path
// player. Bounded by construction: at most one plan per (user, sampleId), and
// only the three known sampleIds are accepted.

import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import {
  successResponse,
  unauthorizedResponse,
  badRequestResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { isSampleId } from '@/lib/sample-paths/catalog';
import { materializeSamplePath } from '@/lib/sample-paths/materialize';

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = (await request.json().catch(() => null)) as { sampleId?: unknown } | null;
    const sampleId = body?.sampleId;
    if (typeof sampleId !== 'string' || !isSampleId(sampleId)) {
      return badRequestResponse('Unknown sampleId');
    }

    const result = await materializeSamplePath(userId, sampleId);
    return successResponse(result);
  } catch (error) {
    console.error('[tutorial/sample POST]', error);
    return internalErrorResponse();
  }
}
