// Capability probe for the create-path UX — tells the client whether the
// current user may generate AI paths (a Pro feature). When it returns
// `canGenerate: false` the create CTA points to /pricing instead of opening
// the generator.
//
// Tier/role are read from the DB, NOT the JWT: a fresh upgrade — especially
// one fulfilled by a webhook while the user is on another device — updates
// User.tier immediately, but the caller's 7-day JWT keeps the stale tier
// until they re-login. One indexed PK lookup is cheap for a UX probe. The
// authoritative gate still lives in POST /api/learn/paths (checkUsageLimit).

import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

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

    const canGenerate = user.role === 'admin' || user.tier === 'PRO';

    const payload: PathAccessResponse = { canGenerate };
    return successResponse(payload);
  } catch (error) {
    console.error('[learn/paths/access GET]', error);
    return internalErrorResponse();
  }
}
