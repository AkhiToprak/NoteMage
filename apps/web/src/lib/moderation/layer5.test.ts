// Unit tests for the pure Layer-5 module (P7).
//
// Covers:
//   - The reasonCode allow-list — every L2/L3 category is mirrored under
//     the `l5.<category>` namespace, parser accepts those and rejects
//     everything else (other layers' prefixes, garbage, non-strings).
//   - The note validator — null/undefined/empty are normalised to null,
//     trims wrapping whitespace, throws over the cap (so the API route
//     can dispatch to 400 instead of silently truncating).
//   - `composeL5RejectionReason()` — sentence-cased phrase, optional
//     admin-note tail, deterministic output for identical inputs (the
//     author-facing copy must not drift across calls).
//
// No Prisma touched here; this file should never produce DB / network
// fan-out at import or run time.

import { describe, it, expect } from 'vitest';
import {
  L5_NOTE_MAX_CHARS,
  L5_REJECT_CATEGORIES,
  L5_REJECT_CATEGORY_LABELS,
  composeL5RejectionReason,
  parseL5Note,
  parseL5RejectReasonCode,
} from './layer5';

describe('L5 reason-code allow-list', () => {
  it('mirrors the canonical category taxonomy', () => {
    // Must stay in lock-step with the ModerationAudit reasonCode comment
    // in schema.prisma — if a category is added there, this test fails.
    expect(new Set(L5_REJECT_CATEGORIES)).toEqual(
      new Set(['adult', 'hateful', 'spam', 'copyright', 'offtopic', 'low_quality', 'other']),
    );
  });

  it('has a human label for every category (no orphan codes in the dropdown)', () => {
    for (const cat of L5_REJECT_CATEGORIES) {
      const label = L5_REJECT_CATEGORY_LABELS[cat];
      expect(label, `missing label for ${cat}`).toBeTruthy();
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('parseL5RejectReasonCode accepts every l5.<cat> form', () => {
    for (const cat of L5_REJECT_CATEGORIES) {
      const code = `l5.${cat}`;
      expect(parseL5RejectReasonCode(code)).toBe(code);
    }
  });

  it('parseL5RejectReasonCode rejects non-L5 prefixes (no cross-layer code reuse)', () => {
    // A stale UI must not be able to slip an L2 or L3 reason code through
    // the admin reject endpoint — the audit-row namespace is per-layer.
    expect(parseL5RejectReasonCode('l1.adult')).toBeNull();
    expect(parseL5RejectReasonCode('l2.adult')).toBeNull();
    expect(parseL5RejectReasonCode('l3.adult')).toBeNull();
    expect(parseL5RejectReasonCode('wordlist.en.adult')).toBeNull();
  });

  it('parseL5RejectReasonCode rejects garbage and non-strings', () => {
    expect(parseL5RejectReasonCode('')).toBeNull();
    expect(parseL5RejectReasonCode('l5.unknown_category')).toBeNull();
    expect(parseL5RejectReasonCode('approve')).toBeNull();
    expect(parseL5RejectReasonCode(undefined)).toBeNull();
    expect(parseL5RejectReasonCode(null)).toBeNull();
    expect(parseL5RejectReasonCode(42)).toBeNull();
    expect(parseL5RejectReasonCode({ code: 'l5.adult' })).toBeNull();
  });
});

describe('parseL5Note', () => {
  it('returns null for empty / missing / whitespace-only', () => {
    expect(parseL5Note(undefined)).toBeNull();
    expect(parseL5Note(null)).toBeNull();
    expect(parseL5Note('')).toBeNull();
    expect(parseL5Note('   ')).toBeNull();
    expect(parseL5Note('\n\t\n')).toBeNull();
  });

  it('trims wrapping whitespace but preserves interior content', () => {
    expect(parseL5Note('  hello  ')).toBe('hello');
    expect(parseL5Note('line one\nline two')).toBe('line one\nline two');
    expect(parseL5Note('\n  trimmed  \n')).toBe('trimmed');
  });

  it('throws on non-string input (TypeError-shaped, surfaced as 400)', () => {
    expect(() => parseL5Note(42)).toThrow(/string/);
    expect(() => parseL5Note({ note: 'x' })).toThrow(/string/);
    expect(() => parseL5Note(true)).toThrow(/string/);
  });

  it('accepts a note at exactly the cap', () => {
    const justUnder = 'x'.repeat(L5_NOTE_MAX_CHARS);
    expect(parseL5Note(justUnder)).toBe(justUnder);
  });

  it('throws on a note that exceeds the cap (no silent truncation)', () => {
    const overCap = 'x'.repeat(L5_NOTE_MAX_CHARS + 1);
    expect(() => parseL5Note(overCap)).toThrow(/≤ 1000/);
  });
});

describe('composeL5RejectionReason', () => {
  it('produces a sentence-cased phrase with a terminal period when no note', () => {
    expect(composeL5RejectionReason('l5.adult', null)).toBe(
      'Contains explicit or adult content.',
    );
    expect(composeL5RejectionReason('l5.spam', null)).toBe(
      'Looks like spam or promotion.',
    );
    expect(composeL5RejectionReason('l5.offtopic', null)).toBe(
      'Looks off-topic for a learning resource.',
    );
  });

  it('appends the admin note after an em-dash when present', () => {
    expect(
      composeL5RejectionReason(
        'l5.offtopic',
        'too many personal anecdotes, not enough subject matter',
      ),
    ).toBe(
      'Looks off-topic for a learning resource. — too many personal anecdotes, not enough subject matter',
    );
  });

  it('is deterministic — same inputs produce byte-identical output', () => {
    const a = composeL5RejectionReason('l5.copyright', 'shared key in slot 3');
    const b = composeL5RejectionReason('l5.copyright', 'shared key in slot 3');
    expect(a).toBe(b);
  });

  it('handles the `l5.other` catch-all gracefully', () => {
    // `other` is the catch-all category — the canned phrase is the one
    // `describeModerationReason` ships with for any unrecognised tail.
    expect(composeL5RejectionReason('l5.other', null)).toBe(
      'Was flagged by the review pipeline.',
    );
    expect(composeL5RejectionReason('l5.other', 'see admin note')).toBe(
      'Was flagged by the review pipeline. — see admin note',
    );
  });
});
