// Phase 2 of plans/path-publishing-community-library.md — state-machine
// publish endpoint. Creates a SharedPath in `pending`. Moderation (L1
// inline, L2 async, etc.) hooks into this state in P3+; this phase only
// owns the row lifecycle: create on first call, return existing on retry,
// 409 if the underlying StudyPlan isn't `ready` yet.
//
// Phase 3 extension: after the SharedPath row is persisted in `pending`,
// L1 (wordlist filter) runs synchronously and transitions the row to
// either `auditing_l2` (pass) or `rejected` (block hit) per AC-Publish-5
// and AC-Moderate-2.
//
// Phase 4 extension: when L1 passes (state → `auditing_l2`) we kick off
// L2 (cheap-model safety / spam / off-topic audit) fire-and-forget per
// the existing async pattern (`void runLayer2().catch(...)`). The L2
// runner is reentrant and idempotent so a duplicate fire is safe; the
// publish response still returns the post-L1 status because L2 is
// off-request work the client polls for via the publication-status
// endpoint.
//
// Phase 11 extension: the seeded-bypass branch (P0 spec §4.1) is now
// wired. When an ADMIN publishes with `seeded: true`, the SharedPath is
// created directly in `approved` (skipping L1/L2/L3), `approvedAt` and
// `popularityTriggeredAt` are stamped, an `AdminAuditLog{action:
// 'shared_path.approve', details:{seeded:true}}` row is written, and the
// popular-language pre-translation fan-out fires immediately so the
// free-funnel anchor is cache-warm for the first viewer. A non-admin
// passing `seeded: true` is silently treated as a regular publish.
//
// Non-owner → 404 (existence-leak policy, same as the rest of the public
// surface). Not 403.

import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { getAuthUserId, getAdminUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { logAdminAction } from '@/lib/admin-audit';
import { runLayer1 } from '@/lib/moderation/layer1-runner';
import { runLayer2 } from '@/lib/moderation/layer2-runner';
import { runPretranslationFanOut } from '@/lib/translation/pretranslate';
import { costRateLimit, rateLimitKey } from '@/lib/rate-limit';
import { reserveUsage, refundUsage } from '@/lib/usage-limits';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  conflictResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';

interface PublishBody {
  title?: string;
  description?: string;
  coverImageUrl?: string;
  // Admin-only per P0 §4.1; silently ignored for non-admins. Wired in
  // P11 — see the seeded-bypass branch below and the file header.
  seeded?: boolean;
  // Theory-visuals: author opts in to sharing the images embedded in the
  // path's lessons. Defaults false (privacy-conservative); the clone flow
  // reads SharedPath.includeImages to copy-or-strip embedded figures.
  includeImages?: boolean;
}

type Params = { params: Promise<{ planId: string }> };

// Per P0 spec §4.1 — Response 200 carries this DTO whether the row was
// created on this call or already existed (idempotent retry).
interface PublishResponse {
  shareId: string;
  moderationStatus: string;
  rejectionReason: string | null;
  createdAt: string;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { planId } = await params;

    // Idempotency check first — re-running publish on the same plan
    // returns the existing row without retouching the state machine.
    // We check sharedById to keep the existence-leak policy tight: a
    // non-owner who somehow knows the planId still gets 404, not 200.
    const existing = await db.sharedPath.findUnique({
      where: { planId },
      select: {
        id: true,
        sharedById: true,
        moderationStatus: true,
        rejectionReason: true,
        createdAt: true,
      },
    });

    if (existing) {
      if (existing.sharedById !== userId) return notFoundResponse('Path not found');
      const payload: PublishResponse = {
        shareId: existing.id,
        moderationStatus: existing.moderationStatus,
        rejectionReason: existing.rejectionReason,
        createdAt: existing.createdAt.toISOString(),
      };
      return successResponse(payload);
    }

    // Owner check + snapshot fields. `findFirst` with `userId` keeps
    // ownership and existence in one query; non-owner sees 404.
    const plan = await db.studyPlan.findFirst({
      where: { id: planId, userId },
      select: {
        id: true,
        title: true,
        description: true,
        generationStatus: true,
        language: true,
        subjects: true,
        _count: { select: { phases: true } },
        phases: { select: { _count: { select: { slots: true } } } },
      },
    });
    if (!plan) return notFoundResponse('Path not found');

    // P0 AC-Publish-2 — reject any non-ready state. `generating` /
    // `queued` / `failed` all fail with the same typed error so the
    // client can localise the copy once.
    if (plan.generationStatus !== 'ready') {
      return conflictResponse('path_not_ready');
    }

    const body = (await request.json().catch(() => ({}))) as PublishBody;

    // Author override on the publication's public-facing fields. Plan
    // title is the snapshot default; overrides are length-bounded so the
    // list cards stay readable. Empty strings collapse back to the plan
    // defaults so the author can clear an override accidentally.
    const titleOverride =
      typeof body.title === 'string' && body.title.trim().length > 0
        ? body.title.trim().slice(0, 200)
        : null;
    const descriptionOverride =
      typeof body.description === 'string' && body.description.trim().length > 0
        ? body.description.trim().slice(0, 10000)
        : null;
    const coverImageUrl =
      typeof body.coverImageUrl === 'string' && body.coverImageUrl.trim().length > 0
        ? body.coverImageUrl.trim().slice(0, 500)
        : null;
    // Theory-visuals: only `true` opts in; anything else (absent / false)
    // keeps embedded figures private to the author's copy.
    const includeImages = body.includeImages === true;

    const slotCount = plan.phases.reduce((acc, p) => acc + p._count.slots, 0);

    // P11 — seeded-path admin bypass (P0 §4.1). Only honoured for an
    // admin caller; a non-admin's `seeded:true` falls through to the
    // regular `pending` → L1 → L2 flow below. Creates the SharedPath
    // directly in `approved` (skips L1/L2/L3), stamps approvedAt +
    // popularityTriggeredAt, writes the admin audit row, and fires the
    // popular-language pre-translation fan-out so the funnel anchor is
    // cache-warm for the first viewer.
    if (body.seeded === true) {
      const adminId = await getAdminUserId(request);
      if (adminId) {
        const now = new Date();
        let seededRow;
        try {
          seededRow = await db.sharedPath.create({
            data: {
              planId: plan.id,
              sharedById: userId,
              title: titleOverride ?? plan.title,
              description: descriptionOverride ?? plan.description ?? null,
              coverImageUrl,
              language: plan.language,
              subjects: plan.subjects,
              phaseCount: plan._count.phases,
              slotCount,
              includeImages,
              moderationStatus: 'approved',
              seeded: true,
              approvedAt: now,
              popularityTriggeredAt: now,
            },
            select: {
              id: true,
              moderationStatus: true,
              rejectionReason: true,
              createdAt: true,
            },
          });
        } catch (err) {
          // Race with a concurrent publish — @@unique([planId]) trips
          // P2002. Re-read and return the existing row (idempotent).
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
          ) {
            const race = await db.sharedPath.findUnique({
              where: { planId },
              select: {
                id: true,
                sharedById: true,
                moderationStatus: true,
                rejectionReason: true,
                createdAt: true,
              },
            });
            if (race && race.sharedById === userId) {
              const payload: PublishResponse = {
                shareId: race.id,
                moderationStatus: race.moderationStatus,
                rejectionReason: race.rejectionReason,
                createdAt: race.createdAt.toISOString(),
              };
              return successResponse(payload);
            }
          }
          throw err;
        }

        // AC-Auditability — a seeded publish is an admin moderation
        // decision; log the bypass with the seeded marker (P0 §3.7).
        await logAdminAction(adminId, 'shared_path.approve', seededRow.id, {
          seeded: true,
        });

        // Cache-warm the funnel anchor — fire-and-forget, never on the
        // publish response's critical path.
        void runPretranslationFanOut(seededRow.id).catch((fanErr) => {
          console.error('[publish seeded] pre-translation fan-out failed', fanErr);
        });

        const payload: PublishResponse = {
          shareId: seededRow.id,
          moderationStatus: seededRow.moderationStatus,
          rejectionReason: seededRow.rejectionReason,
          createdAt: seededRow.createdAt.toISOString(),
        };
        return successResponse(payload);
      }
    }

    // Guard the L1 → L2(Gemini) → L3(Sonnet) moderation chain that the
    // regular publish path kicks off below. Without this, a
    // publish/unpublish/republish loop could re-run the (paid) L2/L3 audit
    // on every cycle without bound. The cost-aware limiter fails CLOSED in
    // prod so a Redis outage can't uncap the moderation COGS; the
    // moderation_audit meter is the per-user anti-abuse cap. Both sit after
    // the admin seeded-bypass (which skips L1/L2/L3 entirely) so seeded
    // publishes never consume a moderation credit.
    const rl = await costRateLimit(rateLimitKey('path-publish', request, userId), 10, 60_000);
    if (!rl.success) {
      return tooManyRequestsResponse(
        'Too many publish attempts. Please wait a moment and try again.',
        rl.retryAfterMs,
      );
    }
    const reservation = await reserveUsage(userId, 'moderation_audit');
    if (!reservation.allowed) {
      return tooManyRequestsResponse(
        'Moderation review limit reached for this month. Please try again later.',
      );
    }

    let created;
    try {
      created = await db.sharedPath.create({
        data: {
          planId: plan.id,
          sharedById: userId,
          title: titleOverride ?? plan.title,
          description: descriptionOverride ?? plan.description ?? null,
          coverImageUrl,
          language: plan.language,
          subjects: plan.subjects,
          phaseCount: plan._count.phases,
          slotCount,
          includeImages,
          moderationStatus: 'pending',
        },
        select: {
          id: true,
          moderationStatus: true,
          rejectionReason: true,
          createdAt: true,
        },
      });
    } catch (err) {
      // The SharedPath was never created, so moderation won't run on this
      // request — return the reserved moderation_audit credit before exiting
      // down either branch below.
      await refundUsage(userId, 'moderation_audit');
      // Race with a concurrent publish — the @@unique([planId]) trips
      // P2002. Re-read and return the existing row so the second caller
      // still gets a useful 200 instead of a 500. The existing row
      // already had L1 run by the racer, so we don't re-run here.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const race = await db.sharedPath.findUnique({
          where: { planId },
          select: {
            id: true,
            sharedById: true,
            moderationStatus: true,
            rejectionReason: true,
            createdAt: true,
          },
        });
        if (race && race.sharedById === userId) {
          const payload: PublishResponse = {
            shareId: race.id,
            moderationStatus: race.moderationStatus,
            rejectionReason: race.rejectionReason,
            createdAt: race.createdAt.toISOString(),
          };
          return successResponse(payload);
        }
      }
      throw err;
    }

    // Phase 3 — run L1 wordlist filter synchronously. judgeL1 transitions
    // the SharedPath state machine + writes the ModerationAudit row + on
    // reject also writes a Notification, all in one transaction. If L1
    // itself fails we still return the row in `pending` to the caller —
    // the path can be re-judged once the bug is fixed, no need to undo
    // the publish.
    let postL1Status = created.moderationStatus;
    let postL1Reason = created.rejectionReason;
    try {
      const l1 = await runLayer1(created.id);
      postL1Status = l1.status;
      postL1Reason = l1.judgement.rejectionReason;
    } catch (l1Err) {
      console.error('[publish] L1 run failed; row stays in pending', l1Err);
    }

    // Phase 4 — fire-and-forget L2 when L1 passed. Same shape as
    // path-generation's Stage B fire-and-forget (`void … .catch(...)`):
    // we don't await the result, errors are logged but never surfaced
    // to the publish response. The client polls publication-status to
    // observe the transition out of `auditing_l2`. The L2 runner is
    // reentrant (idempotency guard checks `moderationStatus`) so a
    // duplicate fire from a retry-then-race is a quiet no-op.
    if (postL1Status === 'auditing_l2') {
      void runLayer2(created.id).catch((l2Err) => {
        console.error('[publish] L2 background run failed', l2Err);
      });
    }

    const payload: PublishResponse = {
      shareId: created.id,
      moderationStatus: postL1Status,
      rejectionReason: postL1Reason,
      createdAt: created.createdAt.toISOString(),
    };
    return successResponse(payload);
  } catch (error) {
    console.error('[learn/paths/[planId]/publish POST]', error);
    return internalErrorResponse();
  }
}
