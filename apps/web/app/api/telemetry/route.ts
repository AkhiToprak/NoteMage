import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  tooManyRequestsResponse,
} from '@/lib/api-response';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';
import { logTelemetry } from '@/lib/telemetry-server';

/**
 * Minimal telemetry sink. Auth-gated POST that emits a structured
 * `console.info` line — Coolify captures stdout, which is enough for v1.
 *
 * Phase 7 client surface fires `quiz.streak_hit` and `quiz.perfect` here;
 * server-side path events bypass the HTTP hop and call `logTelemetry`
 * directly from the attempts route.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Rate limit: 60 events per minute per user
    const rl = await rateLimit(rateLimitKey('telemetry', request, userId), 60, 60_000);
    if (!rl.success) return tooManyRequestsResponse('Too many telemetry events.', rl.retryAfterMs);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return badRequestResponse('Invalid body');
    }
    const { event, props } = body as { event?: unknown; props?: unknown };
    if (typeof event !== 'string' || event.length === 0 || event.length > 100) {
      return badRequestResponse('Invalid event name');
    }

    logTelemetry(userId, event, isPlainObject(props) ? props : undefined);
    return successResponse({ ok: true });
  } catch (error) {
    console.error('[telemetry] handler error:', error);
    return successResponse({ ok: false });
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
