// Onboarding-real-generation P2 — anonymous, pre-signup PREVIEW generation.
//
// A capped corpus → `{ structure, slot-1 lesson, exactly 2 questions }` as PLAIN
// JSON, with NO database writes (the plan is not persisted until claim, P4). The
// preview is the make-or-break first impression but only ~3 small calls, so it
// routes through the `path-preview` feature (GLM-5.2, the former Sonnet slot, by
// default, D4) and folds
// every artifact through validate-and-repair (one retry; the caller falls back
// to the static sample on a second miss — D6/D11).
//
// Railings (D6) that let a cheaper model stay reliable here are deliberately
// reusable — `generateWithRepair` is generic so the full Stage-B generators can
// adopt the same validate/repair loop later (out of scope for v1).

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ToolDef } from './ai-tool-types';
import { TheorySectionSchema, type TheorySection } from '@notemage/shared';
import {
  buildTheoryPrompt,
  buildPreviewQuizPrompt,
  type SlotContentContext,
  type PreviewQuizContext,
} from './path-prompts';
import { THEORY_SECTION_TOOL } from './ai-tools';
import { forcedStructuredCall, type NormalizedUsage } from './path-generator-routing';
import { generateWithRepair } from './generate-with-repair';
import { logAiUsage } from './ai-usage';
import { normalizeTheoryInput } from './path-generator-normalize';
import {
  generatePathStructure,
  theoryInputToTipTap,
  theoryPlainText,
  type GeneratedPathStructure,
} from './path-generator';
import type { SubjectId } from './path-subjects';
import { normalizePathLanguage, type PathLanguageCode } from './path-languages';
import {
  PREVIEW_CORPUS_CHARS,
  capAtBoundary,
  type OnboardingSourceKind,
} from './onboarding-preview-constants';
import type { SampleQuestion } from './sample-run';

// ── Railings (tunable; not load-bearing) ───────────────────────────────────
// Corpus cap + boundary truncation live in onboarding-preview-constants.ts (P1),
// shared with the client extractor + the route so the slice can never drift.

/** Raw learning-slot cap for the preview structure, BEFORE `enforceSpacedReviews`
 *  interleaves the review + trailing assessment (final node count ≈ this + 2). */
const PREVIEW_MAX_SLOTS = 3;

/** Feature tag every preview AI call records under, so anonymous-preview spend
 *  rolls up as a single line in the AiUsageEvent table / cost dashboard (P5 cost
 *  accounting). There is no real user, so the rows carry `userId: null`
 *  (AiUsageEvent.userId is nullable, no FK). The IP-scoped *budget* is the
 *  per-IP costRateLimit on the route; this is the spend *record*. */
const PREVIEW_USAGE_FEATURE = 'path-preview';

/** Record one preview model call's tokens + USD cost against the anonymous
 *  feature bucket. Best-effort (logAiUsage never throws). Wired into the lesson
 *  + questions generators' `onUsage`; the structure call routes its usage here
 *  too via generatePathStructure's `usageFeature`. */
function recordPreviewUsage(u: NormalizedUsage): void {
  logAiUsage({
    userId: null,
    feature: PREVIEW_USAGE_FEATURE,
    provider: u.provider,
    model: u.model,
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    cacheReadTokens: u.cacheReadTokens,
    cacheWriteTokens: u.cacheWriteTokens,
    extra: { anon: true },
  });
}

/** Preview skips the classifier (D5 — minimal calls); generic guidance is fine. */
const PREVIEW_SUBJECTS: SubjectId[] = ['general'];
const PREVIEW_SUBJECT_WEIGHTS = [1];

// ── Public shapes ──────────────────────────────────────────────────────────

export interface PreviewMeta {
  /** User-entered path title / topic — the seed for Stage A (may be refined). */
  title: string;
  /** The learner's stated goal / intent (the "Study goals" brief). Steers tone. */
  goal?: string;
  /** Onboarding pacing intensity — recorded, not heavily used in the preview. */
  intensity?: string;
  /** Content language. Defaults to English. */
  language?: PathLanguageCode;
  /** How the material reached us — refines the default question `source` cite. */
  sourceKind?: OnboardingSourceKind;
  /** Citation label stamped on each question's `source` line (e.g. the material
   *  title or "Your notes"). Defaults from `sourceKind` / the title. */
  sourceLabel?: string;
}

export interface PreviewLesson {
  title: string;
  /** TipTap doc for the read-only viewer — the SAME shape the real path uses. */
  body: ReturnType<typeof theoryInputToTipTap>;
  /** Flattened plain text — feeds question generation + lighter screen renders. */
  text: string;
  /** Lead paragraph — the "Short explanation" body on `/start/session` (P3). The
   *  onboarding screen renders this structured slice rather than the TipTap doc so
   *  the bespoke Figma layout (explanation → EXAMPLE → KEY IDEA) stays intact. */
  intro: string;
  /** First worked example, or null when the section produced none. */
  example: { label: string; text: string } | null;
  /** One-line takeaway — the "KEY IDEA" block. */
  keyIdea: string;
}

export interface PreviewResult {
  /** Refined path title from Stage A — the reveal-screen headline. */
  title: string;
  /** Short, preview-bounded skeleton (one section, ~4–5 nodes). */
  structure: GeneratedPathStructure;
  /** Slot-1 theory — the `/start/session` lesson. */
  lesson: PreviewLesson;
  /** EXACTLY 2 questions in the onboarding sample-run shape — `/start/quiz` +
   *  `/start/weak-point` render these with the same machinery as the sample. */
  questions: SampleQuestion[];
}

/** Thrown when a preview artifact can't be produced after the repair retry. The
 *  caller (the P1 endpoint) maps any throw to the sample fallback (D11). */
export class PreviewGenerationError extends Error {
  constructor(
    readonly stage: 'structure' | 'lesson' | 'questions',
    message: string,
  ) {
    super(`preview ${stage} generation failed: ${message}`);
    this.name = 'PreviewGenerationError';
  }
}

// ── Validate-and-repair (D6 — shareable railing) ────────────────────────────
// `generateWithRepair` now lives in ./generate-with-repair (imported at the top)
// so the full Stage-B generators can reuse it without an import cycle. Re-exported
// here so existing imports from this module keep working.
export { generateWithRepair, type RepairResult } from './generate-with-repair';

// ── Preview questions: tool + schema (sample-run shape) ──────────────────────

const PreviewQuestionSchema = z
  .object({
    topic: z.string().min(1),
    prompt: z.string().min(1),
    options: z.array(z.object({ id: z.string().min(1).max(4), text: z.string().min(1) })).min(2).max(4),
    correct: z.string().min(1),
    source: z.string().min(1),
    hint: z.string().min(1),
    okBubble: z.string().min(1),
    okWhy: z.string().min(1),
    noBubble: z.string().min(1),
    noWhy: z.string().min(1),
    weakPoint: z.object({ title: z.string().min(1), desc: z.string().min(1) }).optional(),
  })
  .refine((q) => q.options.some((o) => o.id === q.correct), {
    message: '`correct` must equal one of the option `id`s',
  });

export type PreviewQuestion = z.infer<typeof PreviewQuestionSchema>;

/** Exactly two — restated as a schema so the repair loop catches a wrong count. */
const PreviewQuestionsSchema = z.object({
  questions: z.array(PreviewQuestionSchema).length(2),
});

// Forced tool for the 2-question preview (the codebase's tool shape, formerly
// Anthropic-shaped). Lives here (not ai-tools.ts) because
// it is onboarding-only and its shape is the sample-run shape, not QuizSetV2.
// `tool_choice` forces it, so the dispatcher must send it as its OWN tools array
// (it is NOT one of the four stable path tools) — see `anthropicTools` below.
const PREVIEW_QUESTIONS_TOOL: ToolDef = {
  name: 'create_preview_questions',
  description: [
    'Create EXACTLY two warm-up questions on the lesson the learner just read.',
    'Each is multiple-choice (4 options) or true/false (2 options: "True"/"False").',
    '`correct` is the id of the right option. The SECOND question carries a `weakPoint` diagnostic; the first does not.',
  ].join('\n'),
  input_schema: {
    type: 'object' as const,
    properties: {
      questions: {
        type: 'array',
        minItems: 2,
        maxItems: 2,
        description: 'Exactly two questions testing the lesson.',
        items: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: '1–3 word sub-topic chip (e.g. "Database basics").' },
            prompt: { type: 'string', description: 'The question (for true/false, the statement to judge).' },
            options: {
              type: 'array',
              minItems: 2,
              maxItems: 4,
              description: '4 options for multiple-choice; 2 ("True"/"False") for true/false.',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Short id, e.g. "A","B","C","D".' },
                  text: { type: 'string', description: 'Option label.' },
                },
                required: ['id', 'text'],
              },
            },
            correct: { type: 'string', description: 'The `id` of the correct option.' },
            source: { type: 'string', description: 'Short citation grounding the question in the material.' },
            hint: { type: 'string', description: 'One short nudge that does not give the answer away.' },
            okBubble: { type: 'string', description: 'One warm sentence shown when the learner is right.' },
            okWhy: { type: 'string', description: '1–2 sentences explaining why, with a concrete example.' },
            noBubble: { type: 'string', description: 'One gentle sentence shown when wrong (name the mix-up).' },
            noWhy: { type: 'string', description: '1–2 sentences stating the correct idea plainly.' },
            weakPoint: {
              type: 'object',
              description: 'SECOND question ONLY: the diagnostic shown if missed. Omit on the first.',
              properties: {
                title: { type: 'string', description: 'The sub-skill probed.' },
                desc: { type: 'string', description: 'One sentence: "You understood X, but …".' },
              },
              required: ['title', 'desc'],
            },
          },
          required: ['topic', 'prompt', 'options', 'correct', 'source', 'hint', 'okBubble', 'okWhy', 'noBubble', 'noWhy'],
        },
      },
    },
    required: ['questions'],
  },
};

// ── Per-artifact generators ──────────────────────────────────────────────────

type StructurePhase = GeneratedPathStructure['phases'][number];
type StructureSlot = StructurePhase['slots'][number];

/** First `learning` slot — its theory becomes the preview lesson. */
function firstLearningSlot(
  structure: GeneratedPathStructure,
): { phase: StructurePhase; slot: StructureSlot } | null {
  for (const phase of structure.phases) {
    for (const slot of phase.slots) {
      if (slot.kind === 'learning') return { phase, slot };
    }
  }
  return null;
}

async function generatePreviewStructure(
  corpus: string,
  meta: PreviewMeta,
  sessionId: string,
): Promise<GeneratedPathStructure> {
  try {
    return await generatePathStructure({
      userId: null,
      usageFeature: PREVIEW_USAGE_FEATURE,
      title: meta.title,
      brief: meta.goal,
      corpus: corpus || undefined,
      subjects: PREVIEW_SUBJECTS,
      subjectWeights: PREVIEW_SUBJECT_WEIGHTS,
      language: meta.language ?? 'en',
      previewMaxSlots: PREVIEW_MAX_SLOTS,
      sessionId,
    });
  } catch (error) {
    throw new PreviewGenerationError('structure', error instanceof Error ? error.message : String(error));
  }
}

async function generatePreviewLesson(
  corpus: string,
  meta: PreviewMeta,
  structure: GeneratedPathStructure,
  phase: StructurePhase,
  slot: StructureSlot,
  sessionId: string,
): Promise<PreviewLesson> {
  const language = meta.language ?? 'en';
  const ctx: SlotContentContext = {
    pathTitle: structure.title,
    pathDescription: structure.description,
    phaseTitle: phase.title,
    phaseDescription: phase.description,
    slotTitle: slot.title,
    slotKind: 'learning',
    slotTopicHint: slot.topicHint,
    slotObjective: slot.objective,
    learnerBrief: meta.goal,
    hasSourceMaterials: corpus.length > 0,
    subjects: PREVIEW_SUBJECTS,
    subjectWeights: PREVIEW_SUBJECT_WEIGHTS,
    language,
    // Text-only taster: no DB-backed figures (post-auth concern) and no diagrams
    // (keeps it short + cheap — D5).
    diagramsEnabled: false,
    imageCatalog: null,
  };
  const { system, tail } = buildTheoryPrompt(ctx);
  // Tighten the reusable theory prompt to a taster. The tail is uncached/dynamic,
  // so appending here is cache-safe.
  const previewTail = [
    tail,
    '',
    'PREVIEW MODE: keep this lesson SHORT — 200–350 words total, with EXACTLY ONE worked example. It is a taster, not the full lesson.',
  ].join('\n');

  const outcome = await generateWithRepair<TheorySection>({
    call: (corrective) =>
      forcedStructuredCall<unknown>({
        stage: 'theory',
        featureOverride: 'path-preview',
        corpus: corpus || null,
        staticInstructions: system,
        dynamicInstructions: corrective
          ? [
              previewTail,
              '',
              '--- RETRY NOTICE ---',
              corrective,
              '`examples` MUST be a non-empty array of { label, explanation } objects. Regenerate the whole section.',
            ].join('\n')
          : previewTail,
        anthropicTool: THEORY_SECTION_TOOL,
        userMessage: `Write the preview lesson for "${slot.title}".`,
        sessionId,
        // generateWithRepair owns the retry loop — single-shot per call.
        maxAttempts: 1,
        onUsage: recordPreviewUsage,
      }),
    parse: (raw) => {
      const parsed = TheorySectionSchema.safeParse(normalizeTheoryInput(raw));
      if (parsed.success && parsed.data.examples.length > 0) return { ok: true, data: parsed.data };
      if (parsed.success) return { ok: false, error: 'The theory section had an empty `examples` array.' };
      return { ok: false, error: parsed.error.message };
    },
  });
  if (!outcome.data) {
    throw new PreviewGenerationError('lesson', outcome.lastError ?? 'unknown');
  }
  const section = outcome.data;
  const firstExample = section.examples[0];
  return {
    title: section.title,
    body: theoryInputToTipTap(section, language),
    text: theoryPlainText(section),
    intro: section.introduction,
    example: firstExample ? { label: firstExample.label, text: firstExample.explanation } : null,
    keyIdea: section.summary?.trim() || section.keyPoints[0] || '',
  };
}

async function generatePreviewQuestions(
  corpus: string,
  meta: PreviewMeta,
  structure: GeneratedPathStructure,
  slot: StructureSlot,
  lessonText: string,
  sessionId: string,
): Promise<SampleQuestion[]> {
  const ctx: PreviewQuizContext = {
    pathTitle: structure.title,
    slotTitle: slot.title,
    slotTopicHint: slot.topicHint,
    lessonText,
    sourceLabel: meta.sourceLabel ?? defaultSourceLabel(meta),
    language: meta.language ?? 'en',
  };
  const { system, tail } = buildPreviewQuizPrompt(ctx);

  const outcome = await generateWithRepair<PreviewQuestion[]>({
    call: (corrective) =>
      forcedStructuredCall<unknown>({
        stage: 'quiz',
        featureOverride: 'path-preview',
        corpus: corpus || null,
        staticInstructions: system,
        dynamicInstructions: corrective
          ? [
              tail,
              '',
              '--- RETRY NOTICE ---',
              corrective,
              'Return EXACTLY 2 questions in the exact shape. `correct` MUST equal one option `id`. Only the SECOND question carries `weakPoint`.',
            ].join('\n')
          : tail,
        anthropicTool: PREVIEW_QUESTIONS_TOOL,
        // The preview tool is NOT one of the four stable path tools, so it must be
        // the sole tool in the array or `tool_choice` would 400.
        anthropicTools: [PREVIEW_QUESTIONS_TOOL],
        userMessage: `Write the 2 preview questions for "${slot.title}".`,
        sessionId,
        maxAttempts: 1,
        onUsage: recordPreviewUsage,
      }),
    parse: (raw) => {
      const parsed = PreviewQuestionsSchema.safeParse(raw);
      if (parsed.success) return { ok: true, data: parsed.data.questions };
      return { ok: false, error: parsed.error.message };
    },
  });
  if (!outcome.data) {
    throw new PreviewGenerationError('questions', outcome.lastError ?? 'unknown');
  }
  return toSampleQuestions(outcome.data);
}

/** Adopt the model's questions into the `SampleQuestion` shape: assign stable
 *  ids and pin the `weakPoint` diagnostic to the LAST question only (synthesizing
 *  one if the model forgot it, so the weak-point screen always has content). */
function toSampleQuestions(questions: PreviewQuestion[]): SampleQuestion[] {
  return questions.map((q, i) => {
    const isLast = i === questions.length - 1;
    return {
      id: `q${i + 1}`,
      topic: q.topic,
      prompt: q.prompt,
      options: q.options,
      correct: q.correct,
      source: q.source,
      okBubble: q.okBubble,
      okWhy: q.okWhy,
      noBubble: q.noBubble,
      noWhy: q.noWhy,
      hint: q.hint,
      weakPoint: isLast
        ? q.weakPoint ?? {
            title: q.topic,
            desc: `You worked through ${q.topic}, but it is worth another look.`,
          }
        : undefined,
    };
  });
}

function defaultSourceLabel(meta: PreviewMeta): string {
  switch (meta.sourceKind) {
    case 'notes':
      return 'Your notes';
    case 'link':
      return 'The video';
    default: {
      const title = meta.title?.trim();
      return title && title.length > 0 ? title : 'Your material';
    }
  }
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Generate the anonymous onboarding preview: structure (GLM-5.2, the former
 * Sonnet slot, bounded to a short section) → slot-1 lesson → exactly 2 questions,
 * all PLAIN JSON, NO DB
 * writes. Throws `PreviewGenerationError` on any unrecoverable miss so the
 * caller falls back to the sample flow (D11).
 */
export async function generatePathPreview(input: {
  corpus: string;
  meta: PreviewMeta;
}): Promise<PreviewResult> {
  const corpus = capAtBoundary(input.corpus ?? '', PREVIEW_CORPUS_CHARS);
  const meta: PreviewMeta = {
    ...input.meta,
    language: input.meta.language ? normalizePathLanguage(input.meta.language) : 'en',
  };

  // One OpenRouter sticky-routing token for all 3 preview calls (structure →
  // lesson → questions), so they land on the same upstream and the shared corpus
  // prefix hits the implicit cache instead of cold-missing per call.
  const sessionId = `preview-${randomUUID()}`;

  const structure = await generatePreviewStructure(corpus, meta, sessionId);
  const first = firstLearningSlot(structure);
  if (!first) {
    throw new PreviewGenerationError('structure', 'no learning slot in the generated structure');
  }

  const lesson = await generatePreviewLesson(corpus, meta, structure, first.phase, first.slot, sessionId);
  const questions = await generatePreviewQuestions(corpus, meta, structure, first.slot, lesson.text, sessionId);

  return { title: structure.title, structure, lesson, questions };
}
