// Shared constants for the community-library path surface (Phase 8 of
// plans/path-publishing-community-library.md). Kept Prisma-free so it
// imports anywhere — the list route, future rating endpoints, and the
// integration tests — without pulling the database client into the graph.

/**
 * AC-Browse-9 — minimum number of independent ratings before a path's
 * ratingAverage is allowed to outrank a popular-but-unrated row. Default
 * matches the P0 spec §4.4 default of 5; centralised here so the route
 * and the integration tests share one source of truth.
 *
 * Lives outside the route module because Next.js App Router route files
 * may only export HTTP handlers + route-segment config — any other export
 * breaks the generated route type and fails `tsc --noEmit`.
 */
export const MIN_RATING_SAMPLES = 5;
