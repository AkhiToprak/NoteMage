/**
 * Mage Revolution Phase 7 — focused practice-session generator.
 *
 * The medium-risk "generate" Mage actions (weak-topic / exam-sim / manual
 * practice) land here. The flow:
 *   1. gather a FOCUS POOL + a bounded source corpus for the origin
 *      (weak checkpoints via `derivePathStats`, missed `QuizAnswer`s, exam
 *      scope, or the in-context study pack/path),
 *   2. assemble a short focused `QuizSet` by REUSING the path quiz primitive —
 *      `forcedStructuredCall` + `QUIZ_FOR_SLOT_TOOL` (already in the stable
 *      tool array, so the corpus prompt-caches) + the same `QuizSetV2Schema`
 *      validator + `buildLegacyColumns` mapping (zero new generation/grading
 *      code),
 *   3. persist it under a hidden per-user "Practice with Mage" notebook so the
 *      EXISTING study-pack quiz viewer + canonical attempt route work unchanged.
 *
 * The route owns auth / quota reservation / the `PracticeSession` row + status
 * (so HTTP concerns stay there); this module owns the focus gathering, the AI
 * call, and persistence. The pure helpers (focus selection, instruction text,
 * column mapping, action→origin) are exported for unit tests, mirroring
 * `quiz-grading.test.ts`.
 */

import { Prisma } from '@prisma/client';
import type { PathPlan } from '@/components/learn/PathView';
import { db } from './db';
import { tiptapJsonToPlainText } from './contentConverter';
import { derivePathStats } from './path-stats';
import { serializePath, pathInclude } from './path-loader';
import { loadExamReadiness } from './exam-scope';
import { forcedStructuredCall, type NormalizedUsage } from './path-generator-routing';
import { QUIZ_FOR_SLOT_TOOL, quizPayloadCatalogFor, type QuizForSlotToolInput } from './ai-tools';
import { normalizeQuizQuestions } from './path-generator-normalize';
import {
  QuizSetV2Schema,
  QuizSourceSchema,
  type QuestionKind,
  type QuizQuestionV2,
} from '@notemage/shared';
import { buildLegacyColumns } from './quiz-grading';
import { logAiUsage } from './ai-usage';
import { logTelemetry } from './telemetry-server';
import type { MageActionId, MageContextIds } from './mage-types';
import type { TierKey } from './tiers';
import { verifiedSourceAnchor } from './source-grounding';
import {
  applyQuizVerification,
  shouldVerifyQuiz,
  verifyQuiz,
  type QuizVerificationResult,
} from './quiz-verifier';

// ─────────────────────────────────────────────────────────────────────
// Constants + pure helpers (unit-tested)
// ─────────────────────────────────────────────────────────────────────

export type PracticeOrigin = 'weak_topic' | 'exam_sim' | 'mistake_review' | 'manual';

/**
 * Safe, subject-agnostic, cleanly server-gradable kinds for ad-hoc practice.
 * Deliberately EXCLUDES equation / code_* / timeline / translation — those are
 * subject-specific and carry grading edge cases the path generator only emits
 * behind a subject filter. A practice set has no classifier, so we stick to the
 * four kinds that grade reliably for any material.
 */
export const PRACTICE_QUIZ_KINDS: QuestionKind[] = ['mc', 'true_false', 'fill_blank', 'match_pairs'];

/** Total corpus chars fed to one practice call (theory is already distilled). */
const PRACTICE_CORPUS_CAP = 14_000;
/** Most focus topics we list in the prompt tail. */
const MAX_FOCUS_TOPICS = 8;
export const PRACTICE_QUIZ_PROMPT_VERSION = 'practice-quiz-2026-07-02-v2';

/** Bounded question count per origin — keeps the single GLM quiz call cheap + fast. */
export function practiceQuizCount(origin: PracticeOrigin): number {
  return origin === 'exam_sim' ? 12 : 8;
}

/**
 * Map a medium-risk "generate" Mage action id to its practice origin. Returns
 * null for any id that is NOT a practice-session generator (e.g. EXPLAIN_MISTAKE,
 * which the panel handles as a grounded chat turn, or any navigate/prefill id).
 */
export function practiceOriginForAction(action: MageActionId): PracticeOrigin | null {
  switch (action) {
    case 'START_WEAK_TOPIC_SESSION':
      return 'weak_topic';
    case 'START_EXAM_SIMULATION':
      return 'exam_sim';
    case 'CREATE_PRACTICE_SET':
      return 'manual';
    default:
      return null;
  }
}

/**
 * Merge weak-checkpoint titles and missed-question prompts into a deduped,
 * length-capped focus list (case-insensitive de-dup, weak titles first). Pure.
 */
export function selectFocusTopics(
  weakTitles: readonly string[],
  missedPrompts: readonly string[],
  max = MAX_FOCUS_TOPICS,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...weakTitles, ...missedPrompts]) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed.length > 160 ? `${trimmed.slice(0, 159)}…` : trimmed);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * The cacheable static instruction block — the quiz role + STRICT SHAPE RULES +
 * the payload catalog restricted to the allowed kinds. Byte-stable per kind set
 * so GLM implicitly prefix-caches it alongside the corpus (the dynamic focus
 * tail is left uncached). The shape rules mirror QUIZ_TOOL_V2's proven description.
 */
export function buildPracticeQuizInstructions(kinds: QuestionKind[]): string {
  return [
    'You are NoteMage, writing a SHORT focused practice quiz that helps a learner drill the material above they are weak on.',
    'Ground every question in the SOURCE MATERIALS — never invent facts they do not support. When focus topics are listed, weight the quiz toward them.',
    '',
    'STRICT SHAPE RULES — the server rejects questions that violate these:',
    '1. `mc` `options` is an ARRAY OF PLAIN STRINGS (never objects like {text,isCorrect}); mark the answer with the top-level `correctIndex` (0–3), and include payload.optionFeedback aligned to all four options (null for the correct option; targeted misconception correction for each wrong option).',
    '2. `true_false` payload is `{"correct": true|false}`.',
    '3. `fill_blank` payload MUST wrap answers inside `blank: { acceptableAnswers: [...] }` — never at the payload root.',
    '4. `match_pairs` uses keys `left` and `right` on each pair — never term/definition.',
    '',
    `Use ONLY these question kinds: ${kinds.join(', ')}. Mix at least two kinds when the material supports it.`,
    'Give each question a short `correctExplanation` and `wrongExplanation` so the learner learns from mistakes.',
    '',
    'PROVENANCE: when SOURCE MATERIALS are present, every question must attach a `source` object `{ "label": <the "## " section heading the passage came from>, "quote": <a VERBATIM excerpt of <=60 words from that section> }`. Copy the quote word-for-word—never paraphrase or invent one. Only omit `source` when no source corpus was supplied.',
    '',
    quizPayloadCatalogFor(kinds),
  ].join('\n');
}

/** The per-call dynamic tail — focus topics + count + optional subject. Pure. */
export function buildPracticeFocusTail(opts: {
  focusTopics: readonly string[];
  count: number;
  subject?: string;
}): string {
  const lines: string[] = [`Produce about ${opts.count} questions.`];
  if (opts.subject) lines.push(`Subject area: ${opts.subject}.`);
  if (opts.focusTopics.length > 0) {
    lines.push('Focus the quiz on these weak topics the learner has struggled with:');
    for (const t of opts.focusTopics) lines.push(`- ${t}`);
  } else {
    lines.push('Cover the most important ideas across the source materials evenly.');
  }
  return lines.join('\n');
}

type ValidatedPracticeQuiz = ReturnType<typeof QuizSetV2Schema.parse>;

interface PracticeGenerationMeta {
  promptVersion: string;
  provider: NormalizedUsage['provider'];
  model: string;
  verificationStatus: string;
  verification: QuizVerificationResult | null;
  rejectedIndexes: number[];
  /** In-memory only; used to verify source quotes before persistence. */
  sourceCorpus: string | null;
}

type AssembledPracticeQuiz = ValidatedPracticeQuiz & { generationMeta?: PracticeGenerationMeta };

/**
 * Validate raw tool output into a practice quiz: normalize drift → Zod-check the
 * v2 shape → drop any question whose kind is outside {@link PRACTICE_QUIZ_KINDS}.
 * Returns null when nothing usable survives (the caller retries / refunds). Pure.
 */
export function parsePracticeQuiz(
  raw: unknown,
  fallbackTitle: string,
  allowKinds: readonly QuestionKind[] = PRACTICE_QUIZ_KINDS,
): ValidatedPracticeQuiz | null {
  const r = (raw ?? {}) as { title?: unknown; questions?: unknown };
  const normalized = normalizeQuizQuestions(r.questions);
  const parsed = QuizSetV2Schema.safeParse({
    title: typeof r.title === 'string' && r.title.trim().length > 0 ? r.title : fallbackTitle,
    questions: normalized,
  });
  if (!parsed.success) return null;
  // Intersect the requested kinds with the always-safe practice set so a mock
  // can never widen the gradable surface beyond the four reliable kinds.
  const safe = new Set<QuestionKind>(PRACTICE_QUIZ_KINDS);
  const allow = new Set<QuestionKind>([...allowKinds].filter((k) => safe.has(k)));
  const effective = allow.size > 0 ? allow : safe;
  const questions = parsed.data.questions.filter((q) => effective.has(q.kind));
  if (questions.length === 0) return null;
  return { ...parsed.data, questions };
}

/** Map validated questions onto `QuizQuestion` create rows (legacy columns +
 *  kind/payload), exactly as the path generator does. Pure. */
export function practiceQuestionRows(
  questions: ValidatedPracticeQuiz['questions'],
  sourceCorpus?: string | null,
): Prisma.QuizQuestionCreateWithoutQuizSetInput[] {
  return questions.map((q, i) => {
    const legacy = buildLegacyColumns(q.kind, q.payload);
    // Phase E — validate the loose `source` separately (mirrors the path
    // generator's drop policy): a malformed or general-knowledge source becomes
    // null rather than failing the question. The runner's Sources card + reader
    // drawer light up only when a verbatim quote survived.
    const rawSource = (q as { source?: unknown }).source;
    const parsedSource = rawSource == null ? null : QuizSourceSchema.safeParse(rawSource);
    const source =
      parsedSource && parsedSource.success
        ? sourceCorpus === undefined
          ? parsedSource.data
          : verifiedSourceAnchor(parsedSource.data, sourceCorpus)
        : null;
    return {
      kind: q.kind,
      payload: q.payload as unknown as Prisma.InputJsonValue,
      question: q.prompt,
      options: legacy.options,
      correctIndex: legacy.correctIndex,
      hint: q.hint ?? null,
      correctExplanation: q.correctExplanation ?? null,
      wrongExplanation: q.wrongExplanation ?? null,
      sourceLabel: source?.label ?? null,
      sourcePage: source?.page ?? null,
      sourceQuote: source?.quote ?? null,
      sortOrder: i,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────
// Focus gathering (db) — one loader per origin, all ownership-scoped
// ─────────────────────────────────────────────────────────────────────

export interface PracticeFocus {
  origin: PracticeOrigin;
  /** Title for the assembled quiz. */
  title: string;
  /** Bounded source corpus (theory / notes), or null when only topics drive it. */
  corpus: string | null;
  /** Weak-topic hints the model weights the quiz toward. */
  focusTopics: string[];
  /** Dominant subject of the source path, when known — steers tone. */
  subject?: string;
  /** Provenance for the `PracticeSession` row. */
  examId?: string;
  sourcePathId?: string;
}

/** Join titled text sections under a total char cap, dropping empty ones. */
function joinCappedSections(
  sections: { heading?: string; text: string }[],
  cap: number,
): string {
  const parts: string[] = [];
  let used = 0;
  for (const s of sections) {
    const text = s.text.trim();
    if (!text) continue;
    const block = s.heading ? `## ${s.heading}\n${text}` : text;
    if (used + block.length > cap) {
      const remaining = cap - used;
      if (remaining > 400) parts.push(block.slice(0, remaining));
      break;
    }
    parts.push(block);
    used += block.length;
  }
  return parts.join('\n\n');
}

/** A path's theory bodies (already-distilled corpus), capped. */
async function loadPathTheoryCorpus(userId: string, pathId: string): Promise<string> {
  const acts = await db.checkpointActivity.findMany({
    where: { kind: 'theory', slot: { phase: { plan: { id: pathId, userId } } } },
    select: { title: true, theory: { select: { body: true } } },
    take: 60,
  });
  return joinCappedSections(
    acts.map((a) => ({ heading: a.title, text: a.theory ? tiptapJsonToPlainText(a.theory.body) || '' : '' })),
    PRACTICE_CORPUS_CAP,
  );
}

/** A study pack's page text (plain mirror, lazy-converting TipTap), capped. */
async function loadNotebookCorpus(userId: string, notebookId: string): Promise<string> {
  const pages = await db.page.findMany({
    where: { section: { notebookId, notebook: { userId } } },
    orderBy: { updatedAt: 'desc' },
    take: 40,
    select: { title: true, textContent: true, content: true },
  });
  return joinCappedSections(
    pages.map((p) => ({ heading: p.title, text: p.textContent || tiptapJsonToPlainText(p.content) || '' })),
    PRACTICE_CORPUS_CAP,
  );
}

/** Prompts of questions the learner got wrong on a given quiz set (newest first). */
async function loadMissedPrompts(userId: string, quizSetId: string): Promise<string[]> {
  const wrong = await db.quizAnswer.findMany({
    where: { isCorrect: false, attempt: { userId, quizSetId } },
    orderBy: { createdAt: 'desc' },
    take: 40,
    select: { question: { select: { question: true } } },
  });
  return wrong.map((w) => w.question?.question ?? '').filter((q) => q.length > 0);
}

/** weak_topic origin: weak checkpoints + the path's theory corpus. */
export async function loadWeakTopicFocus(userId: string, pathId: string): Promise<PracticeFocus | null> {
  const plan = await db.studyPlan.findFirst({ where: { id: pathId, userId }, include: pathInclude });
  if (!plan) return null;
  // `SerializedPath` is structurally a `PathPlan` for stats purposes (same as exam-scope).
  const stats = derivePathStats(serializePath(plan) as unknown as PathPlan);
  const weakTitles = stats.weakCheckpoints.map((w) => w.title);
  // No graded weak checkpoints yet → fall back to the lowest-mastery section.
  const fallback = weakTitles.length === 0 && stats.weakTopicName ? [stats.weakTopicName] : [];
  const focusTopics = selectFocusTopics([...weakTitles, ...fallback], []);
  const corpus = await loadPathTheoryCorpus(userId, pathId);
  if (!corpus && focusTopics.length === 0) return null;
  return {
    origin: 'weak_topic',
    title: `${plan.title} — weak-spot practice`,
    corpus: corpus || null,
    focusTopics,
    subject: plan.subjects?.[0],
    sourcePathId: pathId,
  };
}

/** exam_sim origin: corpus from scoped paths + pages; weak topics from readiness. */
export async function loadExamSimFocus(userId: string, examId: string): Promise<PracticeFocus | null> {
  const exam = await db.exam.findFirst({ where: { id: examId, userId }, select: { id: true, title: true } });
  if (!exam) return null;

  const scope = await db.examScopeItem.findMany({
    where: { examId },
    select: { itemType: true, itemId: true },
    take: 200,
  });
  const pathIds = scope.filter((s) => s.itemType === 'path').map((s) => s.itemId);
  const pageIds = scope.filter((s) => s.itemType === 'page').map((s) => s.itemId);
  const sectionIds = scope.filter((s) => s.itemType === 'section').map((s) => s.itemId);

  const sections: { heading?: string; text: string }[] = [];
  if (pathIds.length > 0) {
    const acts = await db.checkpointActivity.findMany({
      where: { kind: 'theory', slot: { phase: { plan: { id: { in: pathIds }, userId } } } },
      select: { title: true, theory: { select: { body: true } } },
      take: 80,
    });
    for (const a of acts) {
      sections.push({ heading: a.title, text: a.theory ? tiptapJsonToPlainText(a.theory.body) || '' : '' });
    }
  }
  if (pageIds.length > 0 || sectionIds.length > 0) {
    const pageOr: Prisma.PageWhereInput[] = [];
    if (pageIds.length > 0) pageOr.push({ id: { in: pageIds } });
    if (sectionIds.length > 0) pageOr.push({ sectionId: { in: sectionIds } });
    const pages = await db.page.findMany({
      where: { section: { notebook: { userId } }, OR: pageOr },
      take: 60,
      select: { title: true, textContent: true, content: true },
    });
    for (const p of pages) {
      sections.push({ heading: p.title, text: p.textContent || tiptapJsonToPlainText(p.content) || '' });
    }
  }
  const corpus = joinCappedSections(sections, PRACTICE_CORPUS_CAP);

  // Best-effort weak topics from the readiness rollup (never fatal).
  const readiness = await loadExamReadiness(userId, examId).catch(() => null);
  const weakTitles = readiness?.readiness.weakTopics.map((w) => w.title) ?? [];
  const focusTopics = selectFocusTopics(weakTitles, []);

  if (!corpus && focusTopics.length === 0) return null;
  return {
    origin: 'exam_sim',
    title: `${exam.title} — mock exam`,
    corpus: corpus || null,
    focusTopics,
    examId,
  };
}

/** manual origin: the in-context study pack (+ missed answers on an open quiz) or path. */
export async function loadManualFocus(userId: string, ids: MageContextIds): Promise<PracticeFocus | null> {
  if (ids.notebookId) {
    const nb = await db.studyContainer.findFirst({
      where: { id: ids.notebookId, userId },
      select: { name: true },
    });
    if (nb) {
      const corpus = await loadNotebookCorpus(userId, ids.notebookId);
      const missed = ids.quizSetId ? await loadMissedPrompts(userId, ids.quizSetId) : [];
      const focusTopics = selectFocusTopics([], missed);
      if (corpus || focusTopics.length > 0) {
        return {
          origin: 'manual',
          title: `${nb.name} — practice set`,
          corpus: corpus || null,
          focusTopics,
        };
      }
    }
  }
  if (ids.pathId) {
    const plan = await db.studyPlan.findFirst({
      where: { id: ids.pathId, userId },
      select: { title: true, subjects: true },
    });
    if (plan) {
      const corpus = await loadPathTheoryCorpus(userId, ids.pathId);
      if (corpus) {
        return {
          origin: 'manual',
          title: `${plan.title} — practice set`,
          corpus,
          focusTopics: [],
          subject: plan.subjects?.[0],
          sourcePathId: ids.pathId,
        };
      }
    }
  }
  return null;
}

/** Dispatch focus gathering by origin against ALREADY-AUTHORIZED context ids. */
export function loadPracticeFocus(
  userId: string,
  origin: PracticeOrigin,
  ids: MageContextIds,
): Promise<PracticeFocus | null> {
  switch (origin) {
    case 'weak_topic':
      return ids.pathId ? loadWeakTopicFocus(userId, ids.pathId) : Promise.resolve(null);
    case 'exam_sim':
      return ids.examId ? loadExamSimFocus(userId, ids.examId) : Promise.resolve(null);
    case 'manual':
      return loadManualFocus(userId, ids);
    default:
      return Promise.resolve(null);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Generation + persistence (db / AI)
// ─────────────────────────────────────────────────────────────────────

const PRACTICE_NOTEBOOK_NAME = 'Practice with Mage';
const PRACTICE_NOTEBOOK_COLOR = '#7c6cf0';

/**
 * The hidden per-user notebook that hosts every Mage practice quiz. Lazily
 * created (mirrors `getOrCreateInboxNotebook`); `kind: 'practice'` keeps it out
 * of the standard Study Packs grid, but the quiz viewer + canonical attempt
 * route resolve it by id so the set is fully playable + gradable.
 */
export async function getOrCreatePracticeNotebook(userId: string): Promise<string> {
  const existing = await db.studyContainer.findFirst({
    where: { userId, kind: 'practice' },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await db.studyContainer.create({
    data: { userId, name: PRACTICE_NOTEBOOK_NAME, color: PRACTICE_NOTEBOOK_COLOR, kind: 'practice' },
    select: { id: true },
  });
  return created.id;
}

/**
 * Assemble a focused practice quiz by REUSING the path quiz primitive. Routes to
 * the GLM quiz slot via `resolveModel('path-quiz')` (inside `forcedStructuredCall`),
 * relies on GLM's implicit prefix cache for the corpus + static rules, and
 * validates with the same
 * `QuizSetV2Schema`. Up to 2 validation attempts; logs one `ai.model_usage`
 * event. Throws if nothing usable is produced (the route refunds the quota).
 */
export async function assemblePracticeQuiz(opts: {
  userId: string;
  tier: TierKey;
  corpus: string | null;
  focusTopics: string[];
  subject?: string;
  title: string;
  count: number;
  origin: PracticeOrigin;
  /** Restrict to a subset of the safe practice kinds (Phase 3 mock setup lets the
   *  learner choose). Defaults to all four; always intersected with the safe set. */
  kinds?: readonly QuestionKind[];
  /** Appended to the dynamic (uncached) tail — e.g. a mock's difficulty steer. */
  extraInstruction?: string;
}): Promise<AssembledPracticeQuiz> {
  const safe = new Set<QuestionKind>(PRACTICE_QUIZ_KINDS);
  const requested = (opts.kinds ?? PRACTICE_QUIZ_KINDS).filter((k) => safe.has(k));
  const kinds: QuestionKind[] = requested.length > 0 ? requested : PRACTICE_QUIZ_KINDS;
  const staticInstructions = buildPracticeQuizInstructions(kinds);
  const baseTail = [
    buildPracticeFocusTail({
      focusTopics: opts.focusTopics,
      count: opts.count,
      subject: opts.subject,
    }),
    opts.extraInstruction?.trim() ? opts.extraInstruction.trim() : '',
  ]
    .filter(Boolean)
    .join('\n');
  const corpus = opts.corpus && opts.corpus.trim().length > 0 ? opts.corpus : null;

  const usage = {
    // Placeholder — overwritten by onUsage with the real provider (openrouter
    // for the quiz stage). Kept as a valid provider literal for typing.
    provider: 'openrouter' as NormalizedUsage['provider'],
    model: '',
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  const onUsage = (u: NormalizedUsage) => {
    usage.provider = u.provider;
    usage.model = u.model;
    usage.inputTokens += u.inputTokens;
    usage.outputTokens += u.outputTokens;
    usage.cacheReadTokens += u.cacheReadTokens;
    usage.cacheWriteTokens += u.cacheWriteTokens;
  };

  let parsed: ValidatedPracticeQuiz | null = null;
  for (let attempt = 1; attempt <= 2 && !parsed; attempt++) {
    const tail =
      attempt === 1
        ? baseTail
        : [
            baseTail,
            '',
            '--- RETRY NOTICE ---',
            'Your previous quiz was empty or malformed. Regenerate the entire quiz; the `questions` array MUST be non-empty and every payload MUST match its kind exactly.',
          ].join('\n');
    try {
      const raw = await forcedStructuredCall<QuizForSlotToolInput>({
        stage: 'quiz',
        corpus,
        staticInstructions,
        dynamicInstructions: tail,
        anthropicTool: QUIZ_FOR_SLOT_TOOL,
        userMessage: 'Generate the practice quiz now. The questions array must not be empty.',
        // Extraction-shaped forced tool — sample cold, not at the ~1.0 default.
        temperature: 0.3,
        onUsage,
      });
      parsed = parsePracticeQuiz(raw, opts.title, kinds);
    } catch (err) {
      logTelemetry(opts.userId, 'mage.practice.retry', {
        origin: opts.origin,
        attempt,
        reason: err instanceof Error ? err.message : 'call_failed',
      });
    }
  }

  if (usage.model) {
    logAiUsage({
      userId: opts.userId,
      feature: 'mage-practice',
      tier: opts.tier,
      provider: usage.provider,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      extra: { origin: opts.origin, count: opts.count, focus: opts.focusTopics.length },
    });
  }

  if (!parsed) throw new Error('practice quiz generation produced no usable questions');

  const verifyThisQuiz = shouldVerifyQuiz({
    slotKind: opts.origin === 'exam_sim' ? 'final_exam' : 'assessment',
    sampleKey: `${opts.origin}:${opts.title}:${opts.focusTopics.join('|')}`,
  });
  let verification: QuizVerificationResult | null = null;
  if (verifyThisQuiz) {
    const verifierQuestions = parsed.questions.map((question) => {
      const copy = { ...question } as QuizQuestionV2 & { source?: unknown };
      const source = verifiedSourceAnchor(copy.source, corpus);
      if (source) copy.source = source;
      else delete copy.source;
      return copy as QuizQuestionV2;
    });
    verification = await verifyQuiz({
      userId: opts.userId,
      objective:
        opts.focusTopics.length > 0
          ? `Assess these focus topics: ${opts.focusTopics.join(', ')}`
          : 'Assess the most important ideas in the supplied material.',
      hasSourceMaterials: Boolean(corpus),
      questions: verifierQuestions,
    });
  }
  const minCount = Math.min(parsed.questions.length, opts.origin === 'exam_sim' ? 8 : 3);
  const applied = applyQuizVerification(parsed.questions, verification, minCount);
  // Use the deterministic practice title, not the model's generic one.
  return {
    ...parsed,
    title: opts.title,
    questions: applied.questions,
    generationMeta: {
      promptVersion: PRACTICE_QUIZ_PROMPT_VERSION,
      provider: usage.provider,
      model: usage.model,
      verificationStatus: applied.status,
      verification,
      rejectedIndexes: applied.rejectedIndexes,
      sourceCorpus: corpus,
    },
  };
}

/** Persist a validated practice quiz as a standalone `QuizSet` under `notebookId`. */
export async function persistPracticeQuizSet(
  userId: string,
  notebookId: string,
  parsed: AssembledPracticeQuiz,
): Promise<string> {
  const meta = parsed.generationMeta;
  const set = await db.quizSet.create({
    data: {
      userId,
      notebookId,
      title: parsed.title,
      generationPromptVersion: meta?.promptVersion ?? null,
      generationProvider: meta?.provider ?? null,
      generationModel: meta?.model || null,
      verificationStatus: meta?.verificationStatus ?? null,
      verificationModel: meta?.verification?.model ?? null,
      ...(meta?.verification
        ? {
            verificationDetails: {
              items: meta.verification.items,
              error: meta.verification.error ?? null,
              rejectedIndexes: meta.rejectedIndexes,
            } as unknown as Prisma.InputJsonValue,
          }
        : {}),
      questions: { create: practiceQuestionRows(parsed.questions, meta?.sourceCorpus) },
    },
    select: { id: true },
  });
  return set.id;
}
