// Unit tests for the pure L4 module (P13 — reports + trust scoring).
// No DB, no model — these lock the static contract the runner, the
// report route, and the L2/L5 runners all depend on.

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  parseReportReason,
  parseReportDetail,
  REPORT_DETAIL_MAX_CHARS,
  reportRemoderationThreshold,
  trustAutoflagThreshold,
  trustRejectPenalty,
  isAuthorTrusted,
  applyTrustGate,
  composeReportBreakdown,
  L4_UNTRUSTED_REASON_CODE,
} from './layer4';
import type { L2Judgement } from './layer2';

// ── reason taxonomy ─────────────────────────────────────────────────────────

describe('parseReportReason', () => {
  it('accepts every canonical reason', () => {
    for (const r of REPORT_REASONS) {
      expect(parseReportReason(r)).toBe(r);
    }
  });

  it('rejects unknown / cross-namespace / non-string input', () => {
    expect(parseReportReason('l2.adult')).toBeNull(); // a moderation code, not a report reason
    expect(parseReportReason('nonsense')).toBeNull();
    expect(parseReportReason('')).toBeNull();
    expect(parseReportReason(null)).toBeNull();
    expect(parseReportReason(undefined)).toBeNull();
    expect(parseReportReason(3)).toBeNull();
    expect(parseReportReason({ reason: 'spam' })).toBeNull();
  });

  it('has a human label for every reason (no orphan codes in the UI)', () => {
    for (const r of REPORT_REASONS) {
      expect(REPORT_REASON_LABELS[r]).toBeTruthy();
      expect(typeof REPORT_REASON_LABELS[r]).toBe('string');
    }
  });
});

// ── reporter detail ─────────────────────────────────────────────────────────

describe('parseReportDetail', () => {
  it('normalises missing / blank to null', () => {
    expect(parseReportDetail(undefined)).toBeNull();
    expect(parseReportDetail(null)).toBeNull();
    expect(parseReportDetail('')).toBeNull();
    expect(parseReportDetail('   ')).toBeNull();
  });

  it('trims wrapping whitespace', () => {
    expect(parseReportDetail('  wrong dates  ')).toBe('wrong dates');
  });

  it('throws on non-string input', () => {
    expect(() => parseReportDetail(42)).toThrow(/string/);
    expect(() => parseReportDetail({})).toThrow(/string/);
  });

  it('throws when over the cap (a 400-class error, never silent truncation)', () => {
    const tooLong = 'x'.repeat(REPORT_DETAIL_MAX_CHARS + 1);
    expect(() => parseReportDetail(tooLong)).toThrow(
      new RegExp(String(REPORT_DETAIL_MAX_CHARS)),
    );
  });

  it('accepts exactly the cap', () => {
    const atCap = 'x'.repeat(REPORT_DETAIL_MAX_CHARS);
    expect(parseReportDetail(atCap)).toBe(atCap);
  });
});

// ── env-driven thresholds ───────────────────────────────────────────────────

describe('threshold env readers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('return the documented defaults when unset', () => {
    expect(reportRemoderationThreshold()).toBe(3);
    expect(trustAutoflagThreshold()).toBe(2);
    expect(trustRejectPenalty()).toBe(2);
  });

  it('honour env overrides read at call time (no-rebuild rotation)', () => {
    vi.stubEnv('REPORT_REMODERATION_THRESHOLD', '5');
    vi.stubEnv('TRUST_AUTOFLAG_THRESHOLD', '4');
    vi.stubEnv('TRUST_REJECT_PENALTY', '3');
    expect(reportRemoderationThreshold()).toBe(5);
    expect(trustAutoflagThreshold()).toBe(4);
    expect(trustRejectPenalty()).toBe(3);
  });

  it('clamp degenerate / unparseable values to the floor or fallback', () => {
    vi.stubEnv('REPORT_REMODERATION_THRESHOLD', '0'); // would re-moderate on first report
    expect(reportRemoderationThreshold()).toBe(1); // floored to 1
    vi.stubEnv('TRUST_AUTOFLAG_THRESHOLD', '-4'); // would trust nobody / everybody
    expect(trustAutoflagThreshold()).toBe(1); // floored to 1
    vi.stubEnv('TRUST_REJECT_PENALTY', 'abc'); // unparseable
    expect(trustRejectPenalty()).toBe(2); // back to default
  });
});

// ── trust ───────────────────────────────────────────────────────────────────

describe('isAuthorTrusted', () => {
  it('is true at / above the threshold, false below', () => {
    expect(isAuthorTrusted(2, 2)).toBe(true);
    expect(isAuthorTrusted(3, 2)).toBe(true);
    expect(isAuthorTrusted(1, 2)).toBe(false);
    expect(isAuthorTrusted(0, 2)).toBe(false);
  });

  it('treats a negative score (post-rejection) as untrusted', () => {
    expect(isAuthorTrusted(-2, 2)).toBe(false);
  });
});

describe('applyTrustGate', () => {
  const passJudgement: L2Judgement = {
    verdict: 'pass',
    reasonCode: null,
    reasoning: 'Clean educational path.',
    rejectionReason: null,
    failedClosed: false,
  };

  it('downgrades an untrusted non-admin author pass → flag (route to L3)', () => {
    const { judgement, trustGated } = applyTrustGate(
      passJudgement,
      { score: 0, role: 'user' },
      2,
    );
    expect(trustGated).toBe(true);
    expect(judgement.verdict).toBe('flag');
    expect(judgement.reasonCode).toBe(L4_UNTRUSTED_REASON_CODE);
    // Original reasoning preserved (the content WAS clean) + annotated.
    expect(judgement.reasoning).toContain('Clean educational path.');
    expect(judgement.reasoning).toContain('trust-gate');
    expect(judgement.rejectionReason).toBeNull();
  });

  it('leaves a trusted author pass untouched', () => {
    const { judgement, trustGated } = applyTrustGate(
      passJudgement,
      { score: 5, role: 'user' },
      2,
    );
    expect(trustGated).toBe(false);
    expect(judgement).toBe(passJudgement); // same reference — no rewrite
  });

  it('lets an admin bypass the gate even at score 0', () => {
    const { judgement, trustGated } = applyTrustGate(
      passJudgement,
      { score: 0, role: 'admin' },
      2,
    );
    expect(trustGated).toBe(false);
    expect(judgement.verdict).toBe('pass');
  });

  it('never touches a reject or flag verdict (trust is moot there)', () => {
    const reject: L2Judgement = {
      verdict: 'reject',
      reasonCode: 'l2.spam',
      reasoning: 'spam',
      rejectionReason: 'Looks like spam.',
      failedClosed: false,
    };
    const flag: L2Judgement = {
      verdict: 'flag',
      reasonCode: 'l2.offtopic',
      reasoning: 'borderline',
      rejectionReason: null,
      failedClosed: false,
    };
    expect(applyTrustGate(reject, { score: 0, role: 'user' }, 2).trustGated).toBe(false);
    expect(applyTrustGate(flag, { score: 0, role: 'user' }, 2).trustGated).toBe(false);
    expect(applyTrustGate(reject, { score: 0, role: 'user' }, 2).judgement).toBe(reject);
  });
});

// ── report breakdown ─────────────────────────────────────────────────────────

describe('composeReportBreakdown', () => {
  it('counts + sorts by frequency desc, then reason asc, deterministically', () => {
    expect(composeReportBreakdown(['spam', 'offtopic', 'spam'])).toBe(
      '3 reports: spam ×2, offtopic ×1',
    );
    // Tie on count → alphabetical by reason for stability.
    expect(composeReportBreakdown(['offtopic', 'adult'])).toBe(
      '2 reports: adult ×1, offtopic ×1',
    );
  });

  it('uses the singular noun for a single report', () => {
    expect(composeReportBreakdown(['spam'])).toBe('1 report: spam ×1');
  });

  it('handles an empty list without crashing', () => {
    expect(composeReportBreakdown([])).toBe('0 reports');
  });
});
