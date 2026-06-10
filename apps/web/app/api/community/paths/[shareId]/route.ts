// Phase 2 of plans/path-publishing-community-library.md — DELETE
// (unpublish).
// Phase 8 of the same plan — GET (community detail).
// Phase 10 of the same plan — GET `?lang=` translation lookup +
// on-demand translation flow (single-flight via PathTranslation
// `@@unique([sharedPathId, language])`, rate-limited, quota-gated,
// per-language daily-budget-guarded).
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
//   - Response shape: `{ shareId, language, source, translation?,
//     userRating, userClonePlanId }`. `source` ships the SharedPath
//     metadata + a phase/slot title preview (titles + kind only — no
//     theory/flashcards/quiz content, per AC-Browse-6).
//   - `?lang=` (BCP-47 lowercase): when omitted or equal to the source
//     language, returns the source snapshot. Otherwise routes through
//     the translation cache + on-demand translation flow.
//   - viewCount is incremented once per (user, path) per 24h via a
//     Redis-backed rate limit. Failure to acquire the rate-limit token
//     is the no-op branch — the view still serves, just doesn't tick
//     the counter.

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getAuthUserId, getAdminUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { logAdminAction } from '@/lib/admin-audit';
import { rateLimit, rateLimitKey, getClientIp } from '@/lib/rate-limit';
import { checkUsageLimit, incrementUsage } from '@/lib/usage-limits';
import { TIERS, isLifetimeLimit, type TierKey } from '@/lib/tiers';
import { loadTranslatableSnapshot } from '@/lib/translation/snapshot';
import { runTranslation } from '@/lib/translation/runner';
import type { PersistedTranslation } from '@/lib/translation/prompt';

type Params = { params: Promise<{ shareId: string }> };

// One viewCount increment per (user, path) per 24h. AC-Browse-8 lists
// viewCount as a public social signal; without the throttle a single
// curious user F5-ing the detail page would inflate the metric. The
// rate limiter fails open if Redis is unreachable — at worst we
// over-count, never under-count.
const VIEW_WINDOW_MS = 24 * 60 * 60 * 1000;

// Per AC-Translate-8 / P0 §2.5:
//   - 6 cache-miss translation triggers per user per 10 minutes
//   - 12 cache-miss translation triggers per IP per 10 minutes
// Both fire together — the more restrictive wins. The IP cap defends
// against a coordinated request from a multi-account farm; the user cap
// is the per-person fair-use guard.
const TRANSLATION_RATE_USER_MAX = 6;
const TRANSLATION_RATE_IP_MAX = 12;
const TRANSLATION_RATE_WINDOW_MS = 10 * 60 * 1000;

// AC-Translate-7 / P0 §7.4 — per-language daily on-demand spend cap.
// Tunable via `TRANSLATION_DAILY_BUDGET_<L>_USD` (e.g.
// `TRANSLATION_DAILY_BUDGET_DE_USD=5`). When the env knob is missing,
// fall back to the documented $5.00/day per-language ceiling so a
// missing env var doesn't accidentally lift the safety net.
const TRANSLATION_DAILY_BUDGET_DEFAULT_USD = 5.0;

// BCP-47 lowercase. Permissive: 2-3 letter primary tag, optional region
// (2-letter alpha or 3-digit numeric) or script (4-letter title-cased
// in spec but we accept lowercase) sub-tag. We lowercase everything for
// storage; the routing layer never round-trips back to BCP-47 casing.
const LANG_PATTERN = /^[a-z]{2,3}(-[a-z0-9]{2,4})?$/;

// AC-Translate-1 + AC-Translate-9 — translation envelope returned
// alongside `source` whenever a non-source language was requested. The
// runner persists the canonical `PersistedTranslation` shape; the
// route hands it to the client unchanged on cache hits.
interface TranslationEnvelopeReady {
  status: 'ready';
  language: string;
  payload: PersistedTranslation;
  cachedAt: string;
}

interface TranslationEnvelopeTranslating {
  status: 'translating';
  language: string;
}

interface TranslationEnvelopeFailed {
  status: 'failed';
  language: string;
  error: string;
}

type TranslationEnvelope =
  | TranslationEnvelopeReady
  | TranslationEnvelopeTranslating
  | TranslationEnvelopeFailed;

/**
 * Internal result type for the translation flow. Either it produced an
 * envelope to attach to the response (success / status), or it produced
 * a pre-baked NextResponse to short-circuit the handler with (rate
 * limit, quota, daily budget, etc.).
 */
type TranslationFlowResult =
  | { kind: 'envelope'; envelope: TranslationEnvelope }
  | { kind: 'response'; response: NextResponse };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { shareId } = await params;

    // Validate the requested language up-front so a malformed query
    // string fails fast and doesn't burn a SharedPath lookup.
    const rawLang = request.nextUrl.searchParams.get('lang');
    let requestedLang: string | null = null;
    if (rawLang) {
      const lower = rawLang.toLowerCase().trim();
      if (!LANG_PATTERN.test(lower)) {
        return badRequestResponse(
          `Invalid 'lang' parameter — expected a BCP-47 code like 'de', 'en', 'pt-br'.`,
        );
      }
      requestedLang = lower;
    }

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

    // ── Translation branch ───────────────────────────────────────────
    // AC-Translate-1 — `?lang=<source>` (or no lang at all) is a no-op
    // pass-through. The detail page renders the source snapshot
    // verbatim; no AI call, no DB write, no rate-limit hit.
    let translation: TranslationEnvelope | null = null;
    if (requestedLang && requestedLang !== sharedPath.language) {
      const flow = await resolveTranslation({
        request,
        userId,
        sharedPathId: shareId,
        sourceLanguage: sharedPath.language,
        targetLanguage: requestedLang,
      });
      if (flow.kind === 'response') {
        return flow.response;
      }
      translation = flow.envelope;
    }

    const responseLanguage = translation ? translation.language : sharedPath.language;

    return successResponse({
      shareId: sharedPath.id,
      language: responseLanguage,
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
      translation,
      userRating: myRating?.value ?? null,
      userClonePlanId: existingClone?.id ?? null,
    });
  } catch (error) {
    console.error('[community/paths/[shareId] GET]', error);
    return internalErrorResponse();
  }
}

/**
 * Translation flow for a non-source `?lang=` request. Implements the
 * order-of-checks from P0 §4.5:
 *   (1) cache lookup — `ready` / `translating` / `failed` all short-
 *       circuit without quota checks (the originating user already paid
 *       the cache-miss cost on the first request);
 *   (2) per-user + per-IP rate limit — 429 on either cap;
 *   (3) `checkUsageLimit(userId, 'path_translation')` — 402 (FREE
 *       lifetime) or 429 (PRO monthly anti-abuse);
 *   (4) per-language daily budget — 429 with "try later" copy when
 *       today's spend in this language is over the cap;
 *   (5) single-flight claim via `db.pathTranslation.create` (P2002 on
 *       race-lose); winner runs the translation inline (bounded by the
 *       runner's provider timeouts), loser re-reads the existing row;
 *   (6) on AI-call success, `incrementUsage(userId, 'path_translation')`.
 *       Failed AI calls do NOT increment.
 */
async function resolveTranslation(args: {
  request: NextRequest;
  userId: string;
  sharedPathId: string;
  sourceLanguage: string;
  targetLanguage: string;
}): Promise<TranslationFlowResult> {
  const { request, userId, sharedPathId, sourceLanguage, targetLanguage } = args;

  // (1) Cache lookup. `ready` → cache hit; `translating` → tell the
  // client to poll; `failed` → return the failure so the UI can offer
  // a retry. None of these branches consult rate-limit / quota / budget
  // — the originating user paid those costs on the first cache-miss.
  const existing = await db.pathTranslation.findUnique({
    where: {
      sharedPathId_language: { sharedPathId, language: targetLanguage },
    },
    select: {
      status: true,
      payload: true,
      error: true,
      updatedAt: true,
    },
  });

  if (existing && existing.status === 'ready' && existing.payload) {
    return {
      kind: 'envelope',
      envelope: {
        status: 'ready',
        language: targetLanguage,
        payload: existing.payload as unknown as PersistedTranslation,
        cachedAt: existing.updatedAt.toISOString(),
      },
    };
  }
  if (existing && existing.status === 'translating') {
    // AC-Translate-5 — concurrent first-requesters get this; the client
    // polls until status flips.
    return {
      kind: 'envelope',
      envelope: { status: 'translating', language: targetLanguage },
    };
  }
  // `failed` rows do NOT short-circuit blindly — the user is allowed
  // to retry, which re-acquires the lock via an updateMany (below).
  // Fall through to the gate stack so the retry counts against quota /
  // budget like a fresh request would.

  // (2) Rate limit — per user AND per IP. Both must pass.
  const userLimit = await rateLimit(
    rateLimitKey('translation', request, userId),
    TRANSLATION_RATE_USER_MAX,
    TRANSLATION_RATE_WINDOW_MS,
  );
  if (!userLimit.success) {
    return {
      kind: 'response',
      response: tooManyRequestsResponse(
        `You've requested too many translations recently. Try again in a minute.`,
        userLimit.retryAfterMs,
      ),
    };
  }
  const ipKey = `translation-ip:ip:${getClientIp(request)}`;
  const ipLimit = await rateLimit(
    ipKey,
    TRANSLATION_RATE_IP_MAX,
    TRANSLATION_RATE_WINDOW_MS,
  );
  if (!ipLimit.success) {
    return {
      kind: 'response',
      response: tooManyRequestsResponse(
        `Translation traffic from your network is rate-limited. Try again in a minute.`,
        ipLimit.retryAfterMs,
      ),
    };
  }

  // (3) Personal usage quota — FREE is lifetime-capped, PRO is monthly.
  // The status code differs so the client can render the right copy:
  //   FREE exhausted → 402 (upgrade prompt)
  //   PRO  exhausted → 429 (anti-abuse safety net, contact support)
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { tier: true },
  });
  if (!user) {
    // Shouldn't happen post-auth — but if it does, refuse the call.
    return { kind: 'response', response: unauthorizedResponse() };
  }
  const usage = await checkUsageLimit(userId, 'path_translation');
  if (!usage.allowed) {
    const tier = user.tier as TierKey;
    if (isLifetimeLimit(tier, 'path_translation')) {
      // FREE — lifetime cap. 402 with `upgrade: true` so the client can
      // show an upsell instead of a generic error.
      return {
        kind: 'response',
        response: NextResponse.json(
          {
            success: false,
            error:
              `You've used your ${TIERS.FREE.limits.path_translation} free translations. Upgrade to Pro to translate more paths — or view this one in a popular language.`,
            upgrade: true,
          },
          { status: 402 },
        ),
      };
    }
    // PRO — monthly anti-abuse cap. 429 with support copy.
    return {
      kind: 'response',
      response: tooManyRequestsResponse(
        `You've hit the monthly translation cap (${TIERS.PRO.limits.path_translation}). If you need more, please reach out to support.`,
      ),
    };
  }

  // (4) Per-language daily budget. AC-Translate-7 / P0 §7.4: pre-baked
  // popular languages are exempt because they pay no per-request cost
  // (their cache rows already exist) — so we ONLY hit this branch when
  // we're about to spend on a cache miss, which by definition is not a
  // pre-baked row.
  const budgetExceeded = await isDailyBudgetExceeded(targetLanguage);
  if (budgetExceeded) {
    return {
      kind: 'response',
      response: tooManyRequestsResponse(
        `Translations into ${targetLanguage} are temporarily paused for today's budget. Try again tomorrow, or pick another language.`,
      ),
    };
  }

  // (5) Single-flight claim. Three possible states to land in:
  //   (a) the row didn't exist → `create` wins; we run the translation.
  //   (b) the row exists with `status='failed'` (we're a retry); we
  //       try to flip it back to `translating` via updateMany w/ guard;
  //       on success we own the lock, on failure we lost the race and
  //       re-read.
  //   (c) we lost a `create` race (P2002 unique-violation); the winner
  //       owns the lock — we re-read the row's status and return it.
  let ownsLock = false;
  if (!existing) {
    try {
      await db.pathTranslation.create({
        data: {
          sharedPathId,
          language: targetLanguage,
          status: 'translating',
        },
      });
      ownsLock = true;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        ownsLock = false;
      } else {
        throw err;
      }
    }
  } else if (existing.status === 'failed') {
    const updated = await db.pathTranslation.updateMany({
      where: {
        sharedPathId,
        language: targetLanguage,
        // Status guard — the only state from which a retry can claim
        // the lock. A concurrent re-tryer that beats us flips status
        // to `translating` first, so our updateMany matches zero rows.
        status: 'failed',
      },
      data: {
        status: 'translating',
        error: null,
        provider: null,
        // Reset cost / token counters — the previous attempt's spend
        // is sunk; the new attempt is a fresh row from a budgeting POV.
        costUsd: 0,
        tokensIn: 0,
        tokensOut: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    });
    ownsLock = updated.count === 1;
  } else {
    // existing.status === 'translating' or 'ready' — should have short-
    // circuited above. Defensive fall-through: re-read and return.
    ownsLock = false;
  }

  if (!ownsLock) {
    // Lost the race — re-read the row and return whatever the winner
    // landed on. We don't burn quota on this path (the increment
    // happens only when WE successfully ran the translation).
    const after = await db.pathTranslation.findUnique({
      where: {
        sharedPathId_language: { sharedPathId, language: targetLanguage },
      },
      select: { status: true, payload: true, error: true, updatedAt: true },
    });
    if (!after) {
      // Extremely unlikely (the row should exist if a concurrent
      // writer just inserted) — surface as a `translating` status so
      // the client polls.
      return {
        kind: 'envelope',
        envelope: { status: 'translating', language: targetLanguage },
      };
    }
    if (after.status === 'ready' && after.payload) {
      return {
        kind: 'envelope',
        envelope: {
          status: 'ready',
          language: targetLanguage,
          payload: after.payload as unknown as PersistedTranslation,
          cachedAt: after.updatedAt.toISOString(),
        },
      };
    }
    if (after.status === 'failed') {
      return {
        kind: 'envelope',
        envelope: {
          status: 'failed',
          language: targetLanguage,
          error: after.error ?? 'Translation failed.',
        },
      };
    }
    return {
      kind: 'envelope',
      envelope: { status: 'translating', language: targetLanguage },
    };
  }

  // (5 continued) We own the lock. Load the snapshot and run the
  // translation. If anything below throws (network, parser, …), the
  // runner converts the row to `status='failed'` and we surface that to
  // the caller; quota stays untouched.
  const snapshot = await loadTranslatableSnapshot(sharedPathId, targetLanguage);
  if (!snapshot) {
    // Race — the SharedPath was unpublished between our pre-check and
    // here. Mark the row as failed so the cache doesn't end up stuck on
    // `translating` forever, and surface a 404 to the caller.
    await db.pathTranslation
      .update({
        where: {
          sharedPathId_language: { sharedPathId, language: targetLanguage },
        },
        data: {
          status: 'failed',
          error: 'Source path was unpublished mid-flight.',
        },
      })
      .catch(() => {
        /* best-effort */
      });
    return { kind: 'response', response: notFoundResponse('Path not found') };
  }
  // Sanity: don't run a translation INTO the source language even if a
  // weird client query bypassed the source-lang short-circuit above.
  if (snapshot.sourceLanguage === targetLanguage) {
    await db.pathTranslation
      .delete({
        where: {
          sharedPathId_language: { sharedPathId, language: targetLanguage },
        },
      })
      .catch(() => {
        /* best-effort */
      });
    return {
      kind: 'response',
      response: badRequestResponse(
        `'lang' equals the source language (${sourceLanguage}); translation is a no-op.`,
      ),
    };
  }

  const result = await runTranslation(sharedPathId, snapshot);

  if (result.status === 'ready' && result.payload) {
    // (6) Quota increment — only on successful AI call. Lifetime-vs-
    // monthly accounting is handled by `incrementUsage` writing to the
    // current month's row in either case (the read path sums across
    // months for lifetime features).
    await incrementUsage(userId, 'path_translation');

    // Re-read to get the canonical `updatedAt` written by the runner's
    // final update. (The runner returns the payload directly, but the
    // envelope's `cachedAt` is the row's authoritative timestamp.)
    const after = await db.pathTranslation.findUnique({
      where: {
        sharedPathId_language: { sharedPathId, language: targetLanguage },
      },
      select: { updatedAt: true },
    });
    return {
      kind: 'envelope',
      envelope: {
        status: 'ready',
        language: targetLanguage,
        payload: result.payload,
        cachedAt: (after?.updatedAt ?? new Date()).toISOString(),
      },
    };
  }

  return {
    kind: 'envelope',
    envelope: {
      status: 'failed',
      language: targetLanguage,
      error: result.error ?? 'Translation failed.',
    },
  };
}

/**
 * Per-language daily-budget check. Reads `TRANSLATION_DAILY_BUDGET_<L>_USD`
 * from env with a $5.00 fallback. Sums `costUsd` across all
 * `PathTranslation` rows for the language created since today's UTC
 * midnight; the schema's `@@index([language, createdAt])` makes this an
 * index-only scan even at high row counts.
 *
 * Returns true when today's spend has already exceeded the cap; the
 * caller refuses the request with 429.
 */
async function isDailyBudgetExceeded(language: string): Promise<boolean> {
  const envKey = `TRANSLATION_DAILY_BUDGET_${language.toUpperCase()}_USD`;
  const envVal = process.env[envKey];
  const cap = envVal !== undefined && envVal !== '' && Number.isFinite(Number(envVal))
    ? Number(envVal)
    : TRANSLATION_DAILY_BUDGET_DEFAULT_USD;

  const now = new Date();
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const agg = await db.pathTranslation.aggregate({
    where: {
      language,
      createdAt: { gte: todayStart },
    },
    _sum: { costUsd: true },
  });
  const spend = agg._sum.costUsd ?? 0;
  return spend >= cap;
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
