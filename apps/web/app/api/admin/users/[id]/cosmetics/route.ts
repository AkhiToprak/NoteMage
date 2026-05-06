import { NextRequest } from 'next/server';
import { getAdminUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { logAdminAction } from '@/lib/admin-audit';
import { COSMETICS } from '@/lib/cosmetics/catalog';

/**
 * Admin cosmetics grant/revoke endpoint.
 *
 * Used for support (manual grants when automatic unlocks misbehave) and for
 * QA (seeding a test account with every cosmetic without having to grind
 * levels). Not exposed in the UI — admins hit it via curl or an internal
 * tool. Every mutation is written to the admin audit log.
 *
 * POST   { cosmeticId }              → grant (idempotent: no-op if owned)
 * POST   { cosmeticId, all: true }   → grant every entry in the catalog
 * DELETE { cosmeticId }              → revoke a single cosmetic
 *
 * Catalog slugs are validated against COSMETICS on the server so bogus ids
 * can't land in UserCosmetic and confuse the client.
 */

// POST — grant a single cosmetic (or all of them) to the target user
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const adminId = await getAdminUserId(request);
    if (!adminId) return forbiddenResponse('Admin access required');

    const { id: targetId } = await params;

    const target = await db.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!target) return notFoundResponse('User not found');

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return badRequestResponse('JSON body required');
    }

    const grantAll = body.all === true;
    const slugsToGrant: string[] = grantAll
      ? Object.keys(COSMETICS)
      : typeof body.cosmeticId === 'string'
        ? [body.cosmeticId]
        : [];

    if (slugsToGrant.length === 0) {
      return badRequestResponse('Missing cosmeticId (or all: true)');
    }

    // Validate every requested slug exists in the catalog. Reject the whole
    // request on the first unknown one so the caller gets a clear error
    // instead of a silent partial grant.
    const invalid = slugsToGrant.filter((id) => !COSMETICS[id]);
    if (invalid.length > 0) {
      return badRequestResponse(`Unknown cosmetic(s): ${invalid.join(', ')}`);
    }

    // Figure out which of the requested slugs the user doesn't already own.
    const existing = await db.userCosmetic.findMany({
      where: { userId: targetId, cosmeticId: { in: slugsToGrant } },
      select: { cosmeticId: true },
    });
    const ownedSet = new Set(existing.map((r) => r.cosmeticId));
    const newlyGranted = slugsToGrant.filter((id) => !ownedSet.has(id));

    if (newlyGranted.length > 0) {
      await db.$transaction([
        db.userCosmetic.createMany({
          data: newlyGranted.map((cosmeticId) => ({
            userId: targetId,
            cosmeticId,
          })),
          skipDuplicates: true,
        }),
        db.notification.createMany({
          data: newlyGranted.map((cosmeticId) => {
            const entry = COSMETICS[cosmeticId];
            return {
              userId: targetId,
              type: 'cosmetic_unlocked',
              data: {
                cosmeticId,
                label: entry.label,
                cosmeticType: entry.type,
                grantedByAdmin: true,
              },
            };
          }),
        }),
      ]);
    }

    logAdminAction(adminId, 'cosmetic.grant', targetId, {
      requested: slugsToGrant,
      newlyGranted,
      all: grantAll,
    }).catch(() => {});

    return successResponse({
      granted: newlyGranted,
      alreadyOwned: slugsToGrant.filter((id) => ownedSet.has(id)),
    });
  } catch {
    return internalErrorResponse();
  }
}

// DELETE — revoke a single cosmetic. Idempotent: deleting a cosmetic the user
// doesn't own is a no-op that still succeeds. If the revoked cosmetic is
// currently equipped on the user, we also unequip it so the profile doesn't
// render a dangling reference.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminId = await getAdminUserId(request);
    if (!adminId) return forbiddenResponse('Admin access required');

    const { id: targetId } = await params;

    const target = await db.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        equippedTitleId: true,
        equippedFrameId: true,
        equippedBackgroundId: true,
        nameStyle: true,
      },
    });
    if (!target) return notFoundResponse('User not found');

    const { searchParams } = new URL(request.url);
    const cosmeticId = searchParams.get('cosmeticId');
    if (!cosmeticId || !COSMETICS[cosmeticId]) {
      return badRequestResponse('Missing or unknown cosmeticId');
    }

    // Build the "unequip if equipped" patch. nameStyle is stored as JSON,
    // so we rebuild it explicitly with the matching slot omitted instead of
    // relying on `undefined` being dropped during JSON serialization.
    const unequipPatch: Record<string, unknown> = {};
    if (target.equippedTitleId === cosmeticId) unequipPatch.equippedTitleId = null;
    if (target.equippedFrameId === cosmeticId) unequipPatch.equippedFrameId = null;
    if (target.equippedBackgroundId === cosmeticId) unequipPatch.equippedBackgroundId = null;

    const currentStyle = (target.nameStyle ?? {}) as {
      fontId?: string;
      colorId?: string;
    };
    const styleUsesCosmetic =
      currentStyle.fontId === cosmeticId || currentStyle.colorId === cosmeticId;
    if (styleUsesCosmetic) {
      const nextStyle: { fontId?: string; colorId?: string } = {};
      if (currentStyle.fontId && currentStyle.fontId !== cosmeticId) {
        nextStyle.fontId = currentStyle.fontId;
      }
      if (currentStyle.colorId && currentStyle.colorId !== cosmeticId) {
        nextStyle.colorId = currentStyle.colorId;
      }
      unequipPatch.nameStyle = nextStyle;
    }

    await db.$transaction([
      db.userCosmetic.deleteMany({
        where: { userId: targetId, cosmeticId },
      }),
      ...(Object.keys(unequipPatch).length > 0
        ? [
            db.user.update({
              where: { id: targetId },
              data: unequipPatch,
            }),
          ]
        : []),
    ]);

    logAdminAction(adminId, 'cosmetic.revoke', targetId, {
      cosmeticId,
      unequipped: Object.keys(unequipPatch),
    }).catch(() => {});

    return successResponse({ revoked: cosmeticId });
  } catch {
    return internalErrorResponse();
  }
}
