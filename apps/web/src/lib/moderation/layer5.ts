// Pure decision module for Moderation Layer 5 (P7 of the path-publishing
// plan — human review wired to the admin dashboard).
//
// L5 has no rubric, no model call, no parser, no projection — the
// "decision" is the admin's click. What lives here is the small static
// surface both the runner and the API routes consume:
//
//   - The canonical reason-code allow-list for admin rejections, derived
//     from the shared `Categories: adult, hateful, spam, offtopic,
//     low_quality, copyright, other` taxonomy comment on ModerationAudit
//     in `apps/web/prisma/schema.prisma`. The set is also the L2/L3
//     category set, prefixed with `l5.` so the audit-row reasonCode
//     namespace stays disjoint across layers.
//   - A short composer for `SharedPath.rejectionReason` — turns a
//     reason code + optional admin note into the human phrase that
//     fronts the author's publication-status page.
//   - The `L5_NOTE_MAX_CHARS` cap so input validation in the route
//     handlers and the textarea maxLength in the admin UI stay in lockstep.
//
// Kept Prisma-free so it can be imported anywhere — tests, route
// handlers, the runner, the UI — without dragging the database client
// or the model dispatcher into the import graph.

import { describeModerationReason } from '@/lib/notification-utils';

// ── reason-code taxonomy ──────────────────────────────────────────────────

/**
 * Categories an admin can pick when rejecting from the human queue.
 * Mirror of the L2/L3 vocabulary so the author-facing copy stays uniform
 * regardless of which layer terminated the path. Order is roughly
 * "obvious-violation → judgement-call → catch-all", which is also the
 * order the select renders in.
 */
export const L5_REJECT_CATEGORIES = [
  'adult',
  'hateful',
  'spam',
  'copyright',
  'offtopic',
  'low_quality',
  'other',
] as const;

export type L5RejectCategory = (typeof L5_REJECT_CATEGORIES)[number];

/** The canonical reasonCode form persisted on `ModerationAudit.reasonCode`. */
export type L5RejectReasonCode = `l5.${L5RejectCategory}`;

const L5_REJECT_CODE_SET = new Set<string>(
  L5_REJECT_CATEGORIES.map((c) => `l5.${c}`),
);

/**
 * Validate an admin-supplied reason code. Returns the narrowed
 * `L5RejectReasonCode` when accepted, `null` otherwise — the API route
 * uses this for 400-vs-200 dispatch without re-implementing the check.
 */
export function parseL5RejectReasonCode(input: unknown): L5RejectReasonCode | null {
  if (typeof input !== 'string') return null;
  return L5_REJECT_CODE_SET.has(input) ? (input as L5RejectReasonCode) : null;
}

/**
 * Short human-readable label for one of the L5 reject categories — what
 * the admin UI dropdown shows next to the code. Kept disjoint from
 * `describeModerationReason()`, which is author-facing and reads as a
 * sentence fragment ("contains explicit or adult content"); these are
 * select-option labels.
 */
export const L5_REJECT_CATEGORY_LABELS: Record<L5RejectCategory, string> = {
  adult: 'Explicit or adult content',
  hateful: 'Hateful or harassing language',
  spam: 'Spam or promotion',
  copyright: 'Piracy or copyright bypass',
  offtopic: 'Off-topic for a learning resource',
  low_quality: 'Low quality',
  other: 'Other — see note',
};

// ── admin note ────────────────────────────────────────────────────────────

/**
 * Cap on the admin-supplied note that backs both the audit-row
 * `reasoning` and the ticket `resolutionNote`. 1K chars is plenty for a
 * human review note and avoids unbounded inserts into the audit table.
 */
export const L5_NOTE_MAX_CHARS = 1000;

/**
 * Validate + normalise an admin-supplied note. Returns the trimmed
 * string (≤ cap) when present, `null` when blank/missing. Throws when
 * the note exceeds the cap — that's a 400-class input error and the
 * route handler should surface it as such rather than silently truncate.
 */
export function parseL5Note(input: unknown): string | null {
  if (input === undefined || input === null) return null;
  if (typeof input !== 'string') {
    throw new Error('note must be a string');
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > L5_NOTE_MAX_CHARS) {
    throw new Error(`note must be ≤ ${L5_NOTE_MAX_CHARS} characters`);
  }
  return trimmed;
}

// ── rejection-reason composer ─────────────────────────────────────────────

/**
 * Compose the string written to `SharedPath.rejectionReason` on an L5
 * reject. Author-facing — the publication-status page surfaces this
 * verbatim, so it must read as a sentence, not a token dump.
 *
 * Format:
 *   "<reason phrase>." with an optional " — <admin note>" tail.
 *
 * Examples:
 *   "Looks like spam or promotion."
 *   "Off-topic for a learning resource. — too many personal anecdotes,
 *    not enough subject matter."
 */
export function composeL5RejectionReason(
  reasonCode: L5RejectReasonCode,
  note: string | null,
): string {
  const phrase = capitalise(describeModerationReason(reasonCode));
  const base = phrase.endsWith('.') ? phrase : `${phrase}.`;
  if (!note) return base;
  return `${base} — ${note}`;
}

function capitalise(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
