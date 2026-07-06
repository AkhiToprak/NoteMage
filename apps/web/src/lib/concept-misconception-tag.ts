/**
 * Weakness Training Phase 3 — tier-2 "LLM-confirmed" misconception tag.
 *
 * Canonical source: `plans/weakness-training.md` §2.3 "Misconception layer
 * (two-tier, cost-bounded, de-personalised)", **tier 2 only**:
 *
 *   "LLM-confirmed, batched, async, hysteresis-gated: fires only on a
 *   `weak`-band transition (untested/building → weak), once per concept
 *   per 7-day cooldown even if the concept oscillates across the boundary.
 *   Routes through a new cheap `ModelFeature` case (§5). Output is
 *   de-personalised, material-framed copy — about the question type and
 *   the confusable pair, never a psychological claim about the learner:
 *
 *     Preferred: "This kind of question is often mixed up with {neighbor}.
 *     Let's compare them."
 *     Avoid: "You might be confusing X and Y" / "You keep mixing up…"
 *
 *   Always paired with the actual wrong answers it's based on."
 *
 * `runMisconceptionTag(conceptId, userId)` is the handler for the
 * `concept.misconception` background job, enqueued by `concept-tracking.ts`
 * whenever a concept transitions into the `weak` band. It is best-effort and
 * NEVER throws (it runs on the background worker; a throw would burn
 * retries on a nice-to-have annotation, never a hard dependency). Gate order:
 *
 *   1. Flag guard (`weaknessConceptsEnabled()`).
 *   2. Load the `ConceptMastery` row — no-op if the pairing doesn't exist.
 *   3. 7-day cooldown (`isWithinMisconceptionCooldown`) — no LLM call if the
 *      concept was already tagged recently, even if it oscillated across
 *      the weak-band boundary in the meantime.
 *   4. Hysteresis re-check (`classifyBand`) — the async job may run well
 *      after the triggering event; if the concept has since recovered out
 *      of `weak`, don't assert a stale confusion or spend tokens.
 *   5. Gather grounding evidence: the tier-1 dominant-distractor line (if
 *      any) PLUS a small bounded set of the concept's actual recent wrong
 *      `QuizAnswer` rows. If there is no evidence at all, still generate
 *      from the concept label/description alone (§5.6 no-corpus fallback)
 *      rather than hard-failing.
 *   6. One forced-tool LLM call (cheap tier, `weakness-misconception-tag`)
 *      whose system/tool instructions enforce the de-personalised,
 *      material-framed voice.
 *   7. Deterministic de-personalised guard (`isDepersonalised`) as a
 *      backstop against the LLM ever emitting a psychological claim about
 *      the learner. A failing or oversized line falls back to the tier-1
 *      line if available; otherwise nothing is persisted.
 *   8. Persist `ConceptMastery.misconceptionLabel` + `misconceptionAt`.
 */

import type { ToolDef } from '@/lib/ai-tool-types';
import { db } from '@/lib/db';
import { weaknessConceptsEnabled } from '@/lib/feature-flags';
import { resolveModel } from '@/lib/model-routing';
import { classifyBand, type MasteryInputs } from '@/lib/concept-mastery';
import { deriveConceptMisconception } from '@/lib/concept-misconception';
import { forcedStructuredCallGemini } from '@/lib/path-generator-gemini';
import { forcedStructuredCallOpenRouter } from '@/lib/path-generator-openrouter';

// ─── Tunable constants (plan §9 Q#6 — retune here, not inline) ─────────────

/** Once-per-concept re-tag cooldown, even if the concept oscillates across
 *  the weak-band boundary within the window (§2.3). */
export const MISCONCEPTION_COOLDOWN_DAYS = 7;

/** Bound on how many recent wrong `QuizAnswer` rows are pulled as grounding
 *  evidence for the LLM prompt — keeps the call small and recency-biased. */
export const MAX_WRONG_EXAMPLES = 8;

/** Only wrong answers within this many days are considered grounding
 *  evidence — mirrors tier-1's `WRONG_ANSWER_LOOKBACK_DAYS`. */
export const WRONG_EXAMPLE_LOOKBACK_DAYS = 90;

/** Hard cap on the persisted misconception line's length. An LLM output
 *  longer than this is rejected outright (falls back to tier-1 or no-write)
 *  rather than truncated, since a truncated sentence can read as broken. */
export const MAX_MISCONCEPTION_LINE_CHARS = 240;

// ─── Types ──────────────────────────────────────────────────────────────

/** One recent wrong `QuizAnswer`, joined up to its question text and the
 *  learner's selected vs. correct option text — the grounding evidence
 *  passed to the LLM (§2.3 "always paired with the actual wrong answers"). */
export interface WrongAnswerExample {
  questionText: string;
  selectedOptionText: string | null;
  correctOptionText: string | null;
}

/** Forced-tool output shape. */
export interface MisconceptionTagToolInput {
  misconceptionLine: string;
}

// ─── Pure helpers (unit-testable) ──────────────────────────────────────

/**
 * True when `misconceptionAt` falls within {@link MISCONCEPTION_COOLDOWN_DAYS}
 * of `now` — the handler must skip the LLM call entirely in that case. `null`
 * (never tagged before) is never within cooldown. Exactly
 * `MISCONCEPTION_COOLDOWN_DAYS` days elapsed counts as EXPIRED (allowed),
 * i.e. the check is a strict `<`, not `<=`.
 */
export function isWithinMisconceptionCooldown(misconceptionAt: Date | null, now: Date): boolean {
  if (misconceptionAt === null) return false;
  const daysSince = (now.getTime() - misconceptionAt.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince < MISCONCEPTION_COOLDOWN_DAYS;
}

/**
 * Second-person blame families rejected by {@link isDepersonalised}. Each
 * entry covers one confusion/error "family" in both verb and noun/synonym
 * inflections, since a bare verb-inflection alternation (e.g. only
 * `confus(e|ed|es|ing)`) silently misses noun forms like "confusion" or
 * synonyms like "misconception" — the exact gap a prior version of this
 * guard had (a line like "Your confusion between X and Y is common." slipped
 * through). Families covered:
 *   - confuse/confusion
 *   - misconception(s)
 *   - mix up (verb, adjacent) / mix-up(s) (noun) / mix … up (verb, SPLIT
 *     phrasal — object between verb and particle, e.g. "mix X and Y up",
 *     "mix them up", bounded to an intervening span of up to 80 chars
 *     (covers realistic second-person blame lines with a longer object
 *     phrase, e.g. "You mix the subjunctive and the conditional forms up all
 *     the time.") so the regex can't run away across an entire long line —
 *     a gap beyond this bound is accepted as an intentional cutoff, not a
 *     residual gap: the pattern is over-inclusive by design (see below), so
 *     a false negative here just falls back to the tier-1 line or no-write)
 *   - keep(s) mixing
 *   - struggle (verb/noun)
 *   - mistake(n) / mistaking
 *   - error(s)
 *   - wrong(ly) / incorrect(ly)
 *   - fail(s|ed|ing)
 *   - weak(ness|nesses)
 *   - trouble
 *   - difficulty/difficulties
 *   - forget(s|ting)/forgot
 * This list is intentionally broad (over-inclusive is safe — a false reject
 * just falls back to the tier-1 line or no-write; under-inclusive is not,
 * since it would let a psychological claim reach the learner verbatim).
 */
const BLAME_FAMILY_PATTERN =
  /\b(confus(e|ed|es|ing|ion)|misconception(s)?|mix(ed|es|ing)?\s*up|mix(-|\s)?up(s)?|mix(?:es|ed|ing)?\b(?:(?!\bup\b).){0,80}?\bup\b|keep(s)?\s*mixing|struggl(e|es|ed|ing)|mistak(e|es|en|ing)|error(s)?|wrong(ly)?|incorrect(ly)?|fail(s|ed|ing)?|weak(ness|nesses)?|trouble|difficult(y|ies)|forg(et|ets|etting|ot))\b/i;

/**
 * Deterministic backstop against a second-person psychological claim about
 * the learner (§2.3's explicit anti-pattern: "You might be confusing X and
 * Y" / "You keep mixing up…"). Rejects (`false`) any line combining a
 * second-person pronoun with a {@link BLAME_FAMILY_PATTERN} match — case
 * insensitive. A line that clears this bar is still not guaranteed good
 * copy, but it filters the specific forbidden pattern deterministically as
 * a backstop behind the LLM's own instructions.
 *
 * Asymmetric by design: the preferred material-framed shape ("This kind of
 * question is often mixed up with {neighbor}. Let's compare them.") contains
 * "mixed up" but NO second-person pronoun, so it still passes. Only the
 * (second-person + blame-family) combination is rejected.
 */
export function isDepersonalised(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > MAX_MISCONCEPTION_LINE_CHARS) return false;

  const hasSecondPerson = /\byou(?:'re|r|'ve|'ll)?\b/i.test(trimmed);
  if (!hasSecondPerson) return true;

  return !BLAME_FAMILY_PATTERN.test(trimmed);
}

/** Build the forced tool definition for the OpenRouter/GLM dispatch path (the
 *  Gemini branch uses a JSON instruction instead). Kept as a function (not a
 *  module-level const) so the description can reference the concept label directly. */
function buildMisconceptionTagTool(conceptLabel: string): ToolDef {
  return {
    name: 'tag_misconception',
    description: [
      `Write ONE short, de-personalised, material-framed sentence about a common`,
      `confusion learners have around the concept "${conceptLabel}", grounded in`,
      'the wrong-answer examples and/or confusable neighbor option given below.',
      '',
      'STRICT VOICE RULES:',
      '- Frame it about the QUESTION TYPE or MATERIAL, never about the learner.',
      '- NEVER use second-person psychological claims like "you might be',
      '  confusing X and Y" or "you keep mixing up X and Y".',
      '- PREFERRED shape: "This kind of question is often mixed up with',
      '  {neighbor}. Let\'s compare them."',
      '- One sentence. Terse. No filler, no hedging beyond the preferred shape.',
    ].join('\n'),
    input_schema: {
      type: 'object' as const,
      properties: {
        misconceptionLine: {
          type: 'string',
          description:
            'One de-personalised, material-framed sentence, <=240 characters, no second-person blame.',
        },
      },
      required: ['misconceptionLine'],
    },
  };
}

/** Gemini has no forced-tool mechanism — describe the exact output shape in
 *  the prompt itself, mirroring `concept-backfill.ts`'s Gemini branch. */
function buildGeminiJsonInstruction(): string {
  return [
    'Respond with ONLY a single JSON object (no markdown fences, no prose), matching exactly:',
    '{',
    '  "misconceptionLine": string // one de-personalised, material-framed sentence, <=240 chars, no second-person blame',
    '}',
  ].join('\n');
}

/**
 * Build the shared system prompt describing the concept, the tier-1
 * confusable neighbor (if any), and the bounded set of real wrong-answer
 * examples (§2.3 "always paired with the actual wrong answers it's based
 * on"). Exported so the shape is independently testable; also used to
 * degrade gracefully to label/description-only grounding (§5.6) when no
 * wrong-answer evidence exists.
 */
export function buildMisconceptionPrompt(input: {
  conceptLabel: string;
  conceptDescription: string | null;
  neighborOptionText: string | null;
  wrongExamples: WrongAnswerExample[];
}): string {
  const lines: string[] = [`Concept: "${input.conceptLabel}"`];
  if (input.conceptDescription) {
    lines.push(`Description: ${input.conceptDescription}`);
  }
  if (input.neighborOptionText) {
    lines.push(`Tier-1 signal: learners frequently pick "${input.neighborOptionText}" in error.`);
  }
  if (input.wrongExamples.length > 0) {
    lines.push('Recent wrong answers on this concept:');
    input.wrongExamples.forEach((ex, i) => {
      const selected = ex.selectedOptionText ?? '(non-MC answer)';
      const correct = ex.correctOptionText ?? '(unknown)';
      lines.push(`${i + 1}. Q: ${ex.questionText}\n   Learner picked: ${selected}\n   Correct: ${correct}`);
    });
  } else {
    lines.push(
      'No individual wrong-answer examples are available — generate from the concept label/description alone (weaker grounding).'
    );
  }
  return lines.join('\n');
}

/**
 * Dispatch the tag call to whichever provider `resolveModel` picked.
 * Mirrors `concept-backfill.ts`'s `classifySlot` provider switch.
 */
async function callMisconceptionTag(
  system: string,
  conceptLabel: string
): Promise<MisconceptionTagToolInput> {
  const resolved = resolveModel('weakness-misconception-tag');
  const tool = buildMisconceptionTagTool(conceptLabel);

  if (resolved.provider === 'openrouter') {
    return forcedStructuredCallOpenRouter<MisconceptionTagToolInput>({
      system,
      tool,
      model: resolved.model,
    });
  }

  const systemInstruction = [system, buildGeminiJsonInstruction()].join('\n\n');
  const result = await forcedStructuredCallGemini<Partial<MisconceptionTagToolInput>>({
    systemInstruction,
    model: resolved.model,
  });
  return { misconceptionLine: result.misconceptionLine ?? '' };
}

// ─── DB grounding-evidence loader ──────────────────────────────────────

/**
 * Load a small bounded set of the concept's recent WRONG `QuizAnswer` rows,
 * joined to their `QuizQuestion` (question text + the learner's selected
 * option text + the correct option text), scoped to `mc` questions (the only
 * kind with option text to report). Bounded to
 * {@link MAX_WRONG_EXAMPLES} rows within the last
 * {@link WRONG_EXAMPLE_LOOKBACK_DAYS} days, most recent first.
 */
async function loadWrongAnswerExamples(conceptId: string): Promise<WrongAnswerExample[]> {
  const tags = await db.conceptTag.findMany({
    where: { conceptId, itemType: 'quiz_question' },
    select: { itemId: true },
  });
  if (tags.length === 0) return [];

  const questionIds = tags.map((t) => t.itemId);
  const questions = await db.quizQuestion.findMany({
    where: { id: { in: questionIds }, kind: 'mc' },
    select: { id: true, question: true, options: true, correctIndex: true },
  });
  if (questions.length === 0) return [];

  const questionById = new Map(questions.map((q) => [q.id, q]));
  const lookbackDate = new Date(Date.now() - WRONG_EXAMPLE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const wrongAnswers = await db.quizAnswer.findMany({
    where: {
      questionId: { in: questions.map((q) => q.id) },
      isCorrect: false,
      createdAt: { gte: lookbackDate },
    },
    select: { questionId: true, selectedIdx: true },
    orderBy: { createdAt: 'desc' },
    take: MAX_WRONG_EXAMPLES,
  });

  const examples: WrongAnswerExample[] = [];
  for (const answer of wrongAnswers) {
    const question = questionById.get(answer.questionId);
    if (!question) continue;
    examples.push({
      questionText: question.question,
      selectedOptionText: question.options[answer.selectedIdx] ?? null,
      correctOptionText: question.options[question.correctIndex] ?? null,
    });
  }
  return examples;
}

// ─── handler ────────────────────────────────────────────────────────────

/**
 * Handler for the `concept.misconception` background job (Phase 3, §2.3
 * tier 2). See file header for the full gate order. Never throws.
 */
export async function runMisconceptionTag(conceptId: string, userId: string): Promise<void> {
  try {
    if (!weaknessConceptsEnabled()) return;

    const mastery = await db.conceptMastery.findUnique({
      where: { userId_conceptId: { userId, conceptId } },
      include: { concept: true },
    });
    if (!mastery) return;

    const now = new Date();

    // 7-day cooldown (§2.3) — no LLM call even if the concept oscillated
    // across the weak-band boundary within the window.
    if (isWithinMisconceptionCooldown(mastery.misconceptionAt, now)) return;

    // Hysteresis re-check (§2.3) — the async job may run well after the
    // triggering transition; only proceed if the concept is STILL weak.
    const inputs: MasteryInputs = {
      weightedCorrect: mastery.weightedCorrect,
      weightedTotal: mastery.weightedTotal,
      attemptCount: mastery.attemptCount,
      lastAttemptAt: mastery.lastAttemptAt,
      lastCorrectAt: mastery.lastCorrectAt,
      peakLcb: mastery.peakLcb,
    };
    const band = classifyBand(inputs, now);
    if (band !== 'weak') return;

    // Gather grounding evidence: tier-1 dominant-distractor neighbor (if
    // any) + a bounded set of the concept's real recent wrong answers.
    const [tier1, wrongExamples] = await Promise.all([
      deriveConceptMisconception(conceptId),
      loadWrongAnswerExamples(conceptId),
    ]);

    // §5.6 no-corpus fallback: still generate from label/description alone
    // when there is no grounding evidence at all — never hard-fail.
    const system = buildMisconceptionPrompt({
      conceptLabel: mastery.concept.label,
      conceptDescription: mastery.concept.description,
      neighborOptionText: tier1?.neighborOptionText ?? null,
      wrongExamples,
    });

    let result: MisconceptionTagToolInput;
    try {
      result = await callMisconceptionTag(system, mastery.concept.label);
    } catch (error) {
      console.error('[concept-misconception-tag] LLM call failed', {
        conceptId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    // Deterministic de-personalised guard (§2.3) — a backstop behind the
    // LLM's own instructions. A failing/oversized/empty line falls back to
    // the tier-1 line if one exists; otherwise nothing is persisted.
    const candidate = (result.misconceptionLine ?? '').trim();
    const finalLine = isDepersonalised(candidate) ? candidate : (tier1?.line ?? null);
    if (!finalLine) return;

    await db.conceptMastery.update({
      where: { userId_conceptId: { userId, conceptId } },
      data: { misconceptionLabel: finalLine, misconceptionAt: now },
    });
  } catch (error) {
    console.error('[concept-misconception-tag] failed', {
      conceptId,
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
