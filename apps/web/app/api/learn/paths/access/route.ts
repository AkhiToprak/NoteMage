// Phase 12 (path-publishing) — capability probe for the create-path UX.
//
// The FREE-tier AI-path switchover is gated by a server env var that must
// flip at runtime (container restart, no rebuild — AC-Switch-5), so it
// can't be a NEXT_PUBLIC var the client reads directly. This endpoint is
// how the client learns, at request time, whether the current user may
// still generate AI paths. When it returns `canGenerate: false` the
// create CTA routes to the community library instead of opening the
// generator (AC-Switch-3).
//
// Tier/role are read from the DB, NOT the JWT: a fresh upgrade — especially
// one fulfilled by a webhook while the user is on another device — updates
// User.tier immediately, but the caller's 7-day JWT keeps the stale tier
// until they re-login or call useSession().update(). Gating this probe on the
// token would route a paying PRO user to the community library instead of the
// generator. One indexed PK lookup is cheap for a UX probe. The authoritative
// gate still lives in POST /api/learn/paths (checkUsageLimit, also DB-backed).

import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { freeTierAiPathsDisabled } from '@/lib/feature-flags';

interface PathAccessResponse {
  canGenerate: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { tier: true, role: true },
    });
    if (!user) return unauthorizedResponse();

    const privileged = user.role === 'admin' || user.tier === 'PRO';
    const canGenerate = privileged || !freeTierAiPathsDisabled();

    const payload: PathAccessResponse = { canGenerate };
    return successResponse(payload);
  } catch (error) {
    console.error('[learn/paths/access GET]', error);
    return internalErrorResponse();
  }
}
