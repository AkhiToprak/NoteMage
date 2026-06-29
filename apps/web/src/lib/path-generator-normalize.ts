// Phase 10.7 — defensive normalization for Stage B AI tool outputs.
//
// Anthropic tool `input_schema` declares the SHAPE the model should return
// but doesn't bind it tightly enough for nested payloads — `QUIZ_TOOL_V2`
// uses `payload: { type: 'object' }` and `THEORY_SECTION_TOOL` accepts a
// `keyPoints` array that the model has been observed to return as a
// stringified JSON / object-keyed-by-index. These helpers coerce the
// common drift shapes back to canonical form so the downstream Zod
// validators (`TheorySectionSchema`, `QuizSetV2Schema`) accept them.
//
// Both functions are total — they never throw and always return a value.
// The downstream Zod schema is the final arbiter; anything we can't
// recover passes through unchanged so the orchestrator's per-activity
// failure collection ([path-generator.ts] `Promise.allSettled` loop) still
// gets a clean Zod error message.

import type { PathStructureToolInput } from './ai-tools';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Coerce a value that should be `string[]` back to that shape. Handles:
//   - already an array → coerce each element to a string
//   - JSON-stringified array → parse, recurse
//   - object with numeric-ish keys → Object.values()
//   - single string → wrap in single-element array
//   - anything else → []
function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((item) => {
        if (typeof item === 'string') return item;
        if (typeof item === 'number' || typeof item === 'boolean') return String(item);
        if (isPlainObject(item)) {
          const text = item.text ?? item.label ?? item.value ?? item.content;
          if (typeof text === 'string') return text;
        }
        return '';
      })
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        return toStringArray(parsed);
      } catch {
        // fall through
      }
    }
    return trimmed.length > 0 ? [trimmed] : [];
  }
  if (isPlainObject(v)) {
    return toStringArray(Object.values(v));
  }
  return [];
}

// Coerce a value that should be an array back to one. Handles the same
// drift shapes as `toStringArray` (object-keyed-by-index, JSON-stringified
// array) but leaves elements untyped so object normalizers map them.
function toUnknownArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (isPlainObject(v)) return Object.values(v);
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // fall through
      }
    }
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────
// Theory normalizer
// ─────────────────────────────────────────────────────────────────────

interface NormalizedTheoryExample {
  label: string;
  explanation: string;
}

interface NormalizedTheoryInput {
  title: string;
  introduction: string;
  keyPoints: string[];
  examples: NormalizedTheoryExample[];
  summary?: string;
  // Passed through verbatim (raw arrays) so the generator can validate each
  // entry with TheoryFigureSchema / PathDiagramSchema and drop invalid ones —
  // a malformed visual must not fail the whole theory parse. Theory-visuals
  // feature; absent on legacy output.
  figures?: unknown[];
  diagrams?: unknown[];
  // Optional source provenance (source-highlighting feature). Passed through
  // verbatim so the generator validates it with SourceAnchorSchema and drops a
  // malformed anchor — it must never fail the theory parse. Absent when the
  // section was written from general knowledge or no source materials accompanied
  // the prompt. Theory carries ONE primary anchor for the whole section.
  source?: Record<string, unknown>;
}

function normalizeExamples(v: unknown): NormalizedTheoryExample[] {
  let list: unknown[] = [];
  if (Array.isArray(v)) {
    list = v;
  } else if (isPlainObject(v)) {
    list = Object.values(v);
  } else if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) list = parsed;
      } catch {
        // fall through
      }
    }
  }

  const out: NormalizedTheoryExample[] = [];
  for (const item of list) {
    if (isPlainObject(item)) {
      const label =
        asNonEmptyString(item.label) ??
        asNonEmptyString(item.title) ??
        asNonEmptyString(item.name) ??
        asNonEmptyString(item.heading);
      const explanation =
        asNonEmptyString(item.explanation) ??
        asNonEmptyString(item.body) ??
        asNonEmptyString(item.text) ??
        asNonEmptyString(item.description) ??
        asNonEmptyString(item.content);
      if (label && explanation) {
        out.push({ label, explanation });
      } else if (explanation) {
        const synthesized = explanation.split(/\s+/).slice(0, 5).join(' ');
        out.push({ label: synthesized || 'Example', explanation });
      }
    } else if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed.length > 0) {
        const synthesized = trimmed.split(/\s+/).slice(0, 5).join(' ');
        out.push({ label: synthesized || 'Example', explanation: trimmed });
      }
    }
  }
  return out;
}

export function normalizeTheoryInput(raw: unknown): NormalizedTheoryInput {
  if (!isPlainObject(raw)) {
    return { title: '', introduction: '', keyPoints: [], examples: [] };
  }
  const title = asNonEmptyString(raw.title) ?? '';
  const introduction =
    asNonEmptyString(raw.introduction) ??
    asNonEmptyString(raw.intro) ??
    asNonEmptyString(raw.body) ??
    '';
  const keyPoints = toStringArray(raw.keyPoints ?? raw.key_points ?? raw.points ?? raw.bullets);
  const examples = normalizeExamples(raw.examples ?? raw.example ?? raw.worked_examples);
  const summary =
    asNonEmptyString(raw.summary) ??
    asNonEmptyString(raw.conclusion) ??
    asNonEmptyString(raw.wrap_up) ??
    undefined;
  const result: NormalizedTheoryInput = { title, introduction, keyPoints, examples };
  if (summary !== undefined) result.summary = summary;
  // Visuals pass through as-is; per-entry validation happens in the generator.
  if (Array.isArray(raw.figures)) result.figures = raw.figures;
  if (Array.isArray(raw.diagrams)) result.diagrams = raw.diagrams;
  // Pass the source anchor through untyped — SourceAnchorSchema is the arbiter
  // in the generator. Accept `source` or the drifted `citation` key.
  const sourceRaw = raw.source ?? raw.citation;
  if (isPlainObject(sourceRaw)) result.source = sourceRaw;
  return result;
}

// ─────────────────────────────────────────────────────────────────────
// Flashcards normalizer
// ─────────────────────────────────────────────────────────────────────

interface NormalizedFlashcard {
  question: string;
  answer: string;
  // Optional figure-reuse payload (P3). Passed through verbatim (raw object) so
  // the generator validates it with FlashcardFigureSchema and drops invalid
  // refs — a malformed figure must never fail the card. Absent on legacy output
  // and whenever no source-figure catalog accompanied the prompt.
  figure?: Record<string, unknown>;
  // Optional source provenance (source-highlighting feature). Passed through
  // verbatim so the generator validates it with SourceAnchorSchema and drops a
  // malformed anchor — it must never fail the card. Absent on legacy output and
  // whenever the card was written from general knowledge / no source materials.
  source?: Record<string, unknown>;
}

export interface NormalizedFlashcardsInput {
  title: string;
  flashcards: NormalizedFlashcard[];
}

// A flashcard side may arrive as a plain string or wrapped in an object
// (`{ text }` / `{ value }` / `{ content }` / `{ label }`) — Haiku
// intermittently nests the question/answer text under the strict tool
// schema, which then drops the whole card and surfaces as a spurious
// "empty flashcards" failure. Pull a usable string out of either shape
// (mirrors the quiz normalizer's `extractOptionText`); anything else → null.
function asFlexibleString(v: unknown): string | null {
  const direct = asNonEmptyString(v);
  if (direct) return direct;
  if (isPlainObject(v)) {
    return (
      asNonEmptyString(v.text) ??
      asNonEmptyString(v.value) ??
      asNonEmptyString(v.content) ??
      asNonEmptyString(v.label)
    );
  }
  return null;
}

// Coerce the `create_flashcards_for_slot` tool output to canonical form.
// The model has been observed to return `flashcards` as an object keyed by
// index or a JSON-stringified array — both slip past a truthy/`.length`
// guard and then crash a downstream `.map`. Card sides are resolved through
// `asFlexibleString`, so plain-string AND nested-object values both survive;
// cards missing a usable question or answer are dropped, and the caller
// treats an empty result as a failure.
export function normalizeFlashcardsInput(raw: unknown): NormalizedFlashcardsInput {
  if (!isPlainObject(raw)) {
    return { title: '', flashcards: [] };
  }
  const title = asNonEmptyString(raw.title) ?? '';
  const list = toUnknownArray(
    raw.flashcards ?? raw.cards ?? raw.flashCards ?? raw.flash_cards,
  );
  const flashcards: NormalizedFlashcard[] = [];
  for (const item of list) {
    if (!isPlainObject(item)) continue;
    const question =
      asFlexibleString(item.question) ??
      asFlexibleString(item.front) ??
      asFlexibleString(item.prompt) ??
      asFlexibleString(item.q) ??
      asFlexibleString(item.term);
    const answer =
      asFlexibleString(item.answer) ??
      asFlexibleString(item.back) ??
      asFlexibleString(item.a) ??
      asFlexibleString(item.definition) ??
      asFlexibleString(item.response);
    if (question && answer) {
      const card: NormalizedFlashcard = { question, answer };
      // Pass any figure object through untyped — FlashcardFigureSchema is the
      // arbiter in the generator. Accept `figure` or `image` as the key.
      const figureRaw = item.figure ?? item.image;
      if (isPlainObject(figureRaw)) card.figure = figureRaw;
      // Pass the source anchor through untyped — SourceAnchorSchema is the
      // arbiter in the generator. Accept `source` or the drifted `citation` key.
      const sourceRaw = item.source ?? item.citation;
      if (isPlainObject(sourceRaw)) card.source = sourceRaw;
      flashcards.push(card);
    }
  }
  return { title, flashcards };
}

// ─────────────────────────────────────────────────────────────────────
// Quiz normalizer
// ─────────────────────────────────────────────────────────────────────

interface NormalizedQuizQuestion {
  kind: string;
  prompt: string;
  hint?: string;
  correctExplanation?: string;
  wrongExplanation?: string;
  payload: Record<string, unknown>;
  // Optional figure-reuse payload (P4). Passed through verbatim (raw object) so
  // the generator validates it with QuizFigureSchema and drops invalid refs — a
  // malformed figure must never fail the question. Absent on legacy output and
  // whenever no source-figure catalog accompanied the prompt.
  figure?: Record<string, unknown>;
  // Optional source provenance (Phase D). Passed through verbatim so the
  // generator validates it with QuizSourceSchema and drops invalid ones — a
  // malformed source must never fail the question. Absent when the model wrote
  // the question from general knowledge or no source materials were supplied.
  source?: Record<string, unknown>;
}

// Pull the visible text out of an option that the model returned as an
// object (e.g. `{ text, isCorrect }` or `{ label, value }`).
function extractOptionText(opt: unknown): string {
  if (typeof opt === 'string') return opt;
  if (typeof opt === 'number' || typeof opt === 'boolean') return String(opt);
  if (isPlainObject(opt)) {
    const text =
      asNonEmptyString(opt.text) ??
      asNonEmptyString(opt.label) ??
      asNonEmptyString(opt.answer) ??
      asNonEmptyString(opt.option) ??
      asNonEmptyString(opt.value) ??
      asNonEmptyString(opt.content);
    if (text) return text;
  }
  return '';
}

function isMarkedCorrect(opt: unknown): boolean {
  if (!isPlainObject(opt)) return false;
  if (opt.correct === true) return true;
  if (opt.isCorrect === true) return true;
  if (opt.is_correct === true) return true;
  if (opt.correctAnswer === true) return true;
  return false;
}

function normalizeMcPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const rawOptions = payload.options ?? payload.choices ?? payload.answers;
  if (!Array.isArray(rawOptions)) {
    return payload;
  }
  const options = rawOptions.map((o) => extractOptionText(o)).filter((s) => s.length > 0);

  let correctIndex: number | undefined;
  if (typeof payload.correctIndex === 'number') {
    correctIndex = payload.correctIndex;
  } else if (typeof payload.correct_index === 'number') {
    correctIndex = payload.correct_index;
  } else if (typeof payload.answerIndex === 'number') {
    correctIndex = payload.answerIndex;
  } else {
    // Derive from any per-option `correct` flag
    const idx = rawOptions.findIndex((o) => isMarkedCorrect(o));
    if (idx >= 0) correctIndex = idx;
  }

  if (correctIndex === undefined) {
    // Try a top-level `correctAnswer` text
    const correctText =
      asNonEmptyString(payload.correctAnswer) ??
      asNonEmptyString(payload.answer) ??
      asNonEmptyString(payload.correct);
    if (correctText) {
      const idx = options.findIndex((o) => o === correctText);
      if (idx >= 0) correctIndex = idx;
    }
  }

  const out: Record<string, unknown> = { options };
  if (correctIndex !== undefined) out.correctIndex = correctIndex;
  return out;
}

function normalizeBlankPayload(
  payload: Record<string, unknown>,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  // Already correct shape — leave it.
  if (isPlainObject(payload.blank)) {
    const blank = payload.blank;
    const accept = blank.acceptableAnswers ?? blank.answers ?? blank.acceptable;
    const acceptableAnswers = toStringArray(accept);
    if (acceptableAnswers.length > 0) {
      const normalized: Record<string, unknown> = {
        blank: { acceptableAnswers },
      };
      if (typeof blank.caseSensitive === 'boolean') {
        (normalized.blank as Record<string, unknown>).caseSensitive = blank.caseSensitive;
      }
      if (typeof blank.fuzzyThreshold === 'number') {
        (normalized.blank as Record<string, unknown>).fuzzyThreshold = blank.fuzzyThreshold;
      }
      return { ...extras, ...normalized };
    }
  }
  // Hoisted: payload-level acceptableAnswers / answer(s) / correct
  const raw =
    payload.acceptableAnswers ??
    payload.answers ??
    payload.answer ??
    payload.correctAnswers ??
    payload.correctAnswer ??
    payload.correct;
  const acceptableAnswers = toStringArray(raw);
  if (acceptableAnswers.length > 0) {
    const blank: Record<string, unknown> = { acceptableAnswers };
    if (typeof payload.caseSensitive === 'boolean') blank.caseSensitive = payload.caseSensitive;
    if (typeof payload.fuzzyThreshold === 'number') blank.fuzzyThreshold = payload.fuzzyThreshold;
    return { ...extras, blank };
  }
  return payload;
}

function normalizeFillBlankPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return normalizeBlankPayload(payload);
}

function normalizeTranslationPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const targetLanguage =
    asNonEmptyString(payload.targetLanguage) ??
    asNonEmptyString(payload.target_language) ??
    asNonEmptyString(payload.language);
  const extras: Record<string, unknown> = {};
  if (targetLanguage) extras.targetLanguage = targetLanguage;
  return normalizeBlankPayload(payload, extras);
}

function normalizeWordBankPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const template =
    asNonEmptyString(payload.template) ??
    asNonEmptyString(payload.sentence) ??
    asNonEmptyString(payload.prompt) ??
    asNonEmptyString(payload.text);

  let slots: Array<{ correctAnswer: string }> | undefined;
  if (Array.isArray(payload.slots)) {
    slots = payload.slots
      .map((s) => {
        if (typeof s === 'string') return { correctAnswer: s };
        if (isPlainObject(s)) {
          const ans =
            asNonEmptyString(s.correctAnswer) ??
            asNonEmptyString(s.answer) ??
            asNonEmptyString(s.text) ??
            asNonEmptyString(s.value);
          return ans ? { correctAnswer: ans } : null;
        }
        return null;
      })
      .filter((s): s is { correctAnswer: string } => s !== null);
  } else {
    const rawAnswers =
      payload.answers ??
      payload.correctAnswers ??
      payload.correct ??
      payload.fillers;
    const answers = toStringArray(rawAnswers);
    if (answers.length > 0) slots = answers.map((a) => ({ correctAnswer: a }));
  }

  const wordBank = toStringArray(payload.wordBank ?? payload.bank ?? payload.tokens ?? payload.words ?? payload.choices);

  if (template && slots && slots.length > 0 && wordBank.length > 0) {
    // Top up the bank with any slot answer the AI forgot to include — with
    // proper multiplicity, so a puzzle whose answers are [A, B, A] always
    // has at least two "A" tokens in the bank. Without this, the learner
    // is sometimes handed an unsolvable bank (e.g. needing Russia twice
    // but the bank only contains Russia once).
    const bankCounts = new Map<string, number>();
    for (const w of wordBank) {
      const k = w.trim().toLowerCase();
      if (k.length > 0) bankCounts.set(k, (bankCounts.get(k) ?? 0) + 1);
    }
    const answerCounts = new Map<string, { canonical: string; count: number }>();
    for (const s of slots) {
      const k = s.correctAnswer.trim().toLowerCase();
      if (k.length === 0) continue;
      const entry = answerCounts.get(k);
      if (entry) entry.count += 1;
      else answerCounts.set(k, { canonical: s.correctAnswer, count: 1 });
    }
    for (const [k, { canonical, count }] of answerCounts) {
      const have = bankCounts.get(k) ?? 0;
      for (let i = have; i < count; i++) wordBank.push(canonical);
    }
    return { template, slots, wordBank };
  }
  return payload;
}

function normalizeMatchPairsPayload(payload: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(payload.pairs)) return payload;
  const pairs = payload.pairs
    .map((p) => {
      if (!isPlainObject(p)) return null;
      const left =
        asNonEmptyString(p.left) ??
        asNonEmptyString(p.term) ??
        asNonEmptyString(p.key) ??
        asNonEmptyString(p.from) ??
        asNonEmptyString(p.question);
      const right =
        asNonEmptyString(p.right) ??
        asNonEmptyString(p.definition) ??
        asNonEmptyString(p.value) ??
        asNonEmptyString(p.to) ??
        asNonEmptyString(p.answer);
      return left && right ? { left, right } : null;
    })
    .filter((p): p is { left: string; right: string } => p !== null);
  if (pairs.length === 0) return payload;
  return { pairs };
}

function normalizeSentenceReorderPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (Array.isArray(payload.correctOrder)) {
    const correctOrder = toStringArray(payload.correctOrder);
    if (correctOrder.length > 0) return { correctOrder };
  }
  const raw =
    payload.tokens ??
    payload.words ??
    payload.order ??
    payload.correct_order ??
    payload.sentence;
  if (typeof raw === 'string') {
    const tokens = raw.split(/\s+/).filter((s) => s.length > 0);
    if (tokens.length > 0) return { correctOrder: tokens };
  }
  const correctOrder = toStringArray(raw);
  if (correctOrder.length > 0) return { correctOrder };
  return payload;
}

function normalizeQuestionPayload(
  kind: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  switch (kind) {
    case 'mc':
      return normalizeMcPayload(payload);
    case 'fill_blank':
      return normalizeFillBlankPayload(payload);
    case 'translation':
      return normalizeTranslationPayload(payload);
    case 'word_bank':
      return normalizeWordBankPayload(payload);
    case 'match_pairs':
      return normalizeMatchPairsPayload(payload);
    case 'sentence_reorder':
      return normalizeSentenceReorderPayload(payload);
    default:
      return payload;
  }
}

export function normalizeQuizQuestions(raw: unknown): NormalizedQuizQuestion[] {
  // `toUnknownArray` (not a bare Array.isArray) so a JSON-stringified questions
  // array — GLM-5.2 returns the whole `questions` field as a `"[...]"` string
  // under forced tools — is parsed back into an array instead of dropped. A
  // dropped array failed Zod (`too_small`), which forced a retry storm and a
  // Sonnet fallback per checkpoint. Mirrors normalizePathStructure's phases/slots.
  const out: NormalizedQuizQuestion[] = [];
  for (const q of toUnknownArray(raw)) {
    if (!isPlainObject(q)) continue;
    const kind = asNonEmptyString(q.kind) ?? '';
    const prompt =
      asNonEmptyString(q.prompt) ??
      asNonEmptyString(q.question) ??
      asNonEmptyString(q.text) ??
      '';
    const payloadIn = isPlainObject(q.payload) ? q.payload : {};
    const payload = normalizeQuestionPayload(kind, payloadIn);
    const normalized: NormalizedQuizQuestion = { kind, prompt, payload };
    const hint = asNonEmptyString(q.hint);
    const correctExplanation =
      asNonEmptyString(q.correctExplanation) ?? asNonEmptyString(q.correct_explanation);
    const wrongExplanation =
      asNonEmptyString(q.wrongExplanation) ?? asNonEmptyString(q.wrong_explanation);
    if (hint) normalized.hint = hint;
    if (correctExplanation) normalized.correctExplanation = correctExplanation;
    if (wrongExplanation) normalized.wrongExplanation = wrongExplanation;
    // Pass any figure object through untyped — QuizFigureSchema is the arbiter
    // in the generator. Accept `figure` or `image` as the key.
    const figureRaw = q.figure ?? q.image;
    if (isPlainObject(figureRaw)) normalized.figure = figureRaw;
    // Pass any source object through untyped — QuizSourceSchema is the arbiter
    // in the generator (Phase D). Accept `source` or the drifted `citation` key.
    const sourceRaw = q.source ?? q.citation;
    if (isPlainObject(sourceRaw)) normalized.source = sourceRaw;
    out.push(normalized);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Path structure normalizer (Stage A)
// ─────────────────────────────────────────────────────────────────────

function normalizeSlotKind(v: unknown): 'learning' | 'review' | 'assessment' {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (s === 'review') return 'review';
  if (s === 'assessment') return 'assessment';
  return 'learning';
}

// Coerce the `create_path_structure` tool output to canonical form. The
// model sometimes omits `slots` on a phase or returns phases/slots in a
// drifted shape — without this, generatePathStructure crashes on
// `phase.slots.length`. Phases with no usable slot are dropped; the
// caller checks the result has at least one phase before using it.
export function normalizePathStructure(raw: unknown): PathStructureToolInput {
  if (!isPlainObject(raw)) {
    return { title: '', description: '', phases: [] };
  }
  const phases: PathStructureToolInput['phases'] = [];
  for (const phaseRaw of toUnknownArray(raw.phases)) {
    if (!isPlainObject(phaseRaw)) continue;
    const slots: PathStructureToolInput['phases'][number]['slots'] = [];
    for (const slotRaw of toUnknownArray(phaseRaw.slots)) {
      if (!isPlainObject(slotRaw)) continue;
      const slotTitle =
        asNonEmptyString(slotRaw.title) ??
        asNonEmptyString(slotRaw.name) ??
        asNonEmptyString(slotRaw.label);
      if (!slotTitle) continue;
      // `covers` (review/assessment) may arrive as numbers or numeric
      // strings; keep only non-negative integers. The persist step further
      // clamps them to slots that actually precede this one.
      const covers: number[] = [];
      for (const c of toUnknownArray(slotRaw.covers)) {
        const n =
          typeof c === 'number'
            ? c
            : typeof c === 'string'
              ? Number.parseInt(c, 10)
              : NaN;
        if (Number.isInteger(n) && n >= 0) covers.push(n);
      }
      slots.push({
        title: slotTitle,
        kind: normalizeSlotKind(slotRaw.kind),
        topicHint:
          asNonEmptyString(slotRaw.topicHint) ??
          asNonEmptyString(slotRaw.topic_hint) ??
          asNonEmptyString(slotRaw.description) ??
          slotTitle,
        objective:
          asNonEmptyString(slotRaw.objective) ??
          asNonEmptyString(slotRaw.learningObjective) ??
          undefined,
        covers: covers.length > 0 ? covers : undefined,
      });
    }
    if (slots.length === 0) continue;
    phases.push({
      title:
        asNonEmptyString(phaseRaw.title) ??
        asNonEmptyString(phaseRaw.name) ??
        `Section ${phases.length + 1}`,
      description: asNonEmptyString(phaseRaw.description) ?? '',
      slots,
    });
  }
  return {
    title: asNonEmptyString(raw.title) ?? '',
    description: asNonEmptyString(raw.description) ?? '',
    phases,
  };
}
