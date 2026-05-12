// Phase 10.2 — Duolingo-style path generation orchestrator.
//
// Two-stage pipeline:
//
//   Stage A — `generatePathStructure(opts)`
//     One AI call returns the curriculum spine (sections + slots). Pure
//     function: NO database writes. Phase 10.3's `POST /api/learn/paths`
//     persists the plan + empty slots transactionally and then kicks off
//     Stage B as a fire-and-forget.
//
//   Stage B — `generatePath(planId)`
//     Reads the persisted plan, walks every slot sequentially, fires
//     theory + flashcards + quiz AI calls in parallel per slot, persists
//     each result, and updates `StudyPlan.generationProgress` after every
//     slot. Per-activity retries (2 attempts) absorb transient Anthropic
//     errors; activities that still fail are collected and surface in
//     `generationError`. Phase 10.6 will read the failed list for the
//     `regenerate` endpoint.
//
// Slot-kind → activity mapping (the orchestrator picks this):
//   learning   → theory + flashcards + quiz
//   review     → flashcards + quiz
//   assessment → quiz   (becomes the section checkpoint)

import type Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import { anthropic, AI_MODEL, MAX_OUTPUT_TOKENS } from './anthropic';
import {
  PATH_STRUCTURE_TOOL,
  THEORY_SECTION_TOOL,
  FLASHCARDS_FOR_SLOT_TOOL,
  QUIZ_FOR_SLOT_TOOL,
  type PathStructureToolInput,
  type TheorySectionToolInput,
  type FlashcardsForSlotToolInput,
  type QuizForSlotToolInput,
  type PathSlotKind,
} from './ai-tools';
import {
  buildPathStructurePrompt,
  buildTheoryPrompt,
  buildFlashcardsPrompt,
  buildQuizPrompt,
  type PathStructureContext,
  type SlotContentContext,
} from './path-prompts';
import { QuizSetV2Schema, TheorySectionSchema } from '@notemage/shared';
import { buildLegacyColumns } from './quiz-grading';
import { db } from './db';
import { logTelemetry } from './telemetry-server';
import { normalizeQuizQuestions, normalizeTheoryInput } from './path-generator-normalize';

// ─────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────

export interface GeneratePathStructureOpts {
  userId: string;
  /** User-provided path title — the AI may refine it. */
  title: string;
  /** Optional brief from the user (intent, focus, …). */
  brief?: string;
  /** Days the learner expects the path to span. Shapes phase count. */
  targetDays: number;
  /**
   * Optional inventory string passed verbatim into the structure prompt.
   * Phase 10.3 builds this from the request's `materialIds`. Empty/missing
   * lets the AI design from the title + brief alone.
   */
  materialInventory?: string;
}

export type GeneratedPathStructure = PathStructureToolInput;

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

type ToolUseBlock = Extract<Anthropic.Messages.ContentBlock, { type: 'tool_use' }>;

function findToolUse(
  content: Anthropic.Messages.ContentBlock[],
  name: string,
): ToolUseBlock | null {
  for (const block of content) {
    if (block.type === 'tool_use' && block.name === name) {
      return block;
    }
  }
  return null;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call Anthropic with `tool_choice` forced to a single tool. Retries up
 * to `maxAttempts` times with exponential backoff (1s, 2s, …) on any
 * thrown error. Returns the parsed tool input or throws after exhausting
 * retries.
 */
async function forcedToolCall<T>(opts: {
  system: string;
  tool: Anthropic.Messages.Tool;
  /** Optional extra user message body. Defaults to "Generate now." */
  userMessage?: string;
  maxAttempts?: number;
}): Promise<T> {
  const { system, tool, userMessage = 'Generate now.', maxAttempts = 2 } = opts;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: AI_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        messages: [{ role: 'user', content: userMessage }],
        tools: [tool],
        tool_choice: { type: 'tool', name: tool.name },
      });
      const block = findToolUse(response.content, tool.name);
      if (!block) {
        throw new Error(`AI did not call ${tool.name}`);
      }
      return block.input as T;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const delay = 1000 * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`forcedToolCall(${tool.name}) failed after ${maxAttempts} attempts`);
}

// ─────────────────────────────────────────────────────────────────────
// TipTap conversion — Stage B theory → TheoryContent.body
// ─────────────────────────────────────────────────────────────────────

interface TipTapTextNode {
  type: 'text';
  text: string;
}

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: (TipTapNode | TipTapTextNode)[];
}

interface TipTapDoc {
  type: 'doc';
  content: TipTapNode[];
}

function paragraph(text: string): TipTapNode {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text }],
  };
}

function heading(level: 2 | 3 | 4, text: string): TipTapNode {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text }],
  };
}

function bulletList(items: string[]): TipTapNode {
  return {
    type: 'bulletList',
    content: items.map((item) => ({
      type: 'listItem',
      content: [paragraph(item)],
    })),
  };
}

function splitParagraphs(text: string): TipTapNode[] {
  return text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map(paragraph);
}

/**
 * Convert the Stage B `create_theory_section` tool output into a TipTap
 * document JSON. The drawer in Phase 10.6 will render this with a
 * read-only TipTap viewer that reuses PageEditor's extension set.
 */
export function theoryInputToTipTap(input: TheorySectionToolInput): TipTapDoc {
  const content: TipTapNode[] = [];
  content.push(heading(2, input.title));
  content.push(...splitParagraphs(input.introduction));
  if (input.keyPoints.length > 0) {
    content.push(heading(3, 'Key points'));
    content.push(bulletList(input.keyPoints));
  }
  if (input.examples.length > 0) {
    content.push(heading(3, 'Examples'));
    for (const ex of input.examples) {
      content.push(heading(4, ex.label));
      content.push(...splitParagraphs(ex.explanation));
    }
  }
  if (input.summary && input.summary.trim().length > 0) {
    content.push(heading(3, 'Summary'));
    content.push(...splitParagraphs(input.summary));
  }
  return { type: 'doc', content };
}

// ─────────────────────────────────────────────────────────────────────
// Stage A — structure
// ─────────────────────────────────────────────────────────────────────

/**
 * Stage A: one AI call returns the path skeleton. The result is parsed
 * but NOT persisted — the caller (Phase 10.3 `POST /api/learn/paths`)
 * owns the transactional plan + phases + empty slots write.
 */
export async function generatePathStructure(
  opts: GeneratePathStructureOpts,
): Promise<GeneratedPathStructure> {
  const ctx: PathStructureContext = {
    title: opts.title,
    brief: opts.brief,
    targetDays: opts.targetDays,
    materialInventory: opts.materialInventory,
  };
  const system = buildPathStructurePrompt(ctx);
  const result = await forcedToolCall<PathStructureToolInput>({
    system,
    tool: PATH_STRUCTURE_TOOL,
    userMessage: `Design the path "${opts.title}" for a learner with ${opts.targetDays} days. Use the tool now.`,
  });

  // Enforce the "last slot of every section is assessment" rule that the
  // tool schema only describes in prose. If the AI slipped a non-assessment
  // slot at the end, coerce it. The orchestrator depends on this rule when
  // mapping slot kind → activities.
  for (const phase of result.phases) {
    if (phase.slots.length === 0) continue;
    const last = phase.slots[phase.slots.length - 1];
    if (last.kind !== 'assessment') {
      last.kind = 'assessment';
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────
// Stage B — per-slot orchestration
// ─────────────────────────────────────────────────────────────────────

interface SlotForGeneration {
  id: string;
  title: string;
  kind: PathSlotKind;
  topicHint: string;
  sortOrder: number;
  /** Other slot titles in the same phase, used as `reviewOf` for review/assessment kinds. */
  phaseSiblingTitles: string[];
  /**
   * Phase 10.3 — set of activity kinds the slot already has in DB. The
   * orchestrator skips these so `generatePath` is safe to re-run as the
   * retry path for `POST /api/learn/paths/[planId]/regenerate`.
   */
  existingActivityKinds: Set<'theory' | 'flashcards' | 'quiz'>;
}

interface PhaseForGeneration {
  title: string;
  description: string;
  slots: SlotForGeneration[];
}

interface PlanForGeneration {
  id: string;
  userId: string;
  primaryNotebookId: string | null;
  title: string;
  description: string;
  phases: PhaseForGeneration[];
}

interface ActivityFailure {
  slotId: string;
  slotTitle: string;
  activityKind: 'theory' | 'flashcards' | 'quiz';
  message: string;
}

/**
 * Load a plan into the orchestrator's working shape. Returns null if the
 * plan doesn't exist (caller should treat as a no-op).
 */
async function loadPlanForGeneration(planId: string): Promise<PlanForGeneration | null> {
  const plan = await db.studyPlan.findUnique({
    where: { id: planId },
    include: {
      phases: {
        orderBy: { sortOrder: 'asc' },
        include: {
          slots: {
            orderBy: { sortOrder: 'asc' },
            include: {
              activities: { select: { kind: true } },
            },
          },
        },
      },
    },
  });
  if (!plan) return null;
  return {
    id: plan.id,
    userId: plan.userId,
    primaryNotebookId: plan.notebookId,
    title: plan.title,
    description: plan.description ?? '',
    phases: plan.phases.map((p) => {
      const slotTitles = p.slots.map((s) => s.title);
      return {
        title: p.title,
        description: p.description ?? '',
        slots: p.slots.map((s) => ({
          id: s.id,
          title: s.title,
          kind: (s.kind as PathSlotKind) ?? 'learning',
          topicHint: s.description ?? s.title,
          sortOrder: s.sortOrder,
          phaseSiblingTitles: slotTitles.filter((t) => t !== s.title),
          existingActivityKinds: new Set(
            s.activities
              .map((a) => a.kind)
              .filter(
                (k): k is 'theory' | 'flashcards' | 'quiz' =>
                  k === 'theory' || k === 'flashcards' || k === 'quiz',
              ),
          ),
        })),
      };
    }),
  };
}

function totalSlotCount(plan: PlanForGeneration): number {
  return plan.phases.reduce((n, p) => n + p.slots.length, 0);
}

/** Activities a slot should have, based on its kind. */
function activitiesForSlot(kind: PathSlotKind): Array<'theory' | 'flashcards' | 'quiz'> {
  if (kind === 'learning') return ['theory', 'flashcards', 'quiz'];
  if (kind === 'review') return ['flashcards', 'quiz'];
  return ['quiz']; // assessment
}

function makeSlotContentContext(
  plan: PlanForGeneration,
  phase: PhaseForGeneration,
  slot: SlotForGeneration,
): SlotContentContext {
  // `review` and `assessment` slots take the other slot titles in their
  // phase as the "review of" pool. `learning` slots stand on their own.
  const reviewOf =
    slot.kind === 'learning' || slot.phaseSiblingTitles.length === 0
      ? undefined
      : slot.phaseSiblingTitles;
  return {
    pathTitle: plan.title,
    pathDescription: plan.description,
    phaseTitle: phase.title,
    phaseDescription: phase.description,
    slotTitle: slot.title,
    slotKind: slot.kind,
    slotTopicHint: slot.topicHint,
    reviewOf,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Stage B — per-activity AI calls + persistence
// ─────────────────────────────────────────────────────────────────────

async function generateTheoryActivity(
  plan: PlanForGeneration,
  phase: PhaseForGeneration,
  slot: SlotForGeneration,
  nextSortOrder: number,
): Promise<void> {
  const ctx = makeSlotContentContext(plan, phase, slot);
  const system = buildTheoryPrompt(ctx);
  const rawInput = await forcedToolCall<unknown>({
    system,
    tool: THEORY_SECTION_TOOL,
    userMessage: `Write the theory section for slot "${slot.title}".`,
  });
  const normalized = normalizeTheoryInput(rawInput);
  const parsed = TheorySectionSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new Error(`Theory validation failed: ${parsed.error.message}`);
  }
  const input = parsed.data;
  const body = theoryInputToTipTap(input);

  await db.$transaction(async (tx) => {
    const theory = await tx.theoryContent.create({
      data: {
        title: input.title,
        body: body as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.checkpointActivity.create({
      data: {
        slotId: slot.id,
        kind: 'theory',
        title: input.title,
        sortOrder: nextSortOrder,
        theoryId: theory.id,
      },
    });
  });
}

async function generateFlashcardsActivity(
  plan: PlanForGeneration,
  phase: PhaseForGeneration,
  slot: SlotForGeneration,
  nextSortOrder: number,
): Promise<void> {
  const ctx = makeSlotContentContext(plan, phase, slot);
  const system = buildFlashcardsPrompt(ctx);
  const input = await forcedToolCall<FlashcardsForSlotToolInput>({
    system,
    tool: FLASHCARDS_FOR_SLOT_TOOL,
    userMessage: `Generate the flashcards for slot "${slot.title}".`,
  });
  if (!input.flashcards || input.flashcards.length === 0) {
    throw new Error('Flashcards tool returned an empty set');
  }

  await db.$transaction(async (tx) => {
    const set = await tx.flashcardSet.create({
      data: {
        userId: plan.userId,
        notebookId: plan.primaryNotebookId,
        title: input.title || slot.title,
        source: 'ai',
        flashcards: {
          create: input.flashcards.map((fc, i) => ({
            question: fc.question,
            answer: fc.answer,
            sortOrder: i,
          })),
        },
      },
    });
    await tx.checkpointActivity.create({
      data: {
        slotId: slot.id,
        kind: 'flashcards',
        title: input.title || slot.title,
        sortOrder: nextSortOrder,
        flashcardSetId: set.id,
      },
    });
  });
}

async function generateQuizActivity(
  plan: PlanForGeneration,
  phase: PhaseForGeneration,
  slot: SlotForGeneration,
  nextSortOrder: number,
): Promise<void> {
  const ctx = makeSlotContentContext(plan, phase, slot);
  const system = buildQuizPrompt(ctx);
  const input = await forcedToolCall<QuizForSlotToolInput>({
    system,
    tool: QUIZ_FOR_SLOT_TOOL,
    userMessage: `Generate the quiz for slot "${slot.title}".`,
  });

  // Validate v2 shape — the tool schema accepts a generic payload object,
  // so we Zod-check it the same way chat-stream does before persisting.
  // Normalize first to recover from common drift shapes (options-as-objects,
  // hoisted acceptableAnswers, renamed match_pairs keys, etc.).
  const normalizedQuestions = normalizeQuizQuestions(input.questions);
  const parsed = QuizSetV2Schema.safeParse({
    title: input.title || slot.title,
    questions: normalizedQuestions,
  });
  if (!parsed.success) {
    throw new Error(`Quiz validation failed: ${parsed.error.message}`);
  }

  await db.$transaction(async (tx) => {
    const quizSet = await tx.quizSet.create({
      data: {
        userId: plan.userId,
        notebookId: plan.primaryNotebookId,
        title: parsed.data.title,
        questions: {
          create: parsed.data.questions.map((q, i) => {
            const legacy = buildLegacyColumns(q.kind, q.payload);
            return {
              kind: q.kind,
              payload: q.payload as unknown as Prisma.InputJsonValue,
              question: q.prompt,
              options: legacy.options,
              correctIndex: legacy.correctIndex,
              hint: q.hint ?? null,
              correctExplanation: q.correctExplanation ?? null,
              wrongExplanation: q.wrongExplanation ?? null,
              sortOrder: i,
            };
          }),
        },
      },
    });
    await tx.checkpointActivity.create({
      data: {
        slotId: slot.id,
        kind: 'quiz',
        title: parsed.data.title,
        sortOrder: nextSortOrder,
        quizSetId: quizSet.id,
      },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────
// Stage B — orchestrator
// ─────────────────────────────────────────────────────────────────────

interface ProgressSnapshot {
  totalSlots: number;
  completedSlots: number;
  currentSlot: { id: string; title: string } | null;
  currentActivity: 'theory' | 'flashcards' | 'quiz' | null;
}

async function writeProgress(planId: string, snap: ProgressSnapshot): Promise<void> {
  await db.studyPlan
    .update({
      where: { id: planId },
      data: { generationProgress: snap as unknown as Prisma.InputJsonValue },
    })
    .catch((error) => {
      // Progress writes are best-effort; if they fail the orchestrator
      // should keep going rather than abort the whole generation.
      console.error('[path-generator] progress write failed', error);
    });
}

/**
 * Stage B — generate every slot's activities for a plan that's already
 * been persisted with `generationStatus: "queued"` or `"generating"`.
 * Designed to be called as fire-and-forget from `POST /api/learn/paths`:
 *
 *   void generatePath(plan.id).catch((err) =>
 *     console.error('[path-generator]', err),
 *   );
 *
 * The function never throws — errors are collected per-activity and
 * surfaced via `StudyPlan.generationStatus = "failed"` +
 * `generationError`.
 */
export async function generatePath(planId: string): Promise<void> {
  const plan = await loadPlanForGeneration(planId);
  if (!plan) {
    console.error(`[path-generator] plan ${planId} not found`);
    return;
  }

  const total = totalSlotCount(plan);
  if (total === 0) {
    await db.studyPlan.update({
      where: { id: planId },
      data: {
        generationStatus: 'ready',
        generationProgress: {
          totalSlots: 0,
          completedSlots: 0,
          currentSlot: null,
          currentActivity: null,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    return;
  }

  await db.studyPlan.update({
    where: { id: planId },
    data: {
      generationStatus: 'generating',
      generationError: null,
    },
  });
  logTelemetry(plan.userId, 'path.generation.started', { planId, totalSlots: total });

  const failures: ActivityFailure[] = [];
  let completedSlots = 0;

  for (const phase of plan.phases) {
    for (const slot of phase.slots) {
      // Idempotency: skip activity kinds the slot already has. This lets
      // `POST /api/learn/paths/[planId]/regenerate` call generatePath again
      // to retry only the activities that previously failed.
      const wantedKinds = activitiesForSlot(slot.kind);
      const missingKinds = wantedKinds.filter((k) => !slot.existingActivityKinds.has(k));

      if (missingKinds.length === 0) {
        completedSlots += 1;
        continue;
      }

      await writeProgress(planId, {
        totalSlots: total,
        completedSlots,
        currentSlot: { id: slot.id, title: slot.title },
        currentActivity: missingKinds[0],
      });

      // Continue numbering after any pre-existing activities so the slot's
      // sortOrder stays monotonically increasing across runs.
      const sortOrderBase = slot.existingActivityKinds.size;

      // Per-slot the missing activities are independent — fire them in
      // parallel with allSettled so one failure doesn't take down the
      // others.
      const tasks = missingKinds.map((kind, i) => {
        const sortOrder = sortOrderBase + i;
        if (kind === 'theory') return generateTheoryActivity(plan, phase, slot, sortOrder);
        if (kind === 'flashcards')
          return generateFlashcardsActivity(plan, phase, slot, sortOrder);
        return generateQuizActivity(plan, phase, slot, sortOrder);
      });
      const results = await Promise.allSettled(tasks);
      results.forEach((res, i) => {
        if (res.status === 'rejected') {
          const message =
            res.reason instanceof Error ? res.reason.message : String(res.reason);
          failures.push({
            slotId: slot.id,
            slotTitle: slot.title,
            activityKind: missingKinds[i],
            message,
          });
          logTelemetry(plan.userId, 'path.generation.activity_failed', {
            planId,
            slotId: slot.id,
            activityKind: missingKinds[i],
            message,
          });
        }
      });

      completedSlots += 1;
      await writeProgress(planId, {
        totalSlots: total,
        completedSlots,
        currentSlot: null,
        currentActivity: null,
      });
      logTelemetry(plan.userId, 'path.generation.slot_completed', {
        planId,
        slotId: slot.id,
        slotIndex: completedSlots,
        totalSlots: total,
      });
    }
  }

  if (failures.length > 0) {
    const summary = `${failures.length} activity generation${
      failures.length === 1 ? '' : 's'
    } failed`;
    const detail = failures
      .slice(0, 5)
      .map((f) => `• ${f.slotTitle} (${f.activityKind}): ${f.message}`)
      .join('\n');
    await db.studyPlan.update({
      where: { id: planId },
      data: {
        generationStatus: 'failed',
        generationError: `${summary}\n${detail}`,
      },
    });
    logTelemetry(plan.userId, 'path.generation.failed', {
      planId,
      failures: failures.length,
    });
    return;
  }

  await db.studyPlan.update({
    where: { id: planId },
    data: { generationStatus: 'ready', generationError: null },
  });
  logTelemetry(plan.userId, 'path.generation.completed', { planId, totalSlots: total });
}
