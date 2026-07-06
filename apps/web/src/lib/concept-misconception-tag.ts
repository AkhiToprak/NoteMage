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
import { enqueueJob } from '@/lib/background-jobs';
import { logAiUsage } from '@/lib/ai-usage';

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

/** Max eligible concepts tagged in ONE batch call (M2a). More than this and
 *  the handler re-enqueues itself (immediate runAt) to drain the remainder,
 *  keeping each LLM call's grounding block bounded. */
export const MISCONCEPTION_BATCH_LIMIT = 20;

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

// ─── Batch handler (Phase 5 / audit M2a) ────────────────────────────────
//
// Replaces the per-concept fan-out: ONE debounced job per user, ONE forced-tool
// LLM call for up to MISCONCEPTION_BATCH_LIMIT eligible concepts, ONE logAiUsage
// per batch. The per-concept gates (weak-band, 7-day cooldown, hysteresis
// re-check, de-personalisation guard) are the SAME ones runMisconceptionTag
// applies — MOVED into a shared eligibility query + the shared isDepersonalised
// guard, not rewritten.

/** Index-addressed forced-tool output (mirrors concept-backfill.ts's `items`
 *  shape): the model addresses each concept by its 1-based number in the
 *  numbered grounding list, so it never echoes CUIDs. */
export interface MisconceptionBatchToolInput {
  lines: { index: number; line: string }[];
}

/** One eligible concept with its grounding, positioned by 1-based `index`. */
interface EligibleConcept {
  conceptId: string;
  label: string;
  description: string | null;
  neighborOptionText: string | null;
  wrongExamples: WrongAnswerExample[];
  /** Tier-1 line to fall back to when the LLM line fails the guard. */
  tier1Line: string | null;
}

/**
 * Load the user's misconception-eligible concepts, applying the SAME gates the
 * single handler applies, at run time (§2.3): a `status: 'weak'` denormalised
 * pre-filter (the `@@index([userId, status])`), a 7-day cooldown filter
 * (`misconceptionAt` null OR expired), then the authoritative in-JS
 * `classifyBand` re-check (the denormalised `status` MUST be re-decayed on read
 * — same hysteresis re-check the single path does). Returns at most `limit`
 * concepts (most-stale first) plus whether MORE remained past the cap.
 */
async function loadEligibleConcepts(
  userId: string,
  now: Date,
  limit: number,
): Promise<{ eligible: EligibleConcept[]; hasMore: boolean }> {
  const cooldownCutoff = new Date(now.getTime() - MISCONCEPTION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

  // Pre-filter in SQL: weak (denormalised cache) + cooldown-expired. Ordered
  // most-stale first so a re-enqueue drains oldest concepts first. Over-fetch a
  // little headroom so hysteresis drops don't starve a full batch — but keep it
  // bounded (limit*3) so a user with thousands of weak rows can't blow memory.
  const rows = await db.conceptMastery.findMany({
    where: {
      userId,
      status: 'weak',
      OR: [{ misconceptionAt: null }, { misconceptionAt: { lt: cooldownCutoff } }],
    },
    include: { concept: true },
    orderBy: [{ misconceptionAt: { sort: 'asc', nulls: 'first' } }, { updatedAt: 'asc' }],
    take: limit * 3,
  });

  const eligible: EligibleConcept[] = [];
  let considered = 0;

  for (const mastery of rows) {
    // Authoritative hysteresis re-check — the denormalised `status` is a coarse
    // cache; re-decay before spending a token (§2.1.1 / §2.3).
    const inputs: MasteryInputs = {
      weightedCorrect: mastery.weightedCorrect,
      weightedTotal: mastery.weightedTotal,
      attemptCount: mastery.attemptCount,
      lastAttemptAt: mastery.lastAttemptAt,
      lastCorrectAt: mastery.lastCorrectAt,
      peakLcb: mastery.peakLcb,
    };
    if (classifyBand(inputs, now) !== 'weak') continue;
    // Cooldown re-check in JS too (defensive — SQL already filtered, but the
    // exact boundary semantics live in isWithinMisconceptionCooldown).
    if (isWithinMisconceptionCooldown(mastery.misconceptionAt, now)) continue;

    considered += 1;
    if (eligible.length >= limit) {
      // One more genuinely-eligible concept exists beyond the cap → re-enqueue.
      return { eligible, hasMore: true };
    }

    const [tier1, wrongExamples] = await Promise.all([
      deriveConceptMisconception(mastery.conceptId),
      loadWrongAnswerExamples(mastery.conceptId),
    ]);

    eligible.push({
      conceptId: mastery.conceptId,
      label: mastery.concept.label,
      description: mastery.concept.description,
      neighborOptionText: tier1?.neighborOptionText ?? null,
      wrongExamples,
      tier1Line: tier1?.line ?? null,
    });
  }

  void considered;
  return { eligible, hasMore: false };
}

/** Build the index-addressed forced tool for the batch call. The tool returns
 *  one line per concept, each addressed by its 1-based `index`. */
function buildMisconceptionBatchTool(): ToolDef {
  return {
    name: 'tag_misconceptions',
    description: [
      'For EACH numbered concept below, write ONE short, de-personalised,',
      'material-framed sentence about a common confusion learners have around it,',
      'grounded in the wrong-answer examples and/or confusable neighbor given for',
      'that concept. Address each concept by its `index` — the 1-based number',
      'shown before it in the list.',
      '',
      'STRICT VOICE RULES (per concept):',
      '- Frame it about the QUESTION TYPE or MATERIAL, never about the learner.',
      '- NEVER use second-person psychological claims like "you might be',
      '  confusing X and Y" or "you keep mixing up X and Y".',
      '- PREFERRED shape: "This kind of question is often mixed up with',
      '  {neighbor}. Let\'s compare them."',
      '- One sentence each. Terse. No filler.',
    ].join('\n'),
    input_schema: {
      type: 'object' as const,
      properties: {
        lines: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              index: {
                type: 'integer',
                description: 'The 1-based number of the concept from the numbered list.',
              },
              line: {
                type: 'string',
                description:
                  'One de-personalised, material-framed sentence, <=240 characters, no second-person blame.',
              },
            },
            required: ['index', 'line'],
          },
        },
      },
      required: ['lines'],
    },
  };
}

/** Gemini JSON-mode instruction for the batch shape (Gemini has no forced tool). */
function buildGeminiBatchJsonInstruction(): string {
  return [
    'Respond with ONLY a single JSON object (no markdown fences, no prose), matching exactly:',
    '{',
    '  "lines": [ { "index": number, "line": string } ] // index = the 1-based concept number; one de-personalised, material-framed sentence <=240 chars each, no second-person blame',
    '}',
  ].join('\n');
}

/** Build the ONE numbered grounding block for the whole batch. */
function buildBatchPrompt(eligible: EligibleConcept[]): string {
  const blocks = eligible.map((c, i) => {
    const per = buildMisconceptionPrompt({
      conceptLabel: c.label,
      conceptDescription: c.description,
      neighborOptionText: c.neighborOptionText,
      wrongExamples: c.wrongExamples,
    });
    return `### Concept ${i + 1}\n${per}`;
  });
  return [
    'Tag a common misconception for EACH of the following concepts.',
    'Return one entry per concept, addressed by its 1-based number.',
    '',
    ...blocks,
  ].join('\n\n');
}

/** Dispatch the batch call to whichever provider `resolveModel` picked, wiring
 *  `onUsage` so the caller can emit ONE aggregated logAiUsage. */
async function callMisconceptionBatch(
  system: string,
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number },
): Promise<{ lines: { index: number; line: string }[]; provider: 'gemini' | 'openrouter'; model: string }> {
  const resolved = resolveModel('weakness-misconception-tag');
  const tool = buildMisconceptionBatchTool();

  if (resolved.provider === 'openrouter') {
    const result = await forcedStructuredCallOpenRouter<MisconceptionBatchToolInput>({
      system,
      tool,
      model: resolved.model,
      onUsage: (u) => {
        usage.inputTokens += u.inputTokens;
        usage.outputTokens += u.outputTokens;
        usage.cacheReadTokens += u.cachedTokens;
      },
    });
    return { lines: result.lines ?? [], provider: 'openrouter', model: resolved.model };
  }

  const systemInstruction = [system, buildGeminiBatchJsonInstruction()].join('\n\n');
  const result = await forcedStructuredCallGemini<Partial<MisconceptionBatchToolInput>>({
    systemInstruction,
    model: resolved.model,
    onUsage: (u) => {
      usage.inputTokens += u.promptTokens;
      usage.outputTokens += u.candidatesTokens;
      usage.cacheReadTokens += u.cachedTokens;
    },
  });
  return { lines: result.lines ?? [], provider: 'gemini', model: resolved.model };
}

/**
 * Handler for `concept.misconception.batch` (Phase 5 / audit M2a). One
 * debounced job per user tags up to MISCONCEPTION_BATCH_LIMIT eligible concepts
 * in ONE LLM call, persists each de-personalised line through the SAME guard +
 * cooldown stamp the single path uses, meters ONE logAiUsage, and re-enqueues
 * itself (immediate) if more eligible concepts remain. Never throws.
 */
export async function runMisconceptionTagBatch(userId: string): Promise<void> {
  try {
    if (!weaknessConceptsEnabled()) return;

    const now = new Date();
    const { eligible, hasMore } = await loadEligibleConcepts(userId, now, MISCONCEPTION_BATCH_LIMIT);
    if (eligible.length === 0) return;

    const system = buildBatchPrompt(eligible);

    const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    let lines: { index: number; line: string }[];
    let provider: 'gemini' | 'openrouter';
    let model: string;
    try {
      ({ lines, provider, model } = await callMisconceptionBatch(system, usage));
    } catch (error) {
      console.error('[concept-misconception-tag] batch LLM call failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    // ONE aggregated ledger entry for the whole batch (M2a meter).
    if (usage.inputTokens + usage.outputTokens > 0) {
      logAiUsage({
        userId,
        feature: 'weakness-misconception-tag',
        provider,
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
      });
    }

    // Map each returned line back to its concept by 1-based index (mirrors
    // concept-backfill.ts: Number.isInteger + range guard, out-of-range dropped).
    const lineByIndex = new Map<number, string>();
    for (const entry of lines) {
      const idx = entry?.index;
      if (!Number.isInteger(idx) || typeof idx !== 'number' || idx < 1 || idx > eligible.length) {
        console.error('[concept-misconception-tag] batch returned out-of-range index, skipping', {
          userId,
          index: idx,
          conceptCount: eligible.length,
        });
        continue;
      }
      lineByIndex.set(idx, (entry.line ?? '').trim());
    }

    // Persist each through the SAME de-personalisation guard + cooldown stamp
    // the single path uses. A failing/empty line falls back to that concept's
    // tier-1 line if one exists; otherwise nothing is persisted for it.
    for (let i = 0; i < eligible.length; i++) {
      const concept = eligible[i];
      const candidate = lineByIndex.get(i + 1) ?? '';
      const finalLine = isDepersonalised(candidate) ? candidate : concept.tier1Line;
      if (!finalLine) continue;
      try {
        await db.conceptMastery.update({
          where: { userId_conceptId: { userId, conceptId: concept.conceptId } },
          data: { misconceptionLabel: finalLine, misconceptionAt: now },
        });
      } catch (error) {
        console.error('[concept-misconception-tag] batch persist failed', {
          userId,
          conceptId: concept.conceptId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Drain the remainder in a follow-up run (same dedupeKey pattern, immediate).
    if (hasMore) {
      await enqueueJob(
        'concept.misconception.batch',
        { userId },
        { dedupeKey: `concept.misconception.batch:${userId}`, runAt: new Date() },
      ).catch((error) => {
        console.error('[concept-misconception-tag] batch re-enqueue failed', {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  } catch (error) {
    console.error('[concept-misconception-tag] batch failed', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
