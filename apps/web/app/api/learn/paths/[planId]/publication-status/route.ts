// Phase 2 of plans/path-publishing-community-library.md — author-facing
// poll endpoint. The publish status page (and the path card in the list
// view, indirectly via the publication field on SerializedPath) hits
// this to refresh the moderation state and audit summary.
//
// Per P0 spec §4.2 the audit summary is safe to expose to the author for
// their own path — they get layer/verdict/reasonCode/createdAt but not
// the full reasoning text (model output) which is admin-only and lives
// on ModerationAudit.reasoning.

import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import type {
  PublicationStatusDTO,
  SharedPathModerationStatus,
  ModerationLayer,
  ModerationVerdict,
} from '@notemage/shared';

type Params = { params: Promise<{ planId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { planId } = await params;

    // Owner check via SharedPath.sharedById. We deliberately don't join
    // through StudyPlan — the SharedPath row is the source of truth for
    // who can see the publication, and SharedPath.sharedById is fixed at
    // publish time (it doesn't change if the StudyPlan ownership is ever
    // reassigned). Non-owner → 404, same existence-leak policy as the
    // rest of the public surface.
    const sharedPath = await db.sharedPath.findUnique({
      where: { planId },
      select: {
        id: true,
        sharedById: true,
        moderationStatus: true,
        rejectionReason: true,
        audits: {
          orderBy: { createdAt: 'asc' },
          select: {
            layer: true,
            verdict: true,
            reasonCode: true,
            createdAt: true,
          },
        },
      },
    });

    if (!sharedPath || sharedPath.sharedById !== userId) {
      return notFoundResponse('No publication for this path');
    }

    const audits = sharedPath.audits.map((a) => ({
      // String columns coming back from Postgres — cast to the closed
      // unions so consumers can `switch` on the literal without a
      // round-trip through `string`.
      layer: a.layer as ModerationLayer,
      verdict: a.verdict as ModerationVerdict,
      reasonCode: a.reasonCode,
      createdAt: a.createdAt.toISOString(),
    }));

    const dto: PublicationStatusDTO = {
      shareId: sharedPath.id,
      moderationStatus: sharedPath.moderationStatus as SharedPathModerationStatus,
      rejectionReason: sharedPath.rejectionReason,
      lastAuditAt: audits.length > 0 ? audits[audits.length - 1].createdAt : null,
      audits,
    };

    return successResponse(dto);
  } catch (error) {
    console.error('[learn/paths/[planId]/publication-status GET]', error);
    return internalErrorResponse();
  }
}
