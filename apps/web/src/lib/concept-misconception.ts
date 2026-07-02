/**
 * Weakness Training Phase 1B — deterministic tier-1 "dominant distractor"
 * misconception module.
 *
 * Canonical source: `plans/weakness-training.md` §2.3 "Misconception layer
 * (two-tier, cost-bounded, de-personalised)", **tier 1 only**:
 *
 *   "Deterministic, free, inline at every grading event: for `mc`/`match_pairs`,
 *   tally which wrong option was chosen across a concept's wrong answers. A
 *   'dominant distractor' requires n≥5 wrong answers (n=3 at a 60% threshold
 *   is statistically indistinguishable from chance on a 3-way split) AND the
 *   dominant option chosen ≥60% of the time AND a binomial significance check
 *   against the chance baseline `1/(numOptions-1)`. Below that bar, fall back
 *   to the question's own pre-authored `wrongExplanation`
 *   (`QuizQuestion.wrongExplanation`, already exists, zero new cost) — never
 *   assert a specific confusion without enough evidence."
 *
 * Tier 2 (LLM-confirmed, batched, async, hysteresis-gated on a weak-band
 * transition) is explicitly OUT OF SCOPE here — that is Phase 3.
 *
 * This module is split the same way `concept-mastery.ts` is:
 *   - PURE math (`binomialUpperTailPValue`, `computeDominantDistractor`) —
 *     no I/O, fully unit-testable, tunable constants exported per the
 *     "retune the named `const` exports, not inline" convention (plan §9 Q#6).
 *   - A best-effort DB reader (`deriveConceptMisconception`) that joins
 *     `ConceptTag` → `QuizQuestion` → `QuizAnswer` and calls the pure math.
 *     It NEVER throws — any DB error is logged and swallowed, returning
 *     `null`, because tier 1 is a nice-to-have annotation on top of the
 *     Phase 1A weak-area surface, never a hard dependency of it.
 *
 * Output copy is always de-personalised and material-framed (§2.3) — a
 * question-type framing ("this kind of question is often mixed up with
 * X"), never a psychological claim about the learner ("you keep mixing up
 * X and Y" is explicitly the anti-pattern called out in the plan).
 */

import { db } from '@/lib/db';

// ─── Tunable constants (plan §9 Q#6 — retune here, not inline) ─────────────

/** Minimum wrong-answer sample size before a dominant distractor can even be
 *  considered. Per §2.3: "n=3 at a 60% threshold is statistically
 *  indistinguishable from chance on a 3-way split" — 5 is the plan's floor. */
export const MIN_WRONG_FOR_DOMINANT = 5;

/** The single most-chosen wrong option must account for at least this
 *  fraction of all wrong answers to be called "dominant". */
export const DOMINANT_FRACTION_THRESHOLD = 0.6;

/** Binomial upper-tail p-value must be at/below this for the dominant
 *  option's share to be considered significant vs. the chance baseline. */
export const SIGNIFICANCE_ALPHA = 0.05;

/** Bound on how many recent wrong `QuizAnswer` rows {@link deriveConceptMisconception}
 *  will load per concept — keeps the read cheap and recency-biased. */
export const MAX_WRONG_ANSWERS_SCANNED = 200;

/** Only wrong answers within this many days are considered — stale
 *  confusions shouldn't drive a message about the learner's current state. */
export const WRONG_ANSWER_LOOKBACK_DAYS = 90;

// ─── Types ──────────────────────────────────────────────────────────────

/**
 * Result of {@link computeDominantDistractor} — a single wrong option that
 * clears every tier-1 bar (sample size, dominance fraction, significance).
 */
export interface DominantDistractor {
  /** The (0-based) option index most learners incorrectly picked. */
  dominantOptionIndex: number;
  /** How many wrong answers picked `dominantOptionIndex`. */
  dominantCount: number;
  /** Total wrong answers considered (across all wrong options). */
  totalWrong: number;
  /** `dominantCount / totalWrong`. */
  fraction: number;
  /** `1 / (numOptions - 1)` — the chance rate of picking this one wrong
   *  option among the non-correct options, if learners guessed uniformly. */
  chanceBaseline: number;
  /** `binomialUpperTailPValue(dominantCount, totalWrong, chanceBaseline)`. */
  pValue: number;
}

/**
 * A de-personalised, material-framed misconception line for one concept,
 * derived from a single question's dominant distractor (§2.3 tier 1). `null`
 * from {@link deriveConceptMisconception} means nothing cleared the bar — the
 * caller should fall back to `QuizQuestion.wrongExplanation` instead.
 */
export interface ConceptMisconception {
  /** De-personalised, material-framed copy — see file header. */
  line: string;
  /** The dominant wrong option's text, i.e. the `{neighbor}` in `line`. */
  neighborOptionText: string;
  /** The `QuizQuestion.id` the dominant distractor was derived from. */
  questionId: string;
}

// ─── Pure math ──────────────────────────────────────────────────────────

/**
 * P(X ≥ k) for X ~ Binomial(n, p) — the upper-tail p-value used to test
 * whether a wrong option was picked more often than chance alone would
 * predict. Straightforward summation of the binomial pmf from `k` to `n`;
 * pure, no I/O. Guards `n === 0` → 0 (nothing to test).
 */
export function binomialUpperTailPValue(k: number, n: number, p: number): number {
  if (n <= 0) return 0;
  const kFloor = Math.max(0, Math.ceil(k));
  if (kFloor > n) return 0;

  // log-space binomial pmf to stay numerically stable for larger n.
  const logPmf = (i: number): number => {
    if (p <= 0) return i === 0 ? 0 : -Infinity;
    if (p >= 1) return i === n ? 0 : -Infinity;
    return logBinomialCoefficient(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p);
  };

  let total = 0;
  for (let i = kFloor; i <= n; i++) {
    total += Math.exp(logPmf(i));
  }
  // Numerical safety: clamp into [0, 1] in case of floating-point overshoot.
  return Math.min(1, Math.max(0, total));
}

/** log(n choose k), via the log-gamma function — avoids overflow for large n. */
function logBinomialCoefficient(n: number, k: number): number {
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

/** log(n!) via `lgamma(n + 1)`. */
function logFactorial(n: number): number {
  return logGamma(n + 1);
}

/**
 * Lanczos approximation of the log-gamma function — sufficiently accurate
 * for the small-to-moderate `n` (bounded by {@link MAX_WRONG_ANSWERS_SCANNED})
 * this module ever evaluates.
 */
function logGamma(x: number): number {
  const g = 7;
  const coefficients = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const xAdj = x - 1;
  let a = coefficients[0];
  const t = xAdj + g + 0.5;
  for (let i = 1; i < g + 2; i++) {
    a += coefficients[i] / (xAdj + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (xAdj + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Input to {@link computeDominantDistractor}. */
export interface ComputeDominantDistractorInput {
  /** Wrong-answer counts keyed by (0-based) option index — the correct
   *  option must already be excluded by the caller. */
  wrongCountsByOption: Map<number, number> | Record<number, number>;
  /** Total number of options on the question (used for the chance baseline). */
  numOptions: number;
}

/**
 * Tier-1 dominant-distractor decision (§2.3). Returns `null` unless ALL of
 * the following hold:
 *   1. `totalWrong >= MIN_WRONG_FOR_DOMINANT` — enough samples to say anything.
 *   2. The single most-chosen wrong option's share of `totalWrong` is
 *      `>= DOMINANT_FRACTION_THRESHOLD`.
 *   3. That share is statistically significant against the chance baseline
 *      of picking one specific wrong option among the non-correct options
 *      (`1 / (numOptions - 1)`), via a binomial upper-tail test at
 *      `SIGNIFICANCE_ALPHA`.
 *
 * Pure — no I/O, deterministic, fully unit-testable.
 */
export function computeDominantDistractor(
  input: ComputeDominantDistractorInput
): DominantDistractor | null {
  if (input.numOptions <= 1) return null;

  const entries: Array<[number, number]> =
    input.wrongCountsByOption instanceof Map
      ? Array.from(input.wrongCountsByOption.entries())
      : Object.entries(input.wrongCountsByOption).map(([k, v]) => [Number(k), v]);

  const totalWrong = entries.reduce((sum, [, count]) => sum + count, 0);
  if (totalWrong < MIN_WRONG_FOR_DOMINANT) return null;

  let dominantOptionIndex = -1;
  let dominantCount = -1;
  for (const [optionIndex, count] of entries) {
    if (count > dominantCount) {
      dominantCount = count;
      dominantOptionIndex = optionIndex;
    }
  }
  if (dominantOptionIndex < 0) return null;

  const fraction = dominantCount / totalWrong;
  if (fraction < DOMINANT_FRACTION_THRESHOLD) return null;

  const chanceBaseline = 1 / (input.numOptions - 1);
  const pValue = binomialUpperTailPValue(dominantCount, totalWrong, chanceBaseline);
  if (pValue > SIGNIFICANCE_ALPHA) return null;

  return {
    dominantOptionIndex,
    dominantCount,
    totalWrong,
    fraction,
    chanceBaseline,
    pValue,
  };
}

// ─── DB reader (best-effort, bounded) ──────────────────────────────────

/**
 * Derive a tier-1, de-personalised misconception line for one concept, or
 * `null` if nothing clears the bar (caller falls back to
 * `QuizQuestion.wrongExplanation`, per §2.3).
 *
 * Steps:
 *   1. Load the concept's tagged `mc` quiz-question items (`ConceptTag` where
 *      `conceptId` + `itemType='quiz_question'`, joined to `QuizQuestion`,
 *      filtered to `kind === 'mc'`). `match_pairs` distractor-mining is
 *      TODO(phase3) — tier 1 here is scoped to `mc` only.
 *   2. Load wrong `QuizAnswer` rows for those questions
 *      (`isCorrect: false`), bounded to the most recent
 *      {@link MAX_WRONG_ANSWERS_SCANNED} within the last
 *      {@link WRONG_ANSWER_LOOKBACK_DAYS} days.
 *   3. Per question, tally `selectedIdx` occurrences, EXCLUDING any row
 *      whose `selectedIdx` equals the question's `correctIndex` (a "wrong"
 *      answer whose selected index matches the correct one is data noise,
 *      e.g. a stale non-MC `userAnswer` row that never updated the legacy
 *      `selectedIdx` sentinel — skip it rather than let it pollute the tally).
 *   4. Run {@link computeDominantDistractor} per question, pick the question
 *      with the strongest qualifying dominant distractor (lowest p-value),
 *      and if one clears the bar, return a de-personalised line using the
 *      dominant wrong option's text as `{neighbor}`.
 *
 * Best-effort: wraps all DB work in try/catch and returns `null` on any
 * error (logged) — this is an enrichment on top of the Phase 1A weak-area
 * surface, never a hard dependency of it.
 */
export async function deriveConceptMisconception(
  conceptId: string
): Promise<ConceptMisconception | null> {
  try {
    const tags = await db.conceptTag.findMany({
      where: { conceptId, itemType: 'quiz_question' },
      select: { itemId: true },
    });
    if (tags.length === 0) return null;

    const questionIds = tags.map((t) => t.itemId);

    const questions = await db.quizQuestion.findMany({
      where: { id: { in: questionIds }, kind: 'mc' },
      select: { id: true, options: true, correctIndex: true },
    });
    if (questions.length === 0) return null;

    const questionById = new Map(questions.map((q) => [q.id, q]));

    const lookbackDate = new Date(Date.now() - WRONG_ANSWER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const wrongAnswers = await db.quizAnswer.findMany({
      where: {
        questionId: { in: questions.map((q) => q.id) },
        isCorrect: false,
        createdAt: { gte: lookbackDate },
      },
      select: { questionId: true, selectedIdx: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_WRONG_ANSWERS_SCANNED,
    });
    if (wrongAnswers.length === 0) return null;

    // Tally selectedIdx per question, excluding rows whose selectedIdx
    // equals that question's correctIndex (noise — see step 3 above).
    const countsByQuestion = new Map<string, Map<number, number>>();
    for (const answer of wrongAnswers) {
      const question = questionById.get(answer.questionId);
      if (!question) continue;
      if (answer.selectedIdx === question.correctIndex) continue;

      let counts = countsByQuestion.get(answer.questionId);
      if (!counts) {
        counts = new Map<number, number>();
        countsByQuestion.set(answer.questionId, counts);
      }
      counts.set(answer.selectedIdx, (counts.get(answer.selectedIdx) ?? 0) + 1);
    }

    let best: { questionId: string; distractor: DominantDistractor } | null = null;

    for (const [questionId, counts] of countsByQuestion.entries()) {
      const question = questionById.get(questionId);
      if (!question) continue;

      const distractor = computeDominantDistractor({
        wrongCountsByOption: counts,
        numOptions: question.options.length,
      });
      if (!distractor) continue;

      if (!best || distractor.pValue < best.distractor.pValue) {
        best = { questionId, distractor };
      }
    }

    if (!best) return null;

    const question = questionById.get(best.questionId);
    if (!question) return null;

    const neighborOptionText = question.options[best.distractor.dominantOptionIndex];
    if (!neighborOptionText) return null;

    return {
      line: `This kind of question is often mixed up with "${neighborOptionText}". Let's compare them.`,
      neighborOptionText,
      questionId: best.questionId,
    };
  } catch (error) {
    console.error('[concept-misconception] deriveConceptMisconception failed', {
      conceptId,
      error,
    });
    return null;
  }
}
