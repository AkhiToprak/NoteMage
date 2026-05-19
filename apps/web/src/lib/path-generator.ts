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
//     errors; activities that still fail mark the plan `failed` with a
//     learner-facing `generationError` summary, and the `regenerate`
//     endpoint re-runs generation to retry them.
//
// Slot-kind → activity mapping (the orchestrator picks this):
//   learning   → theory + flashcards + quiz
//   review     → flashcards + quiz
//   assessment → quiz   (becomes the section checkpoint)

import type Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import { anthropic, AI_GENERATION_MODEL, MAX_OUTPUT_TOKENS } from './anthropic';
import {
  PATH_STRUCTURE_TOOL,
  THEORY_SECTION_TOOL,
  FLASHCARDS_FOR_SLOT_TOOL,
  QUIZ_FOR_SLOT_TOOL,
  type PathStructureToolInput,
  type TheorySectionToolInput,
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
import {
  QuizSetV2Schema,
  TheorySectionSchema,
  type QuestionKind,
  type TheorySection,
} from '@notemage/shared';
import { buildLegacyColumns } from './quiz-grading';
import { db } from './db';
import { logTelemetry } from './telemetry-server';
import {
  normalizeFlashcardsInput,
  normalizePathStructure,
  normalizeQuizQuestions,
  normalizeTheoryInput,
  type NormalizedFlashcardsInput,
} from './path-generator-normalize';
import {
  allowedKindsForSubjects,
  coerceSubjectIds,
  type SubjectId,
} from './path-subjects';
import { expectedActivityKinds } from './path-slot-activities';

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
  /** Subject buckets from the classifier (sorted by weight). */
  subjects: SubjectId[];
  /** Per-subject weights aligned with `subjects`. */
  subjectWeights: number[];
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

/** Trim a Zod error message so it stays readable inside a retry prompt. */
function truncateError(message: string): string {
  return message.length > 600 ? `${message.slice(0, 600)}…` : message;
}

/** How many times Stage B re-attempts one activity's AI call before giving
 *  up. Each retry feeds a corrective notice back into the prompt. */
const MAX_ACTIVITY_ATTEMPTS = 3;

/** Short, safe preview of a raw AI tool output, for failure diagnostics. */
function previewToolOutput(raw: unknown): string {
  try {
    const json = JSON.stringify(raw);
    return json.length > 600 ? `${json.slice(0, 600)}…` : json;
  } catch {
    return `[unserializable ${typeof raw}]`;
  }
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
  /** Override the default generation model. */
  model?: string;
}): Promise<T> {
  const {
    system,
    tool,
    userMessage = 'Generate now.',
    maxAttempts = 2,
    model = AI_GENERATION_MODEL,
  } = opts;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        messages: [{ role: 'user', content: userMessage }],
        tools: [tool],
        tool_choice: { type: 'tool', name: tool.name },
      });
      if (response.stop_reason === 'max_tokens') {
        throw new Error(`${tool.name} response was truncated (stop_reason: max_tokens)`);
      }
      const block = findToolUse(response.content, tool.name);
      if (!block) {
        throw new Error(
          `AI did not call ${tool.name} (stop_reason: ${response.stop_reason ?? 'unknown'})`,
        );
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

function inlineMathNode(latex: string): TipTapNode {
  return { type: 'inlineMath', attrs: { latex } };
}

function blockMathNode(latex: string): TipTapNode {
  return { type: 'blockMath', attrs: { latex } };
}

// Match `$...$` runs that don't contain `$` or newlines. Block math
// (`$$...$$`) is handled before this is applied.
const INLINE_MATH_RE = /\$([^$\n]+?)\$/g;

function inlineContentFromText(text: string): (TipTapNode | TipTapTextNode)[] {
  const out: (TipTapNode | TipTapTextNode)[] = [];
  let lastIndex = 0;
  INLINE_MATH_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_MATH_RE.exec(text)) !== null) {
    const start = match.index;
    if (start > lastIndex) {
      out.push({ type: 'text', text: text.slice(lastIndex, start) });
    }
    out.push(inlineMathNode(match[1].trim()));
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) {
    out.push({ type: 'text', text: text.slice(lastIndex) });
  }
  return out.length > 0 ? out : [{ type: 'text', text }];
}

function paragraph(text: string): TipTapNode {
  return {
    type: 'paragraph',
    content: inlineContentFromText(text),
  };
}

function heading(level: 2 | 3 | 4, text: string): TipTapNode {
  return {
    type: 'heading',
    attrs: { level },
    content: inlineContentFromText(text),
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

// Split a text blob into TipTap block-level nodes. Splits on blank lines.
// A chunk that is entirely a `$$...$$` block becomes a standalone
// blockMath node; everything else becomes a paragraph (possibly with
// inlineMath nodes inside).
function splitParagraphs(text: string): TipTapNode[] {
  return text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => {
      const blockMatch = /^\$\$([\s\S]+?)\$\$$/.exec(p);
      if (blockMatch) {
        return blockMathNode(blockMatch[1].trim());
      }
      return paragraph(p);
    });
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
    subjects: opts.subjects,
    subjectWeights: opts.subjectWeights,
  };
  const system = buildPathStructurePrompt(ctx);

  // The model occasionally returns a phase with no `slots` (or drifted
  // phases/slots). normalizePathStructure coerces the output and drops
  // unusable phases; retry up to MAX_ACTIVITY_ATTEMPTS when nothing
  // usable comes back, feeding the problem back as a corrective notice.
  let structure: GeneratedPathStructure | null = null;
  let lastDetail = '';
  for (let attempt = 1; attempt <= MAX_ACTIVITY_ATTEMPTS && !structure; attempt++) {
    const attemptSystem =
      attempt === 1
        ? system
        : [
            system,
            '',
            '--- RETRY NOTICE ---',
            `Your previous structure was unusable: ${lastDetail}`,
            'Return 3–6 sections; every section MUST have a non-empty `slots` array of 4–6 slots.',
          ].join('\n');
    try {
      const raw = await forcedToolCall<unknown>({
        system: attemptSystem,
        tool: PATH_STRUCTURE_TOOL,
        userMessage: `Design the path "${opts.title}" for a learner with ${opts.targetDays} days. Use the tool now.`,
      });
      const normalized = normalizePathStructure(raw);
      if (normalized.phases.length > 0) {
        structure = normalized;
      } else {
        lastDetail = `no usable sections; raw output: ${previewToolOutput(raw)}`;
        logTelemetry(opts.userId, 'path.structure.retry', {
          attempt,
          reason: 'no_phases',
          preview: previewToolOutput(raw),
        });
      }
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : String(error);
      logTelemetry(opts.userId, 'path.structure.retry', {
        attempt,
        reason: 'call_failed',
      });
    }
  }
  if (!structure) {
    throw new Error(`Path structure generation failed: ${lastDetail}`);
  }

  // Enforce the "last slot of every section is assessment" rule that the
  // tool schema only describes in prose. normalizePathStructure guarantees
  // every section has at least one slot, so the index access is safe.
  for (const phase of structure.phases) {
    const last = phase.slots[phase.slots.length - 1];
    if (last.kind !== 'assessment') {
      last.kind = 'assessment';
    }
  }
  return structure;
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
  subjects: SubjectId[];
  subjectWeights: number[];
  phases: PhaseForGeneration[];
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
  const subjects = coerceSubjectIds(plan.subjects);
  const subjectWeights = Array.isArray(plan.subjectWeights)
    ? plan.subjectWeights
        .map((w) => (typeof w === 'number' && Number.isFinite(w) ? w : 0))
        .slice(0, subjects.length)
    : [];
  // Pad weights if shorter than subjects.
  while (subjectWeights.length < subjects.length) {
    subjectWeights.push(1 / Math.max(1, subjects.length));
  }
  // Legacy rows without subjects fall back to `general`.
  const resolvedSubjects: SubjectId[] = subjects.length > 0 ? subjects : ['general'];
  const resolvedWeights: number[] =
    subjects.length > 0 ? subjectWeights : [1];
  return {
    id: plan.id,
    userId: plan.userId,
    primaryNotebookId: plan.notebookId,
    title: plan.title,
    description: plan.description ?? '',
    subjects: resolvedSubjects,
    subjectWeights: resolvedWeights,
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

function makeSlotContentContext(
  plan: PlanForGeneration,
  phase: PhaseForGeneration,
  slot: SlotForGeneration,
): SlotContentContext {
  // `review` and `assessment` slots take the other slot titles in their
  // phase as the "review of" pool. `learning` slots stand on their own.
  // `final_exam` is the capstone — it pulls from every learning/review
  // slot across the whole plan so the AI writes a comprehensive exam.
  let reviewOf: string[] | undefined;
  if (slot.kind === 'final_exam') {
    const allTitles: string[] = [];
    for (const p of plan.phases) {
      for (const s of p.slots) {
        if (s.kind === 'learning' || s.kind === 'review') {
          allTitles.push(s.title);
        }
      }
    }
    reviewOf = allTitles.length > 0 ? allTitles : undefined;
  } else if (slot.kind !== 'learning' && slot.phaseSiblingTitles.length > 0) {
    reviewOf = slot.phaseSiblingTitles;
  }
  return {
    pathTitle: plan.title,
    pathDescription: plan.description,
    phaseTitle: phase.title,
    phaseDescription: phase.description,
    slotTitle: slot.title,
    slotKind: slot.kind,
    slotTopicHint: slot.topicHint,
    reviewOf,
    subjects: plan.subjects,
    subjectWeights: plan.subjectWeights,
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

  // Retry on validation failure or missing examples. examples are optional
  // in the schema, so an example-less section is accepted once the retries
  // are spent — a thin section beats a blocked checkpoint.
  let input: TheorySection | null = null;
  let exampleLess: TheorySection | null = null;
  let lastError = '';
  for (let attempt = 1; attempt <= MAX_ACTIVITY_ATTEMPTS && !input; attempt++) {
    const attemptSystem =
      attempt === 1
        ? system
        : [
            system,
            '',
            '--- RETRY NOTICE ---',
            lastError,
            '`examples` MUST be a non-empty JSON array of { label, explanation } objects. Regenerate the full section.',
          ].join('\n');
    try {
      const raw = await forcedToolCall<unknown>({
        system: attemptSystem,
        tool: THEORY_SECTION_TOOL,
        userMessage: `Write the theory section for slot "${slot.title}".`,
      });
      const parsed = TheorySectionSchema.safeParse(normalizeTheoryInput(raw));
      if (parsed.success && parsed.data.examples.length > 0) {
        input = parsed.data;
      } else if (parsed.success) {
        exampleLess = parsed.data;
        lastError = 'Your previous theory section had an empty `examples` array.';
        logTelemetry(plan.userId, 'path.theory.retry', {
          planId: plan.id,
          slotId: slot.id,
          attempt,
          reason: 'no_examples',
        });
      } else {
        lastError = `Your previous theory section failed validation: ${truncateError(
          parsed.error.message,
        )}`;
        logTelemetry(plan.userId, 'path.theory.retry', {
          planId: plan.id,
          slotId: slot.id,
          attempt,
          reason: 'validation_failed',
        });
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      logTelemetry(plan.userId, 'path.theory.retry', {
        planId: plan.id,
        slotId: slot.id,
        attempt,
        reason: 'call_failed',
      });
    }
  }

  // Accept an example-less section rather than failing the checkpoint.
  const resolved = input ?? exampleLess;
  if (!resolved) {
    throw new Error(`Theory generation failed: ${lastError}`);
  }

  const body = theoryInputToTipTap(resolved);
  await db.$transaction(async (tx) => {
    const theory = await tx.theoryContent.create({
      data: {
        title: resolved.title,
        body: body as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.checkpointActivity.create({
      data: {
        slotId: slot.id,
        kind: 'theory',
        title: resolved.title,
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

  // The model intermittently returns an empty / unusable `flashcards` array
  // under the forced-tool call. Retry up to MAX_ACTIVITY_ATTEMPTS with a
  // corrective notice; the raw output is logged so a persistent failure is
  // diagnosable from telemetry.
  let resolved: NormalizedFlashcardsInput | null = null;
  let lastDetail = '';
  for (let attempt = 1; attempt <= MAX_ACTIVITY_ATTEMPTS && !resolved; attempt++) {
    const attemptSystem =
      attempt === 1
        ? system
        : [
            system,
            '',
            '--- RETRY NOTICE ---',
            'Your previous response had an empty or unusable `flashcards` array.',
            '`flashcards` MUST be a non-empty JSON array of { question, answer } objects (8–12 cards).',
          ].join('\n');
    try {
      const raw = await forcedToolCall<unknown>({
        system: attemptSystem,
        tool: FLASHCARDS_FOR_SLOT_TOOL,
        userMessage: `Generate 8–12 flashcards for slot "${slot.title}". The flashcards array must not be empty.`,
      });
      const normalized = normalizeFlashcardsInput(raw);
      if (normalized.flashcards.length > 0) {
        resolved = normalized;
      } else {
        lastDetail = `empty set; raw output: ${previewToolOutput(raw)}`;
        logTelemetry(plan.userId, 'path.flashcards.retry', {
          planId: plan.id,
          slotId: slot.id,
          attempt,
          reason: 'empty_set',
          preview: previewToolOutput(raw),
        });
      }
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : String(error);
      logTelemetry(plan.userId, 'path.flashcards.retry', {
        planId: plan.id,
        slotId: slot.id,
        attempt,
        reason: 'call_failed',
      });
    }
  }
  if (!resolved) {
    throw new Error(`Flashcards generation returned no usable cards (${lastDetail})`);
  }
  const input = resolved;

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

async function callQuizTool(
  system: string,
  slotTitle: string,
): Promise<QuizForSlotToolInput> {
  return forcedToolCall<QuizForSlotToolInput>({
    system,
    tool: QUIZ_FOR_SLOT_TOOL,
    userMessage: `Generate the quiz for slot "${slotTitle}". The questions array must not be empty.`,
  });
}

type ValidatedQuizSet = ReturnType<typeof QuizSetV2Schema.parse>;

type QuizParseResult =
  | { ok: true; data: ValidatedQuizSet }
  | { ok: false; error: string };

function parseQuizInput(
  raw: QuizForSlotToolInput,
  fallbackTitle: string,
): QuizParseResult {
  const normalizedQuestions = normalizeQuizQuestions(raw.questions);
  const parsed = QuizSetV2Schema.safeParse({
    title: raw.title || fallbackTitle,
    questions: normalizedQuestions,
  });
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, error: parsed.error.message };
}

async function generateQuizActivity(
  plan: PlanForGeneration,
  phase: PhaseForGeneration,
  slot: SlotForGeneration,
  nextSortOrder: number,
): Promise<void> {
  const ctx = makeSlotContentContext(plan, phase, slot);
  const system = buildQuizPrompt(ctx);

  // Validate the v2 shape — the tool schema accepts a generic payload
  // object, so we Zod-check it (after normalizing common drift shapes)
  // before persisting. Retry up to MAX_ACTIVITY_ATTEMPTS, feeding the
  // failure reason back as a corrective notice each time.
  let parseResult: ValidatedQuizSet | null = null;
  let lastError = '';
  for (let attempt = 1; attempt <= MAX_ACTIVITY_ATTEMPTS && !parseResult; attempt++) {
    const attemptSystem =
      attempt === 1
        ? system
        : [
            system,
            '',
            '--- RETRY NOTICE ---',
            `Your previous quiz was unusable: ${lastError}`,
            'Regenerate the entire quiz. The `questions` array MUST be non-empty and every question must match the exact payload shape for its kind.',
          ].join('\n');
    try {
      const raw = await callQuizTool(attemptSystem, slot.title);
      const result = parseQuizInput(raw, slot.title);
      if (result.ok) {
        parseResult = result.data;
      } else {
        lastError = truncateError(result.error);
        logTelemetry(plan.userId, 'path.quiz.retry', {
          planId: plan.id,
          slotId: slot.id,
          attempt,
          reason: 'validation_failed',
          preview: previewToolOutput(raw),
        });
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      logTelemetry(plan.userId, 'path.quiz.retry', {
        planId: plan.id,
        slotId: slot.id,
        attempt,
        reason: 'call_failed',
      });
    }
  }
  if (!parseResult) {
    throw new Error(`Quiz generation failed: ${lastError}`);
  }
  let parsed: ValidatedQuizSet = parseResult;

  const allowedKinds = allowedKindsForSubjects(plan.subjects);
  const allowedSet = new Set<QuestionKind>(allowedKinds);
  const beforeFilter = parsed.questions.length;
  let questions = parsed.questions.filter((q) => allowedSet.has(q.kind));
  const droppedFirst = beforeFilter - questions.length;
  if (droppedFirst > 0) {
    logTelemetry(plan.userId, 'path.quiz.dropped_kind', {
      planId: plan.id,
      slotId: slot.id,
      attempt: 1,
      dropped: droppedFirst,
      allowed: allowedKinds,
      subjects: plan.subjects,
    });
  }

  const minCount = slot.kind === 'final_exam' ? 8 : 3;
  if (questions.length < minCount) {
    logTelemetry(plan.userId, 'path.quiz.retry', {
      planId: plan.id,
      slotId: slot.id,
      reason: 'kind_filter_under_min',
      survivors: questions.length,
      minCount,
    });
    const corrective = [
      system,
      '',
      '--- RETRY NOTICE ---',
      'Your previous response included questions whose `kind` is outside the allowed list for this subject. Regenerate the entire quiz.',
      `Allowed kinds (use ONLY these): ${allowedKinds.join(', ')}.`,
      'Drop any kind not on this list.',
    ].join('\n');
    try {
      const retryInput = await callQuizTool(corrective, slot.title);
      const retryResult = parseQuizInput(retryInput, slot.title);
      if (retryResult.ok) {
        const retryParsed = retryResult.data;
        const retryFiltered = retryParsed.questions.filter((q) => allowedSet.has(q.kind));
        const droppedRetry = retryParsed.questions.length - retryFiltered.length;
        if (droppedRetry > 0) {
          logTelemetry(plan.userId, 'path.quiz.dropped_kind', {
            planId: plan.id,
            slotId: slot.id,
            attempt: 2,
            dropped: droppedRetry,
            allowed: allowedKinds,
            subjects: plan.subjects,
          });
        }
        if (retryFiltered.length > questions.length) {
          questions = retryFiltered;
          parsed = retryParsed;
        }
      }
    } catch (error) {
      console.error('[path-generator] quiz retry failed', error);
    }
  }

  if (questions.length === 0) {
    throw new Error(
      `Quiz produced no questions whose kind is allowed for subjects [${plan.subjects.join(', ')}]`,
    );
  }

  const finalQuestions = questions;
  const finalTitle = parsed.title;

  await db.$transaction(async (tx) => {
    const quizSet = await tx.quizSet.create({
      data: {
        userId: plan.userId,
        notebookId: plan.primaryNotebookId,
        title: finalTitle,
        questions: {
          create: finalQuestions.map((q, i) => {
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
        title: finalTitle,
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

  const failedSlotIds: string[] = [];
  let completedSlots = 0;

  for (const phase of plan.phases) {
    for (const slot of phase.slots) {
      // Idempotency: skip activity kinds the slot already has. This lets
      // `POST /api/learn/paths/[planId]/regenerate` call generatePath again
      // to retry only the activities that previously failed.
      const wantedKinds = expectedActivityKinds(slot.kind);
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
          failedSlotIds.push(slot.id);
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

  // Stage B always finishes `ready`: incomplete checkpoints never block the
  // path (path-gating treats them as passable) and surface their own
  // Regenerate affordance. `failed` is reserved for catastrophic failure.
  await db.studyPlan.update({
    where: { id: planId },
    data: { generationStatus: 'ready', generationError: null },
  });
  logTelemetry(plan.userId, 'path.generation.completed', {
    planId,
    totalSlots: total,
    failedActivities: failedSlotIds.length,
    failedSlots: new Set(failedSlotIds).size,
  });
}
