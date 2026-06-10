// Unit tests for Moderation Layer 3 pure module.
//
// Per P5V verification gate:
//   - parser handles malformed JSON / model errors / timeouts (same
//     JSON-parse robustness as L2; fail-closed default escalates,
//     never auto-rejects)
//   - cache-hittable rubric block is byte-identical across calls
//   - per-path payload builder honours the truncation contract +
//     prepends the L2 reasoning context (the distinguishing input vs L2)
//   - projectL3Output enforces:
//       * confidence < 0.85 on auto_reject → escalate (higher bar than L2's 0.7)
//       * non-hard-violation category on auto_reject → escalate
//
// No Prisma, no model client — those land in the runner-side test.

import { describe, expect, it } from 'vitest';
import {
  buildL3PathPayload,
  failClosedL3,
  L3_ANTHROPIC_TOOL,
  L3_GEMINI_SCHEMA,
  L3_RUBRIC,
  L3_TOOL_NAME,
  parseL3Response,
  projectL3Output,
  type L3ModelOutput,
} from './layer3';

describe('L3_RUBRIC: cacheability', () => {
  it('is byte-identical across imports (cache key invariant)', () => {
    // Two snapshots taken in the same process — if the rubric were
    // template-built on each access (`new Date()`, `process.env`), this
    // would diverge.
    const a = L3_RUBRIC;
    const b = L3_RUBRIC;
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(400);
  });

  it('includes the higher-bar escalate-by-default instruction', () => {
    // L3 is the harder review: auto_reject must be unambiguous +
    // confident; everything else escalates. Both halves must be
    // baked into the rubric so the model gets the same instruction
    // every call.
    expect(L3_RUBRIC).toMatch(/UNAMBIGUOUSLY/);
    expect(L3_RUBRIC).toMatch(/when in doubt, escalate/i);
    expect(L3_RUBRIC).toMatch(/confidence/i);
    expect(L3_RUBRIC).toMatch(/0\.85/);
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
      expect(L3_RUBRIC).toContain(cat);
    }
  });

  it('forbids auto_reject on the non-hard-violation categories', () => {
    // offtopic, low_quality, other can never auto_reject — must always
    // escalate. The rubric tells the model AND projectL3Output enforces
    // the same rule in code.
    expect(L3_RUBRIC).toMatch(/offtopic, low_quality, and other CANNOT auto_reject/i);
  });
});

describe('L3_ANTHROPIC_TOOL: schema', () => {
  it('forces the verdict shape via tool name + required fields', () => {
    expect(L3_ANTHROPIC_TOOL.name).toBe(L3_TOOL_NAME);
    expect(L3_ANTHROPIC_TOOL.input_schema.required).toEqual([
      'verdict',
      'category',
      'confidence',
      'reason',
    ]);
    expect(L3_ANTHROPIC_TOOL.input_schema.additionalProperties).toBe(false);
  });

  it('enumerates only the two L3 verdicts (not L2 verdicts)', () => {
    const props = L3_ANTHROPIC_TOOL.input_schema.properties as Record<
      string,
      { enum?: string[] }
    >;
    expect(props.verdict.enum).toEqual(['auto_reject', 'escalate_to_human']);
    // Crosscheck — L2 verdicts must NOT leak into L3's tool.
    expect(props.verdict.enum).not.toContain('pass');
    expect(props.verdict.enum).not.toContain('flag');
  });
});

describe('L3_GEMINI_SCHEMA: schema parity with Anthropic', () => {
  it('mirrors the Anthropic tool shape', () => {
    expect(L3_GEMINI_SCHEMA.required).toEqual([
      'verdict',
      'category',
      'confidence',
      'reason',
    ]);
    const props = L3_GEMINI_SCHEMA.properties as Record<string, { enum?: string[] }>;
    expect(props.verdict.enum).toEqual(['auto_reject', 'escalate_to_human']);
  });
});

describe('parseL3Response', () => {
  const valid: L3ModelOutput = {
    verdict: 'escalate_to_human',
    category: 'offtopic',
    confidence: 0.72,
    reason: 'Personal-journal style entries; humans should decide.',
  };

  it('accepts a valid response', () => {
    const out = parseL3Response(valid);
    expect(out).toEqual(valid);
  });

  it('rejects non-object input', () => {
    expect(() => parseL3Response('escalate_to_human')).toThrow();
    expect(() => parseL3Response(null)).toThrow();
    expect(() => parseL3Response(42)).toThrow();
  });

  it('rejects unknown verdict literals (incl. L2 verdicts)', () => {
    expect(() => parseL3Response({ ...valid, verdict: 'maybe' })).toThrow();
    expect(() => parseL3Response({ ...valid, verdict: 'AUTO_REJECT' })).toThrow();
    // L2 verdicts must NOT parse as L3 verdicts — they're a different range.
    expect(() => parseL3Response({ ...valid, verdict: 'pass' })).toThrow();
    expect(() => parseL3Response({ ...valid, verdict: 'flag' })).toThrow();
    expect(() => parseL3Response({ ...valid, verdict: 'reject' })).toThrow();
  });

  it('rejects unknown categories', () => {
    expect(() => parseL3Response({ ...valid, category: 'meh' })).toThrow();
    expect(() => parseL3Response({ ...valid, category: '' })).toThrow();
  });

  it('rejects confidence out of [0, 1]', () => {
    expect(() => parseL3Response({ ...valid, confidence: -0.01 })).toThrow();
    expect(() => parseL3Response({ ...valid, confidence: 1.01 })).toThrow();
    expect(() => parseL3Response({ ...valid, confidence: NaN })).toThrow();
    expect(() => parseL3Response({ ...valid, confidence: '0.9' })).toThrow();
  });

  it('rejects missing reason / non-string reason', () => {
    expect(() => parseL3Response({ ...valid, reason: undefined })).toThrow();
    expect(() => parseL3Response({ ...valid, reason: 123 })).toThrow();
  });

  it('clamps a runaway long reason to 4000 chars', () => {
    const long = 'x'.repeat(10_000);
    const out = parseL3Response({ ...valid, reason: long });
    expect(out.reason.length).toBe(4_000);
  });
});

describe('failClosedL3: AC-Moderate-5 / AC-Moderate-7 fail-closed', () => {
  it('always returns verdict=escalate_to_human with reasonCode=l3.other', () => {
    const j = failClosedL3('timeout: model did not respond');
    // Fail-closed at L3 is escalate, NOT auto_reject — never silently
    // auto-rejects on a failure.
    expect(j.verdict).toBe('escalate_to_human');
    expect(j.reasonCode).toBe('l3.other');
    expect(j.failedClosed).toBe(true);
    expect(j.rejectionReason).toBeNull();
    expect(j.reasoning).toContain('fail-closed');
    expect(j.reasoning).toContain('timeout');
  });

  it('clamps absurd-length reasoning to 4000 chars (DB safety)', () => {
    const j = failClosedL3('x'.repeat(10_000));
    expect(j.reasoning.length).toBeLessThanOrEqual(4_000);
  });
});

describe('projectL3Output: auto_reject branch (terminal categories + confidence guard)', () => {
  it('auto_rejects on a confident hard-violation', () => {
    const j = projectL3Output({
      verdict: 'auto_reject',
      category: 'spam',
      confidence: 0.92,
      reason: 'Buy-now MLM links across every slot title — confirmed L2 finding.',
    });
    expect(j.verdict).toBe('auto_reject');
    expect(j.reasonCode).toBe('l3.spam');
    expect(j.rejectionReason).toContain('spam');
    expect(j.rejectionReason).toContain('l3.spam');
    expect(j.failedClosed).toBe(false);
  });

  it('auto_rejects on hateful / adult / copyright (all hard-violation categories)', () => {
    for (const cat of ['adult', 'hateful', 'copyright'] as const) {
      const j = projectL3Output({
        verdict: 'auto_reject',
        category: cat,
        confidence: 0.95,
        reason: `Confirmed ${cat} content in slot bodies.`,
      });
      expect(j.verdict).toBe('auto_reject');
      expect(j.reasonCode).toBe(`l3.${cat}`);
      expect(j.rejectionReason).toContain(cat);
    }
  });

  it('downgrades auto_reject to escalate when confidence < 0.85 (higher bar than L2)', () => {
    // L2 guard is 0.7; L3 guard is 0.85 — false positives at L3 are
    // user-visible because no human review sits behind auto_reject.
    const j = projectL3Output({
      verdict: 'auto_reject',
      category: 'adult',
      confidence: 0.83,
      reason: 'Not 100% sure.',
    });
    expect(j.verdict).toBe('escalate_to_human');
    expect(j.reasonCode).toBe('l3.adult');
    expect(j.reasoning).toContain('downgraded auto_reject');
    expect(j.reasoning).toContain('0.85');
    expect(j.rejectionReason).toBeNull();
  });

  it('downgrades a 0.7 confidence (above L2 bar, below L3 bar) — proves the bar shift', () => {
    // This is the regression sentinel: a 0.7-confidence reject would
    // have been honoured at L2 (passing the L2 guard) but L3 must still
    // escalate. Catches accidental copy-paste of the L2 threshold.
    const j = projectL3Output({
      verdict: 'auto_reject',
      category: 'spam',
      confidence: 0.7,
      reason: 'Looks spammy.',
    });
    expect(j.verdict).toBe('escalate_to_human');
  });

  it('escalates auto_reject on non-hard-violation category (offtopic)', () => {
    // offtopic / low_quality / other CANNOT auto_reject even at high
    // confidence — the human queue exists precisely for those.
    const j = projectL3Output({
      verdict: 'auto_reject',
      category: 'offtopic',
      confidence: 0.95,
      reason: 'Personal journal, not learnable.',
    });
    expect(j.verdict).toBe('escalate_to_human');
    expect(j.reasonCode).toBe('l3.offtopic');
    expect(j.reasoning).toContain('non-terminal-reject');
    expect(j.rejectionReason).toBeNull();
  });

  it('escalates auto_reject on low_quality (non-hard-violation)', () => {
    const j = projectL3Output({
      verdict: 'auto_reject',
      category: 'low_quality',
      confidence: 0.95,
      reason: 'Empty slots throughout.',
    });
    expect(j.verdict).toBe('escalate_to_human');
    expect(j.reasonCode).toBe('l3.low_quality');
  });

  it('escalates auto_reject on other (non-hard-violation)', () => {
    const j = projectL3Output({
      verdict: 'auto_reject',
      category: 'other',
      confidence: 0.95,
      reason: 'Weird, not a clear bucket.',
    });
    expect(j.verdict).toBe('escalate_to_human');
    expect(j.reasonCode).toBe('l3.other');
  });
});

describe('projectL3Output: escalate branch', () => {
  it('returns escalate with the canonical reasonCode', () => {
    const j = projectL3Output({
      verdict: 'escalate_to_human',
      category: 'offtopic',
      confidence: 0.6,
      reason: 'Looks like a journal entry; humans should look.',
    });
    expect(j.verdict).toBe('escalate_to_human');
    expect(j.reasonCode).toBe('l3.offtopic');
    expect(j.rejectionReason).toBeNull();
    expect(j.failedClosed).toBe(false);
  });

  it('preserves reasonCode + reason on escalate of any category', () => {
    for (const cat of [
      'adult',
      'hateful',
      'spam',
      'copyright',
      'offtopic',
      'low_quality',
      'other',
    ] as const) {
      const j = projectL3Output({
        verdict: 'escalate_to_human',
        category: cat,
        confidence: 0.7,
        reason: `Borderline ${cat} — needs human eyes.`,
      });
      expect(j.verdict).toBe('escalate_to_human');
      expect(j.reasonCode).toBe(`l3.${cat}`);
      expect(j.rejectionReason).toBeNull();
    }
  });
});

describe('buildL3PathPayload', () => {
  const baseL2Ctx = {
    reasonCode: 'l2.offtopic',
    reasoning: 'L2 was uncertain — possibly off-topic, possibly fine.',
  };

  it('renders the L2 context block + language + every non-empty field', () => {
    const payload = buildL3PathPayload({
      language: 'en',
      l2Context: baseL2Ctx,
      fields: [
        { field: 'title', text: 'Intro to Algorithms' },
        { field: 'description', text: 'A 14-day primer on big-O.' },
        { field: 'phase 1 / slot 1 title', text: 'Loops & invariants' },
      ],
    });
    expect(payload).toContain('# LAYER-2 CONTEXT');
    expect(payload).toContain('l2.reasonCode: l2.offtopic');
    expect(payload).toContain('L2 was uncertain');
    expect(payload).toContain('# PATH SNAPSHOT TO AUDIT');
    expect(payload).toContain('language: en');
    expect(payload).toContain('field: title');
    expect(payload).toContain('Intro to Algorithms');
  });

  it('handles missing L2 context (defensive — null both fields)', () => {
    // First-time L3 run shouldn't happen against a path with no L2 row,
    // but if it does (re-judge job, manual admin trigger) the payload
    // must still be coherent.
    const payload = buildL3PathPayload({
      language: 'en',
      l2Context: { reasonCode: null, reasoning: null },
      fields: [{ field: 'title', text: 'Foo' }],
    });
    expect(payload).toContain('l2.reasonCode: (none)');
    expect(payload).not.toContain('l2.reasoning:');
  });

  it('skips empty fields without emitting a separator', () => {
    const payload = buildL3PathPayload({
      language: 'en',
      l2Context: baseL2Ctx,
      fields: [
        { field: 'title', text: 'Real title' },
        { field: 'description', text: '' },
        { field: 'description', text: null },
        { field: 'phase 1 / slot 1 title', text: 'Real slot' },
      ],
    });
    expect(payload).toContain('field: title');
    expect(payload).toContain('field: phase 1 / slot 1 title');
    expect(payload).not.toContain('field: description');
  });

  it('truncates a pathological theory body to ≤ 4000 chars per field', () => {
    const huge = 'a'.repeat(20_000);
    const payload = buildL3PathPayload({
      language: 'en',
      l2Context: baseL2Ctx,
      fields: [{ field: 'phase 1 / slot 1 / theory body', text: huge }],
    });
    expect(payload).not.toContain('a'.repeat(5_000));
    expect(payload).toContain('truncated');
  });

  it('truncates a pathologically verbose L2 reasoning to ≤ 2000 chars', () => {
    // L2 reasoning is the distinguishing L3 input — must be bounded so
    // an unusually chatty L2 turn doesn't blow the L3 input budget.
    const verbose = 'L2 said: ' + 'lorem '.repeat(1_000);
    const payload = buildL3PathPayload({
      language: 'en',
      l2Context: { reasonCode: 'l2.other', reasoning: verbose },
      fields: [{ field: 'title', text: 'Foo' }],
    });
    expect(payload).toContain('truncated');
    // The full 6K-char reasoning string must not appear verbatim.
    expect(payload).not.toContain('lorem '.repeat(500));
  });

  it('honours the total-snapshot ceiling across many fields', () => {
    const fields = Array.from({ length: 20 }, (_, i) => ({
      field: `slot ${i}`,
      text: 'z'.repeat(4_000),
    }));
    const payload = buildL3PathPayload({
      language: 'en',
      l2Context: baseL2Ctx,
      fields,
    });
    expect(payload).toContain('exceeded');
    expect(payload).toContain('snapshot truncated');
    expect(payload.length).toBeLessThan(50_000);
  });

  it('is byte-stable for identical inputs (cache-friendly)', () => {
    const args = {
      language: 'en' as const,
      l2Context: baseL2Ctx,
      fields: [
        { field: 'title', text: 'Foo' },
        { field: 'description', text: 'Bar' },
      ],
    };
    const a = buildL3PathPayload(args);
    const b = buildL3PathPayload(args);
    expect(a).toBe(b);
  });
});
