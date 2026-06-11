// Unit tests for Moderation Layer 2 pure module.
//
// Per P4V verification gate:
//   - prompt parser handles malformed JSON, model errors, timeouts
//     (defaults to `flag` on parse failure so nothing slips through)
//   - cache-hittable rubric block is byte-identical across calls
//   - per-path payload builder honours the truncation contract
//
// No Prisma, no model client — those land in the runner-side test.

import { describe, expect, it } from 'vitest';
import {
  buildL2PathPayload,
  failClosedL2,
  L2_ANTHROPIC_TOOL,
  L2_GEMINI_SCHEMA,
  L2_RUBRIC,
  L2_TOOL_NAME,
  parseL2Response,
  projectL2Output,
  type L2ModelOutput,
} from './layer2';

describe('L2_RUBRIC: cacheability', () => {
  it('is byte-identical across imports (cache key invariant)', () => {
    // Two snapshots taken in the same process — if the rubric were
    // template-built on each access (`new Date()`, `process.env`), this
    // would diverge.
    const a = L2_RUBRIC;
    const b = L2_RUBRIC;
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(400);
  });

  it('includes the fail-closed → flag instruction', () => {
    // The rubric tells the model that ambiguity → flag. The runner's
    // confidence guard ALSO enforces this, but documenting the model's
    // own discipline first costs nothing.
    expect(L2_RUBRIC).toMatch(/ambiguity → flag/i);
    expect(L2_RUBRIC).toMatch(/confidence/i);
  });

  it('includes all canonical categories', () => {
    for (const cat of [
      'adult',
      'hateful',
      'spam',
      'copyright',
      'offtopic',
      'low_quality',
      'other',
    ]) {
      expect(L2_RUBRIC).toContain(cat);
    }
  });

  it('contains the injection-hardening instruction (PA-30)', () => {
    expect(L2_RUBRIC).toContain('BEGIN UNTRUSTED AUTHOR CONTENT');
    expect(L2_RUBRIC).toContain('END UNTRUSTED AUTHOR CONTENT');
  });

  it('defines confidence as a probability (PA-35 / F12 uniform definition)', () => {
    expect(L2_RUBRIC).toContain('probability');
  });
});

describe('L2_ANTHROPIC_TOOL: schema', () => {
  it('forces the verdict shape via tool name + required fields', () => {
    expect(L2_ANTHROPIC_TOOL.name).toBe(L2_TOOL_NAME);
    expect(L2_ANTHROPIC_TOOL.input_schema.required).toEqual([
      'verdict',
      'category',
      'confidence',
      'reason',
    ]);
    expect(L2_ANTHROPIC_TOOL.input_schema.additionalProperties).toBe(false);
  });

  it('enumerates only the three allowed verdicts', () => {
    const props = L2_ANTHROPIC_TOOL.input_schema.properties as Record<
      string,
      { enum?: string[] }
    >;
    expect(props.verdict.enum).toEqual(['pass', 'reject', 'flag']);
  });
});

describe('L2_GEMINI_SCHEMA: schema parity with Anthropic', () => {
  it('mirrors the Anthropic tool shape', () => {
    expect(L2_GEMINI_SCHEMA.required).toEqual([
      'verdict',
      'category',
      'confidence',
      'reason',
    ]);
    const props = L2_GEMINI_SCHEMA.properties as Record<string, { enum?: string[]; minimum?: number; maximum?: number }>;
    expect(props.verdict.enum).toEqual(['pass', 'reject', 'flag']);
  });

  it('has 0–1 bounds on confidence (F12)', () => {
    const props = L2_GEMINI_SCHEMA.properties as Record<string, { minimum?: number; maximum?: number }>;
    expect(props.confidence.minimum).toBe(0);
    expect(props.confidence.maximum).toBe(1);
  });
});

describe('parseL2Response', () => {
  const valid: L2ModelOutput = {
    verdict: 'pass',
    category: 'other',
    confidence: 0.92,
    reason: 'Algorithm intro — legitimate study path.',
  };

  it('accepts a valid response', () => {
    const out = parseL2Response(valid);
    expect(out).toEqual(valid);
  });

  it('rejects non-object input', () => {
    expect(() => parseL2Response('pass')).toThrow();
    expect(() => parseL2Response(null)).toThrow();
    expect(() => parseL2Response(42)).toThrow();
  });

  it('rejects unknown verdict literals', () => {
    expect(() => parseL2Response({ ...valid, verdict: 'maybe' })).toThrow();
    expect(() => parseL2Response({ ...valid, verdict: 'PASS' })).toThrow();
  });

  it('rejects unknown categories', () => {
    expect(() => parseL2Response({ ...valid, category: 'meh' })).toThrow();
    expect(() => parseL2Response({ ...valid, category: '' })).toThrow();
  });

  it('clamps out-of-range confidence instead of throwing (PA-35)', () => {
    // NaN / non-number still throws (not a scale-confusion, it's garbage).
    expect(() => parseL2Response({ ...valid, confidence: NaN })).toThrow();
    expect(() => parseL2Response({ ...valid, confidence: '0.5' })).toThrow();

    // Values in (1, 100] are treated as percent-scale and divided by 100.
    const scaled = parseL2Response({ ...valid, confidence: 90 });
    expect(scaled.confidence).toBeCloseTo(0.9);

    // Values below 0 clamp to 0.
    const neg = parseL2Response({ ...valid, confidence: -0.5 });
    expect(neg.confidence).toBe(0);

    // Values above 1 (but > 100) clamp to 1.
    const over = parseL2Response({ ...valid, confidence: 200 });
    expect(over.confidence).toBe(1);

    // Exactly 1 and 0 are valid as-is.
    expect(parseL2Response({ ...valid, confidence: 1 }).confidence).toBe(1);
    expect(parseL2Response({ ...valid, confidence: 0 }).confidence).toBe(0);
  });

  it('rejects missing reason / non-string reason', () => {
    expect(() => parseL2Response({ ...valid, reason: undefined })).toThrow();
    expect(() => parseL2Response({ ...valid, reason: 123 })).toThrow();
  });

  it('clamps a runaway long reason to 600 chars (schema maxLength, F12)', () => {
    const long = 'x'.repeat(10_000);
    const out = parseL2Response({ ...valid, reason: long });
    expect(out.reason.length).toBe(600);
  });
});

describe('failClosedL2: AC-Moderate-5 fail-closed', () => {
  it('always returns verdict=flag with reasonCode=l2.other', () => {
    const j = failClosedL2('timeout: model did not respond');
    expect(j.verdict).toBe('flag');
    expect(j.reasonCode).toBe('l2.other');
    expect(j.failedClosed).toBe(true);
    expect(j.rejectionReason).toBeNull();
    expect(j.reasoning).toContain('fail-closed');
    expect(j.reasoning).toContain('timeout');
  });

  it('clamps absurd-length reasoning to 4000 chars (DB safety)', () => {
    const j = failClosedL2('x'.repeat(10_000));
    expect(j.reasoning.length).toBeLessThanOrEqual(4_000);
  });
});

describe('projectL2Output: pass branch', () => {
  it('passes a confident-pass response', () => {
    const j = projectL2Output({
      verdict: 'pass',
      category: 'other',
      confidence: 0.95,
      reason: 'Clean educational path.',
    });
    expect(j.verdict).toBe('pass');
    expect(j.reasonCode).toBeNull();
    expect(j.rejectionReason).toBeNull();
    expect(j.failedClosed).toBe(false);
    expect(j.reasoning).toContain('Clean educational path');
  });

  it('downgrades low-confidence pass to flag (PA-35 guard)', () => {
    const j = projectL2Output({
      verdict: 'pass',
      category: 'other',
      confidence: 0.5, // < 0.6 threshold
      reason: 'Not sure — might be fine.',
    });
    expect(j.verdict).toBe('flag');
    expect(j.reasonCode).toBe('l2.other');
    expect(j.reasoning).toContain('downgraded pass→flag');
    expect(j.rejectionReason).toBeNull();
    expect(j.failedClosed).toBe(false);
  });

  it('does NOT downgrade a pass at confidence 0.6 (boundary)', () => {
    const j = projectL2Output({
      verdict: 'pass',
      category: 'other',
      confidence: 0.6,
      reason: 'Acceptable.',
    });
    expect(j.verdict).toBe('pass');
  });
});

describe('projectL2Output: reject branch + confidence guard', () => {
  it('rejects on a confident terminal-category reject', () => {
    const j = projectL2Output({
      verdict: 'reject',
      category: 'spam',
      confidence: 0.9,
      reason: 'Repeated promo links across 6 slot titles.',
    });
    expect(j.verdict).toBe('reject');
    expect(j.reasonCode).toBe('l2.spam');
    expect(j.rejectionReason).toContain('spam');
    expect(j.rejectionReason).toContain('l2.spam');
  });

  it('downgrades reject to flag when confidence < 0.7 (guard)', () => {
    const j = projectL2Output({
      verdict: 'reject',
      category: 'adult',
      confidence: 0.5,
      reason: 'Maybe borderline — unsure.',
    });
    expect(j.verdict).toBe('flag');
    expect(j.reasonCode).toBe('l2.adult');
    expect(j.reasoning).toContain('downgraded reject');
    expect(j.rejectionReason).toBeNull();
  });

  it('escalates non-terminal-reject category (low_quality) to flag', () => {
    const j = projectL2Output({
      verdict: 'reject',
      category: 'low_quality',
      confidence: 0.9,
      reason: 'Just empty headings.',
    });
    expect(j.verdict).toBe('flag');
    expect(j.reasonCode).toBe('l2.low_quality');
    expect(j.reasoning).toContain('non-terminal-reject');
  });

  it('escalates non-terminal-reject category (other) to flag', () => {
    const j = projectL2Output({
      verdict: 'reject',
      category: 'other',
      confidence: 0.95,
      reason: 'Weird — not sure what bucket.',
    });
    expect(j.verdict).toBe('flag');
    expect(j.reasonCode).toBe('l2.other');
  });

  it('produces a hateful-category rejection copy', () => {
    const j = projectL2Output({
      verdict: 'reject',
      category: 'hateful',
      confidence: 0.95,
      reason: 'Direct slurs against an ethnic group in flashcards.',
    });
    expect(j.verdict).toBe('reject');
    expect(j.rejectionReason).toContain('hateful');
  });
});

describe('projectL2Output: flag branch', () => {
  it('returns flag with the canonical reasonCode', () => {
    const j = projectL2Output({
      verdict: 'flag',
      category: 'offtopic',
      confidence: 0.55,
      reason: 'Looks like a journal entry; humans should look.',
    });
    expect(j.verdict).toBe('flag');
    expect(j.reasonCode).toBe('l2.offtopic');
    expect(j.rejectionReason).toBeNull();
    expect(j.failedClosed).toBe(false);
  });
});

describe('buildL2PathPayload', () => {
  it('renders the language + every non-empty field with the canonical separator', () => {
    const payload = buildL2PathPayload({
      language: 'en',
      fields: [
        { field: 'title', text: 'Intro to Algorithms' },
        { field: 'description', text: 'A 14-day primer on big-O.' },
        { field: 'phase 1 / slot 1 title', text: 'Loops & invariants' },
      ],
    });
    expect(payload).toContain('# PATH SNAPSHOT TO AUDIT');
    expect(payload).toContain('language: en');
    expect(payload).toContain('field: title');
    expect(payload).toContain('Intro to Algorithms');
    expect(payload).toContain('field: phase 1 / slot 1 title');
    expect(payload).toContain('Loops & invariants');
  });

  it('skips empty fields without emitting a separator', () => {
    const payload = buildL2PathPayload({
      language: 'en',
      fields: [
        { field: 'title', text: 'Real title' },
        { field: 'description', text: '' },
        { field: 'description', text: null },
        { field: 'phase 1 / slot 1 title', text: 'Real slot' },
      ],
    });
    expect(payload).toContain('field: title');
    expect(payload).toContain('field: phase 1 / slot 1 title');
    // No "field: description" anywhere because the empty + null bodies
    // are skipped.
    expect(payload).not.toContain('field: description');
  });

  it('truncates a pathological theory body to ≤ 4000 chars per field', () => {
    const huge = 'a'.repeat(20_000);
    const payload = buildL2PathPayload({
      language: 'en',
      fields: [{ field: 'phase 1 / slot 1 / theory body', text: huge }],
    });
    // 20K input must not appear in the payload verbatim; we truncate to
    // ~4K + a "[truncated]" marker.
    expect(payload).not.toContain('a'.repeat(5_000));
    expect(payload).toContain('truncated');
  });

  it('honours the total-snapshot ceiling across many fields', () => {
    // 20 fields × 4K chars > 40K MAX_TOTAL_CHARS → must early-exit.
    const fields = Array.from({ length: 20 }, (_, i) => ({
      field: `slot ${i}`,
      text: 'z'.repeat(4_000),
    }));
    const payload = buildL2PathPayload({ language: 'en', fields });
    expect(payload).toContain('exceeded');
    expect(payload).toContain('snapshot truncated');
    // Total length stays bounded — within a few hundred chars of the
    // 40K cap plus the wrapper bookkeeping (the marker line, language,
    // header, etc.).
    expect(payload.length).toBeLessThan(50_000);
  });

  it('is byte-stable for identical inputs (cache-friendly)', () => {
    // The payload itself is NOT the cached block (the rubric is), but
    // any nondeterminism here would still mean retries don't reuse the
    // cache write. Keep it pure.
    const args = {
      language: 'en',
      fields: [
        { field: 'title', text: 'Foo' },
        { field: 'description', text: 'Bar' },
      ],
    };
    const a = buildL2PathPayload(args);
    const b = buildL2PathPayload(args);
    expect(a).toBe(b);
  });
});
