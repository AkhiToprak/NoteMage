// Admin community-paths oversight list. Unlike /api/community/paths (which
// only surfaces `approved` rows to end users), this endpoint spans every
// moderation state so an admin can see the whole publication pipeline,
// each path's open-report count, and the author's publish-trust score.
//
// Read-only. Force-unpublish is handled by the existing
// DELETE /api/community/paths/[shareId] (admin branch). Approve/reject for
// flagged paths runs through the tickets queue (P7), not here.

import { NextRequest } from 'next/server';
import { getAdminUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { successResponse, forbiddenResponse, internalErrorResponse } from '@/lib/api-response';
import type { Prisma } from '@prisma/client';

// Mirrors SharedPath.moderationStatus. `all` = no status filter.
const ALLOWED_STATUS = new Set([
  'all',
  'pending',
  'auditing_l2',
  'auditing_l3',
  'flagged_pending_human',
  'approved',
  'rejected',
]);

const SEARCH_MAX = 100;

export async function GET(request: NextRequest) {
  try {
    const adminId = await getAdminUserId(request);
    if (!adminId) return forbiddenResponse('Admin access required');

    const { searchParams } = new URL(request.url);

    const statusParam = searchParams.get('status') || 'all';
    const status = ALLOWED_STATUS.has(statusParam) ? statusParam : 'all';

    const search = searchParams.get('search')?.trim().slice(0, SEARCH_MAX) || undefined;
    const reportedOnly = searchParams.get('reported') === 'true';

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '25', 10) || 25));
    const skip = (page - 1) * limit;

    const where: Prisma.SharedPathWhereInput = {};
    if (status !== 'all') where.moderationStatus = status;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    // "Reported" filter — paths with at least one open report.
    if (reportedOnly) {
      where.reports = { some: { status: 'open' } };
    }

    const [rows, total] = await Promise.all([
      db.sharedPath.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          language: true,
          subjects: true,
          moderationStatus: true,
          seeded: true,
          downloadCount: true,
          viewCount: true,
          ratingAverage: true,
          ratingCount: true,
          phaseCount: true,
          slotCount: true,
          createdAt: true,
          approvedAt: true,
          sharedBy: {
            select: { id: true, username: true, name: true, publishTrustScore: true },
          },
        },
      }),
      db.sharedPath.count({ where }),
    ]);

    // Open-report counts via a separate grouped query — version-independent
    // (avoids relying on filtered relation `_count`). Keyed onto the page rows.
    const ids = rows.map((r) => r.id);
    const reportGroups = ids.length
      ? await db.report.groupBy({
          by: ['sharedPathId'],
          where: { sharedPathId: { in: ids }, status: 'open' },
          _count: { _all: true },
        })
      : [];
    const reportMap = new Map(reportGroups.map((g) => [g.sharedPathId, g._count._all]));

    const paths = rows.map((r) => ({
      shareId: r.id,
      title: r.title,
      language: r.language,
      subjects: r.subjects,
      moderationStatus: r.moderationStatus,
      seeded: r.seeded,
      downloadCount: r.downloadCount,
      viewCount: r.viewCount,
      ratingAverage: r.ratingAverage,
      ratingCount: r.ratingCount,
      phaseCount: r.phaseCount,
      slotCount: r.slotCount,
      createdAt: r.createdAt,
      approvedAt: r.approvedAt,
      author: r.sharedBy,
      openReportCount: reportMap.get(r.id) ?? 0,
    }));

    return successResponse({
      paths,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('[admin/paths GET]', error);
    return internalErrorResponse();
  }
}
