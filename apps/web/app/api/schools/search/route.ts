import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';

/**
 * School autocomplete for the onboarding SchoolStep. Returns distinct
 * `User.school` values, ranked by how many users picked each, so the
 * suggestion list grows with the user base instead of needing a curated
 * taxonomy. An empty query surfaces the most-popular schools as a starting
 * hint; a non-empty query does a case-insensitive contains match.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const rl = await rateLimit(
      rateLimitKey('school:search', request, userId),
      30,
      60 * 1000,
    );
    if (!rl.success) {
      return tooManyRequestsResponse('Too many search requests.', rl.retryAfterMs);
    }

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') ?? '').trim().slice(0, 100);

    const grouped = await db.user.groupBy({
      by: ['school'],
      where: {
        school: query
          ? { contains: query, mode: 'insensitive' }
          : { not: null },
        onboardingComplete: true,
      },
      _count: { school: true },
      orderBy: { _count: { school: 'desc' } },
      take: 10,
    });

    const schools = grouped
      .filter((g): g is typeof g & { school: string } => Boolean(g.school))
      .map((g) => ({ name: g.school, userCount: g._count.school }));

    return successResponse({ schools });
  } catch {
    return internalErrorResponse();
  }
}
