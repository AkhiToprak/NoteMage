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
import { DIAGRAM_CLOZE_MASK } from '@notemage/shared';
import { db } from './db';
import {
  normalizePathLanguage,
  type PathLanguageCode,
} from './path-languages';
import { logTelemetry } from './telemetry-server';
import { invalidateDashboardCache } from './dashboard-data';
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

// Byte-identical across the ~50 sequential deep calls per path translation.
// Edits here invalidate cross-call prefix consistency.
// NOTE: these rubrics are short (~400 tok) — well below the Haiku 4.5 minimum
// cacheable prefix (4096 tok) and Sonnet 4.6 minimum (2048 tok). The cache_control
// marker in provider.ts is therefore a no-op; cross-call consistency is a
// quality goal, not an active cache strategy.
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
  '- Strings that are themselves the object of language study — vocabulary items, example sentences in the studied language, acceptable answers to a language exercise — must be preserved exactly, not translated.',
  '- Translate recurring terms exactly as shown in the TERMINOLOGY block when one is present.',
  '',
  '## Anti-patterns',
  '- Do NOT translate, reorder, or renumber placeholder tokens, blanks, or list markers.',
  '- Do NOT translate code, mathematical expressions, or expected program output.',
  '- Do NOT add explanatory parentheticals the source did not have.',
  '- Do not add commentary; translate faithfully.',
].join('\n');

// Sanitize a single-line labelled field value so it can't contain delimiter
// lines that would confuse the model's structural parsing.
function sanitizeFieldValue(text: string): string {
  // Collapse newlines to spaces in single-line fields.
  const flat = text.replace(/\r?\n/g, ' ');
  // Escape lines that exactly match our structural markers so they are
  // treated as content, not as delimiters.
  return flat
    .split('\n')
    .map((line) => {
      if (/^\[\[id:[^\]]+\]\]$/.test(line) || line === '[[end]]') {
        return `\\${line}`;
      }
      return line;
    })
    .join('\n');
}

function buildBatchPayload(
  items: SourceString[],
  source: string,
  target: string,
  glossary?: ReadonlyMap<string, string>,
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
    out.push(
      `NOTE: these strings are nominally already in ${target}, but some may still contain text in another language (often English). Return EVERY string fully in ${target}; if a string is already entirely in ${target}, return it unchanged.`,
    );
    out.push('');
  }
  if (glossary && glossary.size > 0) {
    out.push('# TERMINOLOGY');
    out.push('Translate these recurring terms exactly as shown:');
    for (const [src, tgt] of glossary) {
      out.push(`  ${sanitizeFieldValue(src)} → ${sanitizeFieldValue(tgt)}`);
    }
    out.push('');
  }
  // Untrusted author content is wrapped in explicit markers so the model
  // treats it as data, not instructions.
  out.push('BEGIN UNTRUSTED AUTHOR CONTENT');
  out.push('');
  out.push('# SOURCE STRINGS');
  out.push('');
  for (const it of items) {
    out.push(`[[id:${it.id}]]`);
    out.push(it.text);
    out.push('[[end]]');
  }
  out.push('');
  out.push('END UNTRUSTED AUTHOR CONTENT');
  out.push('');
  out.push('Return the same ids via the tool call, each text translated into the target language.');
  return out.join('\n');
}

/**
 * Translate a batch of id-tagged strings. Returns a map of id → translated
 * text. On any failure (call error, missing ids) the affected ids are simply
 * absent from the map, so callers fall back to the source string — a partial
 * translation never loses content.
 *
 * Items whose text exceeds MAX_TRANSLATABLE_CHARS are left untranslated.
 * The remainder are chunked into sequential batches bounded by
 * MAX_BATCH_CHARS total chars so oversized activities don't produce a
 * truncated output that then retries identically and silently fails.
 */
const MAX_TRANSLATABLE_CHARS = 12_000;
// Keep each individual AI call's input well below the 16K-token output limit.
const MAX_BATCH_CHARS = 20_000;

async function translateBatch(
  items: SourceString[],
  source: string,
  target: string,
  onUsage: (u: TranslationUsage) => void,
  glossary?: ReadonlyMap<string, string>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (items.length === 0) return map;

  const translatable = items.filter((it) => it.text.length <= MAX_TRANSLATABLE_CHARS);
  if (translatable.length === 0) return map;

  // Chunk into batches bounded by total chars to avoid output truncation.
  const chunks: SourceString[][] = [];
  let current: SourceString[] = [];
  let currentChars = 0;
  for (const it of translatable) {
    if (current.length > 0 && currentChars + it.text.length > MAX_BATCH_CHARS) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(it);
    currentChars += it.text.length;
  }
  if (current.length > 0) chunks.push(current);

  for (const chunk of chunks) {
    const { result } = await translationStructuredCall<{
      items?: Array<{ id?: unknown; text?: unknown }>;
    }>({
      rubric: DEEP_TRANSLATION_RUBRIC,
      payload: buildBatchPayload(chunk, source, target, glossary),
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
// place (so writing the doc back persists the translation). The diagram-cloze
// mask marker is NOT natural-language prose — it's a structural sentinel — so it
// is never collected (never appears in theory; only inside a masked cloze
// diagram, where translating it would corrupt the "?" render).
function addStrSlot(obj: Record<string, unknown>, key: string, out: AttrSlot[]): void {
  const v = obj[key];
  if (typeof v === 'string' && v.trim().length > 0 && v !== DIAGRAM_CLOZE_MASK) {
    out.push({ get: () => obj[key] as string, set: (val) => { obj[key] = val; } });
  }
}

// Push each non-empty string element of an array as a slot. Skips the
// diagram-cloze mask marker (see addStrSlot).
function addArrSlots(arr: unknown, out: AttrSlot[]): void {
  if (!Array.isArray(arr)) return;
  arr.forEach((el, i) => {
    if (typeof el === 'string' && el.trim().length > 0 && el !== DIAGRAM_CLOZE_MASK) {
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

/**
 * Deep-clone the set-level `diagrams` JSONB column (a `PathDiagram[]`) into a
 * mutable plain array so collectColumnDiagramSlots's set() closures can write
 * translations back in place. Returns null for a null/non-array column (no
 * write-back then).
 */
export function cloneDiagramColumn(column: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(column)) return null;
  return JSON.parse(JSON.stringify(column)) as Record<string, unknown>[];
}

/**
 * Collect translatable label slots from a cloned `diagrams` column, reusing the
 * exact per-diagram label selection (`collectDiagramSlots`) the theory walker
 * uses — so cards/quizzes translate the same labels theory does, with timeline
 * dates left untouched. Mutates the cloned objects in place via the slots.
 */
export function collectColumnDiagramSlots(
  diagrams: Record<string, unknown>[] | null,
): AttrSlot[] {
  const out: AttrSlot[] = [];
  if (!diagrams) return out;
  for (const d of diagrams) {
    if (d && typeof d === 'object') collectDiagramSlots(d, out);
  }
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
export function questionSlots(
  idx: number,
  q: QuizQuestionRow,
  payload: LooseObj | null,
  isLanguagePath = false,
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

  // On language-study paths a `translation`-kind question text IS the phrase
  // being studied — translating it would destroy the exercise (PA-23c).
  if (!(isLanguagePath && q.kind === 'translation')) {
    add('q', () => q.question, (v) => { q.question = v; });
  }
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
        // acceptableAnswers are the grading answer keys. On language-study
        // paths the answer IS the thing being learned, so it must stay in the
        // source language (PA-23b). On every other path the key must follow
        // the question into the target language or graded answers in the
        // user's language would be rejected.
        if (!isLanguagePath) {
          const acc = arrAt(p.acceptableAnswers);
          if (acc)
            acc.forEach((_, j) =>
              add(`aa${j}`, () => (p.acceptableAnswers as unknown[])[j], (v) => { (p.acceptableAnswers as unknown[])[j] = v; }),
            );
        }
        break;
      }
      case 'word_bank': {
        add('tpl', () => p.template, (v) => { p.template = v; });
        // Translate only the wordBank entries. After all bank entries are
        // translated we build a source→translated map and use it to sync
        // the slot correctAnswers (PA-23a). Translating correctAnswer
        // independently causes grading mismatches when the answer
        // diverges from the bank entry.
        const bank = arrAt(p.wordBank);
        const wbSlots = arrAt(p.slots);
        if (bank) {
          bank.forEach((_, j) =>
            add(`wb${j}`, () => (p.wordBank as unknown[])[j], (v) => { (p.wordBank as unknown[])[j] = v; }),
          );
        }
        // Register a post-translation hook by attaching metadata to the slot
        // objects. The actual sync happens in translateQuizActivity after the
        // map is built: it iterates slots and looks up correctAnswer in the
        // source→translated bank map.
        if (wbSlots && bank) {
          // Store the source bank values as a parallel array on the payload so
          // translateQuizActivity can build the sync map without re-reading DB.
          (p as LooseObj).__wbSourceBank = bank.map((b) => (typeof b === 'string' ? b : null));
          (p as LooseObj).__wbSlotCount = wbSlots.length;
        }
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
      case 'diagram_cloze': {
        // Translate the 4 options (the answer is `options[correctIndex]`, an
        // index — left untouched, so the cloze stays answerable post-translation
        // by construction). Then translate the embedded masked diagram's labels
        // via the same collector the theory walker uses; addStrSlot/addArrSlots
        // skip the mask marker, so the "?" element never gets translated. The
        // collected AttrSlots are bridged into the id-keyed TextSlot batch.
        const opts = arrAt(p.options);
        if (opts)
          opts.forEach((_, j) =>
            add(`do${j}`, () => (p.options as unknown[])[j], (v) => { (p.options as unknown[])[j] = v; }),
          );
        const diagram = p.diagram;
        if (diagram && typeof diagram === 'object') {
          const attrSlots: AttrSlot[] = [];
          collectDiagramSlots(diagram as Record<string, unknown>, attrSlots);
          attrSlots.forEach((s, j) =>
            slots.push({ id: `${idx}:dgl${j}`, get: s.get, set: s.set }),
          );
        }
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
        // Path-diagrams revival (Phase 3): set-level reference diagrams whose
        // labels are translatable prose. Loose JSON — collectDiagramSlots reads
        // each kind's strings.
        diagrams: Prisma.JsonValue;
        flashcards: Array<{
          id: string;
          question: string;
          answer: string;
          images: Array<{ id: string; caption: string | null }>;
        }>;
      }
    | null;
  quizSet:
    | { id: string; title: string; diagrams: Prisma.JsonValue; questions: QuizQuestionRow[] }
    | null;
}

async function translateTheoryActivity(
  activity: ActivityRow,
  source: string,
  target: string,
  onUsage: (u: TranslationUsage) => void,
  glossary?: ReadonlyMap<string, string>,
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
  const map = await translateBatch(strings, source, target, onUsage, glossary);

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
  glossary?: ReadonlyMap<string, string>,
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
  // Path-diagrams revival (Phase 3): the set-level reference diagrams carry
  // translatable labels (timeline event labels, step titles, comparison cells,
  // cycle nodes, …). Deep-clone the JSON, collect its label slots via the same
  // helper the theory walker uses, and ride the same batch — then write the
  // mutated clone back below. Without this a translated path shows English
  // diagram labels on cards.
  const diagramData = cloneDiagramColumn(set.diagrams);
  const diagramSlots = collectColumnDiagramSlots(diagramData);
  diagramSlots.forEach((s, i) => strings.push({ id: `dg${i}`, text: s.get() }));

  const map = await translateBatch(strings, source, target, onUsage, glossary);
  diagramSlots.forEach((s, i) => s.set(map.get(`dg${i}`) ?? s.get()));

  await db.$transaction([
    db.checkpointActivity.update({
      where: { id: activity.id },
      data: { title: map.get('act') ?? activity.title },
    }),
    db.flashcardSet.update({
      where: { id: set.id },
      data: {
        title: map.get('st') ?? set.title,
        ...(diagramData !== null
          ? { diagrams: diagramData as Prisma.InputJsonValue }
          : {}),
      },
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
  glossary?: ReadonlyMap<string, string>,
  isLanguagePath = false,
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
    const slots = questionSlots(i, q, payload, isLanguagePath);
    slots.forEach((s) => strings.push({ id: s.id, text: s.get() }));
    return { q, payload, slots };
  });

  // Figure-reuse (P4): translate each exhibit caption in place so a translated
  // path doesn't keep an English caption under a question's figure.
  set.questions.forEach((q, i) => {
    const caption = q.image?.caption?.trim();
    if (caption) strings.push({ id: `cap${i}`, text: caption });
  });

  // Path-diagrams revival (Phase 3): translate the set-level reference diagrams'
  // labels (same helper + same batch as the flashcard pass above).
  const diagramData = cloneDiagramColumn(set.diagrams);
  const diagramSlots = collectColumnDiagramSlots(diagramData);
  diagramSlots.forEach((s, i) => strings.push({ id: `dg${i}`, text: s.get() }));

  const map = await translateBatch(strings, source, target, onUsage, glossary);
  for (const { slots } of perQ) {
    slots.forEach((s) => s.set(map.get(s.id) ?? s.get()));
  }
  diagramSlots.forEach((s, i) => s.set(map.get(`dg${i}`) ?? s.get()));

  // PA-23a: sync word_bank correctAnswers from the translated bank.
  // questionSlots() translated only the bank entries (wb0, wb1, …) and
  // stashed the source bank as __wbSourceBank. Build a source→translated
  // lookup and copy matching translations onto each slot's correctAnswer
  // so grading never diverges from the presented bank options.
  for (const { q, payload } of perQ) {
    if (q.kind !== 'word_bank' || !payload) continue;
    const sourceBank = payload.__wbSourceBank as Array<string | null> | undefined;
    const slotCount = payload.__wbSlotCount as number | undefined;
    if (!Array.isArray(sourceBank) || typeof slotCount !== 'number') continue;

    // Build source text → translated text map from bank slot results.
    const bankMap = new Map<string, string>();
    sourceBank.forEach((srcText, j) => {
      if (typeof srcText !== 'string') return;
      const translated = map.get(`wb${j}`);
      if (translated) bankMap.set(srcText, translated);
    });

    // Apply: find the slot's current (source) correctAnswer value and look
    // it up in the bankMap. We read the original source value from the
    // slots array (before translation mutated the slot's value) via the
    // DB payload clone which still has the original correctAnswer.
    const originalPayload = q.payload && typeof q.payload === 'object'
      ? (q.payload as LooseObj)
      : null;
    const originalSlots = Array.isArray(originalPayload?.slots)
      ? originalPayload!.slots as LooseObj[]
      : null;
    if (originalSlots && Array.isArray(payload.slots)) {
      for (let j = 0; j < slotCount; j++) {
        const origSrc = originalSlots[j]?.correctAnswer;
        if (typeof origSrc === 'string') {
          const synced = bankMap.get(origSrc);
          if (synced !== undefined) {
            (payload.slots as LooseObj[])[j].correctAnswer = synced;
          }
          // If origSrc not in bankMap (bank entry missing or over-cap),
          // leave correctAnswer as-is (source fallback).
        }
      }
    }

    // Remove the temporary metadata keys before persisting.
    delete payload.__wbSourceBank;
    delete payload.__wbSlotCount;
  }

  // Clean up any remaining __wb* metadata on payloads for other kinds.
  for (const { payload } of perQ) {
    if (payload) {
      delete payload.__wbSourceBank;
      delete payload.__wbSlotCount;
    }
  }

  await db.$transaction([
    db.checkpointActivity.update({
      where: { id: activity.id },
      data: { title: map.get('act') ?? activity.title },
    }),
    db.quizSet.update({
      where: { id: set.id },
      data: {
        title: map.get('st') ?? set.title,
        ...(diagramData !== null
          ? { diagrams: diagramData as Prisma.InputJsonValue }
          : {}),
      },
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
    // PA-23: on language-study paths, quiz answer keys and translation-kind
    // question phrases are the studied content and must not be translated.
    const isLanguagePath = plan.subjects.includes('language');
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

    // PA-12g: include cacheWriteTokens in the accumulator.
    const usage = { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const onUsage = (u: TranslationUsage) => {
      usage.calls += 1;
      usage.inputTokens += u.inputTokens;
      usage.outputTokens += u.outputTokens;
      usage.cacheReadTokens += u.cacheReadTokens;
      usage.cacheWriteTokens += u.cacheWriteTokens;
    };

    // PA-36b: glossary seeded from the structural overlay result so deep
    // batch calls use consistent terminology for plan/phase/slot titles.
    let deepGlossary: Map<string, string> | undefined;

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

      // Build the glossary from source title → translated title for the plan,
      // phases, and slots (titles only — compact and unambiguous).
      deepGlossary = new Map<string, string>();
      if (plan.title && payload.title && plan.title !== payload.title) {
        deepGlossary.set(plan.title, payload.title);
      }
      for (const srcPhase of snapshot.phases) {
        const tgtPhase = payload.phases.find((p) => p.id === srcPhase.id);
        if (tgtPhase && srcPhase.title !== tgtPhase.title) {
          deepGlossary.set(srcPhase.title, tgtPhase.title);
        }
        for (const srcSlot of srcPhase.slots) {
          const tgtPhasePayload = payload.phases.find((p) => p.id === srcPhase.id);
          const tgtSlot = tgtPhasePayload?.slots.find((s) => s.id === srcSlot.id);
          if (tgtSlot && srcSlot.title !== tgtSlot.title) {
            deepGlossary.set(srcSlot.title, tgtSlot.title);
          }
        }
      }
      if (deepGlossary.size === 0) deepGlossary = undefined;

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
              await translateTheoryActivity(activity, source, targetLanguage, onUsage, deepGlossary);
            } else if (activity.kind === 'flashcards') {
              await translateFlashcardsActivity(activity, source, targetLanguage, onUsage, deepGlossary);
            } else if (activity.kind === 'quiz') {
              await translateQuizActivity(activity, source, targetLanguage, onUsage, deepGlossary, isLanguagePath);
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
    await invalidateDashboardCache(plan.userId);
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
        select: { userId: true },
      })
      .then((plan) => invalidateDashboardCache(plan.userId))
      .catch(() => {});
  }
}
