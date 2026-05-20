// Phase 2 of plans/path-publishing-community-library.md — state-machine
// publish endpoint. Creates a SharedPath in `pending`. Moderation (L1
// inline, L2 async, etc.) hooks into this state in P3+; this phase only
// owns the row lifecycle: create on first call, return existing on retry,
// 409 if the underlying StudyPlan isn't `ready` yet.
//
// Phase 3 extension: after the SharedPath row is persisted in `pending`,
// L1 (wordlist filter) runs synchronously and transitions the row to
// either `auditing_l2` (pass) or `rejected` (block hit) per AC-Publish-5
// and AC-Moderate-2. L2's async hook lands in P4.
//
// Per P0 spec §4.1 the seeded-bypass branch (admin + seeded=true →
// approved directly + pre-translation fan-out) is also part of this
// endpoint's contract, but the bypass shortcut depends on AdminAuditLog
// (first-used in P7's admin approve/reject) and the P11 pre-translation
// fan-out hook. P3 keeps the admin-only `seeded` flag silently ignored
// for now; the bypass lands in P7/P11.
//
// Non-owner → 404 (existence-leak policy, same as the rest of the public
// surface). Not 403.

import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { runLayer1 } from '@/lib/moderation/layer1-runner';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  conflictResponse,
  internalErrorResponse,
} from '@/lib/api-response';

interface PublishBody {
  title?: string;
  description?: string;
  coverImageUrl?: string;
  // Admin-only per P0 §4.1; silently ignored for non-admins. Wired up in
  // the moderation phases that introduce the bypass — see file header.
  seeded?: boolean;
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

    const slotCount = plan.phases.reduce((acc, p) => acc + p._count.slots, 0);

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
