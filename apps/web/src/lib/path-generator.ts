// Phase 10.2 — guided path generation orchestrator.
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
//     theory + flashcards AI calls in parallel per slot for `learning` slots,
//     quiz calls for `review`/`assessment` slots, and persists each result
//     while updating `StudyPlan.generationProgress` after every slot.
//     Per-activity retries (2 attempts) absorb transient errors; activities
//     that still fail mark the plan `failed` with a learner-facing
//     `generationError` summary, and the `regenerate` endpoint re-runs
//     generation to retry them.
//
// Slot-kind → activity mapping (the orchestrator picks this):
//   learning   → theory + flashcards
//   review     → flashcards + quiz
//   assessment → quiz   (becomes the section checkpoint)

import { Prisma } from '@prisma/client';
import {
  PATH_STRUCTURE_TOOL,
  THEORY_SECTION_TOOL,
  FLASHCARDS_FOR_SLOT_TOOL,
  QUIZ_FOR_SLOT_TOOL,
  quizPayloadCatalogFor,
  type PathStructureToolInput,
  type TheorySectionToolInput,
  type QuizForSlotToolInput,
  type PathSlotKind,
} from './ai-tools';
import { repairMathLatex } from './math-latex-repair';
// ai-tools-gemini exports schema converters kept for documentation / future
// re-enable of constrained decoding; see path-generator-routing.ts comments.
import {
  buildPathStructurePrompt,
  buildTheoryPrompt,
  buildFlashcardsPrompt,
  buildQuizPrompt,
  type PathStructureContext,
  type SlotContentContext,
} from './path-prompts';
import { forcedStructuredCall, type NormalizedUsage } from './path-generator-routing';
import { computeCost, type ModelUsage } from './path-generator-cost';
import { loadMaterialCorpus, renderMaterialCorpus } from './path-corpus';
import {
  loadSourceImages,
  captionMissing,
  renderImageCatalog,
  resolveFlashcardFigures,
  resolveQuizFigures,
  type SourceImage,
} from './path-image-catalog';

// Re-exported for back-compat: these figure validators moved to
// path-image-catalog (their natural home, also reused by chat-stream) but the
// path generator and its tests still import them from here.
export { resolveFlashcardFigures, resolveQuizFigures };
import { refundUsage } from './usage-limits';
import {
  QuizSetV2Schema,
  TheorySectionSchema,
  PathDiagramSchema,
  TheoryFigureSchema,
  DIAGRAM_CLOZE_MASK,
  type QuestionKind,
  type TheorySection,
  type PathDiagram,
  type DiagramClozePayload,
} from '@notemage/shared';
import { randomUUID } from 'crypto';
import { copyImage } from './storage';
import { buildLegacyColumns } from './quiz-grading';
import { db } from './db';
import { logTelemetry } from './telemetry-server';
import { logAiUsage } from './ai-usage';
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
import {
  expectedActivityKinds,
  isTheoryTooThinForFlashcards,
  type PathActivityKind,
} from './path-slot-activities';
import { normalizePathLanguage, type PathLanguageCode } from './path-languages';
import { CANCELLING_STATUS, deletePathCascade } from './path-loader';

// ─────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────

export interface GeneratePathStructureOpts {
  userId: string;
  /** User-provided path title — the AI may refine it. */
  title: string;
  /** Optional brief from the user (intent, focus, …). */
  brief?: string;
  /**
   * Optional rendered material corpus — the learner's actual page/document
   * text and flashcard/quiz content. Delivered as a cached system block so
   * Stage A grounds the path's structure in it. Empty/missing lets the AI
   * design from the title + brief alone.
   */
  corpus?: string;
  /** Subject buckets from the classifier (sorted by weight). */
  subjects: SubjectId[];
  /** Per-subject weights aligned with `subjects`. */
  subjectWeights: number[];
  /** Per-path Gemini override — when true, Stage A (and Stage B via the
   *  persisted plan flag) routes through Gemini regardless of env vars. */
  gemini?: boolean;
  /** Author-selected content language (BCP-47). Defaults to English. */
  language?: PathLanguageCode;
}

export type GeneratedPathStructure = PathStructureToolInput;

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/** Trim a Zod error message so it stays readable inside a retry prompt. */
function truncateError(message: string): string {
  return message.length > 600 ? `${message.slice(0, 600)}…` : message;
}

/** How many times Stage B re-attempts one activity's AI call before giving
 *  up. Each retry feeds a corrective notice back into the prompt. */
const MAX_ACTIVITY_ATTEMPTS = 3;

// Path-level retry sweeps (plans/path-generation-reliability.md, Phase 4). After
// the first full pass, the orchestrator re-walks any slots whose activities are
// still missing — on top of each activity's own MAX_ACTIVITY_ATTEMPTS retries —
// reloading the plan between sweeps so generated/pruned activities are skipped.
// Ultra is capped at 3/month, so cost is irrelevant: sweep generously. Basic
// (Haiku, high-volume) gets one extra sweep; its real fix is prompt reliability.
const PATH_RETRY_SWEEPS_ULTRA = 3;
const PATH_RETRY_SWEEPS_BASIC = 1;

/** Short, safe preview of a raw AI tool output, for failure diagnostics. */
function previewToolOutput(raw: unknown): string {
  try {
    const json = JSON.stringify(raw);
    return json.length > 600 ? `${json.slice(0, 600)}…` : json;
  } catch {
    return `[unserializable ${typeof raw}]`;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Token-usage metering — accumulated per generation and logged to
// telemetry so cache effectiveness (read vs write tokens) is observable.
// Provider-agnostic: the routing dispatcher hands us `NormalizedUsage`
// for every call regardless of which provider served it.
// ─────────────────────────────────────────────────────────────────────

interface UsageMeter {
  calls: number;
  // Rolled-up totals across every provider — preserved for telemetry
  // continuity with downstream log consumers that key off these.
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  // Per-model breakdown. Required for cost computation because Sonnet
  // and Haiku are both 'anthropic' but priced very differently — a
  // provider-level rollup would hide the Sonnet upgrade on ultra quizzes.
  perModel: Record<string, ModelUsage>;
  // Per-provider call counts — quick at-a-glance signal in telemetry.
  byProvider: { anthropic: number; gemini: number };
}

function emptyMeter(): UsageMeter {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    perModel: {},
    byProvider: { anthropic: 0, gemini: 0 },
  };
}

function addNormalizedUsage(meter: UsageMeter, u: NormalizedUsage): void {
  meter.calls += 1;
  meter.inputTokens += u.inputTokens;
  meter.outputTokens += u.outputTokens;
  meter.cacheReadTokens += u.cacheReadTokens;
  meter.cacheWriteTokens += u.cacheWriteTokens;
  const m: ModelUsage = meter.perModel[u.model] ?? {
    model: u.model,
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  m.calls += 1;
  m.inputTokens += u.inputTokens;
  m.outputTokens += u.outputTokens;
  m.cacheReadTokens += u.cacheReadTokens;
  m.cacheWriteTokens += u.cacheWriteTokens;
  meter.perModel[u.model] = m;
  meter.byProvider[u.provider] += 1;
}

/**
 * Persist a path-stage's accumulated usage to the admin AI-usage ledger — one
 * row per model so Haiku vs Sonnet costs stay distinguishable. Emitted once per
 * stage at completion (not per call) since the meter already aggregates by
 * model. Best-effort via logAiUsage(); never throws.
 */
function reportMeterUsage(meter: UsageMeter, feature: string, userId: string | null): void {
  for (const m of Object.values(meter.perModel)) {
    logAiUsage({
      userId,
      feature,
      provider: m.model.startsWith('gemini') ? 'gemini' : 'anthropic',
      model: m.model,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      cacheReadTokens: m.cacheReadTokens,
      cacheWriteTokens: m.cacheWriteTokens,
    });
  }
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
  return { type: 'inlineMath', attrs: { latex: repairMathLatex(latex) } };
}

function blockMathNode(latex: string): TipTapNode {
  return { type: 'blockMath', attrs: { latex: repairMathLatex(latex) } };
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

// The theory section's structural headings ("Key points" / "Examples" /
// "Summary") are added by us, not the model — so they must be localized to
// the path's content language or a German path ends up with English headings
// above German prose. One entry per supported PATH_LANGUAGES code.
type TheorySectionLabels = { keyPoints: string; examples: string; summary: string };

const THEORY_SECTION_LABELS: Record<PathLanguageCode, TheorySectionLabels> = {
  en: { keyPoints: 'Key points', examples: 'Examples', summary: 'Summary' },
  de: { keyPoints: 'Kernpunkte', examples: 'Beispiele', summary: 'Zusammenfassung' },
  fr: { keyPoints: 'Points clés', examples: 'Exemples', summary: 'Résumé' },
  es: { keyPoints: 'Puntos clave', examples: 'Ejemplos', summary: 'Resumen' },
  it: { keyPoints: 'Punti chiave', examples: 'Esempi', summary: 'Riepilogo' },
  tr: { keyPoints: 'Önemli noktalar', examples: 'Örnekler', summary: 'Özet' },
  pt: { keyPoints: 'Pontos-chave', examples: 'Exemplos', summary: 'Resumo' },
  nl: { keyPoints: 'Kernpunten', examples: 'Voorbeelden', summary: 'Samenvatting' },
  pl: { keyPoints: 'Kluczowe punkty', examples: 'Przykłady', summary: 'Podsumowanie' },
  ru: { keyPoints: 'Ключевые моменты', examples: 'Примеры', summary: 'Итоги' },
  uk: { keyPoints: 'Ключові моменти', examples: 'Приклади', summary: 'Підсумок' },
  sv: { keyPoints: 'Viktiga punkter', examples: 'Exempel', summary: 'Sammanfattning' },
  da: { keyPoints: 'Nøglepunkter', examples: 'Eksempler', summary: 'Opsummering' },
  no: { keyPoints: 'Nøkkelpunkter', examples: 'Eksempler', summary: 'Oppsummering' },
  fi: { keyPoints: 'Keskeiset kohdat', examples: 'Esimerkit', summary: 'Yhteenveto' },
  cs: { keyPoints: 'Klíčové body', examples: 'Příklady', summary: 'Shrnutí' },
  sk: { keyPoints: 'Kľúčové body', examples: 'Príklady', summary: 'Zhrnutie' },
  ro: { keyPoints: 'Puncte cheie', examples: 'Exemple', summary: 'Rezumat' },
  hu: { keyPoints: 'Kulcspontok', examples: 'Példák', summary: 'Összefoglalás' },
  el: { keyPoints: 'Βασικά σημεία', examples: 'Παραδείγματα', summary: 'Περίληψη' },
  bg: { keyPoints: 'Ключови точки', examples: 'Примери', summary: 'Обобщение' },
  hr: { keyPoints: 'Ključne točke', examples: 'Primjeri', summary: 'Sažetak' },
  sr: { keyPoints: 'Кључне тачке', examples: 'Примери', summary: 'Резиме' },
  sl: { keyPoints: 'Ključne točke', examples: 'Primeri', summary: 'Povzetek' },
  ca: { keyPoints: 'Punts clau', examples: 'Exemples', summary: 'Resum' },
  ar: { keyPoints: 'النقاط الرئيسية', examples: 'أمثلة', summary: 'ملخص' },
  he: { keyPoints: 'נקודות מפתח', examples: 'דוגמאות', summary: 'סיכום' },
  fa: { keyPoints: 'نکات کلیدی', examples: 'مثال‌ها', summary: 'خلاصه' },
  hi: { keyPoints: 'मुख्य बिंदु', examples: 'उदाहरण', summary: 'सारांश' },
  bn: { keyPoints: 'মূল বিষয়সমূহ', examples: 'উদাহরণ', summary: 'সারসংক্ষেপ' },
  id: { keyPoints: 'Poin utama', examples: 'Contoh', summary: 'Ringkasan' },
  ms: { keyPoints: 'Perkara utama', examples: 'Contoh', summary: 'Ringkasan' },
  vi: { keyPoints: 'Điểm chính', examples: 'Ví dụ', summary: 'Tóm tắt' },
  th: { keyPoints: 'ประเด็นสำคัญ', examples: 'ตัวอย่าง', summary: 'สรุป' },
  ja: { keyPoints: '要点', examples: '例', summary: 'まとめ' },
  ko: { keyPoints: '핵심 요점', examples: '예시', summary: '요약' },
  zh: { keyPoints: '要点', examples: '示例', summary: '小结' },
};

// The core (text-only) theory fields theoryInputToTipTap + theoryPlainText
// read. A loose structural subset so a validated `TheorySection` — which also
// carries loose `figures`/`diagrams` arrays — is assignable here.
type TheoryCore = Pick<
  TheorySectionToolInput,
  'title' | 'introduction' | 'keyPoints' | 'examples' | 'summary'
>;

// Theory-visuals custom nodes. `pathImage` carries only a `ref` (the
// TheoryImage.sortOrder) — never an id/URL — so a clone resolves it against
// the clone's own copied images with zero body rewriting. `pathDiagram` holds
// the validated diagram object in attrs; the viewer renders it with a React
// component and the translation/moderation walkers reach into attrs.
function pathImageNode(ref: number, alt: string): TipTapNode {
  return { type: 'pathImage', attrs: { ref, alt } };
}

function pathDiagramNode(diagram: PathDiagram): TipTapNode {
  return { type: 'pathDiagram', attrs: { diagram } };
}

interface TheoryVisuals {
  /** Snapshotted figures, in order; `ref` is the TheoryImage.sortOrder. */
  figures?: { ref: number; alt: string }[];
  /** Validated diagrams, in order. */
  diagrams?: PathDiagram[];
}

/**
 * Convert the Stage B `create_theory_section` tool output into a TipTap
 * document JSON, rendered by the read-only viewer (TheoryViewer). The
 * structural headings are localized to `language` so they match the
 * generated prose. Optional `visuals` interleave figures (after the intro)
 * and diagrams (after the examples) as custom block nodes.
 */
export function theoryInputToTipTap(
  input: TheoryCore,
  language: PathLanguageCode = 'en',
  visuals?: TheoryVisuals,
): TipTapDoc {
  const labels = THEORY_SECTION_LABELS[language] ?? THEORY_SECTION_LABELS.en;
  const content: TipTapNode[] = [];
  content.push(heading(2, input.title));
  content.push(...splitParagraphs(input.introduction));
  // Figures sit right after the intro — they illustrate the concept being set up.
  for (const fig of visuals?.figures ?? []) {
    content.push(pathImageNode(fig.ref, fig.alt));
  }
  if (input.keyPoints.length > 0) {
    content.push(heading(3, labels.keyPoints));
    content.push(bulletList(input.keyPoints));
  }
  if (input.examples.length > 0) {
    content.push(heading(3, labels.examples));
    for (const ex of input.examples) {
      content.push(heading(4, ex.label));
      content.push(...splitParagraphs(ex.explanation));
    }
  }
  // Diagrams sit after the examples — they consolidate structure / sequence.
  for (const diagram of visuals?.diagrams ?? []) {
    content.push(pathDiagramNode(diagram));
  }
  if (input.summary && input.summary.trim().length > 0) {
    content.push(heading(3, labels.summary));
    content.push(...splitParagraphs(input.summary));
  }
  return { type: 'doc', content };
}

/**
 * Flatten a theory section into plain text so a learning slot's flashcard
 * generator can build cards from exactly what the learner just read — which
 * keeps the card count honest (no padding from the bare topic hint).
 */
function theoryPlainText(input: TheoryCore): string {
  const parts: string[] = [];
  if (input.introduction.trim()) parts.push(input.introduction.trim());
  if (input.keyPoints.length > 0) {
    parts.push(input.keyPoints.map((p) => `- ${p}`).join('\n'));
  }
  if (input.examples.length > 0) {
    parts.push(input.examples.map((ex) => `${ex.label}: ${ex.explanation}`).join('\n'));
  }
  if (input.summary && input.summary.trim()) parts.push(input.summary.trim());
  return parts.join('\n\n');
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
    hasSourceMaterials: Boolean(opts.corpus && opts.corpus.trim().length > 0),
    subjects: opts.subjects,
    subjectWeights: opts.subjectWeights,
    language: opts.language ?? 'en',
  };
  const { system, tail } = buildPathStructurePrompt(ctx);
  const meter = emptyMeter();

  // The model occasionally returns a phase with no `slots` (or drifted
  // phases/slots). normalizePathStructure coerces the output and drops
  // unusable phases; retry up to MAX_ACTIVITY_ATTEMPTS when nothing
  // usable comes back, feeding the problem back as a corrective notice.
  let structure: GeneratedPathStructure | null = null;
  let lastDetail = '';
  for (let attempt = 1; attempt <= MAX_ACTIVITY_ATTEMPTS && !structure; attempt++) {
    const attemptTail =
      attempt === 1
        ? tail
        : [
            tail,
            '',
            '--- RETRY NOTICE ---',
            `Your previous structure was unusable: ${lastDetail}`,
            'Every section MUST have a non-empty `slots` array.',
          ].join('\n');
    try {
      const raw = await forcedStructuredCall<unknown>({
        stage: 'structure',
        corpus: opts.corpus ?? null,
        staticInstructions: system,
        dynamicInstructions: attemptTail,
        anthropicTool: PATH_STRUCTURE_TOOL,
        userMessage: `Design the path "${opts.title}".`,
        providerOverride: opts.gemini ? 'gemini' : undefined,
        onUsage: (u) => addNormalizedUsage(meter, u),
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

  // Rebuild each section to interleave spaced-repetition `review` slots and
  // guarantee a trailing graded `assessment`. The prompt asks for this but the
  // model reliably falls back to a wall of learning slots + one assessment, so
  // we enforce the rhythm in code.
  enforceSpacedReviews(structure);
  logTelemetry(opts.userId, 'path.structure.completed', {
    usage: meter,
    cost: computeCost(meter.perModel),
  });
  reportMeterUsage(meter, 'path-structure', opts.userId);
  return structure;
}

type StructureSlot = GeneratedPathStructure['phases'][number]['slots'][number];

/**
 * Stage A reliably emits a wall of `learning` slots and a single trailing
 * `assessment`, which makes every path feel identical. Rebuild each section so
 * a `review` slot lands after roughly every 2 `learning` slots (spaced
 * repetition), the section still ends with a graded `assessment`, and every
 * checkpoint's `covers` points at the correct preceding slots in the rebuilt
 * order. Enforced in code because the prompt alone does not reliably produce
 * reviews.
 */
function enforceSpacedReviews(structure: GeneratedPathStructure): void {
  for (const phase of structure.phases) {
    if (phase.slots.length === 0) continue;

    // Split the section body from its trailing assessment. If the model didn't
    // end with one, fold that slot back into the body and synthesize a fresh
    // checkpoint so the section still gates.
    const body = phase.slots.slice(0, -1);
    let assessment = phase.slots[phase.slots.length - 1];
    if (assessment.kind !== 'assessment') {
      body.push(assessment);
      assessment = {
        title: 'Section Checkpoint',
        kind: 'assessment',
        topicHint: `Graded checkpoint for "${phase.title}". Tests every concept covered in this section.`,
      };
    }

    const rebuilt: StructureSlot[] = [];
    // rebuilt-array indices of the learning slots awaiting their next review.
    let pending: number[] = [];

    const pushReview = (existing?: StructureSlot) => {
      const covered = [...pending];
      let review: StructureSlot;
      if (existing) {
        existing.kind = 'review';
        review = existing;
      } else {
        const titles = covered
          .map((i) => rebuilt[i]?.title)
          .filter((t): t is string => Boolean(t));
        const last = titles[titles.length - 1];
        const label = last ? `Review: ${last}` : 'Review & Practice';
        review = {
          title: label.length <= 34 ? label : 'Review & Practice',
          kind: 'review',
          topicHint:
            titles.length > 0
              ? `Consolidate and practice the concepts from: ${titles.join('; ')}.`
              : 'Consolidate and practice the concepts from the previous slots.',
        };
      }
      // Recompute covers against the rebuilt order — the model's indices are
      // stale once slots move. Empty covers falls back to "all earlier slots"
      // at resolution time, which is still a valid review.
      review.covers = covered;
      rebuilt.push(review);
      pending = [];
    };

    for (const slot of body) {
      if (slot.kind === 'review') {
        // Keep model-authored reviews; have them consolidate the pending pair.
        pushReview(slot);
      } else {
        // Learning (or any stray mid-section assessment) becomes a learning slot.
        slot.kind = 'learning';
        slot.covers = undefined;
        rebuilt.push(slot);
        pending.push(rebuilt.length - 1);
        if (pending.length >= 2) pushReview();
      }
    }
    // A lone leftover learning slot needs no review — the assessment covers it.

    assessment.kind = 'assessment';
    assessment.covers = rebuilt.map((_, i) => i);
    rebuilt.push(assessment);
    phase.slots = rebuilt;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Stage B — per-slot orchestration
// ─────────────────────────────────────────────────────────────────────

interface SlotForGeneration {
  id: string;
  title: string;
  kind: PathSlotKind;
  topicHint: string;
  /** Stage A's measurable objective for the slot (verb-first capability). */
  objective: string | null;
  sortOrder: number;
  /**
   * Stage A's resolved `covers` — ids of the earlier slots in the same phase
   * this review/assessment checkpoint tests. Empty for learning slots; when
   * empty on a checkpoint the orchestrator falls back to every earlier slot
   * in the section.
   */
  coversSlotIds: string[];
  /**
   * Phase 10.3 — set of activity kinds the slot already has in DB. The
   * orchestrator skips these so `generatePath` is safe to re-run as the
   * retry path for `POST /api/learn/paths/[planId]/regenerate`.
   */
  existingActivityKinds: Set<'theory' | 'flashcards' | 'quiz'>;
  /**
   * Activity kinds Stage B previously PRUNED for this slot (material too thin
   * to support them). Excluded from `missingKinds` so a retry sweep or
   * regenerate never re-attempts an intentionally-absent activity. See
   * plans/path-generation-reliability.md (Phase 3).
   */
  prunedActivityKinds: Set<'theory' | 'flashcards' | 'quiz'>;
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
  /** The learner's "Study goals" brief, persisted so Stage B content honors it. */
  learnerBrief: string | null;
  subjects: SubjectId[];
  subjectWeights: number[];
  /** Ultra path — Stage B generates quizzes with the premium model. */
  ultra: boolean;
  /** Per-path Gemini override — when true, every Stage B call routes
   *  through Gemini regardless of env vars (wins over `ultra` too). */
  gemini: boolean;
  /** Author-selected content language (BCP-47). Drives the per-prompt
   *  "write in this language" directive and the localized theory headings. */
  language: PathLanguageCode;
  /** Rendered material corpus, rebuilt from StudyPlan.materialIds. */
  corpus: string | null;
  /**
   * Rendered source-image catalog appended to the theory prompt's cached
   * system block. Non-null only when the path's materials carried (captioned)
   * images and `PATH_THEORY_FIGURES_DISABLED` is off (all tiers since P2). When
   * null, the theory model is never told figures exist.
   */
  imageCatalog: string | null;
  /**
   * The images behind `imageCatalog`, keyed for snapshotting at emit time.
   * Empty when figures are off. `imageRef` (PageImage.id) maps to one entry.
   */
  availableImages: SourceImage[];
  /** Whether theory figures are offered/kept (false ⇢ PATH_THEORY_FIGURES_DISABLED). */
  theoryFiguresEnabled: boolean;
  /** Whether flashcard figures are offered/kept (false ⇢ PATH_FLASHCARD_FIGURES_DISABLED). */
  flashcardFiguresEnabled: boolean;
  /** Whether quiz exhibit figures are offered/kept (false ⇢ PATH_QUIZ_FIGURES_DISABLED). */
  quizFiguresEnabled: boolean;
  /** Whether structured diagrams are offered/kept (false ⇢ PATH_THEORY_DIAGRAMS_DISABLED). */
  diagramsEnabled: boolean;
  /** Token usage accumulated across this run's Stage B calls. */
  usage: UsageMeter;
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

  // Rebuild the same material corpus Stage A used so every Stage B activity
  // call is grounded in the learner's content. If a material was deleted
  // since the path was created, loadMaterialCorpus returns null — generate
  // without it rather than aborting the whole path.
  const corpusEntries = await loadMaterialCorpus(plan.userId, plan.materialIds);
  const corpus = corpusEntries ? renderMaterialCorpus(corpusEntries) : null;

  // Theory visuals. Diagrams are all-tiers (no added AI cost) so they ride a
  // simple kill-switch. Figures are all-tiers too: captions are pre-warmed at
  // import time (P1), so generation adds zero vision tokens for fresh imports —
  // captionMissing only heals pre-feature/OneNote/sweep-killed gaps. Theory,
  // flashcard (P3) and quiz (P4) figures share ONE catalog (deterministic +
  // 1h-cached); each feature has its own kill-switch and is gated at its
  // consumption site, so the catalog is built whenever ANY is enabled. The whole
  // build is best-effort — any failure leaves imageCatalog null and figures are
  // simply never offered, so a path never fails over visuals.
  const diagramsEnabled = process.env.PATH_THEORY_DIAGRAMS_DISABLED !== '1';
  const theoryFiguresEnabled = process.env.PATH_THEORY_FIGURES_DISABLED !== '1';
  const flashcardFiguresEnabled = process.env.PATH_FLASHCARD_FIGURES_DISABLED !== '1';
  const quizFiguresEnabled = process.env.PATH_QUIZ_FIGURES_DISABLED !== '1';
  let imageCatalog: string | null = null;
  let availableImages: SourceImage[] = [];
  if (theoryFiguresEnabled || flashcardFiguresEnabled || quizFiguresEnabled) {
    try {
      availableImages = await loadSourceImages(plan.userId, plan.materialIds);
      if (availableImages.length > 0) {
        await captionMissing(availableImages, { userId: plan.userId });
        const rendered = renderImageCatalog(availableImages);
        imageCatalog = rendered.length > 0 ? rendered : null;
      }
    } catch (error) {
      logTelemetry(plan.userId, 'path.theory.image_catalog_failed', {
        planId: plan.id,
        message: error instanceof Error ? error.message : String(error),
      });
      imageCatalog = null;
      availableImages = [];
    }
  }

  return {
    id: plan.id,
    userId: plan.userId,
    primaryNotebookId: plan.notebookId,
    title: plan.title,
    description: plan.description ?? '',
    learnerBrief: plan.learnerBrief ?? null,
    subjects: resolvedSubjects,
    subjectWeights: resolvedWeights,
    ultra: plan.ultra,
    gemini: plan.gemini,
    language: normalizePathLanguage(plan.language),
    corpus,
    imageCatalog,
    availableImages,
    theoryFiguresEnabled,
    flashcardFiguresEnabled,
    quizFiguresEnabled,
    diagramsEnabled,
    usage: emptyMeter(),
    phases: plan.phases.map((p) => ({
      title: p.title,
      description: p.description ?? '',
      slots: p.slots.map((s) => ({
        id: s.id,
        title: s.title,
        kind: (s.kind as PathSlotKind) ?? 'learning',
        topicHint: s.description ?? s.title,
        objective: s.objective ?? null,
        sortOrder: s.sortOrder,
        coversSlotIds: Array.isArray(s.coversSlotIds) ? s.coversSlotIds : [],
        existingActivityKinds: new Set(
          s.activities
            .map((a) => a.kind)
            .filter(
              (k): k is 'theory' | 'flashcards' | 'quiz' =>
                k === 'theory' || k === 'flashcards' || k === 'quiz',
            ),
        ),
        prunedActivityKinds: new Set(
          (Array.isArray(s.prunedActivityKinds) ? s.prunedActivityKinds : []).filter(
            (k): k is 'theory' | 'flashcards' | 'quiz' =>
              k === 'theory' || k === 'flashcards' || k === 'quiz',
          ),
        ),
      })),
    })),
  };
}

function totalSlotCount(plan: PlanForGeneration): number {
  return plan.phases.reduce((n, p) => n + p.slots.length, 0);
}

// Count slots that still need work this run — i.e. are missing at least one
// expected activity kind that wasn't intentionally pruned. For a fresh create
// every slot is pending (== totalSlotCount); for a regenerate only the
// previously-failed checkpoints are pending. This is the progress denominator
// so the modal shows "x / N" for the N being (re)generated, not the whole path.
// Mirrors the missing-kinds test in runGenerationPass and isGenerationIncomplete
// (path-gating), so it stays in lockstep with the banner's incomplete count.
function pendingSlotCount(plan: PlanForGeneration): number {
  let n = 0;
  for (const phase of plan.phases) {
    for (const slot of phase.slots) {
      const missing = expectedActivityKinds(slot.kind).filter(
        (k) => !slot.existingActivityKinds.has(k) && !slot.prunedActivityKinds.has(k),
      );
      if (missing.length > 0) n += 1;
    }
  }
  return n;
}

function makeSlotContentContext(
  plan: PlanForGeneration,
  phase: PhaseForGeneration,
  slot: SlotForGeneration,
  theoryText?: string,
): SlotContentContext {
  // Build the "review of" pool — the earlier slots a checkpoint consolidates.
  // Each entry is rendered as "Title — what it taught" so Stage B tests the
  // actual content rather than a bare title. `learning` slots stand on their
  // own. `review`/`assessment` use Stage A's `covers` (resolved to slot ids),
  // falling back to every earlier slot in the same phase. `final_exam` pulls
  // from every learning/review slot across the whole plan.
  const renderSlot = (s: SlotForGeneration): string => {
    const hint = s.topicHint?.trim() ?? '';
    return hint.length > 0 && hint !== s.title.trim() ? `${s.title} — ${hint}` : s.title;
  };
  let reviewOf: string[] | undefined;
  if (slot.kind === 'final_exam') {
    const all: string[] = [];
    for (const p of plan.phases) {
      for (const s of p.slots) {
        if (s.kind === 'learning' || s.kind === 'review') all.push(renderSlot(s));
      }
    }
    reviewOf = all.length > 0 ? all : undefined;
  } else if (slot.kind !== 'learning') {
    const byId = new Map(phase.slots.map((s) => [s.id, s]));
    let covered: SlotForGeneration[];
    if (slot.coversSlotIds.length > 0) {
      covered = slot.coversSlotIds
        .map((id) => byId.get(id))
        .filter((s): s is SlotForGeneration => Boolean(s));
    } else {
      // No explicit `covers`: every earlier slot in the section (preserves the
      // old "all siblings" behavior, minus slots that come after this one).
      covered = phase.slots.filter((s) => s.id !== slot.id && s.sortOrder < slot.sortOrder);
    }
    const rendered = covered.map(renderSlot);
    reviewOf = rendered.length > 0 ? rendered : undefined;
  }
  return {
    pathTitle: plan.title,
    pathDescription: plan.description,
    phaseTitle: phase.title,
    phaseDescription: phase.description,
    slotTitle: slot.title,
    slotKind: slot.kind,
    slotTopicHint: slot.topicHint,
    slotObjective: slot.objective ?? undefined,
    learnerBrief: plan.learnerBrief ?? undefined,
    reviewOf,
    subjects: plan.subjects,
    subjectWeights: plan.subjectWeights,
    hasSourceMaterials: Boolean(plan.corpus && plan.corpus.trim().length > 0),
    language: plan.language,
    theoryText,
    // The same catalog feeds three prompts behind separate kill-switches:
    // buildTheoryPrompt reads `imageCatalog`, buildFlashcardsPrompt reads
    // `flashcardImageCatalog`, buildQuizPrompt reads `quizImageCatalog`. Each is
    // gated by its own feature flag so any can be off while the others are on.
    imageCatalog: plan.theoryFiguresEnabled ? plan.imageCatalog : null,
    flashcardImageCatalog: plan.flashcardFiguresEnabled ? plan.imageCatalog : null,
    quizImageCatalog: plan.quizFiguresEnabled ? plan.imageCatalog : null,
    diagramsEnabled: plan.diagramsEnabled,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Stage B — per-activity AI calls + persistence
// ─────────────────────────────────────────────────────────────────────

/**
 * Validate the model's figure references against the path's image catalog and
 * return the matched source images (model order, deduped, capped at 3). A
 * hallucinated or duplicate `imageRef` is dropped so it can never reach a
 * snapshot or an <img> src.
 */
export function resolveFigures(
  rawFigures: unknown,
  available: SourceImage[],
): { image: SourceImage; caption: string }[] {
  if (!Array.isArray(rawFigures) || available.length === 0) return [];
  const byId = new Map(available.map((img) => [img.id, img]));
  const seen = new Set<string>();
  const out: { image: SourceImage; caption: string }[] = [];
  for (const raw of rawFigures) {
    const parsed = TheoryFigureSchema.safeParse(raw);
    if (!parsed.success) continue;
    const img = byId.get(parsed.data.imageRef);
    if (!img || seen.has(img.id)) continue;
    seen.add(img.id);
    out.push({ image: img, caption: parsed.data.caption });
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * Validate each diagram with the strict per-kind schema and drop the invalid
 * ones (never fail the theory over a bad diagram). Capped at 2. When `meta` is
 * supplied, emits one aggregated telemetry event per slot so silent drops
 * become visible in prod (the optional param keeps unit calls one-arg).
 */
export function resolveDiagrams(
  rawDiagrams: unknown,
  meta?: { userId: string | null; planId: string; slotId: string },
): PathDiagram[] {
  if (!Array.isArray(rawDiagrams)) return [];
  const out: PathDiagram[] = [];
  let dropped = 0;
  for (const raw of rawDiagrams) {
    const parsed = PathDiagramSchema.safeParse(raw);
    if (parsed.success) out.push(parsed.data);
    else dropped++;
    if (out.length >= 2) break;
  }
  if (meta && (out.length > 0 || dropped > 0)) {
    logTelemetry(meta.userId, 'path.theory.diagrams_resolved', {
      planId: meta.planId,
      slotId: meta.slotId,
      emitted: out.length,
      dropped,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Diagram reuse (Phase 3) — extract theory's `pathDiagram` nodes for
// stamping onto the slot's flashcard / quiz sets (zero AI tokens).
// ─────────────────────────────────────────────────────────────────────

/**
 * Walk a persisted TheoryContent.body (TipTap doc) and collect every top-level
 * `pathDiagram` node's diagram, validated by the strict per-kind schema. The
 * theory generator only ever emits diagrams as direct children of the doc (see
 * theoryInputToTipTap), so a top-level walk is sufficient and avoids matching
 * any nested look-alike. Invalid entries are dropped, never thrown.
 */
export function extractDiagramsFromTheoryBody(body: unknown): PathDiagram[] {
  if (!body || typeof body !== 'object') return [];
  const nodes = (body as Record<string, unknown>).content;
  if (!Array.isArray(nodes)) return [];
  const out: PathDiagram[] = [];
  for (const node of nodes) {
    const n = node as Record<string, unknown>;
    if (n?.type === 'pathDiagram' && n.attrs) {
      const parsed = PathDiagramSchema.safeParse((n.attrs as Record<string, unknown>).diagram);
      if (parsed.success) out.push(parsed.data);
    }
  }
  return out;
}

/**
 * Merge diagrams pulled from several covered slots' theory bodies into the set
 * of ≤2 the viewer renders. Preserves covered-slot order, dedupes by
 * `kind`+`title` (a review pulling from siblings that each emitted "Timeline of
 * the Republic" shouldn't show it twice), and caps at 2 — matching
 * `resolveDiagrams`. Pure: unit-tested directly.
 */
export function mergeDiagrams(lists: PathDiagram[][]): PathDiagram[] {
  const out: PathDiagram[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const d of list) {
      const key = `${d.kind}::${d.title ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(d);
      if (out.length >= 2) return out;
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Diagram cloze (Phase 5) — deterministic "what's missing?" question
// ─────────────────────────────────────────────────────────────────────

/**
 * Terse "what's missing in this diagram?" stem per language. Paths generate
 * directly IN the plan's language, but this question is built in code — so we
 * carry a native stem for the popular languages and fall back to English for
 * the rest. The English stem also rides the translatable question-text slot, so
 * `translatePath` localises it for every other language on demand.
 */
const DIAGRAM_CLOZE_STEMS: Partial<Record<PathLanguageCode, string>> = {
  en: "What's missing in this diagram?",
  de: 'Was fehlt in diesem Diagramm?',
  fr: 'Que manque-t-il dans ce schéma ?',
  es: '¿Qué falta en este diagrama?',
  it: 'Cosa manca in questo diagramma?',
  tr: 'Bu diyagramda eksik olan ne?',
};

function diagramClozeStem(language: PathLanguageCode): string {
  return DIAGRAM_CLOZE_STEMS[language] ?? DIAGRAM_CLOZE_STEMS.en!;
}

// One maskable element of a diagram: its label string plus a function that
// returns a deep clone of the whole diagram with THAT element replaced by the
// mask marker. Kind-specific rules exclude the cue elements (timeline dates,
// comparison column headers + row labels) so the masked element is always a
// fair answer.
interface MaskableElement {
  label: string;
  masked: () => PathDiagram;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * The maskable elements of one diagram, in document order. Per kind:
 *   timeline   → each event LABEL (never the date — the date is the cue).
 *   steps      → each step TITLE.
 *   comparison → each non-empty body CELL (never a column header or row label).
 *   cycle      → each node.
 */
function maskableElements(diagram: PathDiagram): MaskableElement[] {
  const out: MaskableElement[] = [];
  switch (diagram.kind) {
    case 'timeline':
      diagram.events.forEach((ev, i) => {
        out.push({
          label: ev.label,
          masked: () => {
            const d = clone(diagram);
            d.events[i].label = DIAGRAM_CLOZE_MASK;
            return d;
          },
        });
      });
      break;
    case 'steps':
      diagram.steps.forEach((st, i) => {
        out.push({
          label: st.title,
          masked: () => {
            const d = clone(diagram);
            d.steps[i].title = DIAGRAM_CLOZE_MASK;
            return d;
          },
        });
      });
      break;
    case 'comparison':
      diagram.rows.forEach((row, ri) => {
        row.cells.forEach((cell, ci) => {
          if (typeof cell !== 'string' || cell.trim().length === 0) return;
          out.push({
            label: cell,
            masked: () => {
              const d = clone(diagram);
              d.rows[ri].cells[ci] = DIAGRAM_CLOZE_MASK;
              return d;
            },
          });
        });
      });
      break;
    case 'cycle':
      diagram.nodes.forEach((node, i) => {
        out.push({
          label: node,
          masked: () => {
            const d = clone(diagram);
            d.nodes[i] = DIAGRAM_CLOZE_MASK;
            return d;
          },
        });
      });
      break;
    default:
      break;
  }
  return out;
}

/**
 * Build ONE deterministic diagram-cloze question from a set's diagrams, or null
 * when the rule can't be met. Zero AI tokens — the question is derived in code.
 *
 * Element pick (deterministic, documented): take the FIRST diagram that has any
 * maskable element; mask its MIDDLE maskable element (`floor(n/2)`).
 *
 * Distractors: other maskable labels from the SAME diagram first, then sibling
 * diagrams, deduped (case-insensitively) against the answer and each other. We
 * need ≥3 unique non-empty distractors (4 options total) or we return null —
 * never a degenerate question. Options are ordered by a stable rotation (no
 * randomness) so unit output is deterministic and the answer isn't always first.
 */
export function buildDiagramClozeQuestion(
  diagrams: PathDiagram[],
  language: PathLanguageCode,
): { kind: 'diagram_cloze'; question: string; payload: DiagramClozePayload } | null {
  if (!Array.isArray(diagrams) || diagrams.length === 0) return null;

  // First diagram with at least one maskable element is the target.
  let targetIndex = -1;
  let elements: MaskableElement[] = [];
  for (let i = 0; i < diagrams.length; i++) {
    const els = maskableElements(diagrams[i]);
    if (els.length > 0) {
      targetIndex = i;
      elements = els;
      break;
    }
  }
  if (targetIndex < 0 || elements.length === 0) return null;

  const pick = elements[Math.floor(elements.length / 2)];
  const answer = pick.label;
  const answerKey = answer.trim().toLowerCase();

  // Distractor pool: same-diagram labels first (in order, minus the answer),
  // then every other diagram's maskable labels. Dedupe case-insensitively.
  const seen = new Set<string>([answerKey]);
  const distractors: string[] = [];
  const consider = (label: string) => {
    const key = label.trim().toLowerCase();
    if (key.length === 0 || seen.has(key)) return;
    seen.add(key);
    distractors.push(label);
  };
  for (const el of elements) consider(el.label);
  for (let i = 0; i < diagrams.length; i++) {
    if (i === targetIndex) continue;
    for (const el of maskableElements(diagrams[i])) consider(el.label);
  }

  if (distractors.length < 3) return null;

  // 4 options: answer + first 3 distractors, ordered by a stable rotation keyed
  // by the answer length so the correct slot varies but is deterministic.
  const pool = [answer, distractors[0], distractors[1], distractors[2]];
  const shift = answer.length % 4;
  const options = pool.map((_, i) => pool[(i + shift) % 4]);
  const correctIndex = (0 + (4 - shift)) % 4; // where `answer` (pool[0]) landed

  return {
    kind: 'diagram_cloze',
    question: diagramClozeStem(language),
    payload: { diagram: pick.masked(), options, correctIndex },
  };
}

/**
 * Resolve the diagrams to stamp onto a slot's flashcard/quiz set, sourced from
 * theory bodies per the slot-kind composition (path-slot-activities.ts):
 *
 *   learning  → the slot's OWN persisted theory body.
 *   review    → the covered learning slots' theory bodies (flashcards + quiz).
 *   assessment→ the covered learning slots' theory bodies (quiz).
 *   final_exam→ none (covers the whole plan; a merged dump isn't a useful panel).
 *
 * Covered-slot resolution replicates makeSlotContentContext exactly: explicit
 * `coversSlotIds` when non-empty (resolved against the same phase's slots), else
 * every earlier slot in the same phase with a lower `sortOrder`. Theory bodies
 * are read from the DB (not in-memory) so a fresh run (theory persists before
 * the slot's parallel activities, and earlier slots persist before later ones in
 * sortOrder) and a retry sweep (theory created in an earlier run) behave
 * identically. Returns at most 2.
 */
async function resolveDiagramsForSet(
  phase: PhaseForGeneration,
  slot: SlotForGeneration,
): Promise<PathDiagram[]> {
  if (slot.kind === 'final_exam') return [];

  if (slot.kind === 'learning') {
    const body = await loadSlotTheoryBody(slot.id);
    return mergeDiagrams([extractDiagramsFromTheoryBody(body)]);
  }

  // review / assessment — cross-slot resolver (same rule as makeSlotContentContext).
  const byId = new Map(phase.slots.map((s) => [s.id, s]));
  let covered: SlotForGeneration[];
  if (slot.coversSlotIds.length > 0) {
    covered = slot.coversSlotIds
      .map((id) => byId.get(id))
      .filter((s): s is SlotForGeneration => Boolean(s));
  } else {
    covered = phase.slots.filter((s) => s.id !== slot.id && s.sortOrder < slot.sortOrder);
  }
  if (covered.length === 0) return [];
  const bodies = await Promise.all(covered.map((s) => loadSlotTheoryBody(s.id)));
  return mergeDiagrams(bodies.map((b) => extractDiagramsFromTheoryBody(b)));
}

/**
 * Read a slot's theory activity body (TipTap JSON) from the DB. Returns null
 * when the slot has no theory activity (review/assessment slots) or it hasn't
 * been generated yet.
 */
async function loadSlotTheoryBody(slotId: string): Promise<unknown> {
  const act = await db.checkpointActivity.findFirst({
    where: { slotId, kind: 'theory', theoryId: { not: null } },
    select: { theory: { select: { body: true } } },
  });
  return act?.theory?.body ?? null;
}

async function generateTheoryActivity(
  plan: PlanForGeneration,
  phase: PhaseForGeneration,
  slot: SlotForGeneration,
  nextSortOrder: number,
): Promise<string> {
  const ctx = makeSlotContentContext(plan, phase, slot);
  const { system, tail } = buildTheoryPrompt(ctx);

  // Retry on validation failure or missing examples. examples are optional
  // in the schema, so an example-less section is accepted once the retries
  // are spent — a thin section beats a blocked checkpoint.
  let input: TheorySection | null = null;
  let exampleLess: TheorySection | null = null;
  let lastError = '';
  for (let attempt = 1; attempt <= MAX_ACTIVITY_ATTEMPTS && !input; attempt++) {
    const attemptTail =
      attempt === 1
        ? tail
        : [
            tail,
            '',
            '--- RETRY NOTICE ---',
            lastError,
            '`examples` MUST be a non-empty JSON array of { label, explanation } objects. Regenerate the full section.',
          ].join('\n');
    try {
      const raw = await forcedStructuredCall<unknown>({
        stage: 'theory',
        corpus: plan.corpus,
        staticInstructions: system,
        dynamicInstructions: attemptTail,
        anthropicTool: THEORY_SECTION_TOOL,
        userMessage: `Write the theory section for slot "${slot.title}".`,
        providerOverride: plan.gemini ? 'gemini' : undefined,
        onUsage: (u) => addNormalizedUsage(plan.usage, u),
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

  // Theory visuals — validate the model's figures (drop hallucinated refs) and
  // diagrams (drop per-kind-invalid), then snapshot referenced source images
  // into path-owned blobs and emit pathImage / pathDiagram nodes.
  const figures =
    plan.theoryFiguresEnabled && plan.imageCatalog
      ? resolveFigures(resolved.figures, plan.availableImages)
      : [];
  const diagrams = plan.diagramsEnabled
    ? resolveDiagrams(resolved.diagrams, { userId: plan.userId, planId: plan.id, slotId: slot.id })
    : [];

  // Snapshot blobs OUTSIDE the DB transaction — storage I/O must not hold a DB
  // connection open. A copy failure simply drops that one figure.
  const snapped: {
    sourcePageImageId: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
    caption: string;
  }[] = [];
  for (const fig of figures) {
    try {
      const dest = `theory-images/${slot.id}/${Date.now()}-${snapped.length}`;
      const { filePath, fileSize } = await copyImage(fig.image.filePath, dest);
      snapped.push({
        sourcePageImageId: fig.image.id,
        fileName: fig.image.fileName,
        filePath,
        fileSize,
        mimeType: fig.image.mimeType,
        caption: fig.caption,
      });
    } catch (error) {
      logTelemetry(plan.userId, 'path.theory.figure_copy_failed', {
        planId: plan.id,
        slotId: slot.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // pathImage `ref` is the TheoryImage.sortOrder (= index of the snapshot).
  const figureNodes = snapped.map((s, i) => ({ ref: i, alt: s.caption }));
  const body = theoryInputToTipTap(resolved, plan.language, {
    figures: figureNodes,
    diagrams,
  });

  await db.$transaction(async (tx) => {
    const theory = await tx.theoryContent.create({
      data: {
        title: resolved.title,
        body: body as unknown as Prisma.InputJsonValue,
      },
    });
    if (snapped.length > 0) {
      await tx.theoryImage.createMany({
        data: snapped.map((s, i) => ({
          theoryId: theory.id,
          sourcePageImageId: s.sourcePageImageId,
          fileName: s.fileName,
          filePath: s.filePath,
          fileSize: s.fileSize,
          mimeType: s.mimeType,
          caption: s.caption,
          sortOrder: i,
        })),
      });
    }
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

  // Diagram-reuse staleness (Phase 3): if this slot's flashcards were generated
  // in a PRIOR sweep while theory was still failing, that FlashcardSet has empty
  // diagrams. Theory is normally generated BEFORE flashcards in the same pass
  // (so the create-time stamp covers the common case), but a retry sweep can land
  // theory afterward — backfill the same-slot set with the diagrams we just
  // validated. Only learning slots carry both theory and flashcards. Cross-slot
  // copies on review/assessment sets are an accepted v1 staleness (see Non-Goals).
  if (slot.kind === 'learning' && diagrams.length > 0) {
    await db.flashcardSet
      .updateMany({
        where: {
          sourcePathId: plan.id,
          checkpointActivity: { slotId: slot.id, kind: 'flashcards' },
        },
        data: { diagrams: diagrams as unknown as Prisma.InputJsonValue },
      })
      .catch((error) => {
        logTelemetry(plan.userId, 'path.theory.diagram_backfill_failed', {
          planId: plan.id,
          slotId: slot.id,
          message: error instanceof Error ? error.message : String(error),
        });
      });
  }
  return theoryPlainText(resolved);
}

/**
 * Persist that Stage B intentionally PRUNED an activity kind for a slot
 * (material too thin to support it). Recorded on the slot so path-gating
 * treats the kind as satisfied — not a failure — and re-runs never re-attempt
 * it. See plans/path-generation-reliability.md (Phase 3).
 */
async function recordPrunedActivity(
  plan: PlanForGeneration,
  slot: SlotForGeneration,
  kind: PathActivityKind,
  reason: string,
): Promise<void> {
  // Gating dedupes via a Set, but guard the push so a re-run can't accumulate
  // duplicate entries in the column.
  if (slot.prunedActivityKinds.has(kind)) return;
  await db.checkpointSlot.update({
    where: { id: slot.id },
    data: { prunedActivityKinds: { push: kind } },
  });
  slot.prunedActivityKinds.add(kind);
  logTelemetry(plan.userId, 'path.activity.pruned', {
    planId: plan.id,
    slotId: slot.id,
    activityKind: kind,
    reason,
  });
}

async function generateFlashcardsActivity(
  plan: PlanForGeneration,
  phase: PhaseForGeneration,
  slot: SlotForGeneration,
  nextSortOrder: number,
  theoryText?: string,
): Promise<void> {
  const ctx = makeSlotContentContext(plan, phase, slot, theoryText);
  const { system, tail } = buildFlashcardsPrompt(ctx);

  // The model intermittently returns an empty / unusable `flashcards` array
  // under the forced-tool call. Retry up to MAX_ACTIVITY_ATTEMPTS with a
  // corrective notice; the raw output is logged so a persistent failure is
  // diagnosable from telemetry.
  let resolved: NormalizedFlashcardsInput | null = null;
  let lastDetail = '';
  for (let attempt = 1; attempt <= MAX_ACTIVITY_ATTEMPTS && !resolved; attempt++) {
    const attemptTail =
      attempt === 1
        ? tail
        : [
            tail,
            '',
            '--- RETRY NOTICE ---',
            'Your previous response had an empty or unusable `flashcards` array.',
            '`flashcards` MUST be a non-empty JSON array of { question, answer } objects.',
          ].join('\n');
    try {
      const raw = await forcedStructuredCall<unknown>({
        stage: 'flashcards',
        corpus: plan.corpus,
        staticInstructions: system,
        dynamicInstructions: attemptTail,
        anthropicTool: FLASHCARDS_FOR_SLOT_TOOL,
        userMessage: `Generate flashcards for slot "${slot.title}" — only as many as the material supports. The flashcards array must not be empty.`,
        providerOverride: plan.gemini ? 'gemini' : undefined,
        onUsage: (u) => addNormalizedUsage(plan.usage, u),
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
    // Prune-vs-fail. Thin theory legitimately supports no cards → prune the
    // activity (the theory lesson still stands) instead of failing the
    // checkpoint. Rich theory with no cards is a real failure and still throws
    // (→ retry sweep / honest status). Review slots carry no theory, so the
    // helper returns false and they fail-and-retry as before.
    if (isTheoryTooThinForFlashcards(theoryText)) {
      await recordPrunedActivity(plan, slot, 'flashcards', 'thin_theory');
      return;
    }
    throw new Error(`Flashcards generation returned no usable cards (${lastDetail})`);
  }
  const input = resolved;

  // Figure-reuse (P3): validate the model's per-card figures against the catalog
  // (drop hallucinated/duplicate refs, cap at 4), then SNAPSHOT each referenced
  // source image into a path-owned `flashcard-images/{cardId}/…` blob. Card ids
  // are pre-generated so the snapshot path is known AND the FlashcardImage rows
  // attach in the same nested create — storage I/O stays OUTSIDE the DB
  // transaction (mirrors theory figure snapshotting). A copy failure simply
  // drops that one figure; the card is still written text-only.
  const figures =
    plan.flashcardFiguresEnabled && plan.imageCatalog
      ? resolveFlashcardFigures(input.flashcards, plan.availableImages)
      : [];
  const cardIds = input.flashcards.map(() => randomUUID());
  const snappedByCard = new Map<
    number,
    { side: 'front' | 'back'; fileName: string; filePath: string; fileSize: number; mimeType: string; caption: string }[]
  >();
  for (const fig of figures) {
    try {
      const dest = `flashcard-images/${cardIds[fig.cardIndex]}/${Date.now()}-${fig.cardIndex}`;
      const { filePath, fileSize } = await copyImage(fig.image.filePath, dest);
      const list = snappedByCard.get(fig.cardIndex) ?? [];
      list.push({
        side: fig.side,
        fileName: fig.image.fileName,
        filePath,
        fileSize,
        mimeType: fig.image.mimeType,
        caption: fig.caption,
      });
      snappedByCard.set(fig.cardIndex, list);
    } catch (error) {
      logTelemetry(plan.userId, 'path.flashcards.figure_copy_failed', {
        planId: plan.id,
        slotId: slot.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Diagram reuse (Phase 3): copy the covering theory's diagrams onto the set
  // (zero AI tokens) so the viewer can show them as a reference panel. Source
  // per slot kind: learning → own theory; review → covered slots' theory.
  const diagrams = plan.diagramsEnabled ? await resolveDiagramsForSet(phase, slot) : [];

  await db.$transaction(async (tx) => {
    const set = await tx.flashcardSet.create({
      data: {
        userId: plan.userId,
        notebookId: plan.primaryNotebookId,
        // Stamp the source path so notebook list endpoints can filter it
        // out — the deck lives inside the path, not as a notebook item.
        sourcePathId: plan.id,
        title: input.title || slot.title,
        source: 'ai',
        ...(diagrams.length > 0
          ? { diagrams: diagrams as unknown as Prisma.InputJsonValue }
          : {}),
        flashcards: {
          create: input.flashcards.map((fc, i) => {
            const imgs = snappedByCard.get(i);
            return {
              id: cardIds[i],
              question: fc.question,
              answer: fc.answer,
              sortOrder: i,
              ...(imgs && imgs.length > 0
                ? {
                    images: {
                      create: imgs.map((s) => ({
                        side: s.side,
                        fileName: s.fileName,
                        filePath: s.filePath,
                        fileSize: s.fileSize,
                        mimeType: s.mimeType,
                        caption: s.caption,
                        sortOrder: 0,
                      })),
                    },
                  }
                : {}),
            };
          }),
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

async function callQuizDispatch(
  plan: PlanForGeneration,
  slotTitle: string,
  staticInstructions: string,
  dynamicInstructions: string,
): Promise<QuizForSlotToolInput> {
  return forcedStructuredCall<QuizForSlotToolInput>({
    stage: 'quiz',
    corpus: plan.corpus,
    staticInstructions,
    dynamicInstructions,
    anthropicTool: QUIZ_FOR_SLOT_TOOL,
    userMessage: `Generate the quiz for slot "${slotTitle}". The questions array must not be empty.`,
    providerOverride: plan.gemini ? 'gemini' : undefined,
    onUsage: (u) => addNormalizedUsage(plan.usage, u),
    ultra: plan.ultra,
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

/**
 * Last-resort quiz generation (plans/path-generation-reliability.md, Phase 4).
 * When the normal attempts can't produce a valid payload, retry with a
 * deliberately SIMPLER ask — lowest-drift kinds the subject allows, counts kept
 * modest — so the checkpoint yields a valid quiz instead of a hole.
 *
 * The model/tier is unchanged; only the request is degraded. Returns null if
 * even the simplified ask fails, or if the subject filter would zero the result.
 */
async function tryDegradedQuiz(
  plan: PlanForGeneration,
  slot: SlotForGeneration,
  system: string,
  baseTail: string,
): Promise<ValidatedQuizSet | null> {
  const count = slot.kind === 'final_exam' ? '8–12 questions' : '3–5 questions';

  // Prefer `mc` + `true_false` (lowest drift) but intersect with what the
  // subject allows so the degraded output passes the post-filter. If neither
  // is in the allowed set, fall back to the 2 lowest-drift allowed kinds.
  const allowed = allowedKindsForSubjects(plan.subjects);
  const allowedSet = new Set<QuestionKind>(allowed);
  const lowDriftPreferred: QuestionKind[] = ['mc', 'true_false'];
  const degradedKinds: QuestionKind[] = lowDriftPreferred.filter((k) => allowedSet.has(k));
  if (degradedKinds.length === 0) {
    // Fall back to the 2 lowest-drift allowed kinds in preference order.
    const fallbackOrder: QuestionKind[] = ['fill_blank', 'match_pairs', ...allowed];
    const seen = new Set<QuestionKind>();
    for (const k of fallbackOrder) {
      if (allowedSet.has(k) && !seen.has(k)) {
        seen.add(k);
        degradedKinds.push(k);
        if (degradedKinds.length >= 2) break;
      }
    }
  }
  if (degradedKinds.length === 0) return null;

  const degradedCatalog = quizPayloadCatalogFor(degradedKinds);
  const degradedTail = [
    baseTail,
    '',
    '--- SIMPLIFIED RETRY ---',
    'The previous attempts produced an unusable quiz. Generate a SIMPLER quiz now so the learner still gets one.',
    `Use ONLY these question kinds: ${degradedKinds.join(', ')} — no other kinds.`,
    `Produce ${count}.`,
    degradedCatalog,
  ].join('\n');
  try {
    const raw = await callQuizDispatch(plan, slot.title, system, degradedTail);
    const result = parseQuizInput(raw, slot.title);
    if (result.ok) {
      // Apply the same subject filter as the normal path.
      const filtered = result.data.questions.filter((q) => allowedSet.has(q.kind));
      if (filtered.length > 0) {
        const degradedSet = { ...result.data, questions: filtered };
        logTelemetry(plan.userId, 'path.quiz.degraded', {
          planId: plan.id,
          slotId: slot.id,
          questions: filtered.length,
          kinds: degradedKinds,
        });
        return degradedSet;
      }
    }
  } catch (error) {
    logTelemetry(plan.userId, 'path.quiz.degrade_failed', {
      planId: plan.id,
      slotId: slot.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return null;
}

async function generateQuizActivity(
  plan: PlanForGeneration,
  phase: PhaseForGeneration,
  slot: SlotForGeneration,
  nextSortOrder: number,
): Promise<void> {
  const ctx = makeSlotContentContext(plan, phase, slot);
  const { system, tail } = buildQuizPrompt(ctx);
  // Quiz model is resolver-driven (model-routing.ts): the optimized default is
  // Haiku for ALL tiers (it beat Sonnet/Flash on correctness in the audit), so
  // the old ultra→Sonnet upgrade is gone. `MODEL_COMPOSITION_LEGACY=1` restores
  // it, and `PATH_QUIZ_MODEL` pins the quiz model. `plan.ultra` is still passed
  // through callQuizDispatch (it drives the legacy upgrade + the structure tier).

  // Validate the v2 shape — the tool schema accepts a generic payload
  // object, so we Zod-check it (after normalizing common drift shapes)
  // before persisting. Retry up to MAX_ACTIVITY_ATTEMPTS, feeding the
  // failure reason back as a corrective notice each time.
  let parseResult: ValidatedQuizSet | null = null;
  let lastError = '';
  for (let attempt = 1; attempt <= MAX_ACTIVITY_ATTEMPTS && !parseResult; attempt++) {
    const attemptTail =
      attempt === 1
        ? tail
        : [
            tail,
            '',
            '--- RETRY NOTICE ---',
            `Your previous quiz was unusable: ${lastError}`,
            'Regenerate the entire quiz. The `questions` array MUST be non-empty and every question must match the exact payload shape for its kind.',
          ].join('\n');
    try {
      const raw = await callQuizDispatch(plan, slot.title, system, attemptTail);
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
    // Degrade before giving up: a simpler mc/true_false quiz beats a hole.
    parseResult = await tryDegradedQuiz(plan, slot, system, tail);
    if (!parseResult) {
      throw new Error(`Quiz generation failed: ${lastError}`);
    }
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
    const correctiveTail = [
      tail,
      '',
      '--- RETRY NOTICE ---',
      'Your previous response included questions whose `kind` is outside the allowed list for this subject. Regenerate the entire quiz.',
      `Allowed kinds (use ONLY these): ${allowedKinds.join(', ')}.`,
      'Drop any kind not on this list.',
    ].join('\n');
    try {
      const retryInput = await callQuizDispatch(plan, slot.title, system, correctiveTail);
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

  // Figure-reuse (P4): validate the model's per-question exhibits against the
  // catalog (drop hallucinated/duplicate refs, cap at 3), then SNAPSHOT each
  // referenced source image into a path-owned `quiz-images/{questionId}/…` blob.
  // Question ids are pre-generated so the snapshot path is known AND the
  // QuizQuestionImage row attaches in the same nested create — storage I/O stays
  // OUTSIDE the DB transaction (mirrors theory/flashcard figure snapshotting). A
  // copy failure simply drops that one exhibit; the question is still written.
  const figures =
    plan.quizFiguresEnabled && plan.imageCatalog
      ? resolveQuizFigures(finalQuestions, plan.availableImages)
      : [];
  const questionIds = finalQuestions.map(() => randomUUID());
  const snappedByQuestion = new Map<
    number,
    { fileName: string; filePath: string; fileSize: number; mimeType: string; caption: string; sourcePageImageId: string }
  >();
  for (const fig of figures) {
    try {
      const dest = `quiz-images/${questionIds[fig.questionIndex]}/${Date.now()}-${fig.questionIndex}`;
      const { filePath, fileSize } = await copyImage(fig.image.filePath, dest);
      snappedByQuestion.set(fig.questionIndex, {
        fileName: fig.image.fileName,
        filePath,
        fileSize,
        mimeType: fig.image.mimeType,
        caption: fig.caption,
        sourcePageImageId: fig.image.id,
      });
    } catch (error) {
      logTelemetry(plan.userId, 'path.quiz.figure_copy_failed', {
        planId: plan.id,
        slotId: slot.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Diagram reuse (Phase 3): copy the covering theory's diagrams onto the set
  // (zero AI tokens). Quizzes only occur on review/assessment/final_exam slots;
  // resolveDiagramsForSet sources review/assessment from covered learning slots
  // and skips final_exam entirely.
  const diagrams = plan.diagramsEnabled ? await resolveDiagramsForSet(phase, slot) : [];

  // Diagram cloze (Phase 5): when the set has reference diagrams, APPEND exactly
  // ONE deterministic "what's missing in this diagram?" question, built in code
  // (zero AI tokens, never LLM-emitted). buildDiagramClozeQuestion returns null
  // when no maskable element or < 3 unique distractors exist — never a degenerate
  // question. Appended AFTER the LLM questions (and after figure snapshotting, so
  // its index never collides with a snapped figure) at the tail sortOrder.
  const cloze =
    diagrams.length > 0 ? buildDiagramClozeQuestion(diagrams, plan.language) : null;
  if (cloze) {
    logTelemetry(plan.userId, 'path.quiz.diagram_cloze_built', {
      planId: plan.id,
      slotId: slot.id,
      diagramKind: cloze.payload.diagram.kind,
    });
  }
  const clozeId = randomUUID();

  await db.$transaction(async (tx) => {
    const quizSet = await tx.quizSet.create({
      data: {
        userId: plan.userId,
        notebookId: plan.primaryNotebookId,
        // See flashcard set above — keeps the quiz off the notebook's
        // flat lists while preserving the viewer's notebookId routing.
        sourcePathId: plan.id,
        title: finalTitle,
        ...(diagrams.length > 0
          ? { diagrams: diagrams as unknown as Prisma.InputJsonValue }
          : {}),
        questions: {
          create: [
            ...finalQuestions.map((q, i) => {
              const legacy = buildLegacyColumns(q.kind, q.payload);
              const snap = snappedByQuestion.get(i);
              return {
                id: questionIds[i],
                kind: q.kind,
                payload: q.payload as unknown as Prisma.InputJsonValue,
                question: q.prompt,
                options: legacy.options,
                correctIndex: legacy.correctIndex,
                hint: q.hint ?? null,
                correctExplanation: q.correctExplanation ?? null,
                wrongExplanation: q.wrongExplanation ?? null,
                sortOrder: i,
                ...(snap
                  ? {
                      image: {
                        create: {
                          fileName: snap.fileName,
                          filePath: snap.filePath,
                          fileSize: snap.fileSize,
                          mimeType: snap.mimeType,
                          caption: snap.caption,
                          sourcePageImageId: snap.sourcePageImageId,
                        },
                      },
                    }
                  : {}),
              };
            }),
            ...(cloze
              ? [
                  {
                    id: clozeId,
                    kind: cloze.kind,
                    payload: cloze.payload as unknown as Prisma.InputJsonValue,
                    question: cloze.question,
                    // Legacy MC columns mirror the payload's options/correctIndex
                    // (diagram_cloze is multiple-choice at heart), so the row is
                    // self-describing exactly like an mc row.
                    options: cloze.payload.options,
                    correctIndex: cloze.payload.correctIndex,
                    hint: null,
                    correctExplanation: null,
                    wrongExplanation: null,
                    sortOrder: finalQuestions.length,
                  },
                ]
              : []),
          ],
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
 * Thrown by the cooperative-cancel checkpoint to unwind out of the slot/sweep
 * loops the moment the user cancels a live generation. Caught in
 * {@link runPathGeneration}, which deletes the half-built path rather than
 * letting it settle to `ready`. Never escapes to {@link generatePath}'s catch,
 * so a cancel is not recorded as a `failed` generation.
 */
class PathGenerationCancelled extends Error {
  constructor() {
    super('path generation cancelled');
    this.name = 'PathGenerationCancelled';
  }
}

/**
 * Cheap status probe between checkpoints. Returns true once the row has been
 * flipped to `cancelling` (user hit Cancel — see the DELETE route) or has
 * vanished entirely (hard-deleted). Either way the orchestrator must stop:
 * continuing would keep spending tokens on a path nobody is waiting for.
 */
async function isCancelRequested(planId: string): Promise<boolean> {
  const row = await db.studyPlan.findUnique({
    where: { id: planId },
    select: { generationStatus: true },
  });
  return !row || row.generationStatus === CANCELLING_STATUS;
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
/**
 * Run ONE full Stage-B pass over the plan: generate each slot's still-missing
 * activities (skipping ones already generated or intentionally pruned), and
 * return the ids of slots that had at least one activity FAIL this pass. Token
 * usage accumulates into `plan.usage`, so the caller can carry a single meter
 * across retry sweeps. No status side effects — the caller owns final status.
 */
async function runGenerationPass(
  plan: PlanForGeneration,
  planId: string,
  progressTotal: number,
  completedSlotsBase: number,
): Promise<string[]> {
  const failedSlotIds: string[] = [];
  // Seed with work finished in earlier sweeps so the scoped progress bar keeps
  // climbing across retries instead of snapping back to 0 / N each sweep.
  let completedSlots = completedSlotsBase;

  for (const phase of plan.phases) {
    for (const slot of phase.slots) {
      // Idempotency: skip kinds the slot already has, plus kinds Stage B
      // intentionally pruned (complete-by-design). This is also what lets each
      // retry sweep — and `POST /api/learn/paths/[planId]/regenerate` — only
      // re-attempt the activities that previously failed.
      const wantedKinds = expectedActivityKinds(slot.kind);
      const missingKinds = wantedKinds.filter(
        (k) => !slot.existingActivityKinds.has(k) && !slot.prunedActivityKinds.has(k),
      );

      // Already-complete (or fully-pruned) slots aren't part of this run's
      // progress — don't count them, so a regenerate of N gaps reports against
      // those N rather than every slot in the path.
      if (missingKinds.length === 0) {
        continue;
      }

      // Cooperative cancel: bail before paying for the next checkpoint if the
      // user cancelled (status → `cancelling`) or deleted the path mid-run.
      // Unwinds via PathGenerationCancelled so runPathGeneration can clean up.
      if (await isCancelRequested(planId)) {
        throw new PathGenerationCancelled();
      }

      await writeProgress(planId, {
        totalSlots: progressTotal,
        completedSlots,
        currentSlot: { id: slot.id, title: slot.title },
        currentActivity: missingKinds[0],
      });

      // Continue numbering after any pre-existing activities so the slot's
      // sortOrder stays monotonically increasing across runs.
      const sortOrderBase = slot.existingActivityKinds.size;
      const sortOrderByKind = new Map<PathActivityKind, number>(
        missingKinds.map((kind, i) => [kind, sortOrderBase + i]),
      );

      const recordFailure = (kind: PathActivityKind, reason: unknown) => {
        const message = reason instanceof Error ? reason.message : String(reason);
        failedSlotIds.push(slot.id);
        logTelemetry(plan.userId, 'path.generation.activity_failed', {
          planId,
          slotId: slot.id,
          activityKind: kind,
          message,
        });
      };

      // Snapshot the failure count BEFORE this slot's work so we can tell, after,
      // whether every missing activity succeeded. Only fully-succeeded slots may
      // advance the counter — otherwise the end-of-pass count would include
      // failed slots while the next sweep's seed (progressTotal − still-pending)
      // excludes them, dipping the bar backward at the sweep boundary.
      const failuresBefore = failedSlotIds.length;

      // Theory first, so a learning slot's flashcards are built from the exact
      // text the learner just read instead of the bare topic hint — that keeps
      // the card count honest and stops the model padding with repeats. Theory
      // and flashcards only co-occur on `learning` slots; review/assessment
      // slots have no theory, so this adds no extra latency there.
      let theoryText: string | undefined;
      if (missingKinds.includes('theory')) {
        try {
          theoryText = await generateTheoryActivity(
            plan,
            phase,
            slot,
            sortOrderByKind.get('theory')!,
          );
        } catch (err) {
          recordFailure('theory', err);
        }
      }

      // The remaining activities are independent — fire them in parallel with
      // allSettled so one failure doesn't take down the others.
      const parallelKinds = missingKinds.filter((kind) => kind !== 'theory');
      const results = await Promise.allSettled(
        parallelKinds.map((kind) => {
          const sortOrder = sortOrderByKind.get(kind)!;
          if (kind === 'flashcards')
            return generateFlashcardsActivity(plan, phase, slot, sortOrder, theoryText);
          return generateQuizActivity(plan, phase, slot, sortOrder);
        }),
      );
      results.forEach((res, i) => {
        if (res.status === 'rejected') {
          recordFailure(parallelKinds[i], res.reason);
        }
      });

      // A slot only counts toward progress when every missing activity landed.
      // (writeProgress still runs on failure so the "writing …" caption clears.)
      const slotSucceeded = failedSlotIds.length === failuresBefore;
      if (slotSucceeded) {
        completedSlots += 1;
      }
      await writeProgress(planId, {
        totalSlots: progressTotal,
        completedSlots,
        currentSlot: null,
        currentActivity: null,
      });
      if (slotSucceeded) {
        logTelemetry(plan.userId, 'path.generation.slot_completed', {
          planId,
          slotId: slot.id,
          slotIndex: completedSlots,
          totalSlots: progressTotal,
        });
      }
    }
  }

  return failedSlotIds;
}

async function runPathGeneration(
  planId: string,
  opts: { allowRefund?: boolean } = {},
): Promise<void> {
  let plan = await loadPlanForGeneration(planId);
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

  // One token meter shared across every sweep so cost telemetry stays accurate
  // even though we re-load the plan between sweeps to refresh which activities
  // still need work.
  const usage = plan.usage;
  const extraSweeps = plan.ultra ? PATH_RETRY_SWEEPS_ULTRA : PATH_RETRY_SWEEPS_BASIC;

  // Scope the streamed progress to checkpoints that actually need work this run
  // (== total on a fresh create; only the failed ones on a regenerate). Held
  // stable across retry sweeps so the bar doesn't reset its denominator.
  const progressTotal = pendingSlotCount(plan);

  let failedSlotIds: string[] = [];
  try {
    for (let sweep = 0; sweep <= extraSweeps; sweep++) {
      if (sweep > 0) {
        // Re-load so the existing/pruned activity sets reflect the prior pass,
        // then carry the accumulated usage forward into the fresh plan object.
        const fresh = await loadPlanForGeneration(planId);
        if (!fresh) break;
        fresh.usage = usage;
        plan = fresh;
        logTelemetry(plan.userId, 'path.generation.sweep', {
          planId,
          sweep,
          retryingSlots: new Set(failedSlotIds).size,
        });
      }
      // Slots already finished in prior sweeps (progressTotal minus what's still
      // pending now) seed this sweep's counter, so progress advances monotonically.
      const completedSlotsBase = progressTotal - pendingSlotCount(plan);
      failedSlotIds = await runGenerationPass(plan, planId, progressTotal, completedSlotsBase);
      if (failedSlotIds.length === 0) break;
    }
  } catch (error) {
    if (error instanceof PathGenerationCancelled) {
      // User cancelled a live generation. The writer has stopped, so deleting
      // now captures every row it created — no orphans. The credit refund (and
      // its per-day cap) is owned by the DELETE route at cancel time, not here —
      // the route can answer the user synchronously, and keeping it there means
      // a single, daily-capped refund instead of one per code path.
      await deletePathCascade(planId).catch((e) =>
        console.error('[path-generator] cancel cleanup failed', e),
      );
      logTelemetry(plan.userId, 'path.generation.cancelled', { planId });
      return;
    }
    throw error;
  }

  // Reserve-and-settle: if an ULTRA path produced NOTHING after every sweep,
  // refund the credit it reserved at creation — a worthless empty path must not
  // cost one of the user's 3 monthly ultra credits. Strict by design (zero
  // generated activities) so it can't be farmed: a refundable path has no usable
  // content. `allowRefund` is set only by the create flow, so the free
  // regenerate path can never re-trigger it (idempotent in practice).
  if (opts.allowRefund && plan.ultra) {
    const generatedCount = await db.checkpointActivity.count({
      where: { slot: { phase: { planId } } },
    });
    if (generatedCount === 0) {
      await refundUsage(plan.userId, 'ultra_path');
      logTelemetry(plan.userId, 'path.credit.refunded', {
        planId,
        feature: 'ultra_path',
        reason: 'total_generation_failure',
      });
    }
  }

  // Stage B always finishes `ready`: incomplete checkpoints never block the
  // path (path-gating treats them as passable) and surface their own
  // Regenerate affordance. `failed` is reserved for catastrophic failure.
  // (Phase 5 will branch the terminal status on any remaining failures.)
  //
  // Guarded so a cancel that landed AFTER our last checkpoint but BEFORE this
  // write can't be resurrected: only flip `generating` → `ready`. If the row was
  // flipped to `cancelling` in that window, honor the cancel and delete it (the
  // DELETE route already refunded) instead of shipping a path the user discarded.
  const settled = await db.studyPlan.updateMany({
    where: { id: planId, generationStatus: 'generating' },
    data: { generationStatus: 'ready', generationError: null },
  });
  if (settled.count === 0) {
    const current = await db.studyPlan.findUnique({
      where: { id: planId },
      select: { generationStatus: true },
    });
    if (current?.generationStatus === CANCELLING_STATUS) {
      await deletePathCascade(planId).catch((e) =>
        console.error('[path-generator] post-complete cancel cleanup failed', e),
      );
      logTelemetry(plan.userId, 'path.generation.cancelled', { planId, race: 'post_complete' });
    }
    return;
  }
  logTelemetry(plan.userId, 'path.generation.completed', {
    planId,
    totalSlots: total,
    failedActivities: failedSlotIds.length,
    failedSlots: new Set(failedSlotIds).size,
    ultra: plan.ultra,
    usage,
    cost: computeCost(usage.perModel),
  });
  reportMeterUsage(usage, 'path-generate', plan.userId);
}

/**
 * Public Stage-B entry point. Thin wrapper over {@link runPathGeneration} that
 * guarantees a catastrophic throw is recorded as `generationStatus: 'failed'`
 * instead of leaving the row stuck in `generating` forever — regenerate, reset
 * AND delete all refuse a `generating` row, so a swallowed throw bricks the
 * path with no in-app recourse. (Mirrors `translatePath`'s contract.) NB: a
 * killed *process* — e.g. a redeploy mid-run — never reaches this catch; the
 * stale-`generating` escape hatch in those routes covers that case.
 */
export async function generatePath(
  planId: string,
  opts: { allowRefund?: boolean } = {},
): Promise<void> {
  try {
    await runPathGeneration(planId, opts);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[path-generator] generation failed', message);
    await db.studyPlan
      .update({
        where: { id: planId },
        data: { generationStatus: 'failed', generationError: `Generation failed: ${message}` },
      })
      .catch((e) => console.error('[path-generator] failed to mark plan failed', e));
  }
}
