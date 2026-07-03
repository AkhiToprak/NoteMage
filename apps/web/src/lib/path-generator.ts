// Phase 10.2 — guided path generation orchestrator.
//
// Two-stage pipeline:
//
//   Stage A — `generatePathStructure(opts)`
//     One AI call returns the curriculum spine (sections + slots). Pure
//     function: NO database writes. Phase 10.3's `POST /api/learn/paths`
//     persists the plan + empty slots transactionally and then queues
//     Stage B as a durable background job.
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
  type PathAssessmentSpec,
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
  PATH_QUIZ_PROMPT_VERSION,
  type PathStructureContext,
  type SlotContentContext,
} from './path-prompts';
import { forcedStructuredCall, type NormalizedUsage, type Provider } from './path-generator-routing';
import { computeCost, type ModelUsage } from './path-generator-cost';
import {
  loadMaterialCorpus,
  renderMaterialCorpus,
  buildSourceIdentityIndex,
  resolveSourceIdentity,
  type SourceMaterialRef,
} from './path-corpus';
import { pathContentCap } from './path-corpus-fit';
import {
  loadSourceImages,
  captionMissing,
  renderImageCatalog,
  resolveFlashcardFigures,
  resolveQuizFigures,
  refOf,
  type SourceImage,
  type FigureRejection,
  type FigureResolution,
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
  type QuizQuestionV2,
  type TheorySection,
  type PathDiagram,
  type DiagramClozePayload,
} from '@notemage/shared';
import { randomUUID } from 'crypto';
import type { ZodError } from 'zod';
import { generateWithRepair } from './generate-with-repair';
import { createSemaphore } from './concurrency';
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
  safeParseQuizQuestions,
  runSemanticChecks,
  type NormalizedFlashcardsInput,
} from './path-generator-normalize';
import { allowedKindsForSubjects, coerceSubjectIds, type SubjectId } from './path-subjects';
import {
  expectedActivityKinds,
  isTheoryTooThinForFlashcards,
  type PathActivityKind,
} from './path-slot-activities';
import { normalizePathLanguage, type PathLanguageCode } from './path-languages';
import { CANCELLING_STATUS, deletePathCascade } from './path-loader';
import { invalidateDashboardCache } from './dashboard-data';
import { weaknessConceptsEnabled } from './feature-flags';
import { verifiedSourceAnchor } from './source-grounding';
import { attachConceptTags } from './concept-write';
import { resolveModel } from './model-routing';
import { LEARNING_SLOT_BATCH_TOOL } from './ai-tools';
import { buildLearningBatchPrompt } from './path-prompts';
import { isLearningBatchEnabled, splitLearningBatchPayload } from './path-learning-batch';
import {
  applyQuizVerification,
  shouldVerifyQuiz,
  verifyQuiz,
  type QuizVerificationResult,
} from './quiz-verifier';

// ─────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────

export interface GeneratePathStructureOpts {
  /** Owning user, or `null` for the anonymous onboarding preview (no real user
   *  yet). Drives telemetry + the AiUsageEvent row; null persists cleanly
   *  (AiUsageEvent.userId is nullable, no FK). */
  userId: string | null;
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
  /**
   * PREVIEW mode (onboarding-real-generation P2). When set, generate a SHORT
   * taster: the Stage A prompt is bounded to a single section of ~`previewMaxSlots`
   * learning slots, the result is trimmed to one phase capped at that many raw
   * slots BEFORE `enforceSpacedReviews` interleaves the review + assessment, and
   * model routing goes through the `path-preview` feature (Sonnet by default,
   * D4) rather than the cheap full-path structure model. Omit for the full path.
   */
  previewMaxSlots?: number;
  /**
   * Override the feature tag on the AiUsageEvent + telemetry this call records
   * (default `'path-structure'`). The anonymous preview passes `'path-preview'`
   * so its Stage-A spend is rolled up with the rest of the preview's calls
   * rather than masquerading as a full-path structure call.
   */
  usageFeature?: string;
}

export type GeneratedPathStructure = PathStructureToolInput;

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Compact a ZodError into a few `path: message` clauses instead of the full
 * multi-hundred-token `.message`. A specific, structured diagnostic drives far
 * better self-repair than a vague "invalid" (research: specific errors repair
 * ~77% vs ~45% for vague), and it keeps the corrective prompt cheap.
 */
function formatZodError(error: ZodError): string {
  const issues = error.issues.slice(0, 4).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
    return `${path}: ${issue.message}`;
  });
  const extra = error.issues.length > 4 ? ` (+${error.issues.length - 4} more)` : '';
  return issues.join('; ') + extra;
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

// How many slots a single generation pass works on concurrently. Slots are
// independent except for the learning→review content dependency, which the
// two-wave-per-phase ordering already enforces — so this just bounds how many
// run at once (and thus peak in-flight OpenRouter calls). Default 5 (≈4× faster
// than serial on a 14-slot path while staying within typical rate limits); set
// PATH_GENERATION_CONCURRENCY=1 to revert to fully serial behavior.
const PATH_SLOT_CONCURRENCY = Math.max(
  1,
  Number(process.env.PATH_GENERATION_CONCURRENCY ?? '5') || 5,
);

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
  byProvider: { anthropic: number; gemini: number; openrouter: number };
}

function emptyMeter(): UsageMeter {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    perModel: {},
    byProvider: { anthropic: 0, gemini: 0, openrouter: 0 },
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
    costUsdExact: 0,
  };
  m.calls += 1;
  m.inputTokens += u.inputTokens;
  m.outputTokens += u.outputTokens;
  m.cacheReadTokens += u.cacheReadTokens;
  m.cacheWriteTokens += u.cacheWriteTokens;
  // OpenRouter returns the real billed USD inline; accumulate it so the ledger
  // records exact cost instead of re-deriving from the approximate rate table.
  m.costUsdExact += u.costUsd ?? 0;
  meter.perModel[u.model] = m;
  meter.byProvider[u.provider] += 1;
}

/** Derive the billing provider from a model id (for the per-model ledger rows).
 *  GLM (`z-ai/glm-*`) and DeepSeek (`deepseek/*`) route via OpenRouter; Gemini
 *  ids start with `gemini`; everything else is Anthropic. */
function providerOfModel(model: string): Provider {
  if (model.startsWith('gemini')) return 'gemini';
  if (model.startsWith('z-ai/') || model.includes('glm')) return 'openrouter';
  if (model.startsWith('deepseek/')) return 'openrouter';
  return 'anthropic';
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
      provider: providerOfModel(m.model),
      model: m.model,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      cacheReadTokens: m.cacheReadTokens,
      cacheWriteTokens: m.cacheWriteTokens,
      // Prefer OpenRouter's exact billed amount; logAiUsage falls back to the
      // derived rate when this is undefined (Anthropic/Gemini paths).
      costUsd: m.costUsdExact > 0 ? m.costUsdExact : undefined,
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
  visuals?: TheoryVisuals
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
export function theoryPlainText(input: TheoryCore): string {
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
  opts: GeneratePathStructureOpts
): Promise<GeneratedPathStructure> {
  const preview = typeof opts.previewMaxSlots === 'number' && opts.previewMaxSlots > 0;
  const ctx: PathStructureContext = {
    title: opts.title,
    brief: opts.brief,
    hasSourceMaterials: Boolean(opts.corpus && opts.corpus.trim().length > 0),
    subjects: opts.subjects,
    subjectWeights: opts.subjectWeights,
    language: opts.language ?? 'en',
    maxNodes: preview ? opts.previewMaxSlots : undefined,
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
        // Preview routes Stage A through `path-preview` (Sonnet); the full path
        // keeps the cheap `path-structure` model. Provider override (plan.gemini)
        // still wins inside the resolver.
        featureOverride: preview ? 'path-preview' : undefined,
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

  // Preview: hard-cap to a single short section BEFORE enforcement. The model is
  // already asked for a tight section, but trim defensively so a cheap model that
  // over-produces can't blow the node budget. enforceSpacedReviews then adds the
  // review + trailing assessment, landing the final count ~previewMaxSlots + 2.
  if (preview) {
    trimStructureForPreview(structure, opts.previewMaxSlots as number);
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
  reportMeterUsage(meter, opts.usageFeature ?? 'path-structure', opts.userId);
  return structure;
}

type StructureSlot = GeneratedPathStructure['phases'][number]['slots'][number];

/**
 * Preview-mode (onboarding) structure trim. Keep only the first section and cap
 * its slots at `maxSlots`, dropping a trailing model-authored `assessment` from
 * the kept window so `enforceSpacedReviews` re-synthesizes a clean one over the
 * surviving learning slots (its `covers` indices are recomputed there anyway).
 * Pure node-count guard — runs BEFORE enforcement.
 */
function trimStructureForPreview(structure: GeneratedPathStructure, maxSlots: number): void {
  if (structure.phases.length === 0) return;
  structure.phases = structure.phases.slice(0, 1);
  const phase = structure.phases[0];
  const cap = Math.max(1, maxSlots);
  if (phase.slots.length > cap) {
    phase.slots = phase.slots.slice(0, cap);
  }
  // If trimming left the section ending on an `assessment`, drop it — a short
  // preview wants its learning slots; enforceSpacedReviews adds the checkpoint.
  while (phase.slots.length > 1 && phase.slots[phase.slots.length - 1].kind === 'assessment') {
    phase.slots = phase.slots.slice(0, -1);
  }
}

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
        const titles = covered.map((i) => rebuilt[i]?.title).filter((t): t is string => Boolean(t));
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
  /** Stage A's structured assessment blueprint. */
  assessmentSpec: PathAssessmentSpec | null;
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
   * Source-highlighting feature — corpus titles indexed to their origin
   * Page/Document id, so each activity's persistence step can resolve a
   * model-emitted `source.label` to a stable material reference. Null when no
   * materials are loaded.
   */
  sourceIndex: Map<string, SourceMaterialRef> | null;
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
  /** Source images available to the generator after ranking/selection. */
  sourceImageCount: number;
  /** Of those, how many were captioned and rendered into the prompt catalog. */
  catalogImageCount: number;
  /** Set when figures were skipped wholesale at build time (figure-reuse P5). */
  figuresSkippedReason: string | null;
  /** Cross-sweep figure telemetry accumulator, attached by runPathGeneration. */
  figureStats?: FigureStats;
  /** OpenRouter sticky-routing token for this run, attached by runPathGeneration
   *  AFTER load (loadPlanForGeneration doesn't know the run). Every Stage B
   *  forcedStructuredCall reads it so all of a run's GLM calls + sweeps land on
   *  the same upstream → reliable corpus prefix-cache hits. */
  sessionId?: string;
  phases: PhaseForGeneration[];
}

/**
 * Cross-sweep accumulator for the figure-reuse pipeline (figure-reuse P4). One
 * instance per generation, re-attached to the plan after every retry-sweep
 * reload, then written to PathGenerationTelemetry at the end. Mutated by the
 * theory/flashcard/quiz activities; never affects generation outcome.
 */
interface FigureStats {
  sourceImageCount: number;
  catalogImageCount: number;
  requestedRefs: number;
  acceptedRefs: number;
  rejectedRefs: number;
  rejections: { ref: string | null; reason: string }[];
  snapshotCount: number;
  theoryImageCount: number;
  flashcardImageCount: number;
  quizImageCount: number;
  skippedReason: string | null;
}

/** Bound the persisted rejection list so a figure-spam path can't bloat JSON. */
const MAX_TRACKED_REJECTIONS = 50;

function makeFigureStats(): FigureStats {
  return {
    sourceImageCount: 0,
    catalogImageCount: 0,
    requestedRefs: 0,
    acceptedRefs: 0,
    rejectedRefs: 0,
    rejections: [],
    snapshotCount: 0,
    theoryImageCount: 0,
    flashcardImageCount: 0,
    quizImageCount: 0,
    skippedReason: null,
  };
}

// Source-highlighting feature — the persisted anchor columns for one content
// item (theory / flashcard / quiz question). All six default to null.
interface AnchorColumns {
  sourceLabel: string | null;
  sourcePage: number | null;
  sourceQuote: string | null;
  sourceMaterialId: string | null;
  sourceMaterialKind: string | null;
  sourceTimestampSec: number | null;
}

const EMPTY_ANCHOR: AnchorColumns = {
  sourceLabel: null,
  sourcePage: null,
  sourceQuote: null,
  sourceMaterialId: null,
  sourceMaterialKind: null,
  sourceTimestampSec: null,
};

/**
 * Validate a model-emitted `source` anchor and resolve it to persisted columns.
 * `quote` is the load-bearing field — a malformed or quote-less anchor yields the
 * empty (all-null) columns so the item falls back to the path-level source / Mage.
 * Identity (materialId/Kind) is resolved server-side from the corpus index — the
 * model never echoes an id. Never throws: a bad anchor must not fail an item.
 */
function anchorColumns(
  rawSource: unknown,
  sourceIndex: Map<string, SourceMaterialRef> | null | undefined,
  corpus: string | null | undefined,
): AnchorColumns {
  if (rawSource == null) return EMPTY_ANCHOR;
  const src = verifiedSourceAnchor(rawSource, corpus);
  if (!src) return EMPTY_ANCHOR;
  const ref = resolveSourceIdentity(sourceIndex, src.label);
  return {
    sourceLabel: src.label ?? null,
    sourcePage: src.page ?? null,
    sourceQuote: src.quote,
    sourceMaterialId: ref?.materialId ?? null,
    sourceMaterialKind: ref?.materialKind ?? null,
    sourceTimestampSec: src.timestampSec ?? null,
  };
}

/** Re-bind the accumulator to a (re)loaded plan, refreshing the per-build
 *  counts the build step computed. */
function attachFigureStats(plan: PlanForGeneration, stats: FigureStats): void {
  stats.sourceImageCount = plan.sourceImageCount;
  stats.catalogImageCount = plan.catalogImageCount;
  stats.skippedReason = plan.figuresSkippedReason;
  plan.figureStats = stats;
}

/** Fold one resolver result into the plan's accumulator (no-op if unattached). */
function recordFigureResolution(
  plan: PlanForGeneration,
  resolution: FigureResolution<unknown>
): void {
  const s = plan.figureStats;
  if (!s) return;
  s.requestedRefs += resolution.accepted.length + resolution.rejected.length;
  s.acceptedRefs += resolution.accepted.length;
  s.rejectedRefs += resolution.rejected.length;
  for (const r of resolution.rejected) {
    if (s.rejections.length >= MAX_TRACKED_REJECTIONS) break;
    s.rejections.push({ ref: r.ref, reason: r.reason });
  }
}

/**
 * The corpus-derived artifacts that are STABLE for the life of one
 * runPathGeneration (materialIds don't change between sweeps). Typed as a `Pick`
 * of PlanForGeneration — NOT a standalone struct — so that if a new
 * corpus-derived field is ever added to PlanForGeneration, this cache and
 * buildCorpusCache's return both fail to compile until it's accounted for
 * (preventing a silently-stale cached value).
 */
type RunCorpusCache = Pick<
  PlanForGeneration,
  | 'corpus'
  | 'sourceIndex'
  | 'imageCatalog'
  | 'availableImages'
  | 'sourceImageCount'
  | 'catalogImageCount'
  | 'figuresSkippedReason'
  | 'theoryFiguresEnabled'
  | 'flashcardFiguresEnabled'
  | 'quizFiguresEnabled'
  | 'diagramsEnabled'
>;

/**
 * Build the run-stable corpus + image catalog ONCE (lifted out of
 * loadPlanForGeneration so sweeps can reuse it). Rebuilds the same material
 * corpus Stage A used so every Stage B activity is grounded in the learner's
 * content; if a material was deleted since creation, loadMaterialCorpus returns
 * null and generation proceeds without it rather than aborting.
 *
 * Theory visuals: diagrams + figures are all-tiers. Captions are pre-warmed at
 * import (P1), so captionMissing only heals pre-feature/OneNote/sweep-killed gaps
 * — and because it writes captions to the DB, the cache means it runs at most
 * once per run. The whole figure build is best-effort: any failure leaves the
 * catalog null and figures are simply never offered (a path never fails over
 * visuals).
 */
async function buildCorpusCache(args: {
  userId: string;
  materialIds: string[];
  ultra: boolean;
  planId: string;
  title: string;
  subjectLabels: SubjectId[];
}): Promise<RunCorpusCache> {
  const { userId, materialIds, ultra, planId, title, subjectLabels } = args;
  const corpusEntries = await loadMaterialCorpus(userId, materialIds);
  const corpus = corpusEntries
    ? renderMaterialCorpus(corpusEntries, pathContentCap(ultra))
    : null;
  // Source-highlighting — index the corpus by title so each activity's persistence
  // can resolve a model-emitted `source.label` to its origin Page/Document id.
  const sourceIndex = corpusEntries ? buildSourceIdentityIndex(corpusEntries) : null;

  const diagramsEnabled = process.env.PATH_THEORY_DIAGRAMS_DISABLED !== '1';
  const theoryFiguresEnabled = process.env.PATH_THEORY_FIGURES_DISABLED !== '1';
  const flashcardFiguresEnabled = process.env.PATH_FLASHCARD_FIGURES_DISABLED !== '1';
  const quizFiguresEnabled = process.env.PATH_QUIZ_FIGURES_DISABLED !== '1';
  let imageCatalog: string | null = null;
  let availableImages: SourceImage[] = [];
  let figuresSkippedReason: string | null = null;
  if (theoryFiguresEnabled || flashcardFiguresEnabled || quizFiguresEnabled) {
    try {
      availableImages = await loadSourceImages(userId, materialIds, {
        planId,
        title,
        subjectLabels,
      });
      if (availableImages.length === 0) {
        figuresSkippedReason = 'no_source_images';
      } else {
        await captionMissing(availableImages, { userId });
        const rendered = renderImageCatalog(availableImages);
        if (rendered.length > 0) {
          imageCatalog = rendered;
        } else {
          figuresSkippedReason = 'no_catalog_captions';
        }
      }
    } catch (error) {
      logTelemetry(userId, 'path.theory.image_catalog_failed', {
        planId,
        message: error instanceof Error ? error.message : String(error),
      });
      imageCatalog = null;
      availableImages = [];
      figuresSkippedReason = 'catalog_build_failed';
    }
    if (figuresSkippedReason) {
      logTelemetry(userId, 'path.figures.skipped', { planId, reason: figuresSkippedReason });
    }
  }
  const catalogImageCount = availableImages.filter(
    (i) => i.caption && i.caption.trim().length > 0
  ).length;

  return {
    corpus,
    sourceIndex,
    imageCatalog,
    availableImages,
    sourceImageCount: availableImages.length,
    catalogImageCount,
    figuresSkippedReason,
    theoryFiguresEnabled,
    flashcardFiguresEnabled,
    quizFiguresEnabled,
    diagramsEnabled,
  };
}

/**
 * Load a plan into the orchestrator's working shape. Returns null if the
 * plan doesn't exist (caller should treat as a no-op). Pass `corpusCache` on
 * sweep reloads to reuse the run-stable corpus instead of rebuilding it.
 */
async function loadPlanForGeneration(
  planId: string,
  corpusCache?: RunCorpusCache,
): Promise<PlanForGeneration | null> {
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
  const resolvedWeights: number[] = subjects.length > 0 ? subjectWeights : [1];

  // Corpus + image catalog are STABLE for the life of a run (materialIds are
  // fixed), so runPathGeneration builds them ONCE and passes the cache into every
  // sweep reload — eliminating 1–3 redundant corpus re-renders + DB reads (and
  // any repeat captionMissing work) per path. On the first load there's no cache,
  // so we build it here. See buildCorpusCache for the lifted body.
  const cc = corpusCache ?? (await buildCorpusCache({
    userId: plan.userId,
    materialIds: plan.materialIds,
    ultra: plan.ultra,
    planId: plan.id,
    title: plan.title,
    subjectLabels: resolvedSubjects,
  }));

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
    ...cc,
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
        assessmentSpec: readAssessmentSpec(s.assessmentSpec),
        sortOrder: s.sortOrder,
        coversSlotIds: Array.isArray(s.coversSlotIds) ? s.coversSlotIds : [],
        existingActivityKinds: new Set(
          s.activities
            .map((a) => a.kind)
            .filter(
              (k): k is 'theory' | 'flashcards' | 'quiz' =>
                k === 'theory' || k === 'flashcards' || k === 'quiz'
            )
        ),
        prunedActivityKinds: new Set(
          (Array.isArray(s.prunedActivityKinds) ? s.prunedActivityKinds : []).filter(
            (k): k is 'theory' | 'flashcards' | 'quiz' =>
              k === 'theory' || k === 'flashcards' || k === 'quiz'
          )
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
        (k) => !slot.existingActivityKinds.has(k) && !slot.prunedActivityKinds.has(k)
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
  theoryText?: string
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
    assessmentSpec: slot.assessmentSpec ?? undefined,
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

function readAssessmentSpec(value: Prisma.JsonValue | null): PathAssessmentSpec | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const spec = value as Record<string, unknown>;
  const knowledgeType = spec.knowledgeType;
  const learnerAction = spec.learnerAction;
  const evidence = spec.evidence;
  const difficulty = spec.difficulty;
  const transfer = spec.transfer;
  if (
    typeof knowledgeType !== 'string' ||
    !['factual', 'conceptual', 'procedural', 'metacognitive'].includes(knowledgeType) ||
    typeof learnerAction !== 'string' ||
    typeof evidence !== 'string' ||
    typeof difficulty !== 'string' ||
    !['foundational', 'standard', 'stretch'].includes(difficulty) ||
    typeof transfer !== 'string' ||
    !['near', 'mixed', 'far'].includes(transfer)
  ) {
    return null;
  }
  const commonErrors = Array.isArray(spec.commonErrors)
    ? spec.commonErrors.filter((v): v is string => typeof v === 'string').slice(0, 3)
    : undefined;
  return {
    knowledgeType: knowledgeType as PathAssessmentSpec['knowledgeType'],
    learnerAction,
    evidence,
    difficulty: difficulty as PathAssessmentSpec['difficulty'],
    transfer: transfer as PathAssessmentSpec['transfer'],
    ...(commonErrors && commonErrors.length > 0 ? { commonErrors } : {}),
    ...(typeof spec.scoringRule === 'string' ? { scoringRule: spec.scoringRule } : {}),
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
  available: SourceImage[]
): FigureResolution<{ image: SourceImage; caption: string }> {
  const accepted: { image: SourceImage; caption: string }[] = [];
  const rejected: FigureRejection[] = [];
  if (!Array.isArray(rawFigures)) return { accepted, rejected };
  const byId = new Map(available.map((img) => [img.id, img]));
  const seen = new Set<string>();
  for (let i = 0; i < rawFigures.length; i++) {
    const raw = rawFigures[i];
    const parsed = TheoryFigureSchema.safeParse(raw);
    if (!parsed.success) {
      rejected.push({ index: i, ref: refOf(raw), reason: 'schema_invalid' });
      continue;
    }
    const img = byId.get(parsed.data.imageRef);
    if (!img) {
      rejected.push({ index: i, ref: parsed.data.imageRef, reason: 'unknown_ref' });
      continue;
    }
    if (seen.has(img.id)) {
      rejected.push({ index: i, ref: parsed.data.imageRef, reason: 'duplicate' });
      continue;
    }
    if (accepted.length >= 3) {
      rejected.push({ index: i, ref: parsed.data.imageRef, reason: 'cap_exceeded' });
      continue;
    }
    seen.add(img.id);
    accepted.push({ image: img, caption: parsed.data.caption });
  }
  return { accepted, rejected };
}

/**
 * Validate each diagram with the strict per-kind schema and drop the invalid
 * ones (never fail the theory over a bad diagram). Capped at 2. When `meta` is
 * supplied, emits one aggregated telemetry event per slot so silent drops
 * become visible in prod (the optional param keeps unit calls one-arg).
 */
export function resolveDiagrams(
  rawDiagrams: unknown,
  meta?: { userId: string | null; planId: string; slotId: string }
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
  language: PathLanguageCode
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
  slot: SlotForGeneration
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
  nextSortOrder: number
): Promise<string> {
  const ctx = makeSlotContentContext(plan, phase, slot);
  const { system, tail } = buildTheoryPrompt(ctx);

  // Validate-and-repair (generateWithRepair: call → validate → re-call once with
  // the SPECIFIC error folded back as a CoT-repair notice). `examples` are
  // optional in the schema, so a valid-but-example-less section is kept as a
  // fallback and we ask ONCE more for an example (theoryInputToTipTap renders
  // fine without one) — never a hard failure. The sweep (runGenerationPass) is
  // the OUTER net; this is the inner repair — distinct layers, not collapsed.
  // Source-highlighting: the raw `source` anchor is captured off the normalized
  // input (schema parse strips it) inside parse.
  let rawTheorySource: unknown = null;
  let exampleLess: TheorySection | null = null;
  const outcome = await generateWithRepair<TheorySection>({
    call: (corrective) =>
      forcedStructuredCall<unknown>({
        stage: 'theory',
        corpus: plan.corpus,
        staticInstructions: system,
        dynamicInstructions: corrective
          ? [
              tail,
              '',
              '--- REPAIR NOTICE ---',
              'Your previous theory section was rejected. Output only the corrected structured response.',
              `Error: ${corrective}`,
            ].join('\n')
          : tail,
        anthropicTool: THEORY_SECTION_TOOL,
        userMessage: `Write the theory section for slot "${slot.title}".`,
        providerOverride: plan.gemini ? 'gemini' : undefined,
        sessionId: plan.sessionId,
        onUsage: (u) => addNormalizedUsage(plan.usage, u),
      }),
    parse: (raw) => {
      const normalized = normalizeTheoryInput(raw);
      const parsed = TheorySectionSchema.safeParse(normalized);
      if (!parsed.success) {
        logTelemetry(plan.userId, 'path.theory.retry', {
          planId: plan.id,
          slotId: slot.id,
          reason: 'validation_failed',
        });
        return { ok: false, error: formatZodError(parsed.error) };
      }
      rawTheorySource = normalized.source ?? null;
      if (parsed.data.examples.length === 0) {
        exampleLess = parsed.data;
        logTelemetry(plan.userId, 'path.theory.retry', {
          planId: plan.id,
          slotId: slot.id,
          reason: 'no_examples',
        });
        return {
          ok: false,
          error: '`examples` MUST be a non-empty JSON array of { label, explanation } objects.',
        };
      }
      return { ok: true, data: parsed.data };
    },
  });

  // Accept an example-less section rather than failing the checkpoint.
  const resolved = outcome.data ?? exampleLess;
  if (!resolved) {
    throw new Error(`Theory generation failed: ${outcome.lastError}`);
  }

  return persistTheoryActivity(plan, slot, nextSortOrder, resolved, rawTheorySource);
}

/**
 * Path-gen Phase 8 (flag-gated PATH_LEARNING_BATCH) — the validate-and-persist
 * tail of theory generation, factored out of {@link generateTheoryActivity} so
 * BOTH the unbatched path (a single `create_theory_section` call, via
 * `generateWithRepair` above) and the batched path
 * ({@link generateLearningSlotBatch}, one `learning_slot_content` call) run
 * through the EXACT SAME persist code once a validated `TheorySection` is in
 * hand — this function has no knowledge of which call shape produced
 * `resolved`. Unchanged body from the pre-Phase-8 `generateTheoryActivity`;
 * only lifted out and parameterized on `resolved` / `rawTheorySource` instead
 * of closing over the repair-loop's `outcome/exampleLess` locals.
 */
async function persistTheoryActivity(
  plan: PlanForGeneration,
  slot: SlotForGeneration,
  nextSortOrder: number,
  resolved: TheorySection,
  rawTheorySource: unknown
): Promise<string> {
  // Theory visuals — validate the model's figures (drop hallucinated refs) and
  // diagrams (drop per-kind-invalid), then snapshot referenced source images
  // into path-owned blobs and emit pathImage / pathDiagram nodes.
  const figRes =
    plan.theoryFiguresEnabled && plan.imageCatalog
      ? resolveFigures(resolved.figures, plan.availableImages)
      : { accepted: [], rejected: [] };
  recordFigureResolution(plan, figRes);
  const figures = figRes.accepted;
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
  if (plan.figureStats) {
    plan.figureStats.snapshotCount += snapped.length;
    plan.figureStats.theoryImageCount += snapped.length;
  }

  // pathImage `ref` is the TheoryImage.sortOrder (= index of the snapshot).
  const figureNodes = snapped.map((s, i) => ({ ref: i, alt: s.caption }));
  const body = theoryInputToTipTap(resolved, plan.language, {
    figures: figureNodes,
    diagrams,
  });

  // Source-highlighting — resolve the lesson's primary anchor (corpus-resolved
  // identity + quote + media seek). All-null when the section wasn't grounded.
  const theoryAnchor = anchorColumns(rawTheorySource, plan.sourceIndex, plan.corpus);

  await db.$transaction(async (tx) => {
    const theory = await tx.theoryContent.create({
      data: {
        title: resolved.title,
        body: body as unknown as Prisma.InputJsonValue,
        sourceLabel: theoryAnchor.sourceLabel,
        sourcePage: theoryAnchor.sourcePage,
        sourceQuote: theoryAnchor.sourceQuote,
        sourceMaterialId: theoryAnchor.sourceMaterialId,
        sourceMaterialKind: theoryAnchor.sourceMaterialKind,
        sourceTimestampSec: theoryAnchor.sourceTimestampSec,
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
 * Path-gen Phase 8 — validate a raw `theory` payload (the shape either the
 * unbatched `create_theory_section` tool or the batched
 * `learning_slot_content` tool's `theory` sub-object produces) into a
 * `TheorySection` plus its raw `source` anchor. Pulled out of
 * {@link generateTheoryActivity}'s `generateWithRepair` `parse` callback so
 * {@link generateLearningSlotBatch} can run the identical check ONCE (no
 * repair loop — the batched call's fallback IS the retry) without duplicating
 * the normalize/schema/no-examples logic. Telemetry stays in the callers
 * (`path.theory.retry` belongs to the unbatched repair loop) so the batched
 * path never emits a misleading "retry" event for a call that never retries.
 */
function parseTheoryPayload(
  raw: unknown
): { ok: true; data: TheorySection; rawSource: unknown } | { ok: false; error: string } {
  const normalized = normalizeTheoryInput(raw);
  const parsed = TheorySectionSchema.safeParse(normalized);
  if (!parsed.success) {
    return { ok: false, error: formatZodError(parsed.error) };
  }
  if (parsed.data.examples.length === 0) {
    return {
      ok: false,
      error: '`examples` MUST be a non-empty JSON array of { label, explanation } objects.',
    };
  }
  return { ok: true, data: parsed.data, rawSource: normalized.source ?? null };
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
  reason: string
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

/**
 * Weakness Training Phase 1A (behind WEAKNESS_TRAINING_CONCEPTS=1): look up
 * the `Concept` rows Stage A already persisted for this slot (via
 * `persistSlotConcepts` inside `persistPlanStructure`) and rebuild the
 * `conceptId` map keyed by both slug and verbatim label — the same map shape
 * `persistSlotConcepts` itself returns, so {@link attachConceptTags} doesn't
 * need to know whether it came from a fresh upsert or a re-fetch.
 *
 * Stage B (this file) runs in a separate job from Stage A
 * (`persistPlanStructure`), so the in-memory `conceptCandidates` strings are
 * gone by the time quiz/flashcard generation runs — re-reading the slot's
 * already-persisted `Concept` rows is how Stage B recovers them without
 * threading a new field through `SlotForGeneration`/`PlanForGeneration`.
 * Returns an empty map (silently) when Stage A persisted no concepts for the
 * slot — e.g. the flag was off at Stage A time, or concept persistence
 * failed there. Never throws — callers treat a failure here exactly like "no
 * concepts for this slot."
 */
async function loadSlotConceptMap(slotId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const concepts = await db.concept.findMany({
      where: { slotId },
      select: { id: true, key: true, label: true },
    });
    for (const c of concepts) {
      map.set(c.key, c.id);
      map.set(c.label, c.id);
    }
  } catch (error) {
    console.error('[path-generator] loadSlotConceptMap failed (non-fatal)', {
      slotId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return map;
}

/**
 * Weakness Training Phase 1A (behind WEAKNESS_TRAINING_CONCEPTS=1): pull
 * `conceptKeys` off the RAW (pre-`normalizeFlashcardsInput`) tool output —
 * mirrors the `figure`/`source` loose-hold idiom in
 * `packages/shared/src/quiz.ts` (~L214-234): hold the unvalidated value just
 * long enough to use it, never let a strict schema strip it first. Accepts
 * any of the question-bearing keys `normalizeFlashcardsInput` itself accepts
 * (`flashcards`/`cards`/`flashCards`/`flash_cards`) so this stays in lockstep
 * with that function's drift-tolerance. Keys the result by the card's
 * question text (string) so it can be looked up again after normalization by
 * the surviving `question` field. Defensive only — malformed input (missing
 * array, non-string keys) is silently ignored, never thrown.
 */
function captureFlashcardConceptKeys(
  raw: unknown,
  out: Map<string, string[]>
): void {
  if (!raw || typeof raw !== 'object') return;
  const obj = raw as Record<string, unknown>;
  const list = obj.flashcards ?? obj.cards ?? obj.flashCards ?? obj.flash_cards;
  if (!Array.isArray(list)) return;
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const card = item as Record<string, unknown>;
    const question =
      typeof card.question === 'string'
        ? card.question
        : typeof card.front === 'string'
          ? card.front
          : typeof card.prompt === 'string'
            ? card.prompt
            : null;
    const conceptKeys = card.conceptKeys;
    if (
      question &&
      Array.isArray(conceptKeys) &&
      conceptKeys.every((k) => typeof k === 'string')
    ) {
      out.set(question, conceptKeys as string[]);
    }
  }
}

async function generateFlashcardsActivity(
  plan: PlanForGeneration,
  phase: PhaseForGeneration,
  slot: SlotForGeneration,
  nextSortOrder: number,
  theoryText?: string
): Promise<void> {
  const ctx = makeSlotContentContext(plan, phase, slot, theoryText);
  const { system, tail } = buildFlashcardsPrompt(ctx);

  // Weakness Training Phase 1A (behind WEAKNESS_TRAINING_CONCEPTS=1): the
  // `conceptKeys` the model emits per card live ONLY on the RAW tool output
  // (`FlashcardsForSlotToolInput.flashcards[].conceptKeys`, ai-tools.ts) —
  // `normalizeFlashcardsInput`'s `NormalizedFlashcard` shape never carries
  // them through (see path-generator-normalize.ts), so they'd otherwise be
  // silently dropped here exactly like an un-stamped `figure`/`source` would
  // be by a `.strict()` schema. Captured from `raw` inside `parse` (the last
  // point the unvalidated object is in scope) into this outer map, keyed by
  // the card's `question` text — the one field guaranteed to survive
  // normalization unchanged and line back up with `input.flashcards[i]`
  // below. Best-effort only: a key collision (two cards with the identical
  // question text) just means the later one's `conceptKeys` wins, which is
  // harmless (closed-enum tagging is idempotent and capped at 2 anyway).
  const conceptKeysByQuestion = new Map<string, string[]>();

  // Validate-and-repair: the model intermittently returns an empty / unusable
  // `flashcards` array under the forced tool. Re-call once with the failure
  // folded back as a CoT-repair notice. The prune-vs-fail fallback survives
  // after the repair attempts are spent. The sweep is the outer net.
  const outcome = await generateWithRepair<NormalizedFlashcardsInput>({
    call: (corrective) =>
      forcedStructuredCall<unknown>({
        stage: 'flashcards',
        corpus: plan.corpus,
        staticInstructions: system,
        dynamicInstructions: corrective
          ? [
              tail,
              '',
              '--- REPAIR NOTICE ---',
              'Your previous flashcards response was unusable. Output only the corrected structured response.',
              `Error: ${corrective}`,
              '`flashcards` MUST be a non-empty JSON array of { question, answer } objects.',
            ].join('\n')
          : tail,
        anthropicTool: FLASHCARDS_FOR_SLOT_TOOL,
        userMessage: `Generate flashcards for slot "${slot.title}" — only as many as the material supports. The flashcards array must not be empty.`,
        providerOverride: plan.gemini ? 'gemini' : undefined,
        sessionId: plan.sessionId,
        onUsage: (u) => addNormalizedUsage(plan.usage, u),
      }),
    parse: (raw) => {
      // Capture raw conceptKeys BEFORE normalization can drop them. Flag-off:
      // weaknessConceptsEnabled() is false, the model never emitted the
      // property (schema omits it), and this is a strict no-op.
      if (weaknessConceptsEnabled()) {
        captureFlashcardConceptKeys(raw, conceptKeysByQuestion);
      }
      const normalized = normalizeFlashcardsInput(raw);
      if (normalized.flashcards.length === 0) {
        logTelemetry(plan.userId, 'path.flashcards.retry', {
          planId: plan.id,
          slotId: slot.id,
          reason: 'empty_set',
          preview: previewToolOutput(raw),
        });
        return {
          ok: false,
          error: 'The `flashcards` array was empty or contained no valid { question, answer } objects.',
        };
      }
      return { ok: true, data: normalized };
    },
  });
  if (!outcome.data) {
    // Prune-vs-fail. Thin theory legitimately supports no cards → prune the
    // activity (the theory lesson still stands) instead of failing the
    // checkpoint. Rich theory with no cards is a real failure and still throws
    // (→ retry sweep / honest status). Review slots carry no theory, so the
    // helper returns false and they fail-and-retry as before.
    if (isTheoryTooThinForFlashcards(theoryText)) {
      await recordPrunedActivity(plan, slot, 'flashcards', 'thin_theory');
      return;
    }
    throw new Error(`Flashcards generation returned no usable cards (${outcome.lastError})`);
  }

  await persistFlashcardsActivity(plan, phase, slot, nextSortOrder, outcome.data, conceptKeysByQuestion);
}

/**
 * Path-gen Phase 8 (flag-gated PATH_LEARNING_BATCH) — the validate-and-persist
 * tail of flashcards generation, factored out of
 * {@link generateFlashcardsActivity} so BOTH the unbatched path (a single
 * `create_flashcards_for_slot` call, via `generateWithRepair` above) and the
 * batched path ({@link generateLearningSlotBatch}, one `learning_slot_content`
 * call) run through the EXACT SAME persist code once a validated
 * `NormalizedFlashcardsInput` is in hand — this function has no knowledge of
 * which call shape produced `input`. Unchanged body from the pre-Phase-8
 * `generateFlashcardsActivity`; only lifted out and parameterized on `input` /
 * `conceptKeysByQuestion` instead of closing over the repair-loop's `outcome`
 * local. Note this function does NOT contain the prune-vs-fail branch above —
 * that discriminator only applies when generation produced NO usable cards at
 * all, which for the batched path is one of the conditions that trips the
 * whole-slot fallback to the unbatched sequence (see generateLearningSlotBatch),
 * not a case this function ever sees.
 */
async function persistFlashcardsActivity(
  plan: PlanForGeneration,
  phase: PhaseForGeneration,
  slot: SlotForGeneration,
  nextSortOrder: number,
  input: NormalizedFlashcardsInput,
  conceptKeysByQuestion: Map<string, string[]>
): Promise<void> {
  // Figure-reuse (P3): validate the model's per-card figures against the catalog
  // (drop hallucinated/duplicate refs, cap at 4), then SNAPSHOT each referenced
  // source image into a path-owned `flashcard-images/{cardId}/…` blob. Card ids
  // are pre-generated so the snapshot path is known AND the FlashcardImage rows
  // attach in the same nested create — storage I/O stays OUTSIDE the DB
  // transaction (mirrors theory figure snapshotting). A copy failure simply
  // drops that one figure; the card is still written text-only.
  const figRes =
    plan.flashcardFiguresEnabled && plan.imageCatalog
      ? resolveFlashcardFigures(input.flashcards, plan.availableImages)
      : { accepted: [], rejected: [] };
  recordFigureResolution(plan, figRes);
  const figures = figRes.accepted;
  const cardIds = input.flashcards.map(() => randomUUID());
  const snappedByCard = new Map<
    number,
    {
      sourcePageImageId: string;
      side: 'front' | 'back';
      fileName: string;
      filePath: string;
      fileSize: number;
      mimeType: string;
      caption: string;
    }[]
  >();
  for (const fig of figures) {
    try {
      const dest = `flashcard-images/${cardIds[fig.cardIndex]}/${Date.now()}-${fig.cardIndex}`;
      const { filePath, fileSize } = await copyImage(fig.image.filePath, dest);
      const list = snappedByCard.get(fig.cardIndex) ?? [];
      list.push({
        sourcePageImageId: fig.image.id,
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
  if (plan.figureStats) {
    let n = 0;
    for (const list of snappedByCard.values()) n += list.length;
    plan.figureStats.snapshotCount += n;
    plan.figureStats.flashcardImageCount += n;
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
        ...(diagrams.length > 0 ? { diagrams: diagrams as unknown as Prisma.InputJsonValue } : {}),
        flashcards: {
          create: input.flashcards.map((fc, i) => {
            const imgs = snappedByCard.get(i);
            // Source-highlighting — per-card grounding anchor (corpus-resolved
            // identity + quote + media seek). All-null when the card wasn't grounded.
            const anchor = anchorColumns(fc.source, plan.sourceIndex, plan.corpus);
            return {
              id: cardIds[i],
              question: fc.question,
              answer: fc.answer,
              sourceLabel: anchor.sourceLabel,
              sourcePage: anchor.sourcePage,
              sourceQuote: anchor.sourceQuote,
              sourceMaterialId: anchor.sourceMaterialId,
              sourceMaterialKind: anchor.sourceMaterialKind,
              sourceTimestampSec: anchor.sourceTimestampSec,
              sortOrder: i,
              ...(imgs && imgs.length > 0
                ? {
                    images: {
                      create: imgs.map((s) => ({
                        sourcePageImageId: s.sourcePageImageId,
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

  // Weakness Training Phase 1A (behind WEAKNESS_TRAINING_CONCEPTS=1): tag each
  // persisted Flashcard with its closed-enum concept(s), now that the cards
  // have DB ids (`cardIds`, pre-generated above and used as the nested-create
  // ids, so they're already the real ids — no re-fetch needed). Runs AFTER
  // the transaction commits and in its OWN try/catch: concept tagging must
  // never roll back or fail flashcard generation, which has already
  // succeeded by this point. Flag-off / no captured keys / no slot concepts:
  // every branch below degenerates to zero extra DB calls.
  if (weaknessConceptsEnabled() && conceptKeysByQuestion.size > 0) {
    try {
      const conceptIdByKey = await loadSlotConceptMap(slot.id);
      if (conceptIdByKey.size > 0) {
        for (let i = 0; i < input.flashcards.length; i++) {
          const conceptKeys = conceptKeysByQuestion.get(input.flashcards[i].question);
          if (conceptKeys && conceptKeys.length > 0) {
            await attachConceptTags('flashcard', cardIds[i], conceptKeys, conceptIdByKey);
          }
        }
      }
    } catch (error) {
      console.error('[path-generator] flashcard concept tagging failed (non-fatal)', {
        planId: plan.id,
        slotId: slot.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Path-gen Phase 8 — validate a raw `flashcards` payload (the shape either the
 * unbatched `create_flashcards_for_slot` tool or the batched
 * `learning_slot_content` tool's `flashcards` sub-object produces) into a
 * `NormalizedFlashcardsInput`, optionally capturing `conceptKeys` into the
 * caller's map exactly like the unbatched repair loop's `parse` callback
 * does. Pulled out of {@link generateFlashcardsActivity} so
 * {@link generateLearningSlotBatch} can run the identical check ONCE (no
 * repair loop — the batched call's fallback IS the retry) without duplicating
 * the concept-key-capture/normalize/empty-check logic.
 */
function parseFlashcardsPayload(
  raw: unknown,
  conceptKeysOut: Map<string, string[]>
): { ok: true; data: NormalizedFlashcardsInput } | { ok: false; error: string } {
  if (weaknessConceptsEnabled()) {
    captureFlashcardConceptKeys(raw, conceptKeysOut);
  }
  const normalized = normalizeFlashcardsInput(raw);
  if (normalized.flashcards.length === 0) {
    return {
      ok: false,
      error: 'The `flashcards` array was empty or contained no valid { question, answer } objects.',
    };
  }
  return { ok: true, data: normalized };
}

async function callQuizDispatch(
  plan: PlanForGeneration,
  slotTitle: string,
  staticInstructions: string,
  dynamicInstructions: string
): Promise<QuizForSlotToolInput> {
  return forcedStructuredCall<QuizForSlotToolInput>({
    stage: 'quiz',
    corpus: plan.corpus,
    staticInstructions,
    dynamicInstructions,
    anthropicTool: QUIZ_FOR_SLOT_TOOL,
    userMessage: `Generate the quiz for slot "${slotTitle}". The questions array must not be empty.`,
    providerOverride: plan.gemini ? 'gemini' : undefined,
    sessionId: plan.sessionId,
    onUsage: (u) => addNormalizedUsage(plan.usage, u),
    ultra: plan.ultra,
  });
}

type ValidatedQuizSet = ReturnType<typeof QuizSetV2Schema.parse>;

type QuizParseResult = { ok: true; data: ValidatedQuizSet } | { ok: false; error: string };

/**
 * Weakness Training Phase 1A (behind WEAKNESS_TRAINING_CONCEPTS=1): pull
 * `conceptKeys` off the RAW (pre-`normalizeQuizQuestions`) tool questions —
 * mirrors the `figure`/`source` loose-hold idiom in
 * `packages/shared/src/quiz.ts` (~L214-234). `QuizQuestionV2Schema` has no
 * `conceptKeys` field at all, so `QuizSetV2Schema.safeParse` in
 * {@link parseQuizInput} silently strips it — this must run on `raw.questions`
 * BEFORE that parse. Keyed by `prompt` text (checked across `prompt`/
 * `question`/`text`, the same drift-tolerant aliases `normalizeQuizQuestions`
 * itself accepts) so the caller can look it up again after normalization by
 * the surviving `q.prompt` field. Defensive only — never throws.
 */
function captureQuizConceptKeys(
  raw: QuizForSlotToolInput,
  out: Map<string, string[]>
): void {
  if (!Array.isArray(raw.questions)) return;
  for (const item of raw.questions) {
    if (!item || typeof item !== 'object') continue;
    const q = item as unknown as Record<string, unknown>;
    const prompt =
      typeof q.prompt === 'string'
        ? q.prompt
        : typeof q.question === 'string'
          ? q.question
          : typeof q.text === 'string'
            ? q.text
            : null;
    const conceptKeys = q.conceptKeys;
    if (
      prompt &&
      Array.isArray(conceptKeys) &&
      conceptKeys.every((k) => typeof k === 'string')
    ) {
      out.set(prompt, conceptKeys as string[]);
    }
  }
}

function parseQuizInput(
  raw: QuizForSlotToolInput,
  fallbackTitle: string,
  minItems = 3,
  conceptKeysOut?: Map<string, string[]>,
): QuizParseResult {
  if (conceptKeysOut && weaknessConceptsEnabled()) {
    captureQuizConceptKeys(raw, conceptKeysOut);
  }
  const normalizedQuestions = normalizeQuizQuestions(raw.questions);
  // Per-question salvage: drop only the individually-unrecoverable questions
  // (provided ≥ minItems survive) so one bad item can't nuke an otherwise-good
  // quiz into a full regenerate. Below the floor we keep the original list so
  // the full-set parse fires and surfaces a clean error.
  const { questions: salvaged } = safeParseQuizQuestions(normalizedQuestions, minItems);
  const parsed = QuizSetV2Schema.safeParse({
    title: raw.title || fallbackTitle,
    questions: salvaged,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  // Value-level checks Zod can't express (e.g. an unsolvable word_bank). A
  // failure here returns a specific diagnostic that drives the corrective retry.
  const semantic = runSemanticChecks(parsed.data.questions);
  if (semantic) return { ok: false, error: semantic };
  return { ok: true, data: parsed.data };
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
  conceptKeysOut?: Map<string, string[]>,
): Promise<ValidatedQuizSet | null> {
  // Slightly fewer questions for the final exam here than the normal ask: the
  // degraded path is also the truncation safety net (a long, rich final exam is
  // the main `finish_reason=length` risk), and mc/true_false questions are short
  // enough that 8–10 comfortably fit the output budget.
  const count = slot.kind === 'final_exam' ? '8–10 questions' : '3–5 questions';

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
    'The previous attempts produced an unusable quiz (possibly too long to finish). Generate a SIMPLER, SHORTER quiz now so the learner still gets one.',
    `Use ONLY these question kinds: ${degradedKinds.join(', ')} — no other kinds.`,
    `Produce ${count}. Keep every prompt and payload concise.`,
    degradedCatalog,
  ].join('\n');
  try {
    const raw = await callQuizDispatch(plan, slot.title, system, degradedTail);
    const result = parseQuizInput(
      raw,
      slot.title,
      slot.kind === 'final_exam' ? 8 : 3,
      conceptKeysOut,
    );
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

async function loadKnownMisconceptions(
  plan: PlanForGeneration,
  phase: PhaseForGeneration,
  slot: SlotForGeneration,
): Promise<string[]> {
  if (!weaknessConceptsEnabled()) return [];
  let slotIds: string[];
  if (slot.kind === 'final_exam') {
    slotIds = plan.phases.flatMap((p) => p.slots.map((s) => s.id));
  } else if (slot.coversSlotIds.length > 0) {
    slotIds = slot.coversSlotIds;
  } else if (slot.kind === 'learning') {
    slotIds = [slot.id];
  } else {
    slotIds = phase.slots
      .filter((candidate) => candidate.sortOrder < slot.sortOrder)
      .map((candidate) => candidate.id);
  }
  if (slotIds.length === 0) return [];
  const rows = await db.conceptMastery.findMany({
    where: {
      userId: plan.userId,
      misconceptionLabel: { not: null },
      concept: { slotId: { in: slotIds } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 6,
    select: { misconceptionLabel: true },
  });
  return rows
    .map((row) => row.misconceptionLabel?.trim() ?? '')
    .filter((label) => label.length > 0);
}

async function generateQuizActivity(
  plan: PlanForGeneration,
  phase: PhaseForGeneration,
  slot: SlotForGeneration,
  nextSortOrder: number
): Promise<void> {
  const knownMisconceptions = await loadKnownMisconceptions(plan, phase, slot).catch(() => []);
  const ctx = { ...makeSlotContentContext(plan, phase, slot), knownMisconceptions };
  const { system, tail } = buildQuizPrompt(ctx);
  // Quiz model is resolver-driven (model-routing.ts): BASIC uses the cheap
  // GLM flash tier; ULTRA keeps GLM-5.2 for context headroom. The independent
  // verifier below is a separate sampled/final-exam OpenRouter call.

  // Validate-and-repair with the kind-filter folded IN. parseQuizInput normalizes
  // drift, salvages per-question, runs Zod + semantic checks; here we ALSO drop
  // questions whose kind isn't allowed for the subject. A Zod failure OR a
  // disallowed-kind shortfall both become a SPECIFIC corrective notice on the one
  // repair attempt — collapsing the former separate 3-attempt loop + kind-filter
  // retry into a single loop. tryDegradedQuiz is the last resort (a simpler ask,
  // not a repair). The sweep (runGenerationPass) remains the OUTER net.
  const allowedKinds = allowedKindsForSubjects(plan.subjects);
  const allowedSet = new Set<QuestionKind>(allowedKinds);
  const minCount = slot.kind === 'final_exam' ? 8 : 3;

  // Weakness Training Phase 1A (behind WEAKNESS_TRAINING_CONCEPTS=1): captured
  // by parseQuizInput (called both from `parse` below AND from
  // tryDegradedQuiz's fallback) directly off each attempt's RAW tool output,
  // keyed by `prompt` text — see captureQuizConceptKeys for why this can't
  // wait until after Zod validation. Flag-off: parseQuizInput's internal
  // `weaknessConceptsEnabled()` check makes capture a no-op even though the
  // map is always passed.
  const conceptKeysByPrompt = new Map<string, string[]>();

  const outcome = await generateWithRepair<ValidatedQuizSet>({
    call: (corrective) =>
      callQuizDispatch(
        plan,
        slot.title,
        system,
        corrective
          ? [
              tail,
              '',
              '--- REPAIR NOTICE ---',
              'Your previous quiz was rejected. Output only the corrected structured response.',
              `Error: ${corrective}`,
            ].join('\n')
          : tail,
      ),
    parse: (raw) => {
      const result = parseQuizInput(
        raw as QuizForSlotToolInput,
        slot.title,
        minCount,
        conceptKeysByPrompt,
      );
      if (!result.ok) {
        logTelemetry(plan.userId, 'path.quiz.retry', {
          planId: plan.id,
          slotId: slot.id,
          reason: 'validation_failed',
          preview: previewToolOutput(raw),
        });
        return { ok: false, error: result.error };
      }
      const filtered = result.data.questions.filter((q) => allowedSet.has(q.kind));
      const dropped = result.data.questions.length - filtered.length;
      if (dropped > 0) {
        logTelemetry(plan.userId, 'path.quiz.dropped_kind', {
          planId: plan.id,
          slotId: slot.id,
          dropped,
          allowed: allowedKinds,
          subjects: plan.subjects,
        });
      }
      if (filtered.length < minCount) {
        logTelemetry(plan.userId, 'path.quiz.retry', {
          planId: plan.id,
          slotId: slot.id,
          reason: 'kind_filter_under_min',
          survivors: filtered.length,
          minCount,
        });
        return {
          ok: false,
          error: `Only ${filtered.length} of ${result.data.questions.length} questions used an allowed kind. Use ONLY these kinds: ${allowedKinds.join(', ')} — and produce at least ${minCount} questions.`,
        };
      }
      return { ok: true, data: { ...result.data, questions: filtered } };
    },
  });

  let parsed: ValidatedQuizSet | null = outcome.data;
  if (!parsed) {
    // Degrade before giving up: a simpler mc/true_false quiz beats a hole.
    // tryDegradedQuiz already applies the subject filter internally.
    parsed = await tryDegradedQuiz(plan, slot, system, tail, conceptKeysByPrompt);
    if (!parsed) {
      throw new Error(`Quiz generation failed: ${outcome.lastError}`);
    }
  }

  // Idempotent final gate (the main path filtered inside parse; degraded filters
  // internally) — also catches an all-disallowed degraded set.
  const questions = parsed.questions.filter((q) => allowedSet.has(q.kind));
  if (questions.length === 0) {
    throw new Error(
      `Quiz produced no questions whose kind is allowed for subjects [${plan.subjects.join(', ')}]`
    );
  }

  const verifyThisQuiz = shouldVerifyQuiz({
    slotKind: slot.kind,
    sampleKey: `${plan.id}:${slot.id}`,
  });
  let verification: QuizVerificationResult | null = null;
  if (verifyThisQuiz) {
    // The semantic verifier sees only anchors that passed the deterministic
    // verbatim-quote check. A fabricated quote therefore becomes "no source"
    // and fails closed on a source-backed quiz.
    const verifierQuestions = questions.map((question) => {
      const copy = { ...question } as QuizQuestionV2 & { source?: unknown };
      const source = verifiedSourceAnchor(copy.source, plan.corpus);
      if (source) copy.source = source;
      else delete copy.source;
      return copy as QuizQuestionV2;
    });
    verification = await verifyQuiz({
      userId: plan.userId,
      objective: slot.objective ?? undefined,
      assessmentSpec: slot.assessmentSpec ?? undefined,
      hasSourceMaterials: Boolean(plan.corpus?.trim()),
      questions: verifierQuestions,
    });
  }
  const verificationApplied = applyQuizVerification(questions, verification, minCount);
  const finalQuestions = verificationApplied.questions;
  if (verificationApplied.rejectedIndexes.length > 0) {
    logTelemetry(plan.userId, 'path.quiz.verified', {
      planId: plan.id,
      slotId: slot.id,
      status: verificationApplied.status,
      rejected: verificationApplied.rejectedIndexes,
    });
  }
  const finalTitle = parsed.title;
  const generatorRoute = resolveModel('path-quiz', {
    ultra: plan.ultra,
    providerOverride: plan.gemini ? 'gemini' : undefined,
  });

  // Figure-reuse (P4): validate the model's per-question exhibits against the
  // catalog (drop hallucinated/duplicate refs, cap at 3), then SNAPSHOT each
  // referenced source image into a path-owned `quiz-images/{questionId}/…` blob.
  // Question ids are pre-generated so the snapshot path is known AND the
  // QuizQuestionImage row attaches in the same nested create — storage I/O stays
  // OUTSIDE the DB transaction (mirrors theory/flashcard figure snapshotting). A
  // copy failure simply drops that one exhibit; the question is still written.
  const figRes =
    plan.quizFiguresEnabled && plan.imageCatalog
      ? resolveQuizFigures(finalQuestions, plan.availableImages)
      : { accepted: [], rejected: [] };
  recordFigureResolution(plan, figRes);
  const figures = figRes.accepted;
  const questionIds = finalQuestions.map(() => randomUUID());
  const snappedByQuestion = new Map<
    number,
    {
      fileName: string;
      filePath: string;
      fileSize: number;
      mimeType: string;
      caption: string;
      sourcePageImageId: string;
    }
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
  if (plan.figureStats) {
    plan.figureStats.snapshotCount += snappedByQuestion.size;
    plan.figureStats.quizImageCount += snappedByQuestion.size;
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
  const cloze = diagrams.length > 0 ? buildDiagramClozeQuestion(diagrams, plan.language) : null;
  if (cloze) {
    logTelemetry(plan.userId, 'path.quiz.diagram_cloze_built', {
      planId: plan.id,
      slotId: slot.id,
      diagramKind: cloze.payload.diagram.kind,
    });
  }
  const clozeId = randomUUID();

  // Source-highlighting feature — validate each question's loose `source` anchor
  // and resolve it to persisted columns (quote + identity + media seek), keyed by
  // question index. A malformed or general-knowledge anchor is simply dropped: the
  // columns stay null and the quiz player falls back to the path-level source.
  // Mirrors the figure drop policy above — a bad anchor must never fail a question.
  const anchorByQuestion = new Map<number, AnchorColumns>();
  finalQuestions.forEach((q, i) => {
    const cols = anchorColumns((q as { source?: unknown }).source, plan.sourceIndex, plan.corpus);
    if (cols.sourceQuote) anchorByQuestion.set(i, cols);
  });

  await db.$transaction(async (tx) => {
    const quizSet = await tx.quizSet.create({
      data: {
        userId: plan.userId,
        notebookId: plan.primaryNotebookId,
        // See flashcard set above — keeps the quiz off the notebook's
        // flat lists while preserving the viewer's notebookId routing.
        sourcePathId: plan.id,
        title: finalTitle,
        generationPromptVersion: PATH_QUIZ_PROMPT_VERSION,
        generationProvider: generatorRoute.provider,
        generationModel: generatorRoute.model,
        verificationStatus: verificationApplied.status,
        verificationModel: verification?.model ?? null,
        ...(verification
          ? {
              verificationDetails: {
                items: verification.items,
                error: verification.error ?? null,
                rejectedIndexes: verificationApplied.rejectedIndexes,
              } as unknown as Prisma.InputJsonValue,
            }
          : {}),
        ...(diagrams.length > 0 ? { diagrams: diagrams as unknown as Prisma.InputJsonValue } : {}),
        questions: {
          create: [
            ...finalQuestions.map((q, i) => {
              const legacy = buildLegacyColumns(q.kind, q.payload);
              const snap = snappedByQuestion.get(i);
              const anchor = anchorByQuestion.get(i) ?? EMPTY_ANCHOR;
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
                // Source-highlighting — denormalized grounding for the source
                // viewer (all null when the model didn't ground the question or
                // the anchor was dropped). Identity is corpus-resolved server-side.
                sourceLabel: anchor.sourceLabel,
                sourcePage: anchor.sourcePage,
                sourceQuote: anchor.sourceQuote,
                sourceMaterialId: anchor.sourceMaterialId,
                sourceMaterialKind: anchor.sourceMaterialKind,
                sourceTimestampSec: anchor.sourceTimestampSec,
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

  // Weakness Training Phase 1A (behind WEAKNESS_TRAINING_CONCEPTS=1): tag each
  // persisted QuizQuestion with its closed-enum concept(s), now that the
  // questions have DB ids (`questionIds`, pre-generated above and used as the
  // nested-create ids). Runs AFTER the transaction commits, in its OWN
  // try/catch — concept tagging must never roll back or fail quiz
  // generation, which has already succeeded by this point. The
  // deterministic diagram-cloze question (if any) never carries
  // `conceptKeys` — it's built in code, not by the model — so only
  // `finalQuestions` is considered. Flag-off / no captured keys / no slot
  // concepts: every branch below degenerates to zero extra DB calls.
  if (weaknessConceptsEnabled() && conceptKeysByPrompt.size > 0) {
    try {
      const conceptIdByKey = await loadSlotConceptMap(slot.id);
      if (conceptIdByKey.size > 0) {
        for (let i = 0; i < finalQuestions.length; i++) {
          const conceptKeys = conceptKeysByPrompt.get(finalQuestions[i].prompt);
          if (conceptKeys && conceptKeys.length > 0) {
            await attachConceptTags('quiz_question', questionIds[i], conceptKeys, conceptIdByKey);
          }
        }
      }
    } catch (error) {
      console.error('[path-generator] quiz concept tagging failed (non-fatal)', {
        planId: plan.id,
        slotId: slot.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// Stage B — Phase 8 learning-slot batching (flag-gated PATH_LEARNING_BATCH,
// default OFF; plans/glm-path-gen-phase8-batching-eval.md)
// ─────────────────────────────────────────────────────────────────────

/**
 * Attempt ONE batched `learning_slot_content` call carrying both a `learning`
 * slot's theory section and its flashcards, persisting both through the exact
 * same `persistTheoryActivity` / `persistFlashcardsActivity` helpers the
 * unbatched path uses. Returns the theory plain text (mirroring
 * `generateTheoryActivity`'s return, for API symmetry with the caller) on
 * success, or `null` on ANY failure — a thrown call, a truncated/missing tool
 * part, a validation failure on either half, or persistence throwing partway
 * through. `null` means "did not happen"; the caller (`processSlot`) must
 * then run the existing unbatched theory+flashcards sequence UNCHANGED. A
 * slot must never fail BECAUSE batching failed — this function swallows and
 * logs every failure itself rather than letting one escape to the caller.
 *
 * No repair loop here (unlike the unbatched calls' `generateWithRepair`):
 * `maxAttempts: 1` on the dispatcher call, because the fallback to the
 * unbatched two-call sequence (which has its OWN repair loops) IS the retry —
 * layering a second repair loop on top would just delay the fallback for a
 * call class that's already cheap to just re-run unbatched.
 *
 * Theory is persisted FIRST, matching `processSlot`'s existing
 * theory-before-flashcards ordering — `persistFlashcardsActivity`'s Diagram
 * reuse (Phase 3) step reads back the just-created FlashcardSet's covering
 * theory via `resolveDiagramsForSet`, and the review-slot dependency on
 * `loadSlotTheoryBody` elsewhere in this file expects theory to exist before
 * any flashcards read depends on it. If flashcards persistence throws AFTER
 * theory already committed, the slot is left with theory generated and
 * flashcards missing — `processSlot`'s idempotency check (existingActivityKinds)
 * means a later sweep retries ONLY flashcards next time, exactly as if the
 * unbatched flashcards call itself had thrown; theory is not regenerated or
 * duplicated.
 */
async function generateLearningSlotBatch(
  plan: PlanForGeneration,
  phase: PhaseForGeneration,
  slot: SlotForGeneration,
  theorySortOrder: number,
  flashcardsSortOrder: number
): Promise<string | null> {
  const ctx = makeSlotContentContext(plan, phase, slot);
  const { system, tail } = buildLearningBatchPrompt(ctx);

  let raw: unknown;
  try {
    raw = await forcedStructuredCall<unknown>({
      // Attributed to the 'theory' stage for routing + cost — this call does
      // the work of both the theory AND flashcards stages. DELIBERATE now that
      // Stage B routing differs: theory resolves to GLM-5.2 (32k completion
      // ceiling, theory-quality bar) while basic flashcards ride the
      // 16,384-capped flash tier — a combined theory+flashcards payload needs
      // the 5.2 headroom.
      stage: 'theory',
      corpus: plan.corpus,
      staticInstructions: system,
      dynamicInstructions: tail,
      anthropicTool: LEARNING_SLOT_BATCH_TOOL,
      anthropicTools: [LEARNING_SLOT_BATCH_TOOL],
      userMessage: `Write the theory section AND the flashcards for slot "${slot.title}" in one response.`,
      providerOverride: plan.gemini ? 'gemini' : undefined,
      sessionId: plan.sessionId,
      maxAttempts: 1,
      onUsage: (u) => addNormalizedUsage(plan.usage, u),
    });
  } catch (error) {
    console.warn('[path-generator] learning-slot batch call failed, falling back to unbatched', {
      planId: plan.id,
      slotId: slot.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  const split = splitLearningBatchPayload(raw);
  if (!split) {
    console.warn('[path-generator] learning-slot batch payload missing theory/flashcards, falling back to unbatched', {
      planId: plan.id,
      slotId: slot.id,
      preview: previewToolOutput(raw),
    });
    return null;
  }

  const theoryParsed = parseTheoryPayload(split.theory);
  if (!theoryParsed.ok) {
    console.warn('[path-generator] learning-slot batch theory validation failed, falling back to unbatched', {
      planId: plan.id,
      slotId: slot.id,
      error: theoryParsed.error,
    });
    return null;
  }

  const conceptKeysByQuestion = new Map<string, string[]>();
  const flashcardsParsed = parseFlashcardsPayload(split.flashcards, conceptKeysByQuestion);
  if (!flashcardsParsed.ok) {
    console.warn('[path-generator] learning-slot batch flashcards validation failed, falling back to unbatched', {
      planId: plan.id,
      slotId: slot.id,
      error: flashcardsParsed.error,
    });
    return null;
  }

  // Both halves validated — persist through the SAME code the unbatched path
  // uses. Theory first (see doc comment above for why). From here on, a
  // thrown error is a genuine persistence failure, not a "batching didn't
  // work" case — it propagates to processSlot's existing try/catch around
  // theory (if it throws before theory persists) or is a partial success
  // (theory persisted, flashcards did not) that the idempotency check above
  // resolves on the next sweep, exactly like the unbatched path's own
  // failure modes.
  const theoryText = await persistTheoryActivity(
    plan,
    slot,
    theorySortOrder,
    theoryParsed.data,
    theoryParsed.rawSource,
  );
  await persistFlashcardsActivity(
    plan,
    phase,
    slot,
    flashcardsSortOrder,
    flashcardsParsed.data,
    conceptKeysByQuestion,
  );
  return theoryText;
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
 * Designed to be called by the durable background worker:
 *
 *   enqueueJob('path.generate', { planId: plan.id })
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
/**
 * Generate ONE slot's still-missing activities: theory first (so a learning
 * slot's flashcards are built from the exact text the learner read), then
 * flashcards + quiz in parallel. Returns whether any activity failed (logging
 * each failure). Throws PathGenerationCancelled if the user cancels — checked
 * before the slot's first AI call and again at the theory→(flashcards/quiz)
 * boundary, so a cancel stops new spend promptly. (In-flight calls in the
 * current wave still settle — cancel cost is bounded to ≤ PATH_SLOT_CONCURRENCY
 * slots, vs ≤1 when serial; an acceptable trade for the speedup.)
 */
async function processSlot(
  plan: PlanForGeneration,
  phase: PhaseForGeneration,
  slot: SlotForGeneration,
  planId: string,
  progressTotal: number,
  completedRef: { value: number },
): Promise<{ slotId: string; failed: boolean }> {
  // Idempotency: skip kinds the slot already has, plus kinds Stage B
  // intentionally pruned (complete-by-design) — this is what lets a retry sweep /
  // regenerate only re-attempt the activities that previously failed.
  const wantedKinds = expectedActivityKinds(slot.kind);
  const missingKinds = wantedKinds.filter(
    (k) => !slot.existingActivityKinds.has(k) && !slot.prunedActivityKinds.has(k),
  );
  if (missingKinds.length === 0) {
    return { slotId: slot.id, failed: false };
  }

  if (await isCancelRequested(planId)) throw new PathGenerationCancelled();

  // Best-effort progress caption (reads the wave-start snapshot; the authoritative
  // count is tallied once per wave in runGenerationPass, not mutated here).
  await writeProgress(planId, {
    totalSlots: progressTotal,
    completedSlots: completedRef.value,
    currentSlot: { id: slot.id, title: slot.title },
    currentActivity: missingKinds[0],
  });

  // Continue numbering after any pre-existing activities so sortOrder stays
  // monotonically increasing across runs.
  const sortOrderBase = slot.existingActivityKinds.size;
  const sortOrderByKind = new Map<PathActivityKind, number>(
    missingKinds.map((kind, i) => [kind, sortOrderBase + i]),
  );

  let failed = false;
  const recordFailure = (kind: PathActivityKind, reason: unknown) => {
    failed = true;
    const message = reason instanceof Error ? reason.message : String(reason);
    logTelemetry(plan.userId, 'path.generation.activity_failed', {
      planId,
      slotId: slot.id,
      activityKind: kind,
      message,
    });
  };

  // Phase 8 (flag-gated PATH_LEARNING_BATCH, default OFF): a `learning` slot
  // that still needs BOTH theory and flashcards this pass, on a plan whose
  // theory stage resolves to the GLM/OpenRouter provider, gets ONE shot at a
  // batched call before falling through to the unbatched sequence below.
  // Read the flag at CALL time (not module scope) so a toggle takes effect
  // without a redeploy. `resolveModel` is checked with the SAME ctx
  // `forcedStructuredCall` would build internally for this slot's calls
  // (`ultra`/`gemini` from the plan) — Anthropic/Gemini (the
  // MODEL_COMPOSITION_LEGACY rollback) never reach here. On any batching
  // failure `generateLearningSlotBatch` returns null (already logged a
  // console.warn internally) and this block simply does nothing further —
  // `batchedTheoryText` stays undefined and the unbatched theory/flashcards
  // code below runs exactly as it did before Phase 8 existed.
  let batchedTheoryText: string | undefined;
  let batchedBothKinds = false;
  if (
    isLearningBatchEnabled(process.env.PATH_LEARNING_BATCH) &&
    slot.kind === 'learning' &&
    missingKinds.includes('theory') &&
    missingKinds.includes('flashcards') &&
    resolveModel('path-theory', { ultra: plan.ultra, providerOverride: plan.gemini ? 'gemini' : undefined })
      .provider === 'openrouter'
  ) {
    const result = await generateLearningSlotBatch(
      plan,
      phase,
      slot,
      sortOrderByKind.get('theory')!,
      sortOrderByKind.get('flashcards')!,
    );
    if (result !== null) {
      batchedTheoryText = result;
      batchedBothKinds = true;
    }
  }

  let theoryText: string | undefined = batchedTheoryText;
  if (!batchedBothKinds && missingKinds.includes('theory')) {
    try {
      theoryText = await generateTheoryActivity(plan, phase, slot, sortOrderByKind.get('theory')!);
    } catch (err) {
      recordFailure('theory', err);
    }
  }

  if (await isCancelRequested(planId)) throw new PathGenerationCancelled();

  // The remaining activities are independent — fire them in parallel with
  // allSettled so one failure doesn't take down the others. A successful
  // batch already persisted flashcards too, so exclude it from this wave —
  // exactly like `existingActivityKinds` excludes an already-generated kind
  // from `missingKinds` on a later sweep.
  const parallelKinds = missingKinds.filter(
    (kind) => kind !== 'theory' && !(batchedBothKinds && kind === 'flashcards'),
  );
  const results = await Promise.allSettled(
    parallelKinds.map((kind) => {
      const sortOrder = sortOrderByKind.get(kind)!;
      if (kind === 'flashcards')
        return generateFlashcardsActivity(plan, phase, slot, sortOrder, theoryText);
      return generateQuizActivity(plan, phase, slot, sortOrder);
    }),
  );
  results.forEach((res, i) => {
    if (res.status === 'rejected') recordFailure(parallelKinds[i], res.reason);
  });

  return { slotId: slot.id, failed };
}

/** True when a slot still has at least one activity to generate this run. */
function slotNeedsWork(slot: SlotForGeneration): boolean {
  return expectedActivityKinds(slot.kind).some(
    (k) => !slot.existingActivityKinds.has(k) && !slot.prunedActivityKinds.has(k),
  );
}

async function runGenerationPass(
  plan: PlanForGeneration,
  planId: string,
  progressTotal: number,
  completedSlotsBase: number
): Promise<string[]> {
  const failedSlotIds: string[] = [];
  // Seed with work finished in earlier sweeps so the scoped progress bar keeps
  // climbing across retries instead of snapping back to 0 / N each sweep. Held in
  // a ref so the wave tally (the ONLY writer) is the single source of truth — the
  // old `completedSlots += 1` inside each slot lost updates under parallelism.
  const completed = { value: completedSlotsBase };
  const semaphore = createSemaphore(PATH_SLOT_CONCURRENCY);

  // Phases run SEQUENTIALLY so a later phase's review / final-exam always reads
  // earlier phases' committed theory. WITHIN a phase, slots run in two waves:
  // all `learning` slots in parallel, THEN all `review`/`assessment` slots in
  // parallel — the review wave reads the learning wave's just-committed theory
  // (the one real cross-slot dependency: resolveDiagramsForSet → loadSlotTheoryBody).
  // enforceSpacedReviews guarantees reviews only ever cover PRECEDING learning
  // slots, so two waves per phase is a correct (and simple) topological order.
  for (const phase of plan.phases) {
    const pending = phase.slots.filter(slotNeedsWork);
    const learningWave = pending.filter((s) => s.kind === 'learning');
    const reviewWave = pending.filter((s) => s.kind !== 'learning');

    for (const wave of [learningWave, reviewWave]) {
      if (wave.length === 0) continue;

      // Cooperative cancel before paying for a whole wave.
      if (await isCancelRequested(planId)) throw new PathGenerationCancelled();

      // Snapshot for the per-slot progress captions; the authoritative increment
      // happens in the tally below (race-free — only this loop writes `completed`).
      const completedRef = { value: completed.value };
      const results = await Promise.allSettled(
        wave.map((slot) =>
          semaphore.run(() => processSlot(plan, phase, slot, planId, progressTotal, completedRef)),
        ),
      );

      // Tally from the settled results: count successes ONCE, collect failed
      // slots, surface a cancel, and propagate any unexpected (infra) throw.
      let cancelled = false;
      let infraError: unknown = null;
      const succeeded: string[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') {
          if (r.value.failed) failedSlotIds.push(r.value.slotId);
          else succeeded.push(r.value.slotId);
        } else if (r.reason instanceof PathGenerationCancelled) {
          cancelled = true;
        } else if (!infraError) {
          infraError = r.reason;
        }
      }
      completed.value += succeeded.length;

      // Cancel wins: stop before the next wave/phase.
      if (cancelled || (await isCancelRequested(planId))) {
        throw new PathGenerationCancelled();
      }
      if (infraError) {
        throw infraError instanceof Error ? infraError : new Error(String(infraError));
      }

      await writeProgress(planId, {
        totalSlots: progressTotal,
        completedSlots: completed.value,
        currentSlot: null,
        currentActivity: null,
      });
      for (const slotId of succeeded) {
        logTelemetry(plan.userId, 'path.generation.slot_completed', {
          planId,
          slotId,
          slotIndex: completed.value,
          totalSlots: progressTotal,
        });
      }
    }
  }

  return failedSlotIds;
}

async function runPathGeneration(
  planId: string,
  opts: { allowRefund?: boolean } = {}
): Promise<void> {
  let plan = await loadPlanForGeneration(planId);
  if (!plan) {
    console.error(`[path-generator] plan ${planId} not found`);
    return;
  }

  // One OpenRouter sticky-routing token for the WHOLE run (all sweeps): keeps
  // every GLM call on the same upstream so the shared corpus prefix actually
  // hits the implicit cache instead of being load-balanced across upstreams that
  // each cache-miss. Keyed by planId so a later regenerate can reuse a still-warm
  // upstream. Disable with OPENROUTER_STICKY_ROUTING_DISABLED=1.
  const sessionId =
    process.env.OPENROUTER_STICKY_ROUTING_DISABLED === '1' ? undefined : `path-${planId}`;
  plan.sessionId = sessionId;

  // Corpus + image catalog are stable for the run — capture them from the first
  // load and feed them into every sweep reload, so we don't re-render ~600k chars
  // + re-query images (and re-run captionMissing) each sweep. Rollback:
  // OPENROUTER_CORPUS_CACHE_DISABLED=1.
  const corpusCache: RunCorpusCache | undefined =
    process.env.OPENROUTER_CORPUS_CACHE_DISABLED === '1'
      ? undefined
      : {
          corpus: plan.corpus,
          sourceIndex: plan.sourceIndex,
          imageCatalog: plan.imageCatalog,
          availableImages: plan.availableImages,
          sourceImageCount: plan.sourceImageCount,
          catalogImageCount: plan.catalogImageCount,
          figuresSkippedReason: plan.figuresSkippedReason,
          theoryFiguresEnabled: plan.theoryFiguresEnabled,
          flashcardFiguresEnabled: plan.flashcardFiguresEnabled,
          quizFiguresEnabled: plan.quizFiguresEnabled,
          diagramsEnabled: plan.diagramsEnabled,
        };

  // One figure-telemetry accumulator for the whole generation, re-bound to each
  // sweep's freshly-loaded plan (figure-reuse P4).
  const figureStats = makeFigureStats();
  attachFigureStats(plan, figureStats);

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
    await invalidateDashboardCache(plan.userId);
    return;
  }

  // Claim the run by flipping to `generating` — but NEVER resurrect a path the
  // user cancelled (status `cancelling`) or hard-deleted. This guard is
  // load-bearing now that generatePath rethrows on a crash: a job retry that
  // re-enters here after a cancel landed must NOT flip `cancelling` → `generating`
  // and keep spending. `updateMany` (not `update`) so a vanished/cancelling row
  // is a no-op we can detect, not a throw.
  const claimed = await db.studyPlan.updateMany({
    where: { id: planId, generationStatus: { not: CANCELLING_STATUS } },
    data: { generationStatus: 'generating', generationError: null },
  });
  if (claimed.count === 0) {
    // Cancelled (or deleted) between load and claim — the DELETE route owns
    // cleanup + any refund; stop here without generating.
    logTelemetry(plan.userId, 'path.generation.cancelled', { planId, race: 'pre_start' });
    return;
  }
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
        const fresh = await loadPlanForGeneration(planId, corpusCache);
        if (!fresh) break;
        fresh.usage = usage;
        fresh.sessionId = sessionId;
        plan = fresh;
        attachFigureStats(plan, figureStats);
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
        console.error('[path-generator] cancel cleanup failed', e)
      );
      await invalidateDashboardCache(plan.userId);
      logTelemetry(plan.userId, 'path.generation.cancelled', { planId });
      return;
    }
    throw error;
  }

  // Stage B always finishes `ready`: incomplete checkpoints never block the
  // path (path-gating treats them as passable) and surface their own
  // Regenerate affordance. `failed` is reserved for catastrophic failure.
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
        console.error('[path-generator] post-complete cancel cleanup failed', e)
      );
      await invalidateDashboardCache(plan.userId);
      logTelemetry(plan.userId, 'path.generation.cancelled', { planId, race: 'post_complete' });
    }
    return;
  }

  // Reserve-and-settle refund — fires ONLY after the path is durably `ready`
  // (above). If an ULTRA path produced NOTHING, refund the credit it reserved at
  // creation: a worthless empty path must not cost one of the 3 monthly ultra
  // credits. Doing it AFTER the `ready` commit (not before) is what closes the
  // crash-then-retry free-path hole: a run that crashes mid-generation never
  // reaches here, so a later successful retry can't be paired with a refund.
  // Strict (zero activities) so it can't be farmed; `allowRefund` is set only by
  // the create flow, never by regenerate/sweeper.
  //
  // The whole block is best-effort: a throw here (the refund OR its count query)
  // would escape to generatePath's catch and overwrite this durably-`ready` row
  // with `failed`, bricking a good path. A missed refund is a recoverable billing
  // miss; a corrupted status is a UX disaster — so swallow our own errors.
  if (opts.allowRefund && plan.ultra) {
    try {
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
    } catch (e) {
      console.error('[path-generator] ultra refund failed — leaving path ready', e);
    }
  }

  // Best-effort from here on: the path is durably `ready` and any ultra refund
  // has fired. A throw AFTER the refund would let a job retry pair that refund
  // with a fresh successful run (a free ultra path), so nothing past this point
  // may throw — invalidateDashboardCache is the only awaited call that could.
  await invalidateDashboardCache(plan.userId).catch((e) =>
    console.error('[path-generator] dashboard cache invalidation failed', e)
  );
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

  // Figure-reuse telemetry (P4): one durable row per generation so the admin
  // surface can answer "why did/didn't figures appear" without re-running.
  // Best-effort and fire-and-forget — telemetry must never fail a path.
  logTelemetry(plan.userId, 'path.figures.summary', { planId, ...figureStats });
  void db.pathGenerationTelemetry
    .create({
      data: {
        planId,
        userId: plan.userId,
        sourceImageCount: figureStats.sourceImageCount,
        catalogImageCount: figureStats.catalogImageCount,
        requestedRefs: figureStats.requestedRefs,
        acceptedRefs: figureStats.acceptedRefs,
        rejectedRefs: figureStats.rejectedRefs,
        rejections:
          figureStats.rejections.length > 0
            ? (figureStats.rejections as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        snapshotCount: figureStats.snapshotCount,
        theoryImageCount: figureStats.theoryImageCount,
        flashcardImageCount: figureStats.flashcardImageCount,
        quizImageCount: figureStats.quizImageCount,
        skippedReason: figureStats.skippedReason,
      },
    })
    .catch(() => {
      /* best-effort — usage analytics must not break the call */
    });
}

/**
 * Public Stage-B entry point. Thin wrapper over {@link runPathGeneration} that
 * records a catastrophic throw as `generationStatus: 'failed'` (so the UI never
 * shows a row stuck in `generating` forever — regenerate, reset AND delete all
 * refuse a `generating` row) AND re-throws it so the background-job runner sees
 * the failure and applies its retry/backoff (1m→5m→15m, up to maxAttempts). The
 * re-entry is idempotent — `runGenerationPass` skips already-generated slots — so
 * a retry resumes rather than restarts. NB: a killed *process* (redeploy mid-run)
 * never reaches this catch; the worker's stale-lease reclaim + the boot-time
 * stale-path sweeper cover that case.
 *
 * Activity-level failures do NOT throw (runPathGeneration returns the failed-slot
 * list and settles `ready`), so they never trigger a job retry — only genuine
 * orchestrator/infrastructure crashes do.
 */
export async function generatePath(
  planId: string,
  opts: { allowRefund?: boolean } = {}
): Promise<void> {
  try {
    await runPathGeneration(planId, opts);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[path-generator] generation failed', message);
    // Settle the row to `failed` BEFORE re-throwing so the DB is always
    // consistent even if the job runner's retry never lands. Best-effort.
    await db.studyPlan
      .update({
        where: { id: planId },
        data: { generationStatus: 'failed', generationError: `Generation failed: ${message}` },
        select: { userId: true },
      })
      .then((plan) => invalidateDashboardCache(plan.userId))
      .catch((e) => console.error('[path-generator] failed to mark plan failed', e));
    // Re-throw so failOrRetryJob fires (queue retry with backoff) instead of the
    // job runner recording a false success.
    throw error;
  }
}
