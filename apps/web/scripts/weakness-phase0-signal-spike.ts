/**
 * THROWAWAY Phase 0 validation spike — read-only, not production code, safe to delete after Phase 0.
 *
 * Plan: plans/weakness-training.md §8.A "signal-quality spike".
 *
 * Goal: de-risk the closed-enum concept-tagging design BEFORE any schema/migration work.
 * Two things are checked against REAL production data (read-only Supabase):
 *
 *   1. Concept tagging: for ~10 real CheckpointSlots that already have QuizQuestion/
 *      Flashcard rows, run the planned two-step closed-enum tagging prompt — first emit
 *      2-4 `conceptCandidates` for the slot (mirrors the planned PATH_STRUCTURE_TOOL
 *      `conceptCandidates` addition, §3.1), then tag each item with `conceptKeys` drawn
 *      ONLY from that closed list (mirrors the planned QUIZ_TOOL_V2 / FLASHCARDS_FOR_SLOT_TOOL
 *      `conceptKeys` addition). Printed per-slot so a human can eyeball whether tags are
 *      FINER-GRAINED than the slot title — the GO/NO-GO kill criterion in §8.
 *   2. Re-teach + discriminate-pair generation: for ~10 real wrong QuizAnswer rows, generate
 *      (a) a re-teach explanation that must not be a verbatim copy of the original theory,
 *      and (b) a genuinely confusable discriminate pair (§5.2 session shape).
 *
 * STRICTLY READ-ONLY against the database: only Prisma findMany/findFirst (SELECT).
 * NO create/update/delete/upsert anywhere in this file — the DB is remote PRODUCTION
 * Supabase. This script also makes real LLM calls (spends API budget) — do not run it
 * casually; it is meant to be run ONCE by a human during Phase 0.
 *
 *   npx tsx --env-file=.env.local scripts/weakness-phase0-signal-spike.ts
 *
 * Model routing (per plan §5.1, mapped to the existing exam-* tier precedent since
 * `weakness-*` ModelFeature cases don't exist yet):
 *   - concept tagging (cheap, like `concept-backfill-classify` → `exam-weak-analysis` tier)
 *     uses GLM_HAIKU_MODEL (the 'haiku' slot replacement).
 *   - re-teach/discriminate generation (like `weakness-session-generate` →
 *     `exam-mock-questions` tier → resolvePathStage('quiz', ctx)) uses GLM_SONNET_MODEL
 *     (the 'sonnet' slot replacement).
 * Both go through the real forced-tool wrapper (`forcedStructuredCallOpenRouter`), the
 * same one production path-generation uses, so the spike is faithful to how this would
 * actually run, not a parallel ad-hoc prompt.
 */

import { PrismaClient } from '@prisma/client';
import type Anthropic from '@anthropic-ai/sdk';
import { forcedStructuredCallOpenRouter } from '../src/lib/path-generator-openrouter';
import { GLM_HAIKU_MODEL, GLM_SONNET_MODEL } from '../src/lib/openrouter';

const db = new PrismaClient();

// ── env guard ────────────────────────────────────────────────────────────

function requireEnv(name: string): void {
  if (!process.env[name]) {
    console.error(
      `✗ ${name} is not set.\n` +
        '  Run: npx tsx --env-file=.env.local scripts/weakness-phase0-signal-spike.ts\n' +
        `  or:  ${name}=... npx tsx scripts/weakness-phase0-signal-spike.ts`,
    );
    process.exit(1);
  }
}

// ── tool schemas (mirror the REAL planned shapes, §3.1) ────────────────────
//
// These are NOT the production tools (PATH_STRUCTURE_TOOL / QUIZ_TOOL_V2 still
// lack conceptCandidates/conceptKeys today) — they are the spike's faithful
// adaptation of them: same forced-tool / closed-enum mechanics, scoped down to
// exactly what this spike needs to validate (no figure/source baggage).

interface ConceptCandidatesToolInput {
  conceptCandidates: string[];
}

function buildConceptCandidatesTool(slotTitle: string): Anthropic.Messages.Tool {
  return {
    name: 'emit_concept_candidates',
    description: [
      `Given one checkpoint slot titled "${slotTitle}" and the quiz/flashcard items it already`,
      'contains, propose 2-4 short, SPECIFIC sub-skill concept labels that are FINER-GRAINED',
      'than the slot title itself (e.g. slot "Regular -ar verbs" -> ["present-tense -ar stem",',
      '"-ar personal endings", "irregular stem changes in -ar verbs"], not just the slot title',
      'restated). These become the CLOSED list every item below must be tagged from.',
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
      },
      required: ['conceptCandidates'],
    },
  };
}

interface ConceptTaggingToolInput {
  items: { itemId: string; conceptKeys: string[] }[];
}

function buildConceptTaggingTool(conceptCandidates: string[]): Anthropic.Messages.Tool {
  return {
    name: 'tag_items_with_concepts',
    description: [
      'Tag each given item (quiz question or flashcard) with 1-2 conceptKeys.',
      `Every conceptKey MUST be copied VERBATIM from this closed list — do not invent new`,
      `labels: ${JSON.stringify(conceptCandidates)}`,
      'If an item does not clearly match any candidate, give it your best single match anyway',
      '(the persistence layer would silently drop unmatched keys in production; here just tag).',
    ].join('\n'),
    input_schema: {
      type: 'object' as const,
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              itemId: { type: 'string', description: 'The itemId copied verbatim from the input list.' },
              conceptKeys: {
                type: 'array',
                items: { type: 'string', enum: conceptCandidates },
                minItems: 1,
                maxItems: 2,
                description: '1-2 keys, each one of the closed conceptCandidates strings.',
              },
            },
            required: ['itemId', 'conceptKeys'],
          },
        },
      },
      required: ['items'],
    },
  };
}

interface ReteachDiscriminateToolInput {
  reteach: { explanation: string; workedExample: string };
  discriminate: {
    prompt: string;
    correctOption: string;
    confusedOption: string;
    explanation: string;
  };
}

const RETEACH_DISCRIMINATE_TOOL: Anthropic.Messages.Tool = {
  name: 'emit_reteach_and_discriminate',
  description: [
    'Given a quiz question the learner answered WRONG (with the original explanation text',
    'they already saw), produce two things:',
    '1. `reteach`: a re-explanation of the underlying concept that is NOT a verbatim copy of',
    '   the original explanation — different wording, different angle or example. Include a',
    '   short worked example.',
    '2. `discriminate`: a genuinely confusable pair — a short prompt plus two options that are',
    '   easy to mix up for someone with this exact misconception, marking which one is',
    '   correct, and a one-line explanation of the distinction.',
  ].join('\n'),
  input_schema: {
    type: 'object' as const,
    properties: {
      reteach: {
        type: 'object',
        properties: {
          explanation: { type: 'string', description: 'Re-explanation, NOT a copy of the original.' },
          workedExample: { type: 'string', description: 'A short concrete worked example.' },
        },
        required: ['explanation', 'workedExample'],
      },
      discriminate: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'A short prompt forcing a choice between two confusable options.' },
          correctOption: { type: 'string' },
          confusedOption: { type: 'string', description: 'The genuinely confusable WRONG option.' },
          explanation: { type: 'string', description: 'One line on why they are easy to confuse and how to tell them apart.' },
        },
        required: ['prompt', 'correctOption', 'confusedOption', 'explanation'],
      },
    },
    required: ['reteach', 'discriminate'],
  },
};

// ── part 1: concept tagging over real slots ─────────────────────────────────

interface SlotWithItems {
  slotId: string;
  slotTitle: string;
  planId: string;
  planTitle: string;
  quizItems: { id: string; question: string }[];
  cardItems: { id: string; question: string }[];
}

async function loadSlotsWithItems(limit: number): Promise<SlotWithItems[]> {
  // CheckpointSlot -> CheckpointActivity -> (quizSet.questions | flashcardSet.flashcards).
  // Pull slots from a handful of real StudyPlans, keeping only slots whose
  // activities actually have content rows.
  const plans = await db.studyPlan.findMany({
    where: { generationStatus: 'ready' },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    select: { id: true, title: true },
  });
  console.log(`Found ${plans.length} ready StudyPlans to sample slots from.`);

  const out: SlotWithItems[] = [];
  for (const plan of plans) {
    if (out.length >= limit) break;
    const slots = await db.checkpointSlot.findMany({
      where: { phase: { planId: plan.id } },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        title: true,
        activities: {
          select: {
            kind: true,
            quizSet: { select: { questions: { select: { id: true, question: true }, take: 8 } } },
            flashcardSet: { select: { flashcards: { select: { id: true, question: true }, take: 8 } } },
          },
        },
      },
    });
    for (const slot of slots) {
      if (out.length >= limit) break;
      const quizItems = slot.activities.flatMap((a) => a.quizSet?.questions ?? []);
      const cardItems = slot.activities.flatMap((a) => a.flashcardSet?.flashcards ?? []);
      if (quizItems.length === 0 && cardItems.length === 0) continue;
      out.push({
        slotId: slot.id,
        slotTitle: slot.title,
        planId: plan.id,
        planTitle: plan.title,
        quizItems,
        cardItems,
      });
    }
  }
  return out;
}

async function runConceptTaggingSpike(): Promise<void> {
  console.log('\n══════════════════════ PART 1: concept tagging spike ══════════════════════\n');
  const slots = await loadSlotsWithItems(10);
  console.log(`Sampled ${slots.length} slots with at least one quiz/flashcard item.\n`);

  for (const slot of slots) {
    const allItems = [
      ...slot.quizItems.map((q) => ({ itemId: q.id, kind: 'quiz' as const, text: q.question })),
      ...slot.cardItems.map((c) => ({ itemId: c.id, kind: 'flashcard' as const, text: c.question })),
    ];
    if (allItems.length === 0) continue;

    console.log(`──── slot "${slot.slotTitle}" (plan "${slot.planTitle}", ${allItems.length} items) ────`);

    try {
      // Step 1: emit 2-4 conceptCandidates for the slot (mirrors the planned
      // PATH_STRUCTURE_TOOL conceptCandidates addition, generated alongside
      // topicHint/objective in the same call in production — here a standalone
      // call since this is reading PAST slots, not generating new ones).
      const candidatesSystem = [
        `Slot title: "${slot.slotTitle}"`,
        'Items already in this slot:',
        ...allItems.map((it, i) => `${i + 1}. [${it.kind}] ${it.text}`),
      ].join('\n');
      const candidatesTool = buildConceptCandidatesTool(slot.slotTitle);
      const candidatesResult = await forcedStructuredCallOpenRouter<ConceptCandidatesToolInput>({
        system: candidatesSystem,
        tool: candidatesTool,
        model: GLM_HAIKU_MODEL,
      });
      const conceptCandidates = candidatesResult.conceptCandidates ?? [];
      console.log(`  conceptCandidates: ${JSON.stringify(conceptCandidates)}`);

      if (conceptCandidates.length < 2) {
        console.log('  ✗ fewer than 2 candidates returned — skipping item tagging for this slot.\n');
        continue;
      }

      // Step 2: tag each item with conceptKeys drawn ONLY from that closed list
      // (mirrors the planned QUIZ_TOOL_V2 / FLASHCARDS_FOR_SLOT_TOOL conceptKeys
      // addition — closed-enum so free-text drift is structurally impossible).
      const taggingSystem = [
        `Slot title: "${slot.slotTitle}"`,
        'Tag each of these items with concept(s) from the closed candidate list.',
        'Items:',
        ...allItems.map((it) => `- itemId="${it.itemId}" [${it.kind}]: ${it.text}`),
      ].join('\n');
      const taggingTool = buildConceptTaggingTool(conceptCandidates);
      const taggingResult = await forcedStructuredCallOpenRouter<ConceptTaggingToolInput>({
        system: taggingSystem,
        tool: taggingTool,
        model: GLM_HAIKU_MODEL,
      });

      console.log('  item tags:');
      const tagsByItemId = new Map(taggingResult.items.map((it) => [it.itemId, it.conceptKeys]));
      for (const it of allItems) {
        const keys = tagsByItemId.get(it.itemId);
        const offEnum = (keys ?? []).filter((k) => !conceptCandidates.includes(k));
        const flag = !keys ? ' [UNTAGGED]' : offEnum.length > 0 ? ` [OFF-ENUM: ${JSON.stringify(offEnum)}]` : '';
        console.log(`    [${it.kind}] "${it.text.slice(0, 70)}" -> ${JSON.stringify(keys ?? [])}${flag}`);
      }
    } catch (e) {
      console.error(`  ✗ tagging failed for slot "${slot.slotTitle}":`, e instanceof Error ? e.message : e);
    }
    console.log('');
  }

  console.log(
    'EYEBALL CHECK (kill criterion, §8): do the conceptCandidates / item tags read as FINER-GRAINED\n' +
      'than the slot title for most slots above, or do they just restate the slot title? If tagging\n' +
      'collapses to ~1 concept per slot, that is the NO-GO signal.',
  );
}

// ── part 2: re-teach + discriminate over real wrong answers ────────────────

interface WrongAnswerRow {
  answerId: string;
  questionId: string;
  question: string;
  wrongExplanation: string | null;
  correctExplanation: string | null;
  userAnswer: unknown;
}

async function loadWrongAnswers(limit: number): Promise<WrongAnswerRow[]> {
  const rows = await db.quizAnswer.findMany({
    where: { isCorrect: false },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      userAnswer: true,
      question: {
        select: {
          id: true,
          question: true,
          wrongExplanation: true,
          correctExplanation: true,
        },
      },
    },
  });
  return rows
    .filter((r) => r.question)
    .map((r) => ({
      answerId: r.id,
      questionId: r.question.id,
      question: r.question.question,
      wrongExplanation: r.question.wrongExplanation,
      correctExplanation: r.question.correctExplanation,
      userAnswer: r.userAnswer,
    }));
}

async function runReteachDiscriminateSpike(): Promise<void> {
  console.log('\n══════════════════ PART 2: re-teach + discriminate spike ══════════════════\n');
  const wrongAnswers = await loadWrongAnswers(10);
  console.log(`Sampled ${wrongAnswers.length} real wrong QuizAnswer rows.\n`);

  for (const wa of wrongAnswers) {
    console.log(`──── answer ${wa.answerId} (question "${wa.question.slice(0, 80)}") ────`);
    const originalExplanation = wa.correctExplanation ?? wa.wrongExplanation ?? '(no stored explanation)';

    try {
      const system = [
        `Question: ${wa.question}`,
        `The learner answered this WRONG. Their submitted answer (raw): ${JSON.stringify(wa.userAnswer)}`,
        `The ORIGINAL explanation already shown to them (do NOT copy this verbatim in your re-teach):`,
        originalExplanation,
      ].join('\n');
      const result = await forcedStructuredCallOpenRouter<ReteachDiscriminateToolInput>({
        system,
        tool: RETEACH_DISCRIMINATE_TOOL,
        model: GLM_SONNET_MODEL,
      });

      console.log('  raw JSON:');
      console.log(JSON.stringify(result, null, 2));

      const reteachText = result.reteach?.explanation ?? '';
      const isLikelyCopy =
        originalExplanation !== '(no stored explanation)' &&
        reteachText.trim().length > 0 &&
        reteachText.trim().toLowerCase() === originalExplanation.trim().toLowerCase();
      console.log(`  verbatim-copy check: ${isLikelyCopy ? 'FAIL — identical to original' : 'ok — differs from original'}`);
    } catch (e) {
      console.error(`  ✗ generation failed for answer ${wa.answerId}:`, e instanceof Error ? e.message : e);
    }
    console.log('');
  }

  console.log(
    'EYEBALL CHECK (kill criterion, §8): is the re-teach text a genuine re-explanation (different\n' +
      'wording/angle/example), or does it just restate the original explanation in slightly different\n' +
      'words? Is the discriminate pair a GENUINELY confusable option, or an obviously-wrong distractor?',
  );
}

// ── main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  requireEnv('OPENROUTER_API_KEY');
  requireEnv('DATABASE_URL');

  console.log('THROWAWAY Phase 0 signal-quality spike — read-only DB, real LLM calls.');
  console.log(`Concept tagging model: ${GLM_HAIKU_MODEL}`);
  console.log(`Re-teach/discriminate model: ${GLM_SONNET_MODEL}`);

  await runConceptTaggingSpike();
  await runReteachDiscriminateSpike();

  console.log('\n✓ Spike complete. This script makes ZERO database writes — nothing to roll back.');
}

main()
  .catch((err) => {
    console.error('✗ spike threw:', err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
