// Phase 2 of plans/path-publishing-community-library.md — DELETE
// (unpublish).
// Phase 8 of the same plan — GET (community detail).
//
// DELETE — per P0 spec §4.3:
//   - Owner OR admin may unpublish.
//   - Cascades: PathTranslation, ModerationAudit, PathRating (schema
//     `onDelete: Cascade`).
//   - Open / assigned Tickets referencing this SharedPath get auto-
//     dismissed with a resolutionNote — Ticket.refType/refId is
//     intentionally not an FK, so the cascade has to happen in code.
//   - Response 204 (no body).
//
// GET — per P0 spec §4.5:
//   - Auth required (user).
//   - 404 if the row is missing or `moderationStatus !== 'approved'`
//     (existence-leak guard — non-public rows must not surface here).
//   - Response shape (P8 scope): `{ source, userRating }`. The `source`
//     payload includes the SharedPath metadata + a phase/slot title
//     preview (titles + kind only — no theory/flashcards/quiz content,
//     per AC-Browse-6). Full content is reserved for clone (P9) or
//     translate-then-view (P10).
//   - `?lang=` is ignored in P8 (translation cache lookup lands in
//     P10); the route always returns the source-language snapshot.
//   - viewCount is incremented once per (user, path) per 24h via a
//     Redis-backed rate limit. Failure to acquire the rate-limit token
//     is the no-op branch — the view still serves, just doesn't tick
//     the counter.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId, getAdminUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { logAdminAction } from '@/lib/admin-audit';
import { rateLimit } from '@/lib/rate-limit';

type Params = { params: Promise<{ shareId: string }> };

// One viewCount increment per (user, path) per 24h. AC-Browse-8 lists
// viewCount as a public social signal; without the throttle a single
// curious user F5-ing the detail page would inflate the metric. The
// rate limiter fails open if Redis is unreachable — at worst we
// over-count, never under-count.
const VIEW_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { shareId } = await params;

    const sharedPath = await db.sharedPath.findUnique({
      where: { id: shareId },
      select: {
        id: true,
        planId: true,
        title: true,
        description: true,
        coverImageUrl: true,
        language: true,
        subjects: true,
        phaseCount: true,
        slotCount: true,
        downloadCount: true,
        viewCount: true,
        ratingAverage: true,
        ratingCount: true,
        seeded: true,
        approvedAt: true,
        createdAt: true,
        moderationStatus: true,
        sharedBy: {
          select: { id: true, username: true, avatarUrl: true },
        },
      },
    });

    // Existence-leak guard: a not-yet-approved path returns the same
    // 404 as a row that genuinely doesn't exist. Same pattern as the
    // admin endpoints' RBAC-by-404.
    if (!sharedPath || sharedPath.moderationStatus !== 'approved') {
      return notFoundResponse('Path not found');
    }

    // AC-Browse-6 — phase + slot titles only. The renderer reserves
    // theory / flashcards / quiz payloads behind the clone (P9) or
    // translate-then-view (P10) flows; loading them here would (a)
    // leak the content the library is meant to gate, and (b) bloat
    // the detail payload unnecessarily for a page that's mostly hero
    // + structure preview + clone CTA.
    const phases = await db.studyPhase.findMany({
      where: { planId: sharedPath.planId },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        title: true,
        sortOrder: true,
        slots: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            title: true,
            description: true,
            kind: true,
            sortOrder: true,
          },
        },
      },
    });

    // Requester's own rating (1..5 or null) — one extra indexed lookup
    // per P0 §4.5; list views deliberately skip this and the detail
    // page is the only place it's surfaced.
    const myRating = await db.pathRating.findUnique({
      where: { sharedPathId_userId: { sharedPathId: shareId, userId } },
      select: { value: true },
    });

    // Existing clone — if the requester already cloned this path, the
    // detail page can flip the "Clone" CTA to "Open your copy". The
    // schema's `clonedFromSharedPathId` column on StudyPlan is the
    // canonical mapping; we cap at the first hit because the clone
    // endpoint (P9) is idempotent per `(userId, sharedPathId)`.
    const existingClone = await db.studyPlan.findFirst({
      where: { userId, clonedFromSharedPathId: shareId },
      select: { id: true },
    });

    // Fire-and-forget viewCount increment. The rate-limit guard keeps
    // the metric honest without putting the user on the critical path
    // — even if Redis is wedged, the detail page still renders.
    void (async () => {
      try {
        const key = `path-view:${userId}:${shareId}`;
        const limit = await rateLimit(key, 1, VIEW_WINDOW_MS);
        if (limit.success) {
          await db.sharedPath.update({
            where: { id: shareId },
            data: { viewCount: { increment: 1 } },
          });
        }
      } catch (err) {
        // Never let a view-counter glitch surface to the user.
        console.error('[community/paths/[shareId] viewCount]', err);
      }
    })();

    return successResponse({
      source: {
        shareId: sharedPath.id,
        title: sharedPath.title,
        description: sharedPath.description,
        coverImageUrl: sharedPath.coverImageUrl,
        language: sharedPath.language,
        subjects: sharedPath.subjects,
        phaseCount: sharedPath.phaseCount,
        slotCount: sharedPath.slotCount,
        downloadCount: sharedPath.downloadCount,
        viewCount: sharedPath.viewCount,
        ratingAverage: sharedPath.ratingAverage,
        ratingCount: sharedPath.ratingCount,
        seeded: sharedPath.seeded,
        approvedAt: sharedPath.approvedAt,
        createdAt: sharedPath.createdAt,
        author: sharedPath.sharedBy,
        phases: phases.map((phase) => ({
          id: phase.id,
          title: phase.title,
          sortOrder: phase.sortOrder,
          slots: phase.slots.map((slot) => ({
            id: slot.id,
            title: slot.title,
            description: slot.description,
            kind: slot.kind,
            sortOrder: slot.sortOrder,
          })),
        })),
      },
      userRating: myRating?.value ?? null,
      userClonePlanId: existingClone?.id ?? null,
    });
  } catch (error) {
    console.error('[community/paths/[shareId] GET]', error);
    return internalErrorResponse();
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const adminId = await getAdminUserId(request);
    const isAdmin = adminId !== null;

    const { shareId } = await params;

    const sharedPath = await db.sharedPath.findUnique({
      where: { id: shareId },
      select: { id: true, sharedById: true, title: true },
    });

    // 404 covers both "doesn't exist" and "not yours and you're not an
    // admin" — same existence-leak policy as the publish endpoint.
    if (!sharedPath) return notFoundResponse('Path not found');
    if (!isAdmin && sharedPath.sharedById !== userId) {
      return notFoundResponse('Path not found');
    }

    const actedByAdmin = isAdmin && sharedPath.sharedById !== userId;
    const resolutionNote = actedByAdmin
      ? 'path deleted by admin'
      : 'path deleted by author';

    await db.$transaction([
      // Auto-dismiss any non-terminal tickets referencing this path
      // (P0 spec AC-Publish-6). `resolvedById` records *who* dismissed
      // it — useful when an admin force-deletes someone else's path.
      db.ticket.updateMany({
        where: {
          refType: 'SharedPath',
          refId: shareId,
          status: { in: ['open', 'assigned'] },
        },
        data: {
          status: 'dismissed',
          resolvedAt: new Date(),
          resolutionNote,
          resolvedById: userId,
        },
      }),
      // Cascades PathTranslation, ModerationAudit, PathRating via
      // schema-level onDelete: Cascade.
      db.sharedPath.delete({ where: { id: shareId } }),
    ]);

    // Admin force-unpublish is an audit-worthy event per P0 §3.7 — the
    // `shared_path.unpublish` literal landed in admin-audit.ts in P1.
    // The author-unpublish path doesn't log — it's the author's own
    // content, not a moderation decision.
    if (actedByAdmin && adminId) {
      await logAdminAction(adminId, 'shared_path.unpublish', shareId, {
        originalAuthorId: sharedPath.sharedById,
        title: sharedPath.title,
      });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[community/paths/[shareId] DELETE]', error);
    return internalErrorResponse();
  }
}
