import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── mocks ──────────────────────────────────────────────────────────────
//
// `concept-misconception-tag.ts` talks to: the DB (`@/lib/db`), the feature
// flag gate, the model router, the three provider-specific forced-tool
// callers, and the tier-1 `concept-misconception` module. All are mocked
// here, mirroring `concept-backfill.test.ts`'s idiom, so `runMisconceptionTag`
// can be exercised as a pure unit against fixture data.

const mocks = vi.hoisted(() => ({
  weaknessConceptsEnabled: vi.fn(),
  resolveModel: vi.fn(),
  forcedStructuredCallOpenRouter: vi.fn(),
  forcedStructuredCallGemini: vi.fn(),
  deriveConceptMisconception: vi.fn(),
  conceptMasteryFindUnique: vi.fn(),
  conceptMasteryFindMany: vi.fn(),
  conceptMasteryUpdate: vi.fn(),
  conceptTagFindMany: vi.fn(),
  quizQuestionFindMany: vi.fn(),
  quizAnswerFindMany: vi.fn(),
  enqueueJob: vi.fn(),
  logAiUsage: vi.fn(),
}));

vi.mock('@/lib/feature-flags', () => ({
  weaknessConceptsEnabled: mocks.weaknessConceptsEnabled,
}));

vi.mock('@/lib/model-routing', () => ({
  resolveModel: mocks.resolveModel,
}));

vi.mock('@/lib/path-generator-openrouter', () => ({
  forcedStructuredCallOpenRouter: mocks.forcedStructuredCallOpenRouter,
}));

vi.mock('@/lib/path-generator-gemini', () => ({
  forcedStructuredCallGemini: mocks.forcedStructuredCallGemini,
}));

vi.mock('@/lib/concept-misconception', () => ({
  deriveConceptMisconception: mocks.deriveConceptMisconception,
}));

vi.mock('@/lib/background-jobs', () => ({
  enqueueJob: mocks.enqueueJob,
}));

vi.mock('@/lib/ai-usage', () => ({
  logAiUsage: mocks.logAiUsage,
}));

vi.mock('@/lib/db', () => ({
  db: {
    conceptMastery: {
      findUnique: mocks.conceptMasteryFindUnique,
      findMany: mocks.conceptMasteryFindMany,
      update: mocks.conceptMasteryUpdate,
    },
    conceptTag: { findMany: mocks.conceptTagFindMany },
    quizQuestion: { findMany: mocks.quizQuestionFindMany },
    quizAnswer: { findMany: mocks.quizAnswerFindMany },
  },
}));

import {
  isDepersonalised,
  isWithinMisconceptionCooldown,
  MISCONCEPTION_BATCH_LIMIT,
  MISCONCEPTION_COOLDOWN_DAYS,
  runMisconceptionTag,
  runMisconceptionTagBatch,
} from './concept-misconception-tag';

// ─── fixtures ───────────────────────────────────────────────────────────

const USER_ID = 'user-1';
const CONCEPT_ID = 'concept-1';

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * A `ConceptMastery` row whose `MasteryInputs` classify to `weak` under
 * `classifyBand` — plenty of decayed evidence (`weightedTotal` well above the
 * untested gate) at a low correct rate, attempted "now" so no decay applies.
 */
function weakMasteryRow(overrides: Partial<Record<string, unknown>> = {}, now: Date = new Date()) {
  return {
    userId: USER_ID,
    conceptId: CONCEPT_ID,
    weightedCorrect: 1,
    weightedTotal: 10,
    attemptCount: 10,
    lastAttemptAt: now,
    lastCorrectAt: now,
    peakLcb: 0.2,
    misconceptionLabel: null,
    misconceptionAt: null,
    concept: {
      id: CONCEPT_ID,
      label: 'Regular -ar verb endings',
      description: 'Conjugating -ar verbs in present tense',
    },
    ...overrides,
  };
}

/** A row that classifies as `solid` (recovered) regardless of `now`. */
function solidMasteryRow(overrides: Partial<Record<string, unknown>> = {}, now: Date = new Date()) {
  return weakMasteryRow(
    {
      weightedCorrect: 9.5,
      weightedTotal: 10,
      peakLcb: 0.9,
    },
    now
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.weaknessConceptsEnabled.mockReturnValue(true);
  mocks.resolveModel.mockReturnValue({ provider: 'openrouter', model: 'z-ai/glm-4.7', token: 'glm-flash' });
  mocks.forcedStructuredCallOpenRouter.mockResolvedValue({
    misconceptionLine: 'This kind of question is often mixed up with the -er endings. Let\'s compare them.',
  });
  mocks.deriveConceptMisconception.mockResolvedValue(null);
  mocks.conceptTagFindMany.mockResolvedValue([]);
  mocks.quizQuestionFindMany.mockResolvedValue([]);
  mocks.quizAnswerFindMany.mockResolvedValue([]);
  mocks.conceptMasteryFindMany.mockResolvedValue([]);
  mocks.conceptMasteryUpdate.mockResolvedValue(undefined);
  mocks.enqueueJob.mockResolvedValue(undefined);
});

// ─── pure: isWithinMisconceptionCooldown ────────────────────────────────

describe('isWithinMisconceptionCooldown', () => {
  it('null misconceptionAt is never within cooldown', () => {
    expect(isWithinMisconceptionCooldown(null, new Date())).toBe(false);
  });

  it('exactly 7 days elapsed is EXPIRED (allowed, not within cooldown)', () => {
    const now = new Date('2026-07-08T00:00:00.000Z');
    const misconceptionAt = addDays(now, -MISCONCEPTION_COOLDOWN_DAYS);
    expect(isWithinMisconceptionCooldown(misconceptionAt, now)).toBe(false);
  });

  it('6.9 days elapsed is BLOCKED (within cooldown)', () => {
    const now = new Date('2026-07-08T00:00:00.000Z');
    const misconceptionAt = addDays(now, -6.9);
    expect(isWithinMisconceptionCooldown(misconceptionAt, now)).toBe(true);
  });

  it('3 days elapsed is blocked', () => {
    const now = new Date('2026-07-08T00:00:00.000Z');
    const misconceptionAt = addDays(now, -3);
    expect(isWithinMisconceptionCooldown(misconceptionAt, now)).toBe(true);
  });

  it('8 days elapsed is expired', () => {
    const now = new Date('2026-07-08T00:00:00.000Z');
    const misconceptionAt = addDays(now, -8);
    expect(isWithinMisconceptionCooldown(misconceptionAt, now)).toBe(false);
  });
});

// ─── pure: isDepersonalised ─────────────────────────────────────────────

describe('isDepersonalised', () => {
  it('accepts the preferred material-framed shape', () => {
    expect(
      isDepersonalised("This kind of question is often mixed up with the -er endings. Let's compare them.")
    ).toBe(true);
  });

  it('accepts a neutral sentence with no second-person pronoun', () => {
    expect(isDepersonalised('This concept is frequently confused with a similar-looking rule.')).toBe(true);
  });

  it('rejects "You might be confusing X and Y"', () => {
    expect(isDepersonalised('You might be confusing X and Y.')).toBe(false);
  });

  it('rejects "You keep mixing up X and Y"', () => {
    expect(isDepersonalised('You keep mixing up the endings.')).toBe(false);
  });

  it('rejects "You\'re confusing the two forms"', () => {
    expect(isDepersonalised("You're confusing the two forms.")).toBe(false);
  });

  it('rejects "You mixed up the answers"', () => {
    expect(isDepersonalised('You mixed up the answers again.')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isDepersonalised('')).toBe(false);
    expect(isDepersonalised('   ')).toBe(false);
  });

  it('rejects a line over MAX_MISCONCEPTION_LINE_CHARS', () => {
    expect(isDepersonalised('a'.repeat(241))).toBe(false);
  });

  it('allows a benign "you" that is not paired with a blame verb', () => {
    // "you" alone (e.g. an instructional aside) without confuse/mix/wrong
    // should not be rejected — only the (you + blame-verb) combination is.
    expect(isDepersonalised('You will see this again in the next section.')).toBe(true);
  });

  // ── broadened blame-family coverage (noun/synonym forms) ──────────────
  // A prior version of this guard only matched VERB inflections of
  // "confuse"/"mix up"/"wrong", so second-person lines using a NOUN or
  // synonym form of the same blame slipped through undetected. These cases
  // pin down that every family (noun + verb + synonym) is now caught.

  it('rejects "Your confusion between X and Y is common." (noun form)', () => {
    expect(isDepersonalised('Your confusion between X and Y is common.')).toBe(false);
  });

  it('rejects "You have a misconception about this rule." (synonym noun)', () => {
    expect(isDepersonalised('You have a misconception about this rule.')).toBe(false);
  });

  it('rejects "You struggle with distinguishing these forms." (synonym verb)', () => {
    expect(isDepersonalised('You struggle with distinguishing these forms.')).toBe(false);
  });

  it('rejects "You often make errors with the subjunctive." (synonym noun)', () => {
    expect(isDepersonalised('You often make errors with the subjunctive.')).toBe(false);
  });

  it('rejects "Your mistakes suggest a mix-up between ser and estar." (noun forms)', () => {
    expect(isDepersonalised('Your mistakes suggest a mix-up between ser and estar.')).toBe(false);
  });

  it('rejects "You have difficulty with these endings." (synonym noun)', () => {
    expect(isDepersonalised('You have difficulty with these endings.')).toBe(false);
  });

  it('rejects "You tend to forget the accent." (synonym verb)', () => {
    expect(isDepersonalised('You tend to forget the accent.')).toBe(false);
  });

  // ── asymmetry: material-framed "mixed up" without second person passes ──

  it('accepts the preferred §2.3 shape containing "mixed up" but no second person', () => {
    expect(
      isDepersonalised(
        "This kind of question is often mixed up with {neighbor}. Let's compare them."
      )
    ).toBe(true);
  });

  it('accepts a neutral "confused" sentence with no second person', () => {
    expect(
      isDepersonalised(
        'This rule is often confused with the imperfect — worth comparing side by side.'
      )
    ).toBe(true);
  });

  it('accepts second-person phrasing with no blame-family word', () => {
    expect(isDepersonalised("Let's compare them so you can tell the two apart.")).toBe(true);
  });

  // ── split-particle phrasal "mix … up" (object between verb and particle) ──
  // BLAME_FAMILY_PATTERN's original "mix up" alternatives only matched the
  // particle immediately adjacent to the verb (or the noun "mix-up"). A
  // second-person line with an object wedged in between — "you mix X and Y
  // up" — slipped through undetected. These cases pin down the bounded-gap
  // fix that closes that hole, while preserving the pass/reject asymmetry
  // for material-framed (no second-person) lines using the same shape.

  it('rejects "You often mix X and Y up." (split phrasal verb)', () => {
    expect(isDepersonalised('You often mix X and Y up.')).toBe(false);
  });

  it('rejects "You mix them up." (split phrasal verb, pronoun object)', () => {
    expect(isDepersonalised('You mix them up.')).toBe(false);
  });

  it('rejects "You always mix these up." (split phrasal verb)', () => {
    expect(isDepersonalised('You always mix these up.')).toBe(false);
  });

  it('rejects "You\'d mix the two up under time pressure." (split phrasal verb, contraction)', () => {
    expect(isDepersonalised("You'd mix the two up under time pressure.")).toBe(false);
  });

  it('accepts "Learners often mix these two up in this kind of question." (no second person)', () => {
    expect(
      isDepersonalised('Learners often mix these two up in this kind of question.')
    ).toBe(true);
  });

  it('accepts the preferred §2.3 shape (regression: still passes with the widened pattern)', () => {
    expect(
      isDepersonalised(
        "This kind of question is often mixed up with {neighbor}. Let's compare them."
      )
    ).toBe(true);
  });

  it('accepts "Let\'s compare them so you can keep them straight." (second person, no blame family)', () => {
    expect(isDepersonalised("Let's compare them so you can keep them straight.")).toBe(true);
  });

  // ── widened bound (30 → 80 chars): longer realistic object phrases ──────
  // The verifier-confirmed gap: a realistic second-person blame line with a
  // longer object phrase between "mix" and "up" (>30, <=80 chars) slipped
  // through the old bound. These pin down the widened {0,80} bound while
  // documenting where the (still finite, by-design) cutoff now sits.

  it('rejects "You mix the subjunctive and the conditional forms up all the time." (long object phrase, ~52-char gap)', () => {
    expect(
      isDepersonalised('You mix the subjunctive and the conditional forms up all the time.')
    ).toBe(false);
  });

  it('rejects another long-object split-particle blame line (~60-70 char gap)', () => {
    expect(
      isDepersonalised(
        "You always mix the past subjunctive forms and the imperfect indicative forms up under pressure."
      )
    ).toBe(false);
  });

  it('documents the accepted bound: a >80-char gap between "mix" and "up" with no other blame-family word may still pass', () => {
    const longGapLine =
      "You mix the present subjunctive endings for regular ar er and ir verbs in the formal register up.";
    // Sanity: the gap between "mix" and the final "up" exceeds 80 chars, so
    // this specific split-particle occurrence falls outside the bounded
    // quantifier. This is the accepted, documented cutoff (not a regression)
    // — the pattern is intentionally over-inclusive rather than unbounded,
    // and a false negative here still falls back to the tier-1 line or
    // no-write per the handler's guard, never a raw LLM line reaching the
    // learner unchecked.
    const gapMatch = /\bmix\b(.*)\bup\b/i.exec(longGapLine);
    expect(gapMatch?.[1]?.length ?? 0).toBeGreaterThan(80);
    expect(isDepersonalised(longGapLine)).toBe(true);
  });
});

// ─── handler: flag guard ────────────────────────────────────────────────

describe('flag guard', () => {
  it('returns immediately with zero DB/LLM calls when weaknessConceptsEnabled() is false', async () => {
    mocks.weaknessConceptsEnabled.mockReturnValue(false);

    await runMisconceptionTag(CONCEPT_ID, USER_ID);

    expect(mocks.conceptMasteryFindUnique).not.toHaveBeenCalled();
    expect(mocks.forcedStructuredCallOpenRouter).not.toHaveBeenCalled();
    expect(mocks.conceptMasteryUpdate).not.toHaveBeenCalled();
  });
});

// ─── handler: mastery row missing ───────────────────────────────────────

describe('mastery row not found', () => {
  it('returns without an LLM call or write', async () => {
    mocks.conceptMasteryFindUnique.mockResolvedValue(null);

    await runMisconceptionTag(CONCEPT_ID, USER_ID);

    expect(mocks.forcedStructuredCallOpenRouter).not.toHaveBeenCalled();
    expect(mocks.conceptMasteryUpdate).not.toHaveBeenCalled();
  });
});

// ─── handler: cooldown gate ─────────────────────────────────────────────

describe('cooldown active', () => {
  it('skips the LLM call and write when misconceptionAt is within the 7-day cooldown', async () => {
    const now = new Date();
    mocks.conceptMasteryFindUnique.mockResolvedValue(
      weakMasteryRow({ misconceptionAt: addDays(now, -3) }, now)
    );

    await runMisconceptionTag(CONCEPT_ID, USER_ID);

    expect(mocks.forcedStructuredCallOpenRouter).not.toHaveBeenCalled();
    expect(mocks.forcedStructuredCallOpenRouter).not.toHaveBeenCalled();
    expect(mocks.forcedStructuredCallGemini).not.toHaveBeenCalled();
    expect(mocks.conceptMasteryUpdate).not.toHaveBeenCalled();
  });
});

// ─── handler: hysteresis gate ───────────────────────────────────────────

describe('hysteresis: concept recovered before the job ran', () => {
  it('skips the LLM call and write when classifyBand resolves to non-weak', async () => {
    mocks.conceptMasteryFindUnique.mockResolvedValue(solidMasteryRow());

    await runMisconceptionTag(CONCEPT_ID, USER_ID);

    expect(mocks.forcedStructuredCallOpenRouter).not.toHaveBeenCalled();
    expect(mocks.conceptMasteryUpdate).not.toHaveBeenCalled();
  });
});

// ─── handler: happy path ────────────────────────────────────────────────

describe('happy path', () => {
  it('weak + past cooldown + grounding present → LLM called, update persisted with a de-personalised label', async () => {
    mocks.conceptMasteryFindUnique.mockResolvedValue(weakMasteryRow());
    mocks.deriveConceptMisconception.mockResolvedValue({
      line: "This kind of question is often mixed up with \"habla\". Let's compare them.",
      neighborOptionText: 'habla',
      questionId: 'q1',
    });
    mocks.conceptTagFindMany.mockResolvedValue([{ itemId: 'q1' }]);
    mocks.quizQuestionFindMany.mockResolvedValue([
      { id: 'q1', question: 'Conjugate hablar (yo)', options: ['hablo', 'hablas', 'habla', 'hablamos'], correctIndex: 0 },
    ]);
    mocks.quizAnswerFindMany.mockResolvedValue([{ questionId: 'q1', selectedIdx: 2 }]);

    await runMisconceptionTag(CONCEPT_ID, USER_ID);

    expect(mocks.forcedStructuredCallOpenRouter).toHaveBeenCalledTimes(1);
    expect(mocks.conceptMasteryUpdate).toHaveBeenCalledTimes(1);
    const [updateArgs] = mocks.conceptMasteryUpdate.mock.calls[0] as [
      { where: { userId_conceptId: { userId: string; conceptId: string } }; data: { misconceptionLabel: string; misconceptionAt: Date } },
    ];
    expect(updateArgs.where.userId_conceptId).toEqual({ userId: USER_ID, conceptId: CONCEPT_ID });
    expect(isDepersonalised(updateArgs.data.misconceptionLabel)).toBe(true);
    expect(updateArgs.data.misconceptionAt).toBeInstanceOf(Date);
  });

  it('generates from label/description alone when there is no grounding evidence (§5.6)', async () => {
    mocks.conceptMasteryFindUnique.mockResolvedValue(weakMasteryRow());
    mocks.deriveConceptMisconception.mockResolvedValue(null);
    mocks.conceptTagFindMany.mockResolvedValue([]);

    await runMisconceptionTag(CONCEPT_ID, USER_ID);

    expect(mocks.forcedStructuredCallOpenRouter).toHaveBeenCalledTimes(1);
    expect(mocks.conceptMasteryUpdate).toHaveBeenCalledTimes(1);
  });
});

// ─── handler: forbidden LLM output falls back to tier-1 ────────────────

describe('LLM returns a forbidden second-person line', () => {
  it('guard rejects it and falls back to the tier-1 line when available', async () => {
    mocks.conceptMasteryFindUnique.mockResolvedValue(weakMasteryRow());
    mocks.forcedStructuredCallOpenRouter.mockResolvedValue({
      misconceptionLine: 'You keep mixing up the endings.',
    });
    mocks.deriveConceptMisconception.mockResolvedValue({
      line: "This kind of question is often mixed up with \"habla\". Let's compare them.",
      neighborOptionText: 'habla',
      questionId: 'q1',
    });

    await runMisconceptionTag(CONCEPT_ID, USER_ID);

    expect(mocks.conceptMasteryUpdate).toHaveBeenCalledTimes(1);
    const [updateArgs] = mocks.conceptMasteryUpdate.mock.calls[0] as [
      { data: { misconceptionLabel: string } },
    ];
    expect(updateArgs.data.misconceptionLabel).toBe(
      "This kind of question is often mixed up with \"habla\". Let's compare them."
    );
  });

  it('guard rejects it and skips the write entirely when no tier-1 fallback exists', async () => {
    mocks.conceptMasteryFindUnique.mockResolvedValue(weakMasteryRow());
    mocks.forcedStructuredCallOpenRouter.mockResolvedValue({
      misconceptionLine: "You're confusing the two forms.",
    });
    mocks.deriveConceptMisconception.mockResolvedValue(null);

    await runMisconceptionTag(CONCEPT_ID, USER_ID);

    expect(mocks.conceptMasteryUpdate).not.toHaveBeenCalled();
  });
});

// ─── handler: never throws ──────────────────────────────────────────────

describe('never throws', () => {
  it('resolves (does not reject) when a DB error occurs, and logs it', async () => {
    mocks.conceptMasteryFindUnique.mockRejectedValue(new Error('connection reset'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runMisconceptionTag(CONCEPT_ID, USER_ID)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      '[concept-misconception-tag] failed',
      expect.objectContaining({ conceptId: CONCEPT_ID, userId: USER_ID, error: 'connection reset' })
    );
    errorSpy.mockRestore();
  });

  it('resolves even when the LLM call itself throws', async () => {
    mocks.conceptMasteryFindUnique.mockResolvedValue(weakMasteryRow());
    mocks.forcedStructuredCallOpenRouter.mockRejectedValue(new Error('provider 500'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runMisconceptionTag(CONCEPT_ID, USER_ID)).resolves.toBeUndefined();

    expect(mocks.conceptMasteryUpdate).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('resolves even when conceptMastery.update throws', async () => {
    mocks.conceptMasteryFindUnique.mockResolvedValue(weakMasteryRow());
    mocks.conceptMasteryUpdate.mockRejectedValue(new Error('write failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runMisconceptionTag(CONCEPT_ID, USER_ID)).resolves.toBeUndefined();
    errorSpy.mockRestore();
  });
});

// ─── provider dispatch ──────────────────────────────────────────────────

describe('provider dispatch', () => {
  it('routes to forcedStructuredCallOpenRouter when resolveModel picks openrouter', async () => {
    mocks.conceptMasteryFindUnique.mockResolvedValue(weakMasteryRow());
    mocks.resolveModel.mockReturnValue({ provider: 'openrouter', model: 'glm-haiku-id', token: 'glm-haiku' });
    mocks.forcedStructuredCallOpenRouter.mockResolvedValue({
      misconceptionLine: "This kind of question is often mixed up with a similar rule. Let's compare them.",
    });

    await runMisconceptionTag(CONCEPT_ID, USER_ID);

    expect(mocks.forcedStructuredCallOpenRouter).toHaveBeenCalledTimes(1);
    expect(mocks.forcedStructuredCallGemini).not.toHaveBeenCalled();
    expect(mocks.conceptMasteryUpdate).toHaveBeenCalledTimes(1);
  });

  it('routes to forcedStructuredCallGemini when resolveModel picks gemini, appending the JSON instruction', async () => {
    mocks.conceptMasteryFindUnique.mockResolvedValue(weakMasteryRow());
    mocks.resolveModel.mockReturnValue({ provider: 'gemini', model: 'flash-lite-id', token: 'flash-lite' });
    mocks.forcedStructuredCallGemini.mockResolvedValue({
      misconceptionLine: "This kind of question is often mixed up with a similar rule. Let's compare them.",
    });

    await runMisconceptionTag(CONCEPT_ID, USER_ID);

    expect(mocks.forcedStructuredCallGemini).toHaveBeenCalledTimes(1);
    const [callArgs] = mocks.forcedStructuredCallGemini.mock.calls[0] as [{ systemInstruction: string }];
    expect(callArgs.systemInstruction).toContain('Respond with ONLY a single JSON object');
    expect(mocks.conceptMasteryUpdate).toHaveBeenCalledTimes(1);
  });

  it('defaults to an empty line when Gemini returns a partial payload, falling back to tier-1', async () => {
    mocks.conceptMasteryFindUnique.mockResolvedValue(weakMasteryRow());
    mocks.resolveModel.mockReturnValue({ provider: 'gemini', model: 'flash-lite-id', token: 'flash-lite' });
    mocks.forcedStructuredCallGemini.mockResolvedValue({});
    mocks.deriveConceptMisconception.mockResolvedValue({
      line: "This kind of question is often mixed up with \"habla\". Let's compare them.",
      neighborOptionText: 'habla',
      questionId: 'q1',
    });

    await runMisconceptionTag(CONCEPT_ID, USER_ID);

    expect(mocks.conceptMasteryUpdate).toHaveBeenCalledTimes(1);
    const [updateArgs] = mocks.conceptMasteryUpdate.mock.calls[0] as [{ data: { misconceptionLabel: string } }];
    expect(updateArgs.data.misconceptionLabel).toContain('habla');
  });
});

// ─── batch handler: runMisconceptionTagBatch (Phase 5 / audit M2a) ──────────

/** A weak-band ConceptMastery row (as returned by findMany with concept
 *  included) for the batch eligibility loader. Fields mirror weakMasteryRow. */
function weakBatchRow(conceptId: string, label: string, now: Date = new Date()) {
  return {
    userId: USER_ID,
    conceptId,
    status: 'weak',
    weightedCorrect: 1,
    weightedTotal: 10,
    attemptCount: 10,
    lastAttemptAt: now,
    lastCorrectAt: now,
    peakLcb: 0.2,
    misconceptionLabel: null,
    misconceptionAt: null,
    updatedAt: now,
    concept: { id: conceptId, label, description: `About ${label}` },
  };
}

describe('runMisconceptionTagBatch', () => {
  it('flag off → no DB/LLM calls', async () => {
    mocks.weaknessConceptsEnabled.mockReturnValue(false);

    await runMisconceptionTagBatch(USER_ID);

    expect(mocks.conceptMasteryFindMany).not.toHaveBeenCalled();
    expect(mocks.forcedStructuredCallOpenRouter).not.toHaveBeenCalled();
  });

  it('no eligible concepts → returns with no LLM call', async () => {
    mocks.conceptMasteryFindMany.mockResolvedValue([]);

    await runMisconceptionTagBatch(USER_ID);

    expect(mocks.forcedStructuredCallOpenRouter).not.toHaveBeenCalled();
    expect(mocks.conceptMasteryUpdate).not.toHaveBeenCalled();
  });

  it('happy path: 2 eligible concepts → 1 LLM call → 2 lines persisted (index-addressed), 1 usage log', async () => {
    mocks.conceptMasteryFindMany.mockResolvedValue([
      weakBatchRow('c-1', 'Regular -ar verbs'),
      weakBatchRow('c-2', 'Ser vs estar'),
    ]);
    // The real forced caller invokes onUsage; the mock must too, so the batch
    // handler's aggregated logAiUsage fires.
    mocks.forcedStructuredCallOpenRouter.mockImplementation(async (opts: { onUsage?: (u: unknown) => void }) => {
      opts.onUsage?.({ inputTokens: 500, outputTokens: 80, cachedTokens: 0, costUsd: 0, upstreamCostUsd: 0 });
      return {
        lines: [
          { index: 1, line: "This kind of question is often mixed up with -er verbs. Let's compare them." },
          { index: 2, line: "This kind of question is often mixed up with the other copula. Let's compare them." },
        ],
      };
    });

    await runMisconceptionTagBatch(USER_ID);

    // ONE LLM call for the whole batch.
    expect(mocks.forcedStructuredCallOpenRouter).toHaveBeenCalledTimes(1);
    expect(mocks.forcedStructuredCallGemini).not.toHaveBeenCalled();
    // Two lines persisted, each to the right concept by 1-based index.
    expect(mocks.conceptMasteryUpdate).toHaveBeenCalledTimes(2);
    const persisted = mocks.conceptMasteryUpdate.mock.calls.map(
      (call) => (call[0] as { where: { userId_conceptId: { conceptId: string } }; data: { misconceptionLabel: string } }),
    );
    const byConcept = new Map(persisted.map((p) => [p.where.userId_conceptId.conceptId, p.data.misconceptionLabel]));
    expect(byConcept.get('c-1')).toContain('-er verbs');
    expect(byConcept.get('c-2')).toContain('copula');
    for (const label of byConcept.values()) expect(isDepersonalised(label)).toBe(true);
    // ONE aggregated usage log for the batch.
    expect(mocks.logAiUsage).toHaveBeenCalledTimes(1);
    const [usageArgs] = mocks.logAiUsage.mock.calls[0] as [{ feature: string }];
    expect(usageArgs.feature).toBe('weakness-misconception-tag');
    // No re-enqueue when everything fit in one batch.
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  it('index out of range is dropped: only the valid line persists', async () => {
    mocks.conceptMasteryFindMany.mockResolvedValue([
      weakBatchRow('c-1', 'Regular -ar verbs'),
      weakBatchRow('c-2', 'Ser vs estar'),
    ]);
    mocks.forcedStructuredCallOpenRouter.mockResolvedValue({
      lines: [
        { index: 1, line: "This kind of question is often mixed up with -er verbs. Let's compare them." },
        { index: 99, line: "Out-of-range index — must be dropped." }, // no concept #99
      ],
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runMisconceptionTagBatch(USER_ID);

    // Only concept #1 persisted; #2 got no line (index 99 dropped), and has no
    // tier-1 fallback so nothing is written for it.
    expect(mocks.conceptMasteryUpdate).toHaveBeenCalledTimes(1);
    const [updateArgs] = mocks.conceptMasteryUpdate.mock.calls[0] as [
      { where: { userId_conceptId: { conceptId: string } } },
    ];
    expect(updateArgs.where.userId_conceptId.conceptId).toBe('c-1');
    expect(
      errorSpy.mock.calls.some((c) => c[0] === '[concept-misconception-tag] batch returned out-of-range index, skipping'),
    ).toBe(true);
    errorSpy.mockRestore();
  });

  it('re-enqueues itself when more than the batch limit are eligible', async () => {
    // Return limit*3 rows (the loader over-fetches) so >limit are genuinely
    // eligible and hasMore is set. All classify weak, none in cooldown.
    const rows = Array.from({ length: MISCONCEPTION_BATCH_LIMIT * 3 }, (_, i) =>
      weakBatchRow(`c-${i}`, `Concept ${i}`),
    );
    mocks.conceptMasteryFindMany.mockResolvedValue(rows);
    mocks.forcedStructuredCallOpenRouter.mockResolvedValue({
      lines: Array.from({ length: MISCONCEPTION_BATCH_LIMIT }, (_, i) => ({
        index: i + 1,
        line: `This kind of question is often mixed up with a similar rule ${i}. Let's compare them.`,
      })),
    });

    await runMisconceptionTagBatch(USER_ID);

    // Exactly the limit's worth of concepts tagged this run.
    expect(mocks.conceptMasteryUpdate).toHaveBeenCalledTimes(MISCONCEPTION_BATCH_LIMIT);
    // And a follow-up batch job enqueued (immediate, same per-user dedupeKey).
    expect(mocks.enqueueJob).toHaveBeenCalledTimes(1);
    const [kind, payload, options] = mocks.enqueueJob.mock.calls[0] as [
      string,
      { userId: string },
      { dedupeKey: string; runAt: Date },
    ];
    expect(kind).toBe('concept.misconception.batch');
    expect(payload).toEqual({ userId: USER_ID });
    expect(options.dedupeKey).toBe(`concept.misconception.batch:${USER_ID}`);
    expect(options.runAt).toBeInstanceOf(Date);
  });

  it('skips concepts that recovered out of weak band before the run (hysteresis)', async () => {
    // A row whose denormalised status is stale 'weak' but whose live inputs
    // classify solid must be dropped, spending no token on it.
    mocks.conceptMasteryFindMany.mockResolvedValue([
      { ...weakBatchRow('c-1', 'Recovered'), weightedCorrect: 9.5, weightedTotal: 10, peakLcb: 0.9 },
    ]);

    await runMisconceptionTagBatch(USER_ID);

    expect(mocks.forcedStructuredCallOpenRouter).not.toHaveBeenCalled();
    expect(mocks.conceptMasteryUpdate).not.toHaveBeenCalled();
  });

  it('never throws when the DB query fails', async () => {
    mocks.conceptMasteryFindMany.mockRejectedValue(new Error('db down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runMisconceptionTagBatch(USER_ID)).resolves.toBeUndefined();
    errorSpy.mockRestore();
  });
});

// ─── kill-switch fallback in concept-tracking (M2a) ─────────────────────────
// The fallback to per-concept enqueues lives in concept-tracking.ts; that
// module's own test file covers the enqueue wiring. Here we only assert the
// batch handler itself is the new path — the enqueue-side switch is verified
// where enqueueMisconceptionForNewlyWeakConcepts is unit-tested.
