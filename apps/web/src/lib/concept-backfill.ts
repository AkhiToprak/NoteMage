/**
 * Weakness Training Phase 1A — slot-scoped backfill job handler (§3.3).
 *
 * `runConceptBackfill(slotId)` is the handler for the `concept.backfill`
 * background job, enqueued by `concept-tracking.ts` whenever a graded
 * `QuizQuestion` is found with zero `ConceptTag` rows. It is best-effort,
 * idempotent, and bounded by construction (plan §3.3):
 *
 *   1. Flag guard — no-op if `WEAKNESS_TRAINING_CONCEPTS` is off, so a
 *      stale-queued job after the flag flips off does nothing.
 *   2. Resolve the slot's content: `CheckpointSlot` -> `CheckpointActivity`
 *      -> `QuizSet.questions` / `FlashcardSet.flashcards` (the same relation
 *      chain the Phase 0 spike used, `scripts/weakness-phase0-signal-spike.ts`).
 *   3. Idempotency guard — no-op only when BOTH the slot already has `Concept`
 *      rows AND every one of its items already has a `ConceptTag` row. A
 *      partial prior run (e.g. concepts persisted but tagging didn't finish)
 *      is intentionally NOT short-circuited — it is safe and cheap to redo.
 *   4. One forced-tool classify call (cheap tier, `concept-backfill-classify`)
 *      mirroring the validated spike prompt: `conceptCandidates` for the slot,
 *      then `conceptKeys` per item drawn only from that closed list.
 *   5. Persist via the shared `concept-write.ts` helpers (closed-enum drop is
 *      automatic in `attachConceptTags`).
 *   6. Bounded event backfill for the slot's QUIZ questions only (flashcards
 *      carry no graded performance signal today) — latest 50 `QuizAnswer`
 *      rows per question AND not older than 90 days (the smaller of the two
 *      bounds), recorded via `recordConceptAttempt` (replay-safe via the
 *      `@@unique([sourceAttemptId, conceptId, itemId])` guard).
 *
 * Never throws out of the handler in a way that would crash the worker —
 * every step is wrapped and failures are logged with `slotId` for follow-up.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db';
import { weaknessConceptsEnabled } from '@/lib/feature-flags';
import { resolveModel } from '@/lib/model-routing';
import { persistSlotConcepts, attachConceptTags, recordConceptAttempt } from '@/lib/concept-write';
import { forcedStructuredCallAnthropic } from '@/lib/path-generator-anthropic';
import { forcedStructuredCallGemini } from '@/lib/path-generator-gemini';
import { forcedStructuredCallOpenRouter } from '@/lib/path-generator-openrouter';

const MAX_ANSWERS_PER_QUESTION = 50;
const MAX_ANSWER_AGE_DAYS = 90;
const MAX_CONCEPT_KEYS_PER_ITEM = 2;

// ─── classify call shape (mirrors scripts/weakness-phase0-signal-spike.ts) ──

interface BackfillClassifyToolInput {
  conceptCandidates: string[];
  items: { itemId: string; conceptKeys: string[] }[];
}

interface ClassifyItem {
  itemId: string;
  itemType: 'quiz_question' | 'flashcard';
  text: string;
}

function buildClassifyTool(slotTitle: string): Anthropic.Messages.Tool {
  return {
    name: 'classify_slot_concepts',
    description: [
      `Given one checkpoint slot titled "${slotTitle}" and the quiz/flashcard items it already`,
      'contains, do two things in one call:',
      '1. Propose 2-4 short, SPECIFIC sub-skill concept labels that are FINER-GRAINED than the',
      '   slot title itself (e.g. slot "Regular -ar verbs" -> ["present-tense -ar stem",',
      '   "-ar personal endings", "irregular stem changes in -ar verbs"], not just the slot',
      '   title restated). These become `conceptCandidates`, a CLOSED list.',
      '2. Tag EVERY given item with 1-2 `conceptKeys`, each copied VERBATIM from',
      '   `conceptCandidates` — never invent a label outside that list.',
    ].join('\n'),
    input_schema: {
      type: 'object' as const,
      properties: {
        conceptCandidates: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          maxItems: 4,
          description: '2-4 short concept labels, each finer-grained than the slot title.',
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              itemId: { type: 'string', description: 'The itemId copied verbatim from the input list.' },
              conceptKeys: {
                type: 'array',
                items: { type: 'string' },
                minItems: 1,
                maxItems: MAX_CONCEPT_KEYS_PER_ITEM,
                description: '1-2 keys, each one of the conceptCandidates strings.',
              },
            },
            required: ['itemId', 'conceptKeys'],
          },
        },
      },
      required: ['conceptCandidates', 'items'],
    },
  };
}

/** Gemini has no forced-tool mechanism (only JSON mode) — describe the exact
 *  output shape in the prompt itself, mirroring GEMINI_JSON_PREAMBLE's role
 *  in the path-generation Gemini branch. */
function buildGeminiJsonInstruction(conceptCandidatesHint: string): string {
  return [
    'Respond with ONLY a single JSON object (no markdown fences, no prose), matching exactly:',
    '{',
    `  "conceptCandidates": string[], // 2-4 short labels, finer-grained than the slot title (${conceptCandidatesHint})`,
    '  "items": [ { "itemId": string, "conceptKeys": string[] } ] // 1-2 keys per item, each copied verbatim from conceptCandidates',
    '}',
  ].join('\n');
}

/**
 * Dispatch the classify call to whichever provider `resolveModel` picked.
 * Mirrors the provider switch in `path-generator-routing.ts`'s
 * `forcedStructuredCall`, but stays independent of that module's
 * corpus/prompt-cache machinery — this call is a single small slot-scoped
 * prompt, not a path-generation stage.
 */
async function classifySlot(
  system: string,
  tool: Anthropic.Messages.Tool
): Promise<BackfillClassifyToolInput> {
  const resolved = resolveModel('concept-backfill-classify');

  if (resolved.provider === 'anthropic') {
    return forcedStructuredCallAnthropic<BackfillClassifyToolInput>({
      system,
      tool,
      model: resolved.model,
    });
  }

  if (resolved.provider === 'openrouter') {
    return forcedStructuredCallOpenRouter<BackfillClassifyToolInput>({
      system,
      tool,
      model: resolved.model,
    });
  }

  const systemInstruction = [
    system,
    buildGeminiJsonInstruction('e.g. "present-tense -ar stem", not just the slot title restated'),
  ].join('\n\n');
  const result = await forcedStructuredCallGemini<Partial<BackfillClassifyToolInput>>({
    systemInstruction,
    model: resolved.model,
  });
  return {
    conceptCandidates: result.conceptCandidates ?? [],
    items: result.items ?? [],
  };
}

// ─── handler ────────────────────────────────────────────────────────────

export async function runConceptBackfill(slotId: string): Promise<void> {
  try {
    if (!weaknessConceptsEnabled()) return;

    const slot = await db.checkpointSlot.findUnique({
      where: { id: slotId },
      select: {
        id: true,
        title: true,
        objective: true,
        phase: { select: { planId: true } },
        activities: {
          select: {
            kind: true,
            quizSet: {
              select: {
                questions: {
                  select: { id: true, question: true, kind: true, options: true },
                },
              },
            },
            flashcardSet: {
              select: {
                flashcards: { select: { id: true, question: true } },
              },
            },
          },
        },
      },
    });

    if (!slot) {
      console.error('[concept-backfill] slot not found', { slotId });
      return;
    }

    const planId = slot.phase.planId;

    const quizQuestions = slot.activities.flatMap((a) => a.quizSet?.questions ?? []);
    const flashcards = slot.activities.flatMap((a) => a.flashcardSet?.flashcards ?? []);

    if (quizQuestions.length === 0 && flashcards.length === 0) {
      return; // nothing to classify yet
    }

    const allItems: ClassifyItem[] = [
      ...quizQuestions.map((q) => ({ itemId: q.id, itemType: 'quiz_question' as const, text: q.question })),
      ...flashcards.map((c) => ({ itemId: c.id, itemType: 'flashcard' as const, text: c.question })),
    ];

    // ── idempotency guard (§3.3 step 3): only skip when the slot already has
    // Concept rows AND every item already has at least one ConceptTag. ──
    const [existingConceptCount, existingTags] = await Promise.all([
      db.concept.count({ where: { slotId } }),
      db.conceptTag.findMany({
        where: {
          OR: [
            { itemType: 'quiz_question', itemId: { in: quizQuestions.map((q) => q.id) } },
            { itemType: 'flashcard', itemId: { in: flashcards.map((c) => c.id) } },
          ],
        },
        select: { itemId: true },
      }),
    ]);

    const taggedItemIds = new Set(existingTags.map((t) => t.itemId));
    const allItemsTagged = allItems.every((it) => taggedItemIds.has(it.itemId));

    if (existingConceptCount > 0 && allItemsTagged) {
      // Fully classified already — still worth a bounded event backfill pass
      // in case prior runs predate this step, but skip the (costly) classify
      // call itself. Fall through to step 6 using the existing tags.
      await backfillEvents(quizQuestions, await loadConceptTagsByQuestion(quizQuestions.map((q) => q.id)));
      return;
    }

    // ── classify (§3.3 step 4) ──
    const slotTitle = slot.title;
    const objective = slot.objective ? `\nObjective: ${slot.objective}` : '';
    const system = [
      `Slot title: "${slotTitle}"${objective}`,
      'Items already in this slot:',
      ...allItems.map((it, i) => `${i + 1}. itemId="${it.itemId}" [${it.itemType}] ${it.text}`),
    ].join('\n');

    const tool = buildClassifyTool(slotTitle);
    const result = await classifySlot(system, tool);

    const conceptCandidates = (result.conceptCandidates ?? []).map((c) => c.trim()).filter(Boolean);
    if (conceptCandidates.length < 2) {
      console.error('[concept-backfill] fewer than 2 concept candidates returned, skipping', {
        slotId,
        conceptCandidates,
      });
      return;
    }

    const conceptIdByKey = await persistSlotConcepts(planId, slotId, conceptCandidates);

    const itemConceptKeys = new Map<string, string[]>();
    for (const entry of result.items ?? []) {
      if (!entry?.itemId) continue;
      itemConceptKeys.set(entry.itemId, entry.conceptKeys ?? []);
    }

    for (const item of allItems) {
      const conceptKeys = itemConceptKeys.get(item.itemId);
      if (!conceptKeys || conceptKeys.length === 0) continue;
      await attachConceptTags(item.itemType, item.itemId, conceptKeys, conceptIdByKey);
    }

    // ── bounded event backfill (§3.3 step 4, quiz questions only) ──
    const tagsByQuestion = await loadConceptTagsByQuestion(quizQuestions.map((q) => q.id));
    await backfillEvents(quizQuestions, tagsByQuestion);
  } catch (error) {
    console.error('[concept-backfill] failed', {
      slotId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ─── helpers ────────────────────────────────────────────────────────────

type SlotQuizQuestion = { id: string; question: string; kind: string; options: string[] };

async function loadConceptTagsByQuestion(
  questionIds: string[]
): Promise<Map<string, { conceptId: string; weight: number }[]>> {
  if (questionIds.length === 0) return new Map();
  const tags = await db.conceptTag.findMany({
    where: { itemType: 'quiz_question', itemId: { in: questionIds } },
    select: { itemId: true, conceptId: true, weight: true },
  });
  const byQuestion = new Map<string, { conceptId: string; weight: number }[]>();
  for (const tag of tags) {
    const list = byQuestion.get(tag.itemId);
    if (list) list.push({ conceptId: tag.conceptId, weight: tag.weight });
    else byQuestion.set(tag.itemId, [{ conceptId: tag.conceptId, weight: tag.weight }]);
  }
  return byQuestion;
}

/**
 * Bounded backfill of `ConceptAttemptEvent` rows for this slot's quiz
 * questions only (flashcards carry no graded performance signal today).
 * Bounded per question by BOTH: the latest `MAX_ANSWERS_PER_QUESTION` (50)
 * `QuizAnswer` rows AND not older than `MAX_ANSWER_AGE_DAYS` (90) — i.e. the
 * smaller of the two sets, never unlimited history (§3.3 step 4).
 */
async function backfillEvents(
  quizQuestions: SlotQuizQuestion[],
  tagsByQuestion: Map<string, { conceptId: string; weight: number }[]>
): Promise<void> {
  if (quizQuestions.length === 0) return;

  const cutoff = new Date(Date.now() - MAX_ANSWER_AGE_DAYS * 24 * 60 * 60 * 1000);

  for (const question of quizQuestions) {
    const tags = tagsByQuestion.get(question.id);
    if (!tags || tags.length === 0) continue; // no concept tags — nothing to attribute events to

    const answers = await db.quizAnswer.findMany({
      where: { questionId: question.id, createdAt: { gte: cutoff } },
      orderBy: { createdAt: 'desc' },
      take: MAX_ANSWERS_PER_QUESTION,
      select: {
        id: true,
        isCorrect: true,
        createdAt: true,
        attempt: { select: { id: true, userId: true } },
      },
    });

    const numOptions = question.kind === 'mc' ? question.options.length : undefined;

    for (const answer of answers) {
      for (const tag of tags) {
        try {
          await recordConceptAttempt({
            conceptId: tag.conceptId,
            userId: answer.attempt.userId,
            itemType: 'quiz_question',
            itemId: question.id,
            sourceAttemptId: answer.attempt.id,
            questionKind: question.kind,
            isCorrect: answer.isCorrect,
            usedHint: false,
            attemptNumber: 1,
            tagWeight: tag.weight,
            numOptions,
            eventAt: answer.createdAt,
          });
        } catch (error) {
          console.error('[concept-backfill] failed to record attempt event', {
            questionId: question.id,
            answerId: answer.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }
}
