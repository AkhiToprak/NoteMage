import { describe, it, expect } from 'vitest';
import { grade, type LegacyMcColumns } from './quiz-grading';

// Equation rows carry their answer key on `payload`; the legacy MC columns are
// unused, so a sentinel suffices.
const NO_LEGACY: LegacyMcColumns = { options: [], correctIndex: 0 };

describe('grade() — equation kind', () => {
  it('marks a numerically-correct constant answer correct', () => {
    const r = grade('equation', { expectedExpression: '2 + 2' }, NO_LEGACY, {
      kind: 'equation',
      expression: '1 + 3',
    });
    expect(r.isCorrect).toBe(true);
  });

  it('marks a wrong constant answer incorrect', () => {
    const r = grade('equation', { expectedExpression: '2 + 2' }, NO_LEGACY, {
      kind: 'equation',
      expression: '5',
    });
    expect(r.isCorrect).toBe(false);
  });

  it('accepts an algebraically-equivalent answer via variable sampling', () => {
    const r = grade(
      'equation',
      { expectedExpression: 'x*(x + 2)', variables: ['x'] },
      NO_LEGACY,
      { kind: 'equation', expression: 'x^2 + 2*x' }
    );
    expect(r.isCorrect).toBe(true);
  });

  it('rejects a non-equivalent answer with variables', () => {
    const r = grade(
      'equation',
      { expectedExpression: 'x*(x + 2)', variables: ['x'] },
      NO_LEGACY,
      { kind: 'equation', expression: 'x^2 + 3*x' }
    );
    expect(r.isCorrect).toBe(false);
  });

  it('treats a sandbox-escape answer as a wrong answer (no execution)', () => {
    const r = grade('equation', { expectedExpression: '2 + 2' }, NO_LEGACY, {
      kind: 'equation',
      expression: 'cos.constructor("return process")()',
    });
    expect(r.isCorrect).toBe(false);
  });

  it('treats a disabled-function answer as a wrong answer', () => {
    const r = grade(
      'equation',
      { expectedExpression: 'x + 1', variables: ['x'] },
      NO_LEGACY,
      { kind: 'equation', expression: 'import("child_process")' }
    );
    expect(r.isCorrect).toBe(false);
  });
});

// ── NM3-29: the remaining grade() branches ──

describe('grade() — guard rails', () => {
  it('returns incorrect for a missing answer regardless of kind', () => {
    expect(grade('mc', null, { options: ['a', 'b'], correctIndex: 0 }, undefined).isCorrect).toBe(
      false
    );
  });

  it('returns incorrect when the answer discriminator mismatches the kind', () => {
    // fill_blank payload but an mc-shaped answer → grader bails.
    const r = grade(
      'fill_blank',
      { blank: { acceptableAnswers: ['paris'] } },
      NO_LEGACY,
      { kind: 'mc', selectedIdx: 0 }
    );
    expect(r.isCorrect).toBe(false);
  });
});

describe('grade() — mc kind', () => {
  it('grades from legacy columns when payload is null', () => {
    const legacy = { options: ['red', 'green', 'blue'], correctIndex: 1 };
    expect(grade('mc', null, legacy, { kind: 'mc', selectedIdx: 1 }).isCorrect).toBe(true);
    expect(grade('mc', null, legacy, { kind: 'mc', selectedIdx: 0 }).isCorrect).toBe(false);
  });

  it('prefers the payload answer key over legacy columns when payload is valid', () => {
    // Valid 4-option McPayload; correctIndex 2. Legacy columns deliberately
    // point elsewhere to prove the payload wins.
    const payload = { options: ['a', 'b', 'c', 'd'], correctIndex: 2 };
    const misleadingLegacy = { options: ['a', 'b', 'c', 'd'], correctIndex: 0 };
    expect(grade('mc', payload, misleadingLegacy, { kind: 'mc', selectedIdx: 2 }).isCorrect).toBe(
      true
    );
    expect(grade('mc', payload, misleadingLegacy, { kind: 'mc', selectedIdx: 0 }).isCorrect).toBe(
      false
    );
  });

  it('rejects an out-of-range selectedIdx', () => {
    const legacy = { options: ['a', 'b'], correctIndex: 0 };
    expect(grade('mc', null, legacy, { kind: 'mc', selectedIdx: 5 }).isCorrect).toBe(false);
    expect(grade('mc', null, legacy, { kind: 'mc', selectedIdx: -1 }).isCorrect).toBe(false);
  });
});

describe('grade() — true_false kind', () => {
  it('matches a true answer to a true correct flag', () => {
    expect(grade('true_false', { correct: true }, NO_LEGACY, {
      kind: 'true_false',
      value: true,
    }).isCorrect).toBe(true);
  });

  it('marks a mismatched boolean incorrect', () => {
    expect(grade('true_false', { correct: false }, NO_LEGACY, {
      kind: 'true_false',
      value: true,
    }).isCorrect).toBe(false);
  });

  it('rejects a payload with no boolean correct flag', () => {
    expect(grade('true_false', {}, NO_LEGACY, { kind: 'true_false', value: true }).isCorrect).toBe(
      false
    );
  });
});

describe('grade() — fill_blank kind', () => {
  const payload = { blank: { acceptableAnswers: ['Paris', 'paris'] } };

  it('accepts an exact (case-insensitive) match', () => {
    expect(grade('fill_blank', payload, NO_LEGACY, { kind: 'fill_blank', text: 'PARIS' }).isCorrect).toBe(
      true
    );
  });

  it('accepts a near-miss within the default fuzzy threshold (0.85)', () => {
    // "Pariss" is one insertion from "Paris" → ratio 5/6 ≈ 0.83 fails, but
    // "Pari" is one deletion from "Paris" → ratio 4/5 = 0.8 also fails; use a
    // single-typo on a longer accepted answer to stay above 0.85.
    const longer = { blank: { acceptableAnswers: ['Mississippi'] } };
    expect(
      grade('fill_blank', longer, NO_LEGACY, { kind: 'fill_blank', text: 'Mississipi' }).isCorrect
    ).toBe(true);
  });

  it('rejects a clearly-wrong answer', () => {
    expect(
      grade('fill_blank', payload, NO_LEGACY, { kind: 'fill_blank', text: 'London' }).isCorrect
    ).toBe(false);
  });

  it('honours caseSensitive when set', () => {
    const cs = { blank: { acceptableAnswers: ['Paris'], caseSensitive: true } };
    expect(grade('fill_blank', cs, NO_LEGACY, { kind: 'fill_blank', text: 'paris' }).isCorrect).toBe(
      false
    );
    expect(grade('fill_blank', cs, NO_LEGACY, { kind: 'fill_blank', text: 'Paris' }).isCorrect).toBe(
      true
    );
  });

  it('rejects a malformed payload (no acceptable answers)', () => {
    expect(
      grade('fill_blank', { blank: { acceptableAnswers: [] } }, NO_LEGACY, {
        kind: 'fill_blank',
        text: 'anything',
      }).isCorrect
    ).toBe(false);
  });
});

describe('grade() — translation kind', () => {
  const payload = {
    targetLanguage: 'fr',
    blank: { acceptableAnswers: ['bonjour'] },
  };

  it('accepts a correct translation', () => {
    expect(
      grade('translation', payload, NO_LEGACY, { kind: 'translation', text: 'Bonjour' }).isCorrect
    ).toBe(true);
  });

  it('rejects a wrong translation', () => {
    expect(
      grade('translation', payload, NO_LEGACY, { kind: 'translation', text: 'hallo' }).isCorrect
    ).toBe(false);
  });

  it('rejects a payload missing targetLanguage', () => {
    expect(
      grade('translation', { blank: { acceptableAnswers: ['bonjour'] } }, NO_LEGACY, {
        kind: 'translation',
        text: 'bonjour',
      }).isCorrect
    ).toBe(false);
  });
});

describe('grade() — word_bank kind', () => {
  const payload = {
    template: 'The {0} is {1}.',
    slots: [{ correctAnswer: 'sky' }, { correctAnswer: 'blue' }],
    wordBank: ['sky', 'blue', 'green', 'sea'],
  };

  it('marks every-slot-correct as correct (case-insensitive)', () => {
    expect(
      grade('word_bank', payload, NO_LEGACY, {
        kind: 'word_bank',
        slotAnswers: ['Sky', 'BLUE'],
      }).isCorrect
    ).toBe(true);
  });

  it('marks a wrong slot incorrect', () => {
    expect(
      grade('word_bank', payload, NO_LEGACY, {
        kind: 'word_bank',
        slotAnswers: ['sky', 'green'],
      }).isCorrect
    ).toBe(false);
  });

  it('rejects a null/empty slot', () => {
    expect(
      grade('word_bank', payload, NO_LEGACY, {
        kind: 'word_bank',
        slotAnswers: ['sky', null],
      }).isCorrect
    ).toBe(false);
  });

  it('rejects a slot-count mismatch', () => {
    expect(
      grade('word_bank', payload, NO_LEGACY, {
        kind: 'word_bank',
        slotAnswers: ['sky'],
      }).isCorrect
    ).toBe(false);
  });
});

describe('grade() — match_pairs kind', () => {
  const payload = {
    pairs: [
      { left: 'dog', right: 'bark' },
      { left: 'cat', right: 'meow' },
    ],
  };

  it('marks every-pair-correct as correct', () => {
    expect(
      grade('match_pairs', payload, NO_LEGACY, {
        kind: 'match_pairs',
        connections: [
          { left: 0, rightLabel: 'bark' },
          { left: 1, rightLabel: 'meow' },
        ],
      }).isCorrect
    ).toBe(true);
  });

  it('marks a wrong connection incorrect', () => {
    expect(
      grade('match_pairs', payload, NO_LEGACY, {
        kind: 'match_pairs',
        connections: [
          { left: 0, rightLabel: 'meow' },
          { left: 1, rightLabel: 'bark' },
        ],
      }).isCorrect
    ).toBe(false);
  });

  it('rejects a duplicate left index', () => {
    expect(
      grade('match_pairs', payload, NO_LEGACY, {
        kind: 'match_pairs',
        connections: [
          { left: 0, rightLabel: 'bark' },
          { left: 0, rightLabel: 'meow' },
        ],
      }).isCorrect
    ).toBe(false);
  });

  it('rejects a connection-count mismatch', () => {
    expect(
      grade('match_pairs', payload, NO_LEGACY, {
        kind: 'match_pairs',
        connections: [{ left: 0, rightLabel: 'bark' }],
      }).isCorrect
    ).toBe(false);
  });

  // Duplicate right values (e.g. two events in the same year) must be matchable
  // independently. The renderer now tags each connection with the distinct
  // right SLOT it chose; the grader still scores by `rightLabel`, which is
  // value-correct here — both lefts legitimately map to the shared "1945".
  it('marks duplicate right values correct when each left maps to a distinct slot', () => {
    const dupPayload = {
      pairs: [
        { left: 'Hiroshima bombing', right: '1945' },
        { left: 'End of WWII', right: '1945' },
      ],
    };
    expect(
      grade('match_pairs', dupPayload, NO_LEGACY, {
        kind: 'match_pairs',
        connections: [
          { left: 0, rightSlot: 0, rightLabel: '1945' },
          { left: 1, rightSlot: 1, rightLabel: '1945' },
        ],
      }).isCorrect
    ).toBe(true);
  });
});

describe('grade() — sentence_reorder kind', () => {
  const payload = { correctOrder: ['the', 'quick', 'fox'] };

  it('marks the exact token order correct', () => {
    expect(
      grade('sentence_reorder', payload, NO_LEGACY, {
        kind: 'sentence_reorder',
        orderedTokens: ['the', 'quick', 'fox'],
      }).isCorrect
    ).toBe(true);
  });

  it('marks a shuffled order incorrect', () => {
    expect(
      grade('sentence_reorder', payload, NO_LEGACY, {
        kind: 'sentence_reorder',
        orderedTokens: ['quick', 'the', 'fox'],
      }).isCorrect
    ).toBe(false);
  });

  it('rejects a length mismatch', () => {
    expect(
      grade('sentence_reorder', payload, NO_LEGACY, {
        kind: 'sentence_reorder',
        orderedTokens: ['the', 'quick'],
      }).isCorrect
    ).toBe(false);
  });
});

describe('grade() — code_output kind', () => {
  // code_output is case-SENSITIVE by default with a 0.95 threshold.
  const payload = {
    language: 'python',
    code: 'print("Hello")',
    blank: { acceptableAnswers: ['Hello'] },
  };

  it('accepts the exact expected output', () => {
    expect(
      grade('code_output', payload, NO_LEGACY, { kind: 'code_output', text: 'Hello' }).isCorrect
    ).toBe(true);
  });

  it('rejects output with the wrong case (case-sensitive default)', () => {
    expect(
      grade('code_output', payload, NO_LEGACY, { kind: 'code_output', text: 'hello' }).isCorrect
    ).toBe(false);
  });

  it('rejects a payload missing code', () => {
    expect(
      grade(
        'code_output',
        { language: 'python', blank: { acceptableAnswers: ['Hello'] } },
        NO_LEGACY,
        { kind: 'code_output', text: 'Hello' }
      ).isCorrect
    ).toBe(false);
  });
});

describe('grade() — timeline kind', () => {
  const payload = {
    events: [
      { year: '1914', label: 'WWI begins' },
      { year: '1939', label: 'WWII begins' },
      { year: '1969', label: 'Moon landing' },
    ],
  };

  it('marks correct index-keyed placements correct', () => {
    expect(
      grade('timeline', payload, NO_LEGACY, {
        kind: 'timeline',
        placements: { '0': 'WWI begins', '1': 'WWII begins', '2': 'Moon landing' },
      }).isCorrect
    ).toBe(true);
  });

  it('marks a mis-placed label incorrect', () => {
    expect(
      grade('timeline', payload, NO_LEGACY, {
        kind: 'timeline',
        placements: { '0': 'Moon landing', '1': 'WWII begins', '2': 'WWI begins' },
      }).isCorrect
    ).toBe(false);
  });

  it('rejects a placement-count mismatch', () => {
    expect(
      grade('timeline', payload, NO_LEGACY, {
        kind: 'timeline',
        placements: { '0': 'WWI begins' },
      }).isCorrect
    ).toBe(false);
  });

  it('supports legacy year-keyed placements', () => {
    expect(
      grade('timeline', payload, NO_LEGACY, {
        kind: 'timeline',
        placements: { '1914': 'WWI begins', '1939': 'WWII begins', '1969': 'Moon landing' },
      }).isCorrect
    ).toBe(true);
  });
});

describe('grade() — code_write kind', () => {
  // Contract: the renderer already ran the code server-side via
  // /api/quiz/code-execute and recorded the verdict on `passed`. grade()
  // TRUSTS that flag (no execution here) — server-side re-verification is a
  // documented future hardening pass.
  it('trusts a passed=true verdict', () => {
    expect(
      grade('code_write', { language: 'python', tests: [{ expectedStdout: '1' }] }, NO_LEGACY, {
        kind: 'code_write',
        language: 'python',
        code: 'print(1)',
        passed: true,
      }).isCorrect
    ).toBe(true);
  });

  it('trusts a passed=false verdict', () => {
    expect(
      grade('code_write', { language: 'python', tests: [{ expectedStdout: '1' }] }, NO_LEGACY, {
        kind: 'code_write',
        language: 'python',
        code: 'print(2)',
        passed: false,
      }).isCorrect
    ).toBe(false);
  });

  it('does not trust a non-boolean passed value (defaults to incorrect)', () => {
    expect(
      grade('code_write', { language: 'python', tests: [{ expectedStdout: '1' }] }, NO_LEGACY, {
        kind: 'code_write',
        language: 'python',
        code: 'print(1)',
        // @ts-expect-error — exercising the strict `=== true` guard against a truthy non-boolean
        passed: 'true',
      }).isCorrect
    ).toBe(false);
  });
});
