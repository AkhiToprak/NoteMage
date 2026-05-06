import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';
import { COSMETICS } from '@/lib/cosmetics/catalog';

/**
 * GET /api/user/cosmetics/pending-unlocks
 *
 * Returns every `cosmetic_unlocked` notification the user has that hasn't
 * been marked read. The `<UnlockProvider>` polls this endpoint on a short
 * interval and turns each row into a rich toast (with the actual swatch
 * preview) — a dedicated surface for unlocks, instead of lumping them in
 * with the generic notification bell.
 *
 * Shape:
 * {
 *   unlocks: Array<{
 *     id: string,             // notification id, used to mark read
 *     cosmeticId: string,     // slug — callers resolve it via COSMETICS[]
 *     cosmeticType: CosmeticType,
 *     label: string,
 *     requiredLevel: number,
 *     createdAt: string,
 *   }>
 * }
 *
 * Unknown slugs (e.g. because the catalog was edited after the notification
 * was created) are dropped so the client never sees dangling rows. The
 * underlying notification row is left in place so the notification bell can
 * still show it as a text-only entry.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const rows = await db.notification.findMany({
      where: { userId, type: 'cosmetic_unlocked', read: false },
      orderBy: { createdAt: 'asc' },
      select: { id: true, data: true, createdAt: true },
      take: 50,
    });

    const unlocks = rows
      .map((row) => {
        // row.data is Prisma JsonValue — could be null, array, or primitive.
        // Narrow to plain object before reading cosmeticId.
        const data =
          row.data && typeof row.data === 'object' && !Array.isArray(row.data)
            ? (row.data as Record<string, unknown>)
            : null;
        const cosmeticId = typeof data?.cosmeticId === 'string' ? data.cosmeticId : null;
        if (!cosmeticId) return null;
        const entry = COSMETICS[cosmeticId];
        if (!entry) return null;
        return {
          id: row.id,
          cosmeticId,
          cosmeticType: entry.type,
          label: entry.label,
          requiredLevel: entry.requiredLevel,
          createdAt: row.createdAt.toISOString(),
        };
      })
      .filter((u): u is NonNullable<typeof u> => u !== null);

    return successResponse({ unlocks });
  } catch {
    return internalErrorResponse();
  }
}
