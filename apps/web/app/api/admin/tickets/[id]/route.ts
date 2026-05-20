import { NextRequest } from 'next/server';
import { getAdminUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

/**
 * GET /api/admin/tickets/[id] — single ticket with SharedPath summary and
 * the full ModerationAudit chain.
 *
 * AC-Admin-1: non-admin → 404 (existence-leak guard).
 * AC-Admin-3: ticket detail surfaces the SharedPath summary, the FULL
 * ModerationAudit chain (every layer, every reasoning), and a link to
 * the author profile (the API returns the author's username; the UI
 * builds the profile link).
 *
 * Returns 404 (not 500 or a partial payload) when the SharedPath behind
 * the ticket is gone — that indicates an invariant break (auto-dismiss
 * on path delete should have closed this ticket) and the admin should
 * see "not found" rather than half-rendered state.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminId = await getAdminUserId(request);
    if (!adminId) return notFoundResponse();

    const { id: ticketId } = await params;

    const ticket = await db.ticket.findUnique({
      where: { id: ticketId },
      include: {
        assignee: { select: { id: true, username: true, avatarUrl: true } },
        resolvedBy: { select: { id: true, username: true, avatarUrl: true } },
      },
    });
    if (!ticket) return notFoundResponse();

    if (ticket.refType !== 'SharedPath') {
      // v1 only supports moderation_review tickets that reference
      // SharedPaths. Other refTypes would need new detail-page UX; for
      // now this is an unreachable branch we want to fail loudly on.
      return notFoundResponse();
    }

    const sharedPath = await db.sharedPath.findUnique({
      where: { id: ticket.refId },
      select: {
        id: true,
        title: true,
        description: true,
        language: true,
        subjects: true,
        phaseCount: true,
        slotCount: true,
        moderationStatus: true,
        rejectionReason: true,
        seeded: true,
        downloadCount: true,
        viewCount: true,
        ratingAverage: true,
        ratingCount: true,
        createdAt: true,
        approvedAt: true,
        sharedBy: {
          select: { id: true, username: true, avatarUrl: true, email: true },
        },
      },
    });
    if (!sharedPath) {
      // Auto-dismiss invariant broke somewhere upstream — surface as 404.
      return notFoundResponse();
    }

    const audits = await db.moderationAudit.findMany({
      where: { sharedPathId: sharedPath.id },
      orderBy: { createdAt: 'asc' },
      include: {
        actor: { select: { id: true, username: true } },
      },
    });

    return successResponse({
      ticket: {
        id: ticket.id,
        type: ticket.type,
        refType: ticket.refType,
        refId: ticket.refId,
        status: ticket.status,
        assignee: ticket.assignee,
        resolvedBy: ticket.resolvedBy,
        resolvedAt: ticket.resolvedAt,
        resolutionNote: ticket.resolutionNote,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
      },
      sharedPath,
      audits: audits.map((a) => ({
        id: a.id,
        layer: a.layer,
        verdict: a.verdict,
        reasonCode: a.reasonCode,
        reasoning: a.reasoning,
        model: a.model,
        actor: a.actor,
        costUsd: a.costUsd,
        tokensIn: a.tokensIn,
        tokensOut: a.tokensOut,
        cacheReadTokens: a.cacheReadTokens,
        cacheWriteTokens: a.cacheWriteTokens,
        createdAt: a.createdAt,
      })),
    });
  } catch {
    return internalErrorResponse();
  }
}
