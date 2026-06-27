/**
 * Mage Revolution Phase 5 — db-backed exam scope + readiness loading.
 *
 * The pure rollup lives in `exam-readiness.ts`; this module does the I/O:
 *  - validates + RE-AUTHORIZES the `ExamScopeItem` refs a client sends (every
 *    referenced row must belong to the requesting user),
 *  - resolves an exam's stored scope into display-ready rows + picker candidates,
 *  - loads each scoped item's progress (paths via `derivePathStats`, quiz sets
 *    via best `QuizAttempt`) and feeds `deriveExamReadiness`,
 *  - formats the volatile study-state block the Mage panel injects (uncached,
 *    placed AFTER the corpus block so a changing readiness never busts the cache).
 */

import type { PathPlan } from '@/components/learn/PathView';
import { db } from './db';
import { derivePathStats } from './path-stats';
import { serializePath, pathInclude } from './path-loader';
import {
  deriveExamReadiness,
  deriveWeakAreas,
  type ExamPassiveItem,
  type ExamPathReadiness,
  type ExamQuizReadiness,
  type ExamReadiness,
  type ExamReadinessInput,
  type WeakAreasResult,
} from './exam-readiness';
import { getGradingSystem, formatGrade, DEFAULT_GRADING_SYSTEM_ID } from './grading-systems';

/** Accepted `ExamScopeItem.itemType` values. */
export const EXAM_SCOPE_ITEM_TYPES = [
  'path',
  'quiz_set',
  'flashcard_set',
  'page',
  'document',
  'section',
] as const;

export type ScopeItemTypeStr = (typeof EXAM_SCOPE_ITEM_TYPES)[number];

const SCOPE_TYPE_SET: ReadonlySet<string> = new Set(EXAM_SCOPE_ITEM_TYPES);

/** Defensive bound on an exam's scope size — not user-facing pagination. */
export const MAX_SCOPE_ITEMS = 200;

/** Picker bound per content kind. */
const CANDIDATE_TAKE = 200;

/** Bound on the exams-list overview — each active exam triggers a readiness rollup. */
const OVERVIEW_TAKE = 30;

export interface ScopeItemRef {
  itemType: ScopeItemTypeStr;
  itemId: string;
}

export interface ResolvedScopeItem extends ScopeItemRef {
  title: string;
  subtitle?: string;
}

export interface ScopeCandidate {
  id: string;
  title: string;
  subtitle?: string;
}

export interface ScopeCandidates {
  paths: ScopeCandidate[];
  quizSets: ScopeCandidate[];
  flashcardSets: ScopeCandidate[];
  pages: ScopeCandidate[];
  documents: ScopeCandidate[];
  sections: ScopeCandidate[];
}

export interface ExamMeta {
  id: string;
  title: string;
  examDate: string; // ISO-8601
  notebookId: string;
  notebookName: string | null;
}

export interface ExamScopeView {
  exam: ExamMeta;
  items: ResolvedScopeItem[];
  candidates: ScopeCandidates;
}

export interface ExamReadinessResult {
  exam: ExamMeta;
  /** Whole days until the exam (negative once past). */
  daysUntil: number;
  readiness: ExamReadiness;
}

export interface ExamWeakAreasResult {
  exam: ExamMeta;
  /** Whole days until the exam (negative once past). */
  daysUntil: number;
  /** First scoped learning path — the deep-link target for path-sourced topics. */
  primaryPathId: string | null;
  weakAreas: WeakAreasResult;
}

/** One upcoming exam, enriched with its readiness summary for the exams list. */
export interface ExamOverviewActive {
  id: string;
  title: string;
  examDate: string; // ISO-8601
  notebookName: string | null;
  /** Whole days until the exam. */
  daysUntil: number;
  /** 0–100 weighted readiness (0 until graded material is in scope). */
  readiness: number;
  hasGradedMaterial: boolean;
  /** True when nothing is scoped yet. */
  isEmpty: boolean;
  /** Number of weak topics surfaced by the rollup. */
  weakAreas: number;
  /** Number of scoped learning paths. */
  linkedPaths: number;
}

/** One past exam — no readiness, plus the recorded grade for the "Archived" list. */
export interface ExamOverviewArchived {
  id: string;
  title: string;
  examDate: string; // ISO-8601
  notebookName: string | null;
  /** The recorded grade in the learner's system, or null if not entered yet. */
  gradeDisplay: string | null;
  outcome: 'passed' | 'failed' | 'pending' | null;
}

export interface ExamsOverview {
  active: ExamOverviewActive[];
  archived: ExamOverviewArchived[];
}

/**
 * Validate + dedup raw scope refs from a PUT body. Drops anything malformed or
 * with an unknown `itemType`; trims to {@link MAX_SCOPE_ITEMS}. Does NOT check
 * ownership — that's {@link authorizeScopeItems}.
 */
export function parseScopeItems(raw: unknown): ScopeItemRef[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ScopeItemRef[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const itemType = (entry as Record<string, unknown>).itemType;
    const itemId = (entry as Record<string, unknown>).itemId;
    if (typeof itemType !== 'string' || !SCOPE_TYPE_SET.has(itemType)) continue;
    if (typeof itemId !== 'string' || itemId.length === 0) continue;
    const key = `${itemType}:${itemId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ itemType: itemType as ScopeItemTypeStr, itemId });
    if (out.length >= MAX_SCOPE_ITEMS) break;
  }
  return out;
}

function groupByType(refs: ScopeItemRef[]): Record<ScopeItemTypeStr, string[]> {
  const acc = {
    path: [] as string[],
    quiz_set: [] as string[],
    flashcard_set: [] as string[],
    page: [] as string[],
    document: [] as string[],
    section: [] as string[],
  };
  for (const r of refs) acc[r.itemType].push(r.itemId);
  return acc;
}

/**
 * Filter scope refs down to the ones the user actually owns. Batched: one
 * existence query per id-kind. The same ownership graph as `mage-context`
 * (page/section/document → notebook → user; path → user; sets → user).
 */
export async function authorizeScopeItems(
  userId: string,
  refs: ScopeItemRef[],
): Promise<ScopeItemRef[]> {
  if (refs.length === 0) return [];
  const ids = groupByType(refs);

  const [paths, quizSets, flashcardSets, pages, documents, sections] = await Promise.all([
    ids.path.length
      ? db.studyPlan.findMany({ where: { id: { in: ids.path }, userId }, select: { id: true } })
      : [],
    ids.quiz_set.length
      ? db.quizSet.findMany({ where: { id: { in: ids.quiz_set }, userId }, select: { id: true } })
      : [],
    ids.flashcard_set.length
      ? db.flashcardSet.findMany({
          where: { id: { in: ids.flashcard_set }, userId },
          select: { id: true },
        })
      : [],
    ids.page.length
      ? db.page.findMany({
          where: { id: { in: ids.page }, section: { notebook: { userId } } },
          select: { id: true },
        })
      : [],
    ids.document.length
      ? db.document.findMany({
          where: { id: { in: ids.document }, notebook: { userId } },
          select: { id: true },
        })
      : [],
    ids.section.length
      ? db.section.findMany({
          where: { id: { in: ids.section }, notebook: { userId } },
          select: { id: true },
        })
      : [],
  ]);

  const owned: Record<ScopeItemTypeStr, Set<string>> = {
    path: new Set(paths.map((r) => r.id)),
    quiz_set: new Set(quizSets.map((r) => r.id)),
    flashcard_set: new Set(flashcardSets.map((r) => r.id)),
    page: new Set(pages.map((r) => r.id)),
    document: new Set(documents.map((r) => r.id)),
    section: new Set(sections.map((r) => r.id)),
  };

  return refs.filter((r) => owned[r.itemType].has(r.itemId));
}

/** Load + ownership-check an exam's meta. Null if not owned. */
async function loadExamMeta(userId: string, examId: string): Promise<ExamMeta | null> {
  const exam = await db.exam.findFirst({
    where: { id: examId, userId },
    select: {
      id: true,
      title: true,
      examDate: true,
      notebookId: true,
      notebook: { select: { name: true } },
    },
  });
  if (!exam) return null;
  return {
    id: exam.id,
    title: exam.title,
    examDate: exam.examDate.toISOString(),
    notebookId: exam.notebookId,
    notebookName: exam.notebook?.name ?? null,
  };
}

/**
 * Resolve an exam's stored scope into display rows + picker candidates. Items
 * whose backing content was deleted (or de-authorized) silently drop out. Null
 * when the exam doesn't belong to the user.
 */
export async function loadExamScopeView(
  userId: string,
  examId: string,
): Promise<ExamScopeView | null> {
  const exam = await loadExamMeta(userId, examId);
  if (!exam) return null;

  const stored = await db.examScopeItem.findMany({
    where: { examId },
    select: { itemType: true, itemId: true },
    take: MAX_SCOPE_ITEMS,
  });
  const refs = stored.filter((s): s is ScopeItemRef => SCOPE_TYPE_SET.has(s.itemType));

  const [items, candidates] = await Promise.all([
    resolveScopeItems(userId, refs),
    loadScopeCandidates(userId, exam.notebookId),
  ]);

  return { exam, items, candidates };
}

/** Resolve refs → titled rows (re-scoped to userId; deleted content drops out). */
async function resolveScopeItems(
  userId: string,
  refs: ScopeItemRef[],
): Promise<ResolvedScopeItem[]> {
  if (refs.length === 0) return [];
  const ids = groupByType(refs);

  const [paths, quizSets, flashcardSets, pages, documents, sections] = await Promise.all([
    ids.path.length
      ? db.studyPlan.findMany({
          where: { id: { in: ids.path }, userId },
          select: { id: true, title: true },
        })
      : [],
    ids.quiz_set.length
      ? db.quizSet.findMany({
          where: { id: { in: ids.quiz_set }, userId },
          select: { id: true, title: true },
        })
      : [],
    ids.flashcard_set.length
      ? db.flashcardSet.findMany({
          where: { id: { in: ids.flashcard_set }, userId },
          select: { id: true, title: true },
        })
      : [],
    ids.page.length
      ? db.page.findMany({
          where: { id: { in: ids.page }, section: { notebook: { userId } } },
          select: { id: true, title: true, section: { select: { title: true } } },
        })
      : [],
    ids.document.length
      ? db.document.findMany({
          where: { id: { in: ids.document }, notebook: { userId } },
          select: { id: true, fileName: true },
        })
      : [],
    ids.section.length
      ? db.section.findMany({
          where: { id: { in: ids.section }, notebook: { userId } },
          select: { id: true, title: true },
        })
      : [],
  ]);

  const title: Record<ScopeItemTypeStr, Map<string, { title: string; subtitle?: string }>> = {
    path: new Map(paths.map((r) => [r.id, { title: r.title }])),
    quiz_set: new Map(quizSets.map((r) => [r.id, { title: r.title }])),
    flashcard_set: new Map(flashcardSets.map((r) => [r.id, { title: r.title }])),
    page: new Map(pages.map((r) => [r.id, { title: r.title, subtitle: r.section?.title }])),
    document: new Map(documents.map((r) => [r.id, { title: r.fileName }])),
    section: new Map(sections.map((r) => [r.id, { title: r.title }])),
  };

  const out: ResolvedScopeItem[] = [];
  for (const r of refs) {
    const hit = title[r.itemType].get(r.itemId);
    if (!hit) continue; // deleted / de-authorized
    out.push({ itemType: r.itemType, itemId: r.itemId, title: hit.title, subtitle: hit.subtitle });
  }
  return out;
}

/**
 * The pickable content for the scope editor: every path the user owns (paths are
 * cross-notebook by design) plus the exam's backing notebook's quizzes,
 * flashcards, pages, documents, and sections.
 */
async function loadScopeCandidates(
  userId: string,
  notebookId: string,
): Promise<ScopeCandidates> {
  const [paths, quizSets, flashcardSets, pages, documents, sections] = await Promise.all([
    db.studyPlan.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: CANDIDATE_TAKE,
      select: { id: true, title: true },
    }),
    db.quizSet.findMany({
      where: { notebookId, userId },
      orderBy: { createdAt: 'desc' },
      take: CANDIDATE_TAKE,
      select: { id: true, title: true },
    }),
    db.flashcardSet.findMany({
      where: { notebookId, userId },
      orderBy: { createdAt: 'desc' },
      take: CANDIDATE_TAKE,
      select: { id: true, title: true },
    }),
    db.page.findMany({
      where: { section: { notebookId, notebook: { userId } } },
      orderBy: { updatedAt: 'desc' },
      take: CANDIDATE_TAKE,
      select: { id: true, title: true, section: { select: { title: true } } },
    }),
    db.document.findMany({
      where: { notebookId, notebook: { userId } },
      orderBy: { createdAt: 'desc' },
      take: CANDIDATE_TAKE,
      select: { id: true, fileName: true },
    }),
    db.section.findMany({
      where: { notebookId, notebook: { userId } },
      orderBy: { sortOrder: 'asc' },
      take: CANDIDATE_TAKE,
      select: { id: true, title: true },
    }),
  ]);

  return {
    paths: paths.map((r) => ({ id: r.id, title: r.title })),
    quizSets: quizSets.map((r) => ({ id: r.id, title: r.title })),
    flashcardSets: flashcardSets.map((r) => ({ id: r.id, title: r.title })),
    pages: pages.map((r) => ({ id: r.id, title: r.title, subtitle: r.section?.title })),
    documents: documents.map((r) => ({ id: r.id, title: r.fileName })),
    sections: sections.map((r) => ({ id: r.id, title: r.title })),
  };
}

/**
 * Replace an exam's scope with `refs` (already validated + authorized). One
 * transaction: clear, then recreate. Returns the new count.
 */
export async function replaceExamScope(examId: string, refs: ScopeItemRef[]): Promise<number> {
  await db.$transaction([
    db.examScopeItem.deleteMany({ where: { examId } }),
    ...(refs.length > 0
      ? [
          db.examScopeItem.createMany({
            data: refs.map((r) => ({ examId, itemType: r.itemType, itemId: r.itemId })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);
  return refs.length;
}

/**
 * Load an exam's full readiness rollup. Returns null when the exam isn't owned.
 * Scoped paths get the full slot tree + `derivePathStats`; quiz sets get their
 * best attempt; passive material is listed for the breakdown. The pure
 * `deriveExamReadiness` handles dedup + weighting.
 */
export async function loadExamReadiness(
  userId: string,
  examId: string,
): Promise<ExamReadinessResult | null> {
  const exam = await loadExamMeta(userId, examId);
  if (!exam) return null;

  const readiness = await deriveReadinessForExam(userId, examId);
  const daysUntil = Math.ceil((new Date(exam.examDate).getTime() - Date.now()) / 86_400_000);

  return { exam, daysUntil, readiness };
}

/**
 * Derive an exam's readiness rollup from its stored scope, WITHOUT re-loading
 * the exam meta. Shared by {@link loadExamReadiness} (single exam, after an
 * ownership check) and {@link loadExamsOverview} (the exams list, which already
 * holds each exam's meta from its list query). Callers must scope `examId` to
 * the user themselves — this reads scope items by `examId` and re-scopes every
 * content lookup to `userId`, so an unowned exam simply yields empty readiness.
 */
async function deriveReadinessForExam(userId: string, examId: string): Promise<ExamReadiness> {
  return deriveExamReadiness(await loadExamReadinessInput(userId, examId));
}

/**
 * Resolve an exam's stored scope into the slim {@link ExamReadinessInput} the
 * pure rollups consume. Shared by {@link deriveReadinessForExam} and
 * {@link loadExamWeakAreas} so both read the same deduped, re-authorized
 * material. Callers must already have scoped `examId` to the user.
 */
async function loadExamReadinessInput(userId: string, examId: string): Promise<ExamReadinessInput> {
  const stored = await db.examScopeItem.findMany({
    where: { examId },
    select: { itemType: true, itemId: true },
    take: MAX_SCOPE_ITEMS,
  });
  const refs = stored.filter((s): s is ScopeItemRef => SCOPE_TYPE_SET.has(s.itemType));
  const ids = groupByType(refs);

  const [paths, quizSets, passive] = await Promise.all([
    loadPathReadinessInputs(userId, ids.path),
    loadQuizReadinessInputs(userId, ids.quiz_set),
    loadPassiveItems(userId, ids),
  ]);

  return { paths, quizSets, passive };
}

/**
 * Load the weak-areas dashboard view for one exam: every weak topic (NOT the
 * hub's capped preview), grouped + impact-ranked by {@link deriveWeakAreas},
 * plus the primary linked path id so the screen can deep-link each path topic to
 * its exam mission. Backs `GET /api/user/exams/:id/weak-areas`. Returns null for
 * an unowned/unknown exam (the meta check fails closed). Exam Mode Phase 2.
 */
export async function loadExamWeakAreas(
  userId: string,
  examId: string,
): Promise<ExamWeakAreasResult | null> {
  const exam = await loadExamMeta(userId, examId);
  if (!exam) return null;

  const input = await loadExamReadinessInput(userId, examId);
  const weakAreas = deriveWeakAreas(input);
  const daysUntil = Math.ceil((new Date(exam.examDate).getTime() - Date.now()) / 86_400_000);

  return { exam, daysUntil, primaryPathId: input.paths[0]?.id ?? null, weakAreas };
}

/**
 * Load the exams-list overview: upcoming exams enriched with their readiness
 * summary (the "Active" cards) plus recent past exams ("Archived"). Active
 * enrichment is bounded — each exam triggers a readiness rollup — so we cap at
 * the soonest {@link OVERVIEW_TAKE} upcoming and most-recent {@link OVERVIEW_TAKE}
 * past exams. Backs `GET /api/user/exams/overview`.
 */
export async function loadExamsOverview(userId: string): Promise<ExamsOverview> {
  const now = new Date();

  const [upcoming, past] = await Promise.all([
    db.exam.findMany({
      where: { userId, examDate: { gte: now } },
      orderBy: { examDate: 'asc' },
      take: OVERVIEW_TAKE,
      select: { id: true, title: true, examDate: true, notebook: { select: { name: true } } },
    }),
    db.exam.findMany({
      where: { userId, examDate: { lt: now } },
      orderBy: { examDate: 'desc' },
      take: OVERVIEW_TAKE,
      select: {
        id: true,
        title: true,
        examDate: true,
        notebook: { select: { name: true } },
        result: { select: { gradeNeutral: true, outcome: true } },
      },
    }),
  ]);

  // One grading-system load for all archived grade formatting.
  const userRow = await db.user.findUnique({ where: { id: userId }, select: { gradingSystem: true } });
  const sys = getGradingSystem(userRow?.gradingSystem ?? DEFAULT_GRADING_SYSTEM_ID) ?? getGradingSystem(DEFAULT_GRADING_SYSTEM_ID)!;

  const active: ExamOverviewActive[] = await Promise.all(
    upcoming.map(async (e) => {
      const readiness = await deriveReadinessForExam(userId, e.id);
      return {
        id: e.id,
        title: e.title,
        examDate: e.examDate.toISOString(),
        notebookName: e.notebook?.name ?? null,
        daysUntil: Math.ceil((e.examDate.getTime() - now.getTime()) / 86_400_000),
        readiness: readiness.readiness,
        hasGradedMaterial: readiness.hasGradedMaterial,
        isEmpty: readiness.isEmpty,
        weakAreas: readiness.weakTopics.length,
        linkedPaths: readiness.counts.paths,
      };
    }),
  );

  const archived: ExamOverviewArchived[] = past.map((e) => ({
    id: e.id,
    title: e.title,
    examDate: e.examDate.toISOString(),
    notebookName: e.notebook?.name ?? null,
    gradeDisplay: e.result ? formatGrade(e.result.gradeNeutral, sys) : null,
    outcome:
      e.result && (e.result.outcome === 'passed' || e.result.outcome === 'failed' || e.result.outcome === 'pending')
        ? e.result.outcome
        : null,
  }));

  return { active, archived };
}

/** Scoped paths → `derivePathStats`-reduced readiness inputs. */
async function loadPathReadinessInputs(
  userId: string,
  pathIds: string[],
): Promise<ExamPathReadiness[]> {
  if (pathIds.length === 0) return [];
  const plans = await db.studyPlan.findMany({
    where: { id: { in: pathIds }, userId },
    include: pathInclude,
  });
  return plans.map((plan) => {
    const serialized = serializePath(plan);
    // `SerializedPath` is structurally a `PathPlan` for stats purposes.
    const stats = derivePathStats(serialized as unknown as PathPlan);
    return {
      id: plan.id,
      title: plan.title,
      readiness: stats.readiness,
      totalCheckpoints: stats.totalCheckpoints,
      doneCheckpoints: stats.doneCheckpoints,
      weakCheckpoints: stats.weakCheckpoints,
    };
  });
}

/** Directly-scoped quiz sets → best-attempt readiness inputs. */
async function loadQuizReadinessInputs(
  userId: string,
  quizSetIds: string[],
): Promise<ExamQuizReadiness[]> {
  if (quizSetIds.length === 0) return [];
  const [sets, best] = await Promise.all([
    db.quizSet.findMany({
      where: { id: { in: quizSetIds }, userId },
      select: { id: true, title: true, sourcePathId: true, _count: { select: { questions: true } } },
    }),
    db.quizAttempt.groupBy({
      by: ['quizSetId'],
      where: { userId, quizSetId: { in: quizSetIds } },
      _max: { percentage: true },
    }),
  ]);
  const bestBySet = new Map(best.map((b) => [b.quizSetId, b._max.percentage]));
  return sets.map((s) => ({
    id: s.id,
    title: s.title,
    questionCount: s._count.questions,
    bestPercentage: bestBySet.get(s.id) ?? null,
    sourcePathId: s.sourcePathId,
  }));
}

/** Passive scope items (flashcards / pages / documents / sections) → titled rows. */
async function loadPassiveItems(
  userId: string,
  ids: Record<ScopeItemTypeStr, string[]>,
): Promise<ExamPassiveItem[]> {
  const [flashcardSets, pages, documents, sections] = await Promise.all([
    ids.flashcard_set.length
      ? db.flashcardSet.findMany({
          where: { id: { in: ids.flashcard_set }, userId },
          select: { id: true, title: true },
        })
      : [],
    ids.page.length
      ? db.page.findMany({
          where: { id: { in: ids.page }, section: { notebook: { userId } } },
          select: { id: true, title: true },
        })
      : [],
    ids.document.length
      ? db.document.findMany({
          where: { id: { in: ids.document }, notebook: { userId } },
          select: { id: true, fileName: true },
        })
      : [],
    ids.section.length
      ? db.section.findMany({
          where: { id: { in: ids.section }, notebook: { userId } },
          select: { id: true, title: true },
        })
      : [],
  ]);

  return [
    ...flashcardSets.map((r) => ({ type: 'flashcard_set' as const, id: r.id, title: r.title })),
    ...pages.map((r) => ({ type: 'page' as const, id: r.id, title: r.title })),
    ...documents.map((r) => ({ type: 'document' as const, id: r.id, title: r.fileName })),
    ...sections.map((r) => ({ type: 'section' as const, id: r.id, title: r.title })),
  ];
}

/**
 * Format the volatile study-state block for the Mage panel. UNCACHED and placed
 * AFTER the corpus block by `chat-stream` (R2 — a changing readiness must never
 * bust the 1h corpus cache). Plain text, compact, model-facing.
 */
export function formatExamStudyState(result: ExamReadinessResult): string {
  const { exam, daysUntil, readiness } = result;
  const lines: string[] = [];

  const when =
    daysUntil > 1
      ? `in ${daysUntil} days`
      : daysUntil === 1
        ? 'tomorrow'
        : daysUntil === 0
          ? 'today'
          : `${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? '' : 's'} ago`;
  lines.push(`Exam "${exam.title}" is ${when} (${exam.examDate.slice(0, 10)}).`);

  if (readiness.isEmpty) {
    lines.push('Nothing is in this exam\'s scope yet — readiness can\'t be measured.');
    return lines.join('\n');
  }

  if (readiness.hasGradedMaterial) {
    const parts: string[] = [];
    if (readiness.counts.paths > 0) {
      parts.push(`${readiness.counts.paths} path${readiness.counts.paths === 1 ? '' : 's'}`);
    }
    if (readiness.counts.quizSets > 0) {
      parts.push(`${readiness.counts.quizSets} quiz${readiness.counts.quizSets === 1 ? '' : 'zes'}`);
    }
    if (readiness.counts.passive > 0) {
      parts.push(`${readiness.counts.passive} reading${readiness.counts.passive === 1 ? '' : 's'}`);
    }
    lines.push(`Overall readiness: ${readiness.readiness}% across ${parts.join(', ')}.`);
  } else {
    lines.push(
      'No graded practice or quizzes in scope yet — only readings, so readiness is unmeasured (0%).',
    );
  }

  if (readiness.weakTopics.length > 0) {
    const weak = readiness.weakTopics
      .slice(0, 5)
      .map((w) => `"${w.title}" ${w.pct}%`)
      .join(', ');
    lines.push(`Weakest: ${weak}.`);
  }

  return lines.join('\n');
}
