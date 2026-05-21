// Pure decision module for Moderation Layer 4 (P13 of the path-publishing
// plan — post-publish reports + trust scoring).
//
// L4 is the post-publish recovery net plus the new-author scrutiny gate.
// Like L5, most of L4's "decision" is mechanical (a count crossing a
// threshold; a score below a threshold) rather than a model call — so
// this module owns the small static surface the runner, the report API
// route, the L2/L5 runners, and the UI all consume:
//
//   - The report-reason allow-list + labels + parsers (mirror of the
//     L2/L3/L5 category vocabulary so author/admin copy stays uniform).
//   - Env-driven thresholds (read at call time so a Coolify rotation
//     flips them without a rebuild — same pattern as feature-flags.ts
//     and the translation daily budget).
//   - `isAuthorTrusted` + `applyTrustGate` — the new-author scrutiny
//     rule: an L2 "pass" by an untrusted, non-admin author is downgraded
//     to "flag" so the deep L3 audit (and ultimately a human) sees it.
//   - `composeReportBreakdown` — turns the open reports' reasons into the
//     one-line `ModerationAudit.reasoning` an admin reads on the ticket.
//
// Kept Prisma-free (and model-free) so it imports anywhere — tests, the
// report route, the runner, the UI — without dragging the database
// client or a model dispatcher into the import graph. Same factoring as
// layer1/layer2/layer3/layer5.

import type { L2Judgement } from './layer2';

// ── report-reason taxonomy ─────────────────────────────────────────────────

/**
 * Categories a reporter can pick. Mirror of the L2/L3/L5 vocabulary so
 * the audit breakdown + future admin filters speak one language across
 * every layer. Order is "obvious-violation → judgement-call → catch-all",
 * which is also the order the report dialog renders.
 */
export const REPORT_REASONS = [
  'adult',
  'hateful',
  'spam',
  'copyright',
  'offtopic',
  'low_quality',
  'other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

const REPORT_REASON_SET = new Set<string>(REPORT_REASONS);

/**
 * Validate a reporter-supplied reason. Returns the narrowed
 * `ReportReason` when accepted, `null` otherwise — the API route uses
 * this for 400-vs-200 dispatch without re-implementing the check.
 */
export function parseReportReason(input: unknown): ReportReason | null {
  if (typeof input !== 'string') return null;
  return REPORT_REASON_SET.has(input) ? (input as ReportReason) : null;
}

/**
 * Short reporter-facing label for each reason — what the report dialog's
 * radio list shows. Phrased as a thing-the-path-is, not a sentence
 * fragment (the audit/notification copy uses `describeModerationReason`).
 */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  adult: 'Explicit or adult content',
  hateful: 'Hateful or harassing language',
  spam: 'Spam or advertising',
  copyright: 'Piracy or copyright violation',
  offtopic: 'Not a real learning resource',
  low_quality: 'Low quality or misleading',
  other: 'Something else',
};

// ── reporter note ──────────────────────────────────────────────────────────

/**
 * Cap on the optional reporter note. 1K matches the L5 admin-note cap —
 * plenty for "the flashcards are full of wrong dates" and bounds the
 * insert into the reports table.
 */
export const REPORT_DETAIL_MAX_CHARS = 1000;

/**
 * Validate + normalise the optional reporter note. Returns the trimmed
 * string (≤ cap) when present, `null` when blank/missing. Throws when it
 * exceeds the cap — a 400-class input error the route surfaces rather
 * than silently truncating. Mirrors `parseL5Note`.
 */
export function parseReportDetail(input: unknown): string | null {
  if (input === undefined || input === null) return null;
  if (typeof input !== 'string') {
    throw new Error('detail must be a string');
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > REPORT_DETAIL_MAX_CHARS) {
    throw new Error(`detail must be ≤ ${REPORT_DETAIL_MAX_CHARS} characters`);
  }
  return trimmed;
}

// ── reasonCode constants ───────────────────────────────────────────────────

/** Audit-row reasonCode for a report-triggered re-moderation (layer 4). */
export const L4_REPORTS_REASON_CODE = 'l4.reports';
/** Audit-row reasonCode for a trust-gate auto-flag of a new author (layer 4). */
export const L4_UNTRUSTED_REASON_CODE = 'l4.untrusted_author';

// ── env-driven thresholds ──────────────────────────────────────────────────

/**
 * Read a positive-integer env knob at call time, clamped to a floor so a
 * fat-fingered `0`/`-1`/`abc` can't make the gate degenerate (a 0
 * report-threshold would re-moderate every reported path on the first
 * click; a 0 trust-threshold would trust everyone). Defaults baked here.
 */
function readPositiveIntEnv(name: string, fallback: number, floor: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(floor, parsed);
}

/**
 * Distinct-open-report count that pulls an approved path back into the
 * human queue. Default 3 — small enough to catch genuinely bad content
 * fast, large enough that one or two grudge reports can't auto-takedown.
 * Floor 1 (a threshold of 0 is nonsense).
 */
export function reportRemoderationThreshold(): number {
  return readPositiveIntEnv('REPORT_REMODERATION_THRESHOLD', 3, 1);
}

/**
 * Trust score at/above which an author's L2-pass goes straight to
 * `approved`. Below it, the pass is downgraded to a deep L3 audit. With
 * the +1-per-approval increment, the default 2 means an author's first
 * two community paths get the extra scrutiny ("auto-flag first N
 * publications"). Floor 1.
 */
export function trustAutoflagThreshold(): number {
  return readPositiveIntEnv('TRUST_AUTOFLAG_THRESHOLD', 2, 1);
}

/**
 * Trust points deducted when an author's path is rejected by a human
 * (L5). Default 2 — one human rejection wipes out two approvals' worth of
 * trust, so a rejected author drops back under the autoflag threshold and
 * earns fresh scrutiny on their next publication. Floor 1.
 */
export function trustRejectPenalty(): number {
  return readPositiveIntEnv('TRUST_REJECT_PENALTY', 2, 1);
}

// ── trust gate ─────────────────────────────────────────────────────────────

/**
 * Is the author trusted enough to skip the new-author scrutiny gate?
 * Pure comparison against the (env-driven) threshold so it's trivially
 * testable. A negative score (from prior rejections) is, correctly,
 * untrusted.
 */
export function isAuthorTrusted(
  score: number,
  threshold: number = trustAutoflagThreshold(),
): boolean {
  return score >= threshold;
}

export interface TrustGateAuthor {
  /** The author's current `User.publishTrustScore`. */
  score: number;
  /** The author's `User.role` — admins bypass the gate entirely. */
  role: string;
}

export interface TrustGateResult {
  /** The (possibly downgraded) judgement the L2 runner should act on. */
  judgement: L2Judgement;
  /** True when the gate downgraded a pass → flag. Drives the extra
   *  `layer:4` audit row + the notification's layer tag. */
  trustGated: boolean;
}

/**
 * Apply the new-author trust gate to a *projected* L2 judgement.
 *
 * Only a clean `pass` is affected — a `reject`/`flag` already routes to a
 * stricter layer, so trust is moot there. An untrusted, non-admin
 * author's pass is downgraded to `flag` with the `l4.untrusted_author`
 * reasonCode, which sends the path to L3 (the deep audit) and, for
 * genuinely clean content, on to a human. Everything else passes through
 * unchanged.
 *
 * The runner records BOTH the genuine `layer:2 pass` (content was clean)
 * AND a `layer:4 flag` (author was new) so the audit chain reads
 * honestly — see layer2-runner.ts.
 */
export function applyTrustGate(
  judgement: L2Judgement,
  author: TrustGateAuthor,
  threshold: number = trustAutoflagThreshold(),
): TrustGateResult {
  if (judgement.verdict !== 'pass') {
    return { judgement, trustGated: false };
  }
  if (author.role === 'admin') {
    return { judgement, trustGated: false };
  }
  if (isAuthorTrusted(author.score, threshold)) {
    return { judgement, trustGated: false };
  }

  // Downgrade pass → flag. Preserve the model's original reasoning (the
  // content WAS clean) and annotate why we're escalating anyway. The flag
  // verdict means statusFor() → `auditing_l3`, reusing the existing
  // L2→L3 fire-and-forget with no new state-machine code.
  const downgraded: L2Judgement = {
    verdict: 'flag',
    reasonCode: L4_UNTRUSTED_REASON_CODE,
    reasoning:
      `${judgement.reasoning} ` +
      `[trust-gate: author score ${author.score} < ${threshold} — routing clean content to L3 for a deeper look]`,
    rejectionReason: null,
    failedClosed: judgement.failedClosed,
  };
  return { judgement: downgraded, trustGated: true };
}

// ── report breakdown ───────────────────────────────────────────────────────

/**
 * Turn the open reports' reasons into the one-line summary written to the
 * `ModerationAudit{layer:4}.reasoning` an admin reads on the ticket, e.g.
 * `3 reports: spam ×2, offtopic ×1`. Sorted by count desc then reason so
 * the dominant complaint leads and the output is deterministic (stable
 * across re-runs / test snapshots).
 */
export function composeReportBreakdown(reasons: string[]): string {
  const counts = new Map<string, number>();
  for (const r of reasons) {
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, n]) => `${reason} ×${n}`);
  const total = reasons.length;
  const noun = total === 1 ? 'report' : 'reports';
  return parts.length > 0
    ? `${total} ${noun}: ${parts.join(', ')}`
    : `${total} ${noun}`;
}
