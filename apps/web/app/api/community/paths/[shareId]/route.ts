// Phase 2 of plans/path-publishing-community-library.md — DELETE
// (unpublish). v1 of this file ships DELETE only; the GET detail
// endpoint that the rest of §4 references lands alongside the community
// library UI in P8 to keep the surface area tight per-phase.
//
// Per P0 spec §4.3:
//   - Owner OR admin may unpublish.
//   - Cascades: PathTranslation, ModerationAudit, PathRating (schema
//     `onDelete: Cascade`).
//   - Open / assigned Tickets referencing this SharedPath get auto-
//     dismissed with a resolutionNote — Ticket.refType/refId is
//     intentionally not an FK, so the cascade has to happen in code.
//   - Response 204 (no body).

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId, getAdminUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { logAdminAction } from '@/lib/admin-audit';

type Params = { params: Promise<{ shareId: string }> };

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
