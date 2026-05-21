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
// Computed from the JWT (tier + role) so there's no DB round-trip: admins
// and PRO always generate; FREE depends on the flag. The authoritative
// gate still lives in POST /api/learn/paths — this is UX only.

import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
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
    const token = await getToken({ req: request });
    if (!token?.id) return unauthorizedResponse();

    const privileged = token.role === 'admin' || token.tier === 'PRO';
    const canGenerate = privileged || !freeTierAiPathsDisabled();

    const payload: PathAccessResponse = { canGenerate };
    return successResponse(payload);
  } catch (error) {
    console.error('[learn/paths/access GET]', error);
    return internalErrorResponse();
  }
}
