// Translate an existing learning path IN PLACE into another language without
// losing the learner's progress.
//
// Why in place: every progress/SRS row (AssessmentAttempt.slotId,
// CheckpointActivity.completed, CheckpointSlot.starsEarned/bestPercentage,
// Flashcard ease/interval/nextReviewAt) references row IDs, never text. So
// overwriting only the text columns on the existing rows keeps all progress
// intact — no copying, no re-linking.
//
// Reuses the cheap translation provider (`translationStructuredCall` → Gemini
// 2.5 Flash by default) and the structural rubric/tool from
// `./translation/prompt` for the plan/phase/slot overlay. The deeper content
// (theory bodies, flashcards, quiz questions) is translated with a generic
// id-keyed string batch defined below. Mirrors `generatePath`'s status model
// (`generationStatus` + `generationProgress`) so the existing "watch it work"
// progress UX (list card + SSE modal) lights up for free.

import type Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import { db } from './db';
import {
  normalizePathLanguage,
  type PathLanguageCode,
} from './path-languages';
import { logTelemetry } from './telemetry-server';
import {
  translationStructuredCall,
  type TranslationUsage,
} from './translation/provider';
import {
  TRANSLATION_RUBRIC,
  T_ANTHROPIC_TOOL,
  T_GEMINI_SCHEMA,
  buildTranslationPayload,
  parseTranslationResponse,
  projectTranslationOnto,
  type TranslatableSnapshot,
} from './translation/prompt';

// ─────────────────────────────────────────────────────────────────────
// Generic id → string batch translator (deep content)
// ─────────────────────────────────────────────────────────────────────

interface SourceString {
  id: string;
  text: string;
}

const STRINGS_TOOL: Anthropic.Messages.Tool = {
  name: 'submit_translations',
  description:
    'Return the translated strings. Preserve every id verbatim — the caller re-keys by id, not by position. Translate only the text.',
  input_schema: {
    type: 'object' as const,
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            text: { type: 'string' },
          },
          required: ['id', 'text'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  },
};

const STRINGS_GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          text: { type: 'STRING' },
        },
        required: ['id', 'text'],
      },
    },
  },
  required: ['items'],
};

// Byte-identical so the provider prompt cache activates across the ~50 calls
// a single path translation makes. Edits invalidate that cache.
const DEEP_TRANSLATION_RUBRIC = [
  'You are a translation model for a learning app.',
  'You are given a list of source strings, each wrapped between an [[id:…]] and an [[end]] marker. Translate the text inside each into the target language and return it under the SAME id via the tool call.',
  '',
  '## Output rules',
  '- Output ONLY via the tool call / JSON schema you were given. No prose, no markdown fences.',
  '- Return every id exactly as given. The caller re-keys by id, not by position — a changed or missing id falls back to the untranslated source.',
  '- Translate every string into the target language. Never echo it back in the source language unless it has no translatable words.',
  '- Preserve verbatim, translating only the words around them: LaTeX / math (`$…$`, `$$…$$`), inline `code` and fenced code, numbers, dates and years, URLs, and placeholder tokens such as `{{0}}`, `{{1}}`, and runs of underscores like `____`.',
  '- Preserve proper nouns, brand names, person / place names, and programming-language / library names.',
  '- Match the source register and keep roughly the same length.',
  '',
  '## Anti-patterns',
  '- Do NOT translate, reorder, or renumber placeholder tokens, blanks, or list markers.',
  '- Do NOT translate code, mathematical expressions, or expected program output.',
  '- Do NOT add explanatory parentheticals the source did not have.',
  '- Do NOT moralise, hedge, or refuse.',
].join('\n');

function buildBatchPayload(
  items: SourceString[],
  source: string,
  target: string,
): string {
  const out: string[] = [];
  out.push('# STRING TRANSLATION REQUEST');
  out.push('');
  out.push(`source language: ${source}`);
  out.push(`target language: ${target}`);
  out.push('');
  if (source === target) {
    // Re-clean pass: the content is nominally already in `target` but may hold
    // fragments left in another language. Override the rubric's "don't echo the
    // source language" rule for this case so correct strings pass through.
    out.push('');
    out.push(
      `NOTE: these strings are nominally already in ${target}, but some may still contain text in another language (often English). Return EVERY string fully in ${target}; if a string is already entirely in ${target}, return it unchanged.`,
    );
  }
  out.push('');
  out.push('# SOURCE STRINGS');
  out.push('');
  for (const it of items) {
    out.push(`[[id:${it.id}]]`);
    out.push(it.text);
    out.push('[[end]]');
  }
  out.push('');
  out.push('Return the same ids via the tool call, each text translated into the target language.');
  return out.join('\n');
}

/**
 * Translate a batch of id-tagged strings. Returns a map of id → translated
 * text. On any failure (call error, missing ids) the affected ids are simply
 * absent from the map, so callers fall back to the source string — a partial
 * translation never loses content.
 */
// A single translatable string is capped so one pathological node can't blow
// the model's input budget. Over-cap items are left untranslated — callers fall
// back to the source string, exactly as they already do for any missing id.
const MAX_TRANSLATABLE_CHARS = 12_000;

async function translateBatch(
  items: SourceString[],
  source: string,
  target: string,
  onUsage: (u: TranslationUsage) => void,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (items.length === 0) return map;

  const translatable = items.filter((it) => it.text.length <= MAX_TRANSLATABLE_CHARS);
  if (translatable.length === 0) return map;

  const { result } = await translationStructuredCall<{
    items?: Array<{ id?: unknown; text?: unknown }>;
  }>({
    rubric: DEEP_TRANSLATION_RUBRIC,
    payload: buildBatchPayload(translatable, source, target),
    anthropicTool: STRINGS_TOOL,
    geminiSchema: STRINGS_GEMINI_SCHEMA,
    onUsage,
  });

  const arr = Array.isArray(result?.items) ? result.items : [];
  for (const it of arr) {
    if (it && typeof it.id === 'string' && typeof it.text === 'string') {
      map.set(it.id, it.text);
    }
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────
// TipTap theory body — translate text nodes, leave math / code untouched
// ─────────────────────────────────────────────────────────────────────

interface TipTapNode {
  type: string;
  text?: string;
  marks?: Array<{ type?: string }>;
  attrs?: Record<string, unknown> | null;
  content?: TipTapNode[];
}

/** A translatable string leaf whose value lives somewhere other than a text
 *  node's `.text` (e.g. a theory-visuals diagram label or image caption). */
interface AttrSlot {
  get: () => string;
  set: (v: string) => void;
}

/**
 * Collect every translatable text node in a TipTap doc. Skips math nodes
 * (`inlineMath` / `blockMath` carry their LaTeX in `attrs`, not `text`), any
 * text node wearing an inline `code` mark, and the theory-visuals custom
 * nodes (`pathImage` / `pathDiagram`) — those carry their strings in `attrs`,
 * surfaced separately by `collectTheoryVisualSlots`.
 */
function collectTipTapTextNodes(doc: unknown): TipTapNode[] {
  const out: TipTapNode[] = [];
  const visit = (node: TipTapNode | undefined) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'pathImage' || node.type === 'pathDiagram') return;
    if (node.type === 'text' && typeof node.text === 'string') {
      const isCode =
        Array.isArray(node.marks) && node.marks.some((m) => m?.type === 'code');
      if (!isCode) out.push(node);
      return;
    }
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  const root = doc as TipTapNode | undefined;
  if (root && Array.isArray(root.content)) root.content.forEach(visit);
  return out;
}

// Push a non-empty string property as a get/set slot mutating the object in
// place (so writing the doc back persists the translation).
function addStrSlot(obj: Record<string, unknown>, key: string, out: AttrSlot[]): void {
  const v = obj[key];
  if (typeof v === 'string' && v.trim().length > 0) {
    out.push({ get: () => obj[key] as string, set: (val) => { obj[key] = val; } });
  }
}

// Push each non-empty string element of an array as a slot.
function addArrSlots(arr: unknown, out: AttrSlot[]): void {
  if (!Array.isArray(arr)) return;
  arr.forEach((el, i) => {
    if (typeof el === 'string' && el.trim().length > 0) {
      out.push({ get: () => arr[i] as string, set: (val) => { arr[i] = val; } });
    }
  });
}

// Collect the human-readable label/caption strings inside one diagram object,
// leaving structural keys (`kind`) and timeline dates untouched.
function collectDiagramSlots(d: Record<string, unknown>, out: AttrSlot[]): void {
  addStrSlot(d, 'title', out);
  switch (d.kind) {
    case 'timeline':
      if (Array.isArray(d.events)) {
        for (const ev of d.events) {
          if (ev && typeof ev === 'object') addStrSlot(ev as Record<string, unknown>, 'label', out);
        }
      }
      break;
    case 'steps':
      if (Array.isArray(d.steps)) {
        for (const st of d.steps) {
          if (st && typeof st === 'object') {
            addStrSlot(st as Record<string, unknown>, 'title', out);
            addStrSlot(st as Record<string, unknown>, 'detail', out);
          }
        }
      }
      break;
    case 'comparison':
      addArrSlots(d.columns, out);
      if (Array.isArray(d.rows)) {
        for (const r of d.rows) {
          if (r && typeof r === 'object') {
            addStrSlot(r as Record<string, unknown>, 'label', out);
            addArrSlots((r as Record<string, unknown>).cells, out);
          }
        }
      }
      break;
    case 'cycle':
      addArrSlots(d.nodes, out);
      break;
    default:
      break;
  }
}

/**
 * Collect translatable string leaves from the theory-visuals custom nodes:
 * `pathImage` alt captions and `pathDiagram` labels. Returns get/set closures
 * that mutate the doc in place — the caller batches them alongside the text
 * nodes and writes the whole doc back after translation.
 */
export function collectTheoryVisualSlots(doc: unknown): AttrSlot[] {
  const out: AttrSlot[] = [];
  const visit = (node: TipTapNode | undefined) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'pathImage') {
      if (node.attrs) addStrSlot(node.attrs, 'alt', out);
      return;
    }
    if (node.type === 'pathDiagram') {
      const diagram = node.attrs?.diagram;
      if (diagram && typeof diagram === 'object') {
        collectDiagramSlots(diagram as Record<string, unknown>, out);
      }
      return;
    }
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  const root = doc as TipTapNode | undefined;
  if (root && Array.isArray(root.content)) root.content.forEach(visit);
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Quiz questions — kind-aware extraction of translatable leaves
// ─────────────────────────────────────────────────────────────────────

interface QuizQuestionRow {
  id: string;
  kind: string;
  question: string;
  options: string[];
  hint: string | null;
  correctExplanation: string | null;
  wrongExplanation: string | null;
  payload: Prisma.JsonValue;
  // Figure-reuse (P4): exhibit caption is translatable prose. 0-or-1 per question.
  image: { id: string; caption: string | null } | null;
}

interface TextSlot {
  id: string;
  get: () => string;
  set: (v: string) => void;
}

type LooseObj = Record<string, unknown>;

/**
 * Translatable string leaves for one quiz question, as get/set closures over
 * the question row and a mutable clone of its payload. Only natural-language
 * leaves are returned: code, equations, expected program output, the
 * true/false answer key and the `translation`-kind answer key are left as-is
 * so grading never breaks.
 */
function questionSlots(
  idx: number,
  q: QuizQuestionRow,
  payload: LooseObj | null,
): TextSlot[] {
  const slots: TextSlot[] = [];
  const add = (
    key: string,
    get: () => unknown,
    set: (v: string) => void,
  ) => {
    const cur = get();
    if (typeof cur === 'string' && cur.trim().length > 0) {
      slots.push({ id: `${idx}:${key}`, get: () => get() as string, set });
    }
  };
  const arrAt = (v: unknown): unknown[] | null => (Array.isArray(v) ? v : null);

  add('q', () => q.question, (v) => { q.question = v; });
  add('hint', () => q.hint, (v) => { q.hint = v; });
  add('ce', () => q.correctExplanation, (v) => { q.correctExplanation = v; });
  add('we', () => q.wrongExplanation, (v) => { q.wrongExplanation = v; });

  // Legacy top-level options (v1 multiple-choice).
  const topOpts = arrAt(q.options);
  if (topOpts) {
    topOpts.forEach((_, j) =>
      add(`opt${j}`, () => (q.options as unknown[])[j], (v) => { q.options[j] = v; }),
    );
  }

  if (payload && typeof payload === 'object') {
    const p = payload;
    switch (q.kind) {
      case 'mc': {
        const opts = arrAt(p.options);
        if (opts)
          opts.forEach((_, j) =>
            add(`po${j}`, () => (p.options as unknown[])[j], (v) => { (p.options as unknown[])[j] = v; }),
          );
        break;
      }
      case 'fill_blank': {
        const blank = p.blank as LooseObj | undefined;
        const aa = arrAt(blank?.acceptableAnswers);
        if (blank && aa)
          aa.forEach((_, j) =>
            add(`aa${j}`, () => (blank.acceptableAnswers as unknown[])[j], (v) => { (blank.acceptableAnswers as unknown[])[j] = v; }),
          );
        break;
      }
      case 'word_bank': {
        add('tpl', () => p.template, (v) => { p.template = v; });
        const wbSlots = arrAt(p.slots);
        if (wbSlots)
          wbSlots.forEach((s, j) => {
            const so = s as LooseObj;
            add(`ws${j}`, () => so.correctAnswer, (v) => { so.correctAnswer = v; });
          });
        const bank = arrAt(p.wordBank);
        if (bank)
          bank.forEach((_, j) =>
            add(`wb${j}`, () => (p.wordBank as unknown[])[j], (v) => { (p.wordBank as unknown[])[j] = v; }),
          );
        break;
      }
      case 'match_pairs': {
        const pairs = arrAt(p.pairs);
        if (pairs)
          pairs.forEach((pr, j) => {
            const po = pr as LooseObj;
            add(`pl${j}`, () => po.left, (v) => { po.left = v; });
            add(`pr${j}`, () => po.right, (v) => { po.right = v; });
          });
        break;
      }
      case 'sentence_reorder': {
        const order = arrAt(p.correctOrder);
        if (order)
          order.forEach((_, j) =>
            add(`co${j}`, () => (p.correctOrder as unknown[])[j], (v) => { (p.correctOrder as unknown[])[j] = v; }),
          );
        break;
      }
      case 'timeline': {
        const events = arrAt(p.events);
        if (events)
          events.forEach((ev, j) => {
            const eo = ev as LooseObj;
            add(`ev${j}`, () => eo.label, (v) => { eo.label = v; });
          });
        break;
      }
      // true_false (answer key only), equation / code_output / code_write
      // (code, math, expected output) and translation (answer is fixed to the
      // question's target language) carry no translatable prose in payload.
      default:
        break;
    }
  }
  return slots;
}

// ─────────────────────────────────────────────────────────────────────
// Per-activity translation
// ─────────────────────────────────────────────────────────────────────

interface ActivityRow {
  id: string;
  kind: string;
  title: string;
  theory: { id: string; title: string; body: Prisma.JsonValue } | null;
  flashcardSet:
    | {
        id: string;
        title: string;
        flashcards: Array<{
          id: string;
          question: string;
          answer: string;
          images: Array<{ id: string; caption: string | null }>;
        }>;
      }
    | null;
  quizSet: { id: string; title: string; questions: QuizQuestionRow[] } | null;
}

async function translateTheoryActivity(
  activity: ActivityRow,
  source: string,
  target: string,
  onUsage: (u: TranslationUsage) => void,
): Promise<void> {
  const theory = activity.theory;
  if (!theory) return;
  const body = theory.body as unknown;
  const textNodes = collectTipTapTextNodes(body);
  // Theory-visuals: diagram labels + image captions live in `attrs`, invisible
  // to collectTipTapTextNodes — surface them as get/set slots so they translate
  // in place too (else a translated path keeps English diagram labels).
  const visualSlots = collectTheoryVisualSlots(body);

  const strings: SourceString[] = [
    { id: 'act', text: activity.title },
    { id: 'tt', text: theory.title },
    ...textNodes.map((n, i) => ({ id: `n${i}`, text: n.text as string })),
    ...visualSlots.map((s, i) => ({ id: `v${i}`, text: s.get() })),
  ];
  const map = await translateBatch(strings, source, target, onUsage);

  textNodes.forEach((n, i) => {
    n.text = map.get(`n${i}`) ?? n.text;
  });
  visualSlots.forEach((s, i) => {
    s.set(map.get(`v${i}`) ?? s.get());
  });
  const theoryTitle = map.get('tt') ?? theory.title;
  const activityTitle = map.get('act') ?? activity.title;

  await db.$transaction([
    db.theoryContent.update({
      where: { id: theory.id },
      data: { title: theoryTitle, body: body as Prisma.InputJsonValue },
    }),
    db.checkpointActivity.update({
      where: { id: activity.id },
      data: { title: activityTitle },
    }),
  ]);
}

async function translateFlashcardsActivity(
  activity: ActivityRow,
  source: string,
  target: string,
  onUsage: (u: TranslationUsage) => void,
): Promise<void> {
  const set = activity.flashcardSet;
  if (!set) return;

  const strings: SourceString[] = [
    { id: 'act', text: activity.title },
    { id: 'st', text: set.title },
  ];
  set.flashcards.forEach((fc, i) => {
    strings.push({ id: `q${i}`, text: fc.question });
    strings.push({ id: `a${i}`, text: fc.answer });
    // Figure-reuse (P3): translate each figure caption in place so a translated
    // path doesn't keep an English caption under a card.
    fc.images.forEach((img, j) => {
      const caption = img.caption?.trim();
      if (caption) strings.push({ id: `c${i}_${j}`, text: caption });
    });
  });
  const map = await translateBatch(strings, source, target, onUsage);

  await db.$transaction([
    db.checkpointActivity.update({
      where: { id: activity.id },
      data: { title: map.get('act') ?? activity.title },
    }),
    db.flashcardSet.update({
      where: { id: set.id },
      data: { title: map.get('st') ?? set.title },
    }),
    ...set.flashcards.map((fc, i) =>
      db.flashcard.update({
        where: { id: fc.id },
        data: {
          question: map.get(`q${i}`) ?? fc.question,
          answer: map.get(`a${i}`) ?? fc.answer,
        },
      }),
    ),
    ...set.flashcards.flatMap((fc, i) =>
      fc.images
        .map((img, j) => ({ img, j }))
        .filter(({ img }) => Boolean(img.caption?.trim()))
        .map(({ img, j }) =>
          db.flashcardImage.update({
            where: { id: img.id },
            data: { caption: map.get(`c${i}_${j}`) ?? img.caption },
          }),
        ),
    ),
  ]);
}

async function translateQuizActivity(
  activity: ActivityRow,
  source: string,
  target: string,
  onUsage: (u: TranslationUsage) => void,
): Promise<void> {
  const set = activity.quizSet;
  if (!set) return;

  const strings: SourceString[] = [
    { id: 'act', text: activity.title },
    { id: 'st', text: set.title },
  ];
  const perQ = set.questions.map((q, i) => {
    const payload =
      q.payload && typeof q.payload === 'object'
        ? (JSON.parse(JSON.stringify(q.payload)) as LooseObj)
        : null;
    const slots = questionSlots(i, q, payload);
    slots.forEach((s) => strings.push({ id: s.id, text: s.get() }));
    return { q, payload, slots };
  });

  // Figure-reuse (P4): translate each exhibit caption in place so a translated
  // path doesn't keep an English caption under a question's figure.
  set.questions.forEach((q, i) => {
    const caption = q.image?.caption?.trim();
    if (caption) strings.push({ id: `cap${i}`, text: caption });
  });

  const map = await translateBatch(strings, source, target, onUsage);
  for (const { slots } of perQ) {
    slots.forEach((s) => s.set(map.get(s.id) ?? s.get()));
  }

  await db.$transaction([
    db.checkpointActivity.update({
      where: { id: activity.id },
      data: { title: map.get('act') ?? activity.title },
    }),
    db.quizSet.update({
      where: { id: set.id },
      data: { title: map.get('st') ?? set.title },
    }),
    ...perQ.map(({ q, payload }) =>
      db.quizQuestion.update({
        where: { id: q.id },
        data: {
          question: q.question,
          hint: q.hint,
          correctExplanation: q.correctExplanation,
          wrongExplanation: q.wrongExplanation,
          options: q.options ?? [],
          payload:
            payload === null
              ? Prisma.JsonNull
              : (payload as Prisma.InputJsonValue),
        },
      }),
    ),
    ...set.questions
      .map((q, i) => ({ q, i }))
      .filter(({ q }) => Boolean(q.image?.caption?.trim()))
      .map(({ q, i }) =>
        db.quizQuestionImage.update({
          where: { questionId: q.id },
          data: { caption: map.get(`cap${i}`) ?? q.image?.caption ?? null },
        }),
      ),
  ]);
}

// ─────────────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────────────

interface TranslateProgress {
  mode: 'translate';
  totalSlots: number;
  completedSlots: number;
  currentSlot: { id: string; title: string } | null;
  currentActivity: string | null;
}

async function writeProgress(planId: string, snap: TranslateProgress): Promise<void> {
  await db.studyPlan
    .update({
      where: { id: planId },
      data: { generationProgress: snap as unknown as Prisma.InputJsonValue },
    })
    .catch((error) => {
      console.error('[path-translator] progress write failed', error);
    });
}

/**
 * Translate a whole path in place into `targetLanguage`. Fire-and-forget from
 * the route (like `generatePath`): never throws — a catastrophic failure is
 * surfaced via `generationStatus: 'failed'` + `generationError`. Per-activity
 * failures are isolated (logged, skipped) so one bad activity can't strand the
 * rest in the source language.
 */
export async function translatePath(
  planId: string,
  targetLanguage: PathLanguageCode,
): Promise<void> {
  try {
    const plan = await db.studyPlan.findUnique({
      where: { id: planId },
      include: {
        phases: {
          orderBy: { sortOrder: 'asc' },
          include: {
            slots: {
              orderBy: { sortOrder: 'asc' },
              include: {
                activities: {
                  orderBy: { sortOrder: 'asc' },
                  include: {
                    theory: { select: { id: true, title: true, body: true } },
                    flashcardSet: {
                      include: {
                        flashcards: {
                          orderBy: { sortOrder: 'asc' },
                          // Figure-reuse (P3): figure captions are translatable prose.
                          include: {
                            images: {
                              orderBy: { sortOrder: 'asc' },
                              select: { id: true, caption: true },
                            },
                          },
                        },
                      },
                    },
                    quizSet: {
                      include: {
                        questions: {
                          orderBy: { sortOrder: 'asc' },
                          // Figure-reuse (P4): exhibit captions are translatable prose.
                          include: { image: { select: { id: true, caption: true } } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!plan) {
      console.error(`[path-translator] plan ${planId} not found`);
      return;
    }

    const source = normalizePathLanguage(plan.language);
    const totalSlots = plan.phases.reduce((n, p) => n + p.slots.length, 0);

    // `source === targetLanguage` is allowed: it runs a "fix mixed content"
    // pass that normalizes any stray non-target text (the payload tells the
    // model some strings may already be correct — see buildBatchPayload).

    let completedSlots = 0;
    await writeProgress(planId, {
      mode: 'translate',
      totalSlots,
      completedSlots,
      currentSlot: null,
      currentActivity: null,
    });

    const usage = { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    const onUsage = (u: TranslationUsage) => {
      usage.calls += 1;
      usage.inputTokens += u.inputTokens;
      usage.outputTokens += u.outputTokens;
      usage.cacheReadTokens += u.cacheReadTokens;
    };

    // ── Structural overlay (plan + phase + slot titles / descriptions) ──
    // Reuses the existing community-translation rubric/tool/parser, then
    // writes the projected result back onto the live rows.
    try {
      const snapshot: TranslatableSnapshot = {
        sourceLanguage: source,
        targetLanguage,
        title: plan.title,
        description: plan.description ?? null,
        phases: plan.phases.map((ph) => ({
          id: ph.id,
          title: ph.title,
          description: ph.description ?? null,
          slots: ph.slots.map((s) => ({
            id: s.id,
            title: s.title,
            description: s.description ?? null,
          })),
        })),
      };
      const { result } = await translationStructuredCall<unknown>({
        rubric: TRANSLATION_RUBRIC,
        payload: buildTranslationPayload(snapshot),
        anthropicTool: T_ANTHROPIC_TOOL,
        geminiSchema: T_GEMINI_SCHEMA,
        onUsage,
      });
      const { payload } = projectTranslationOnto(snapshot, parseTranslationResponse(result));
      await db.$transaction([
        db.studyPlan.update({
          where: { id: plan.id },
          data: { title: payload.title, description: payload.description },
        }),
        ...payload.phases.map((ph) =>
          db.studyPhase.update({
            where: { id: ph.id },
            data: { title: ph.title, description: ph.description },
          }),
        ),
        ...payload.phases.flatMap((ph) =>
          ph.slots.map((s) =>
            db.checkpointSlot.update({
              where: { id: s.id },
              data: { title: s.title, description: s.description },
            }),
          ),
        ),
      ]);
    } catch (error) {
      // Structural overlay is best-effort — keep the source titles and press
      // on to the content rather than stranding the whole translation.
      logTelemetry(plan.userId, 'path.translation.structural_failed', {
        planId,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    // ── Per-activity deep content ──
    for (const phase of plan.phases) {
      for (const slot of phase.slots) {
        await writeProgress(planId, {
          mode: 'translate',
          totalSlots,
          completedSlots,
          currentSlot: { id: slot.id, title: slot.title },
          currentActivity: slot.activities[0]?.kind ?? null,
        });

        for (const activity of slot.activities as ActivityRow[]) {
          await writeProgress(planId, {
            mode: 'translate',
            totalSlots,
            completedSlots,
            currentSlot: { id: slot.id, title: slot.title },
            currentActivity: activity.kind,
          });
          try {
            if (activity.kind === 'theory') {
              await translateTheoryActivity(activity, source, targetLanguage, onUsage);
            } else if (activity.kind === 'flashcards') {
              await translateFlashcardsActivity(activity, source, targetLanguage, onUsage);
            } else if (activity.kind === 'quiz') {
              await translateQuizActivity(activity, source, targetLanguage, onUsage);
            }
          } catch (error) {
            logTelemetry(plan.userId, 'path.translation.activity_failed', {
              planId,
              slotId: slot.id,
              activityId: activity.id,
              activityKind: activity.kind,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }

        completedSlots += 1;
        await writeProgress(planId, {
          mode: 'translate',
          totalSlots,
          completedSlots,
          currentSlot: null,
          currentActivity: null,
        });
      }
    }

    // Flip the language and clear the working state only once everything that
    // could be translated has been. Progress rows were never touched.
    await db.studyPlan.update({
      where: { id: planId },
      data: {
        language: targetLanguage,
        generationStatus: 'ready',
        generationError: null,
        generationProgress: Prisma.DbNull,
      },
    });
    logTelemetry(plan.userId, 'path.translation.completed', {
      planId,
      source,
      target: targetLanguage,
      totalSlots,
      ...usage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[path-translator]', message);
    await db.studyPlan
      .update({
        where: { id: planId },
        data: { generationStatus: 'failed', generationError: `Translation failed: ${message}` },
      })
      .catch(() => {});
  }
}
