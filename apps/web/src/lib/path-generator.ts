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

import { Prisma } from '@prisma/client';
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
import { repairMathLatex } from './math-latex-repair';
import {
  PATH_STRUCTURE_SCHEMA_GEMINI,
  THEORY_SECTION_SCHEMA_GEMINI,
  FLASHCARDS_FOR_SLOT_SCHEMA_GEMINI,
  QUIZ_FOR_SLOT_SCHEMA_GEMINI,
} from './ai-tools-gemini';
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
  type SourceImage,
} from './path-image-catalog';
import { refundUsage } from './usage-limits';
import {
  QuizSetV2Schema,
  TheorySectionSchema,
  PathDiagramSchema,
  TheoryFigureSchema,
  type QuestionKind,
  type TheorySection,
  type PathDiagram,
} from '@notemage/shared';
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
            'Return 3–6 sections; every section MUST have a non-empty `slots` array of 3–6 slots.',
          ].join('\n');
    try {
      const raw = await forcedStructuredCall<unknown>({
        stage: 'structure',
        corpus: opts.corpus ?? null,
        staticInstructions: system,
        dynamicInstructions: attemptTail,
        anthropicTool: PATH_STRUCTURE_TOOL,
        geminiSchema: PATH_STRUCTURE_SCHEMA_GEMINI,
        userMessage: `Design the path "${opts.title}". Use the tool now.`,
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
   * system block. Non-null only on ultra paths whose materials carried
   * (captioned) images and `PATH_THEORY_FIGURES_DISABLED` is off. When null,
   * the theory model is never told figures exist.
   */
  imageCatalog: string | null;
  /**
   * The images behind `imageCatalog`, keyed for snapshotting at emit time.
   * Empty when figures are off. `imageRef` (PageImage.id) maps to one entry.
   */
  availableImages: SourceImage[];
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
  // simple kill-switch. Figures are ultra-only: the vision captioning pass is
  // the sole added cost, gated to ultra + PATH_THEORY_FIGURES_DISABLED. The
  // whole catalog build is best-effort — any failure leaves imageCatalog null
  // and figures are simply never offered, so a path never fails over visuals.
  const diagramsEnabled = process.env.PATH_THEORY_DIAGRAMS_DISABLED !== '1';
  const figuresEnabled = plan.ultra && process.env.PATH_THEORY_FIGURES_DISABLED !== '1';
  let imageCatalog: string | null = null;
  let availableImages: SourceImage[] = [];
  if (figuresEnabled) {
    try {
      availableImages = await loadSourceImages(plan.userId, plan.materialIds);
      if (availableImages.length > 0) {
        await captionMissing(availableImages);
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
    // Only buildTheoryPrompt reads these; flashcards/quiz prompts ignore them.
    imageCatalog: plan.imageCatalog,
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
 * ones (never fail the theory over a bad diagram). Capped at 2.
 */
export function resolveDiagrams(rawDiagrams: unknown): PathDiagram[] {
  if (!Array.isArray(rawDiagrams)) return [];
  const out: PathDiagram[] = [];
  for (const raw of rawDiagrams) {
    const parsed = PathDiagramSchema.safeParse(raw);
    if (parsed.success) out.push(parsed.data);
    if (out.length >= 2) break;
  }
  return out;
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
        geminiSchema: THEORY_SECTION_SCHEMA_GEMINI,
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
  const figures = plan.imageCatalog ? resolveFigures(resolved.figures, plan.availableImages) : [];
  const diagrams = plan.diagramsEnabled ? resolveDiagrams(resolved.diagrams) : [];

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
        geminiSchema: FLASHCARDS_FOR_SLOT_SCHEMA_GEMINI,
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
    geminiSchema: QUIZ_FOR_SLOT_SCHEMA_GEMINI,
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
 * deliberately SIMPLER ask — only `mc` + `true_false` (the lowest-drift kinds),
 * counts kept modest — so the checkpoint yields a valid quiz instead of a hole.
 * The model/tier is unchanged (whatever the resolver picked for the quiz stage);
 * only the request is degraded. Returns null if even the simplified ask fails.
 */
async function tryDegradedQuiz(
  plan: PlanForGeneration,
  slot: SlotForGeneration,
  system: string,
  baseTail: string,
): Promise<ValidatedQuizSet | null> {
  const count = slot.kind === 'final_exam' ? '8–12 questions' : '3–5 questions';
  const degradedTail = [
    baseTail,
    '',
    '--- SIMPLIFIED RETRY ---',
    'The previous attempts produced an unusable quiz. Generate a SIMPLER quiz now so the learner still gets one:',
    'Use ONLY the `mc` and `true_false` question kinds — no other kinds.',
    `Produce ${count}. Follow the exact payload shapes from the catalog above and keep every payload minimal.`,
  ].join('\n');
  try {
    const raw = await callQuizDispatch(plan, slot.title, system, degradedTail);
    const result = parseQuizInput(raw, slot.title);
    if (result.ok && result.data.questions.length > 0) {
      logTelemetry(plan.userId, 'path.quiz.degraded', {
        planId: plan.id,
        slotId: slot.id,
        questions: result.data.questions.length,
      });
      return result.data;
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

  await db.$transaction(async (tx) => {
    const quizSet = await tx.quizSet.create({
      data: {
        userId: plan.userId,
        notebookId: plan.primaryNotebookId,
        // See flashcard set above — keeps the quiz off the notebook's
        // flat lists while preserving the viewer's notebookId routing.
        sourcePathId: plan.id,
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
  await db.studyPlan.update({
    where: { id: planId },
    data: { generationStatus: 'ready', generationError: null },
  });
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
