// Phase 8 of plans/path-publishing-community-library.md — community
// library list endpoint.
//
// Implements P0 spec §4.4: paginated, filterable, searchable list of
// approved SharedPaths. Mirrors the envelope of
// /api/community/notebooks (apps/web/app/api/community/notebooks/route.ts:6-125)
// — same `{ paths, total, page, limit, totalPages }` envelope, same
// auth/limit conventions, same allow-listed query params.
//
// Acceptance criteria covered:
//   - AC-Browse-1: only `moderationStatus='approved'` rows.
//   - AC-Browse-2: filters compose — subject × language × min/max slots
//     × sort. Empty filter = all approved paths.
//   - AC-Browse-3: ILIKE-equivalent (Prisma `contains` + `mode:'insensitive'`)
//     over title + description, length-capped at 100 chars.
//   - AC-Browse-4: default limit=20, hard cap 50; totalPages reflects the
//     filtered count.
//   - AC-Browse-5: auth required (v1). Unauth returns 401; the
//     `/learn/community` page surface routes through the dashboard
//     layout which already redirects unauth visits to /auth/login.
//   - AC-Browse-8: list payload exposes downloadCount, viewCount,
//     ratingAverage, ratingCount as the v1 public social signals.
//   - AC-Browse-9: `sort=rating` filters above-threshold rows by
//     `ratingCount >= MIN_RATING_SAMPLES` then orders by ratingAverage
//     DESC; below-threshold rows tail the result list ordered by the
//     `popular` ranking. Implemented with a two-queue pagination scheme
//     (see `ratingSortQueues` below) so a single 5-star vote can never
//     outrank a 4.8/200 row.
//
// Not implemented in P8 (deferred):
//   - `filter=mine` legitimately needs the user's own approved paths;
//     P8 implements it because it's a 1-line `where` change and the
//     spec lists it. Pending/rejected paths still belong to the
//     publication-status page, not the library.

import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { MIN_RATING_SAMPLES } from '@/lib/community-paths';
import type { Prisma } from '@prisma/client';

// Allow-listed sort modes. Anything unknown clamps to "popular" — the
// safe default per AC-Browse-2 ("empty filter = all approved paths"),
// and the no-SQL-injection surface that mirrors the admin tickets list.
const ALLOWED_SORTS = new Set(['popular', 'recent', 'rating']);
type SortMode = 'popular' | 'recent' | 'rating';

// Allow-listed `filter` modes (v1). `mine` restricts to the requester's
// own approved paths — pending/rejected publications are *not* visible
// in the library and remain on the publication-status page.
const ALLOWED_FILTERS = new Set(['all', 'mine']);
type FilterMode = 'all' | 'mine';

// Length cap for the `search` param. AC-Browse-3 — 100 chars. Anything
// longer is silently truncated rather than rejected: an over-long query
// is more likely a runaway input than a malicious one, and a 400 here
// would surface as a noisy empty result on the client.
const SEARCH_MAX = 100;

// `subjects` is a String[]; the filter uses `has` (Postgres @>),
// length-capped to keep a degenerate query from becoming an attack
// vector. Same cap as the search field for symmetry.
const SUBJECT_MAX = 50;

// `language` is a BCP-47 lowercase code; the longest valid tag we ship
// is 5 chars (e.g. `de-ch`). Anything longer is malformed — clamp to
// undefined so the filter no-ops rather than passing a bogus value to
// Prisma.
const LANGUAGE_MAX = 8;

function parseIntParam(raw: string | null, fallback: number): number {
  const n = parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildBaseWhere(opts: {
  language?: string;
  subject?: string;
  search?: string;
  minSlots?: number;
  maxSlots?: number;
  filter: FilterMode;
  userId: string;
}): Prisma.SharedPathWhereInput {
  const where: Prisma.SharedPathWhereInput = {
    moderationStatus: 'approved',
  };

  if (opts.filter === 'mine') {
    where.sharedById = opts.userId;
  }

  if (opts.language) {
    // Match the path's OWN language OR any READY translation into it — so an
    // English path that's been translated to German also surfaces under the
    // German filter (and vice versa). Composed via AND so it stacks with the
    // search OR group below without clobbering it (Prisma ANDs top-level keys).
    where.AND = [
      {
        OR: [
          { language: opts.language },
          { translations: { some: { language: opts.language, status: 'ready' } } },
        ],
      },
    ];
  }
  if (opts.subject) {
    where.subjects = { has: opts.subject };
  }

  // Slot-count window: AC-Browse-2 supports a min/max pair. We allow
  // either bound to be omitted independently.
  if (opts.minSlots !== undefined || opts.maxSlots !== undefined) {
    const slot: Prisma.IntFilter = {};
    if (opts.minSlots !== undefined) slot.gte = opts.minSlots;
    if (opts.maxSlots !== undefined) slot.lte = opts.maxSlots;
    where.slotCount = slot;
  }

  if (opts.search) {
    // AC-Browse-3 — ILIKE over title + description, case-insensitive.
    // Prisma `contains` + `mode:'insensitive'` is the canonical Postgres
    // ILIKE shape.
    where.OR = [
      { title: { contains: opts.search, mode: 'insensitive' } },
      { description: { contains: opts.search, mode: 'insensitive' } },
    ];
  }

  return where;
}

function popularOrderBy(): Prisma.SharedPathOrderByWithRelationInput[] {
  // AC-Browse-2 — `popular` = downloadCount DESC, then approvedAt DESC
  // as the secondary tiebreaker. approvedAt is the "joined the library"
  // timestamp; createdAt fires earlier but isn't meaningful here.
  return [{ downloadCount: 'desc' }, { approvedAt: 'desc' }];
}

function recentOrderBy(): Prisma.SharedPathOrderByWithRelationInput[] {
  // AC-Browse-2 — `recent` = approvedAt DESC. Pending/auditing rows are
  // filtered out by the base `where`, so this is "newest in the library".
  return [{ approvedAt: 'desc' }];
}

function ratingAboveOrderBy(): Prisma.SharedPathOrderByWithRelationInput[] {
  // Above-threshold rows (ratingCount ≥ MIN_RATING_SAMPLES) — order by
  // ratingAverage DESC, then popular tiebreakers so two paths with the
  // same average don't shuffle on every request.
  return [
    { ratingAverage: 'desc' },
    { downloadCount: 'desc' },
    { approvedAt: 'desc' },
  ];
}

/**
 * Two-queue pagination for `sort=rating` per AC-Browse-9. Above-threshold
 * rows (ratingCount ≥ MIN_RATING_SAMPLES) are paged first, ordered by
 * ratingAverage DESC. Below-threshold rows tail the result list in
 * popular order.
 *
 * The naïve single-SQL implementation would either (a) treat
 * `ratingAverage NULLS LAST` as the dividing line, which lets a single
 * 5-star vote outrank a 4.8/200 row, or (b) compute a Bayesian score in
 * SQL which is gnarly to keep in sync between the test and the route.
 * The two-queue scheme is honest about the threshold, paginates
 * deterministically, and keeps the queries inside Prisma's ergonomic
 * surface.
 */
async function ratingSortQueues(
  baseWhere: Prisma.SharedPathWhereInput,
  select: Prisma.SharedPathSelect,
  skip: number,
  take: number,
) {
  const aboveWhere: Prisma.SharedPathWhereInput = {
    ...baseWhere,
    ratingCount: { gte: MIN_RATING_SAMPLES },
  };
  const belowWhere: Prisma.SharedPathWhereInput = {
    ...baseWhere,
    ratingCount: { lt: MIN_RATING_SAMPLES },
  };

  const [aboveCount, belowCount] = await Promise.all([
    db.sharedPath.count({ where: aboveWhere }),
    db.sharedPath.count({ where: belowWhere }),
  ]);
  const total = aboveCount + belowCount;

  let rows: Array<Record<string, unknown>> = [];

  if (skip + take <= aboveCount) {
    // Entire page comes from the above-threshold queue.
    rows = await db.sharedPath.findMany({
      where: aboveWhere,
      orderBy: ratingAboveOrderBy(),
      select,
      skip,
      take,
    });
  } else if (skip >= aboveCount) {
    // Entire page comes from the below-threshold queue. The skip into
    // the below queue is the requested skip minus the entire above
    // queue's length.
    rows = await db.sharedPath.findMany({
      where: belowWhere,
      orderBy: popularOrderBy(),
      select,
      skip: skip - aboveCount,
      take,
    });
  } else {
    // Page straddles the queue boundary. Pull the tail of the above
    // queue + the head of the below queue.
    const aboveTake = aboveCount - skip;
    const belowTake = take - aboveTake;
    const [aboveRows, belowRows] = await Promise.all([
      db.sharedPath.findMany({
        where: aboveWhere,
        orderBy: ratingAboveOrderBy(),
        select,
        skip,
        take: aboveTake,
      }),
      db.sharedPath.findMany({
        where: belowWhere,
        orderBy: popularOrderBy(),
        select,
        skip: 0,
        take: belowTake,
      }),
    ]);
    rows = [...aboveRows, ...belowRows];
  }

  return { rows, total };
}

/**
 * GET /api/community/paths — community library list endpoint.
 *
 * See the module header for AC mapping and the rating-sort design note.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);

    const sortParam = searchParams.get('sort') || 'popular';
    const sort: SortMode = (
      ALLOWED_SORTS.has(sortParam) ? sortParam : 'popular'
    ) as SortMode;

    const filterParam = searchParams.get('filter') || 'all';
    const filter: FilterMode = (
      ALLOWED_FILTERS.has(filterParam) ? filterParam : 'all'
    ) as FilterMode;

    const search = searchParams.get('search')?.trim().slice(0, SEARCH_MAX) || undefined;
    const subject = searchParams.get('subject')?.trim().slice(0, SUBJECT_MAX) || undefined;
    const languageRaw = searchParams.get('language')?.trim().toLowerCase();
    const language =
      languageRaw && languageRaw.length <= LANGUAGE_MAX ? languageRaw : undefined;

    const minSlotsRaw = searchParams.get('minSlots');
    const maxSlotsRaw = searchParams.get('maxSlots');
    const minSlots =
      minSlotsRaw !== null && Number.isFinite(parseInt(minSlotsRaw, 10))
        ? Math.max(0, parseInt(minSlotsRaw, 10))
        : undefined;
    const maxSlots =
      maxSlotsRaw !== null && Number.isFinite(parseInt(maxSlotsRaw, 10))
        ? Math.max(0, parseInt(maxSlotsRaw, 10))
        : undefined;

    const page = clampInt(parseIntParam(searchParams.get('page'), 1), 1, 100_000);
    const limit = clampInt(parseIntParam(searchParams.get('limit'), 20), 1, 50);
    const skip = (page - 1) * limit;

    const baseWhere = buildBaseWhere({
      language,
      subject,
      search,
      minSlots,
      maxSlots,
      filter,
      userId,
    });

    // The `select` shape mirrors the P0 spec §4.4 `SharedPathListItem`
    // contract — no list view ever needs the full path tree, so the
    // selection stays narrow and includes the denormalized rating
    // aggregates plus the author summary.
    const listSelect: Prisma.SharedPathSelect = {
      id: true,
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
      sharedBy: {
        select: { id: true, username: true, avatarUrl: true },
      },
    };

    let rows: Array<Record<string, unknown>>;
    let total: number;

    if (sort === 'rating') {
      const queues = await ratingSortQueues(baseWhere, listSelect, skip, limit);
      rows = queues.rows;
      total = queues.total;
    } else {
      const orderBy = sort === 'recent' ? recentOrderBy() : popularOrderBy();
      [rows, total] = await Promise.all([
        db.sharedPath.findMany({
          where: baseWhere,
          orderBy,
          select: listSelect,
          skip,
          take: limit,
        }),
        db.sharedPath.count({ where: baseWhere }),
      ]);
    }

    type ListRow = {
      id: string;
      title: string;
      description: string | null;
      coverImageUrl: string | null;
      language: string;
      subjects: string[];
      phaseCount: number;
      slotCount: number;
      downloadCount: number;
      viewCount: number;
      ratingAverage: number | null;
      ratingCount: number;
      seeded: boolean;
      approvedAt: Date | null;
      sharedBy: { id: string; username: string | null; avatarUrl: string | null };
    };

    const paths = (rows as ListRow[]).map((row) => ({
      shareId: row.id,
      title: row.title,
      description: row.description,
      coverImageUrl: row.coverImageUrl,
      language: row.language,
      subjects: row.subjects,
      phaseCount: row.phaseCount,
      slotCount: row.slotCount,
      downloadCount: row.downloadCount,
      viewCount: row.viewCount,
      ratingAverage: row.ratingAverage,
      ratingCount: row.ratingCount,
      seeded: row.seeded,
      approvedAt: row.approvedAt,
      author: row.sharedBy,
    }));

    return successResponse({
      paths,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('[community/paths GET]', error);
    return internalErrorResponse();
  }
}
