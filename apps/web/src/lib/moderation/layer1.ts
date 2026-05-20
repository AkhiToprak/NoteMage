// Moderation Layer 1 — pure decision module.
//
// Why split (P3): the DB-bound runner lives in `layer1-runner.ts` so
// importing this file (e.g. from vitest) doesn't drag Prisma in at
// load time. Tests + future L2 callers can `import { judgeL1 } from
// '@/lib/moderation/layer1'` without paying for the Prisma client.
//
// `judgeL1` is the heart of L1: given a SharedPath snapshot reduced to
// scannable {field, text} pairs, return a verdict + reasonCode +
// rejection-reason copy + the raw scan hits.

import type { ModerationCategory } from '@notemage/shared';
import { getWordlistsForLanguage } from './wordlists';
import { scanFields, type ScanHit, type ScanResult } from './scanner';

// One field of the SharedPath snapshot, ready to scan.
export interface ScannableField {
  field: string;
  text: string | null | undefined;
}

export interface L1Judgement {
  verdict: 'pass' | 'reject';
  // Set on reject. Shape: "wordlist.<language>.<category>" per P0 §3.3.
  reasonCode: string | null;
  // Per-row notes; goes into ModerationAudit.reasoning and is the
  // raw record of which hits fired.
  reasoning: string;
  // Composed sentence the author sees on the publication-status page.
  rejectionReason: string | null;
  // All hits the scanner produced — block + flag. Surfaced so callers
  // (and tests) can introspect without re-running the scan.
  hits: ScanHit[];
}

// Priority order when multiple block-category hits fire on the same
// path — the most-severe category dictates the canonical reasonCode.
const CATEGORY_PRIORITY: ModerationCategory[] = [
  'hateful',
  'adult',
  'copyright',
  'spam',
  'offtopic',
  'low_quality',
  'other',
];

function pickPrimaryHit(hits: ScanHit[]): ScanHit | null {
  if (hits.length === 0) return null;
  let best: ScanHit | null = null;
  let bestIdx = CATEGORY_PRIORITY.length;
  for (const hit of hits) {
    const idx = CATEGORY_PRIORITY.indexOf(hit.category);
    const rank = idx === -1 ? CATEGORY_PRIORITY.length : idx;
    if (rank < bestIdx) {
      best = hit;
      bestIdx = rank;
    }
  }
  return best ?? hits[0];
}

function uniqueFieldList(hits: ScanHit[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of hits) {
    if (!seen.has(h.field)) {
      seen.add(h.field);
      out.push(h.field);
    }
  }
  return out;
}

// Human-readable line for the author UI. Deliberately doesn't echo
// the matched terms back — telling someone "you used the word X" in
// large type on a rejection screen is not the vibe.
function composeAuthorMessage(primary: ScanHit, fields: string[]): string {
  const fieldClause =
    fields.length === 1
      ? fields[0]
      : `${fields.slice(0, -1).join(', ')} and ${fields[fields.length - 1]}`;
  const where = fields.length > 0 ? ` (in: ${fieldClause})` : '';
  switch (primary.category) {
    case 'adult':
      return `wordlist.${primary.language}.${primary.category} — your published path contains explicit or adult content not allowed in the community library${where}.`;
    case 'hateful':
      return `wordlist.${primary.language}.${primary.category} — your published path contains language flagged as hateful${where}.`;
    case 'spam':
      return `wordlist.${primary.language}.${primary.category} — your published path was flagged as spam or promotion${where}.`;
    case 'copyright':
      return `wordlist.${primary.language}.${primary.category} — your published path was flagged for piracy / copyright bypass terms${where}.`;
    case 'offtopic':
      return `wordlist.${primary.language}.${primary.category} — your published path looks off-topic for a learning resource${where}.`;
    case 'low_quality':
    case 'other':
    default:
      return `wordlist.${primary.language}.${primary.category} — your published path was flagged by the automatic wordlist filter${where}.`;
  }
}

// Internal notes line. Goes into ModerationAudit.reasoning so admins
// (P6+) can see exactly which terms fired, but is NOT shown to the
// author — author copy lives in rejectionReason.
export function composeAuditNotes(hits: ScanHit[]): string {
  const counts = new Map<string, number>();
  for (const h of hits) {
    const key = `${h.kind}:${h.language}:${h.term}:${h.category}@${h.field}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => `${key}×${count}`)
    .join('; ');
}

/**
 * Pure decision function. Given the scannable fields of a SharedPath
 * snapshot, decide pass/reject and produce the audit + author copy.
 * No DB access — tests cover this directly.
 */
export function judgeL1(opts: {
  language: string;
  fields: ReadonlyArray<ScannableField>;
}): L1Judgement {
  const wordlists = getWordlistsForLanguage(opts.language);
  const scan: ScanResult = scanFields(opts.fields, wordlists);
  const blockHits = scan.hits.filter((h) => h.kind === 'block');
  const flagHits = scan.hits.filter((h) => h.kind === 'flag');

  if (blockHits.length > 0) {
    const primary = pickPrimaryHit(blockHits);
    if (!primary) {
      // Defensive — primary can only be null if blockHits is empty.
      return {
        verdict: 'pass',
        reasonCode: null,
        reasoning: composeAuditNotes(scan.hits),
        rejectionReason: null,
        hits: scan.hits,
      };
    }
    const fields = uniqueFieldList(blockHits);
    const rejectionReason = composeAuthorMessage(primary, fields);
    return {
      verdict: 'reject',
      reasonCode: `wordlist.${primary.language}.${primary.category}`,
      reasoning: composeAuditNotes(scan.hits),
      rejectionReason,
      hits: scan.hits,
    };
  }

  // Pass — but flag hits still get recorded as soft signals for L2.
  return {
    verdict: 'pass',
    reasonCode: null,
    reasoning: flagHits.length > 0 ? composeAuditNotes(flagHits) : '',
    rejectionReason: null,
    hits: scan.hits,
  };
}
