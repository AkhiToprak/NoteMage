// P11 — popular-language pre-translation fan-out. Fire-and-forget from
// three triggers (P0 spec §4.1 / §4.6 / §4.10):
//   (a) seeded-path approve  → publish route fires it directly;
//   (b) clone popularity-cross → clone route fires `triggerPretranslationOnClone`;
//   (c) admin manual trigger  → POST /api/admin/paths/[shareId]/pretranslate.
//
// The fan-out iterates the popular-language set, claims a single-flight
// lock per (path, language) via the SAME `PathTranslation` create→P2002
// pattern the on-demand detail route uses, and runs the translation
// runner sequentially with a throttle between languages.
//
// Skips, per the P11 build spec:
//   - the source language (never self-translate);
//   - any language that already has a `PathTranslation` row (any status).
//     The create→P2002 collision IS the skip signal — atomic, no race
//     window. A `failed` row is NOT retried here; per the P11V failure-
//     handling rule it's retried on the next on-demand view fallback so
//     we don't re-spend on a path nobody is viewing.
//
// This language-level idempotency is what makes the whole fan-out safe
// to re-fire: concurrent seeded+admin triggers, or a re-run after the
// popular set expands, only translate the languages that don't yet have
// a row.
//
// Cost ceiling: cumulative `costUsd` is accumulated and the fan-out
// aborts the remaining languages once it crosses the hard per-path
// ceiling (P0 §7.4 — target ≤ $0.50, hard ceiling $1.00). Defends the
// monthly pre-translation budget against a runaway translation.

import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { loadTranslatableSnapshot } from './snapshot';
import { runTranslation } from './runner';
import {
  getPopularLanguages,
  getPopularityThreshold,
  getPretranslationCostCeilingUsd,
} from './popular-languages';

export interface PretranslationFanOutResult {
  sharedPathId: string;
  sourceLanguage: string;
  /** Languages we claimed the single-flight lock for and ran the runner against. */
  attempted: string[];
  /** Languages whose runner returned `ready`. */
  succeeded: string[];
  /** Languages whose runner returned `failed` (or whose claim/snapshot errored). */
  failed: string[];
  /** Languages already covered by an existing row (P2002 on claim) — skipped. */
  skipped: string[];
  totalCostUsd: number;
  /** True when the cost ceiling cut the fan-out short. */
  ceilingHit: boolean;
}

// Gentle inter-language throttle so a 5-language fan-out doesn't burst
// the provider's rate limit. Applied only AFTER a real AI call (skips
// are free and don't throttle). Tests inject `throttleMs: 0`.
const DEFAULT_THROTTLE_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface PretranslationFanOutOptions {
  /** Inter-language pause after each AI call. Default 300ms; tests pass 0. */
  throttleMs?: number;
  /** Hard per-path cost ceiling override. Default from env / $1.00. */
  costCeilingUsd?: number;
}

/**
 * Run the popular-language pre-translation fan-out for one SharedPath.
 * Caller is responsible for firing this fire-and-forget (`void
 * runPretranslationFanOut(id).catch(...)`) — it makes bounded AI calls
 * and must never sit on a request's critical path.
 */
export async function runPretranslationFanOut(
  sharedPathId: string,
  opts: PretranslationFanOutOptions = {},
): Promise<PretranslationFanOutResult> {
  const throttleMs = opts.throttleMs ?? DEFAULT_THROTTLE_MS;
  const costCeiling = opts.costCeilingUsd ?? getPretranslationCostCeilingUsd();

  // Source language anchors the skip — never translate a path into its
  // own language. Loading just the header keeps this cheap.
  const sharedPath = await db.sharedPath.findUnique({
    where: { id: sharedPathId },
    select: { id: true, language: true, moderationStatus: true },
  });

  const result: PretranslationFanOutResult = {
    sharedPathId,
    sourceLanguage: sharedPath?.language ?? '',
    attempted: [],
    succeeded: [],
    failed: [],
    skipped: [],
    totalCostUsd: 0,
    ceilingHit: false,
  };

  // Defensive — every trigger site guarantees `approved`, but a race
  // (author unpublishes between trigger and fan-out) shouldn't crash the
  // background task.
  if (!sharedPath || sharedPath.moderationStatus !== 'approved') {
    console.warn(
      `[pretranslate] ${sharedPathId} missing or not approved; skipping fan-out`,
    );
    return result;
  }

  const targets = getPopularLanguages().filter(
    (lang) => lang !== sharedPath.language,
  );

  for (let i = 0; i < targets.length; i++) {
    const lang = targets[i];

    if (result.totalCostUsd >= costCeiling) {
      result.ceilingHit = true;
      console.warn(
        `[pretranslate] ${sharedPathId} hit $${costCeiling} cost ceiling after $${result.totalCostUsd.toFixed(4)}; aborting ${targets.length - i} remaining language(s)`,
      );
      break;
    }

    // Single-flight claim — identical to the on-demand route. A P2002
    // means a row already exists (pre-baked / in-flight / ready /
    // failed) → skip it without touching the existing row.
    try {
      await db.pathTranslation.create({
        data: { sharedPathId, language: lang, status: 'translating' },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        result.skipped.push(lang);
        continue;
      }
      // Unexpected DB error — one bad language must not sink the fan-out.
      console.error(`[pretranslate] ${sharedPathId} → ${lang} claim failed`, err);
      result.failed.push(lang);
      continue;
    }

    result.attempted.push(lang);

    const snapshot = await loadTranslatableSnapshot(sharedPathId, lang);
    if (!snapshot) {
      // Path was unpublished mid-fan-out. Mark the claimed row failed so
      // it doesn't sit in `translating` forever, then stop — every
      // remaining language would hit the same wall.
      await db.pathTranslation
        .update({
          where: { sharedPathId_language: { sharedPathId, language: lang } },
          data: {
            status: 'failed',
            error: 'Source path unavailable during pre-translation.',
          },
        })
        .catch(() => {
          /* best-effort */
        });
      result.failed.push(lang);
      break;
    }

    const run = await runTranslation(sharedPathId, snapshot);
    result.totalCostUsd += run.costUsd;
    const failedThisLang = run.status !== 'ready';
    if (failedThisLang) {
      result.failed.push(lang);
    } else {
      result.succeeded.push(lang);
    }

    // Throttle between real AI calls (never after the last one). Back
    // off harder after a failure — a failed language is a signal the
    // provider may be degraded, so we give it more room before the next
    // call rather than hammering through the whole set.
    if (throttleMs > 0 && i < targets.length - 1) {
      await sleep(failedThisLang ? throttleMs * 3 : throttleMs);
    }
  }

  console.info(
    `[pretranslate] ${sharedPathId} fan-out: ${result.succeeded.length} ok · ${result.failed.length} failed · ${result.skipped.length} skipped · $${result.totalCostUsd.toFixed(4)}${result.ceilingHit ? ' · ceiling-hit' : ''}`,
  );
  return result;
}

/**
 * Clone-trigger (P0 §4.6). Called fire-and-forget after a real first
 * clone commits. Atomically flips `popularityTriggeredAt` only if it's
 * still null AND the (already-incremented) `downloadCount` has crossed
 * `POPULARITY_THRESHOLD`. `count === 1` means WE won the flip → run the
 * fan-out. Concurrent clones at the boundary collapse to exactly one
 * fan-out (every other racer's updateMany matches zero rows). Returns
 * whether the fan-out fired.
 */
export async function triggerPretranslationOnClone(
  sharedPathId: string,
  opts: PretranslationFanOutOptions = {},
): Promise<boolean> {
  const threshold = getPopularityThreshold();
  const flip = await db.sharedPath.updateMany({
    where: {
      id: sharedPathId,
      popularityTriggeredAt: null,
      downloadCount: { gte: threshold },
    },
    data: { popularityTriggeredAt: new Date() },
  });
  if (flip.count !== 1) return false;
  await runPretranslationFanOut(sharedPathId, opts);
  return true;
}
