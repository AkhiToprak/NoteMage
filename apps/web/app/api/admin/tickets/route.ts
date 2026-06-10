import { NextRequest } from 'next/server';
import { getAdminUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

// Allow-listed status filters. Defaults to "open" so the oldest-open-first
// queue is the no-arg landing surface for P6V's manual walkthrough.
const ALLOWED_STATUSES = new Set(['open', 'assigned', 'resolved', 'dismissed']);

/**
 * GET /api/admin/tickets — paginated moderation ticket queue.
 *
 * AC-Admin-1: non-admin → 404 (existence-leak guard, NOT 403 — distinct from
 * the older /api/admin/* endpoints which still return 403; this taxonomy
 * landed with the path-publishing plan).
 * AC-Admin-2: default sort is createdAt ASC (oldest-open-first).
 * AC-Admin-3 (partial): list view returns ticket + SharedPath summary; the
 * full ModerationAudit chain is only loaded on the [id] detail endpoint.
 *
 * Query params:
 *   - `status` ∈ {open, assigned, resolved, dismissed}; default "open".
 *   - `type` — currently only "moderation_review" exists; default to that.
 *   - `page`, `limit` (1–50; mirrors /api/admin/waitlist conventions).
 */
export async function GET(request: NextRequest) {
  try {
    const adminId = await getAdminUserId(request);
    if (!adminId) return notFoundResponse();

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status') || 'open';
    const status = ALLOWED_STATUSES.has(statusParam) ? statusParam : 'open';
    const type = searchParams.get('type') || 'moderation_review';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));
    const skip = (page - 1) * limit;

    const [tickets, total] = await Promise.all([
      db.ticket.findMany({
        where: { status, type },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      db.ticket.count({ where: { status, type } }),
    ]);

    // Tickets reference SharedPath by (refType, refId) — no FK by design
    // (the table is generic for future ticket types). Hydrate SharedPath
    // summaries in a single query keyed by the refIds for refType=SharedPath.
    const sharedPathIds = tickets
      .filter((t) => t.refType === 'SharedPath')
      .map((t) => t.refId);

    const sharedPaths = sharedPathIds.length
      ? await db.sharedPath.findMany({
          where: { id: { in: sharedPathIds } },
          select: {
            id: true,
            title: true,
            language: true,
            phaseCount: true,
            slotCount: true,
            moderationStatus: true,
            seeded: true,
            sharedBy: {
              select: { id: true, username: true, avatarUrl: true },
            },
          },
        })
      : [];
    const sharedPathById = new Map(sharedPaths.map((p) => [p.id, p]));

    const items = tickets.map((ticket) => ({
      id: ticket.id,
      type: ticket.type,
      refType: ticket.refType,
      refId: ticket.refId,
      status: ticket.status,
      assigneeId: ticket.assigneeId,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      // sharedPath is null when the referenced SharedPath has been deleted
      // out from under the ticket. AC-Publish-6 auto-dismisses tickets on
      // SharedPath delete, so this is a defensive-only branch — leaving a
      // null here is the honest answer if the invariant ever breaks.
      sharedPath:
        ticket.refType === 'SharedPath' ? sharedPathById.get(ticket.refId) ?? null : null,
    }));

    return successResponse({
      tickets: items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch {
    return internalErrorResponse();
  }
}
