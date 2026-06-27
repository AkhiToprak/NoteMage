/**
 * Exam Mode (Phase 3) — mock-exam read models.
 *
 * Pure-ish loaders that turn `MockExam` rows + the canonical `QuizAttempt`
 * grading into the shapes the run surface + results screen consume. Kept out of
 * the route files (App Router route modules may export only handlers + segment
 * config) and out of `mock-exam.ts` (which owns config + assembly) so each layer
 * stays single-purpose. The breakdown is computed from real attempt data only —
 * no fabricated metrics (Exam Mode honest-copy rule).
 */

import { db } from './db';
import type { QuestionKind } from '@notemage/shared';
import { MOCK_KIND_LABEL, type MockExamConfig } from './mock-exam-config';

/** The `MockExam` row shape we select (config is stored JSON). */
export interface MockExamRow {
  id: string;
  examId: string;
  userId: string;
  practiceSessionId: string | null;
  quizSetId: string | null;
  quizAttemptId: string | null;
  config: unknown;
  readinessBefore: number | null;
  readinessAfter: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Stored config — the parsed setup config plus the actual generated count. */
export type StoredMockConfig = MockExamConfig & { questionCount: number };

function readConfig(raw: unknown): StoredMockConfig {
  const c = (raw ?? {}) as Partial<StoredMockConfig>;
  return {
    type: c.type ?? 'quick',
    questionCount: typeof c.questionCount === 'number' ? c.questionCount : 0,
    durationSec: typeof c.durationSec === 'number' ? c.durationSec : 0,
    questionKinds: Array.isArray(c.questionKinds) ? c.questionKinds : [],
    difficulty: c.difficulty ?? 'mixed',
    hints: typeof c.hints === 'boolean' ? c.hints : false,
    topics: Array.isArray(c.topics) ? c.topics : [],
  };
}

/** One row in the setup screen's recent-mocks list. */
export interface MockSummary {
  id: string;
  type: StoredMockConfig['type'];
  status: string;
  questionCount: number;
  durationSec: number;
  createdAt: string;
  /** Final percentage when completed, else null. */
  score: number | null;
  readinessBefore: number | null;
  readinessAfter: number | null;
}

export function mockSummary(row: MockExamRow, score: number | null): MockSummary {
  const config = readConfig(row.config);
  return {
    id: row.id,
    type: config.type,
    status: row.status,
    questionCount: config.questionCount,
    durationSec: config.durationSec,
    createdAt: row.createdAt.toISOString(),
    score,
    readinessBefore: row.readinessBefore,
    readinessAfter: row.readinessAfter,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Detail (run + results)
// ─────────────────────────────────────────────────────────────────────

export interface MockBreakdownGroup {
  /** Stable key — the kind string (by-type) or the topic label (by-topic). */
  key: string;
  label: string;
  total: number;
  correct: number;
  /** 0–100, rounded. */
  pct: number;
}

export interface MockBreakdown {
  byType: MockBreakdownGroup[];
  byTopic: MockBreakdownGroup[];
  /** Highest-scoring group with ≥2 questions (topic-first, else type), or null. */
  strongest: MockBreakdownGroup | null;
  /** Lowest-scoring group with ≥2 questions (topic-first, else type), or null. */
  weakest: MockBreakdownGroup | null;
}

export interface MockResult {
  score: number; // correct count
  total: number;
  percentage: number;
  timeSpent: number | null;
  breakdown: MockBreakdown;
}

export interface MockExamDetail {
  mock: {
    id: string;
    status: string;
    config: StoredMockConfig;
    readinessBefore: number | null;
    readinessAfter: number | null;
  };
  exam: { id: string; title: string };
  /** Where the sealed set lives so the runner can load + grade it. */
  run: { notebookId: string; setId: string; title: string; questionCount: number };
  /** Present once the mock is completed + graded. */
  result: MockResult | null;
}

function round(n: number): number {
  return Math.round(n);
}

/** Build the type + topic breakdown from one attempt's answers. Pure. */
export function computeMockBreakdown(
  questions: { id: string; kind: QuestionKind; sourceLabel: string | null }[],
  answers: { questionId: string; isCorrect: boolean }[],
): MockBreakdown {
  const correctByQ = new Map(answers.map((a) => [a.questionId, a.isCorrect]));

  const typeAcc = new Map<string, { total: number; correct: number }>();
  const topicAcc = new Map<string, { total: number; correct: number }>();

  for (const q of questions) {
    const ok = correctByQ.get(q.id) === true;

    const tKey = q.kind;
    const t = typeAcc.get(tKey) ?? { total: 0, correct: 0 };
    t.total += 1;
    if (ok) t.correct += 1;
    typeAcc.set(tKey, t);

    const topic = q.sourceLabel?.trim() || 'General';
    const p = topicAcc.get(topic) ?? { total: 0, correct: 0 };
    p.total += 1;
    if (ok) p.correct += 1;
    topicAcc.set(topic, p);
  }

  const byType: MockBreakdownGroup[] = Array.from(typeAcc.entries())
    .map(([key, v]) => ({
      key,
      label: MOCK_KIND_LABEL[key as keyof typeof MOCK_KIND_LABEL] ?? key,
      total: v.total,
      correct: v.correct,
      pct: round((v.correct / v.total) * 100),
    }))
    .sort((a, b) => b.total - a.total);

  const byTopic: MockBreakdownGroup[] = Array.from(topicAcc.entries())
    .map(([key, v]) => ({
      key,
      label: key,
      total: v.total,
      correct: v.correct,
      pct: round((v.correct / v.total) * 100),
    }))
    .sort((a, b) => a.pct - b.pct);

  // Strongest/weakest from the most granular grouping that has real spread:
  // prefer topics when there's more than one meaningful (≥2-question) topic,
  // else fall back to question type. Never surface a one-question "group" as a
  // strength/weakness — that's noise, not signal.
  const meaningfulTopics = byTopic.filter((g) => g.total >= 2);
  const pool = meaningfulTopics.length >= 2 ? meaningfulTopics : byType.filter((g) => g.total >= 2);
  const ranked = [...pool].sort((a, b) => a.pct - b.pct);
  const weakest = ranked[0] ?? null;
  const strongest = ranked.length > 1 ? ranked[ranked.length - 1] : null;

  return { byType, byTopic, strongest, weakest };
}

/**
 * Load a mock's full detail for the run surface + results screen. Returns null
 * for an unowned/unknown mock (fails closed). When completed + linked to an
 * attempt, computes the real type/topic breakdown from that attempt.
 */
export async function loadMockExamDetail(
  userId: string,
  examId: string,
  mockId: string,
): Promise<MockExamDetail | null> {
  const row = (await db.mockExam.findFirst({
    where: { id: mockId, examId, userId },
  })) as unknown as MockExamRow | null;
  if (!row) return null;

  const exam = await db.exam.findFirst({
    where: { id: examId, userId },
    select: { id: true, title: true },
  });
  if (!exam) return null;

  const config = readConfig(row.config);

  // Resolve the assembled set → notebook + title + question count for the runner.
  let run = { notebookId: '', setId: row.quizSetId ?? '', title: '', questionCount: config.questionCount };
  let breakdownInput: { id: string; kind: QuestionKind; sourceLabel: string | null }[] = [];
  if (row.quizSetId) {
    const set = await db.quizSet.findFirst({
      where: { id: row.quizSetId, userId },
      select: {
        notebookId: true,
        title: true,
        questions: { select: { id: true, kind: true, sourceLabel: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (set) {
      run = {
        notebookId: set.notebookId ?? '',
        setId: row.quizSetId,
        title: set.title,
        questionCount: set.questions.length || config.questionCount,
      };
      breakdownInput = set.questions.map((q) => ({ id: q.id, kind: q.kind, sourceLabel: q.sourceLabel }));
    }
  }

  let result: MockResult | null = null;
  if (row.status === 'completed' && row.quizAttemptId) {
    const attempt = await db.quizAttempt.findFirst({
      where: { id: row.quizAttemptId, userId },
      select: {
        score: true,
        total: true,
        percentage: true,
        timeSpent: true,
        answers: { select: { questionId: true, isCorrect: true } },
      },
    });
    if (attempt) {
      result = {
        score: attempt.score,
        total: attempt.total,
        percentage: attempt.percentage,
        timeSpent: attempt.timeSpent,
        breakdown: computeMockBreakdown(breakdownInput, attempt.answers),
      };
    }
  }

  return {
    mock: {
      id: row.id,
      status: row.status,
      config,
      readinessBefore: row.readinessBefore,
      readinessAfter: row.readinessAfter,
    },
    exam: { id: exam.id, title: exam.title },
    run,
    result,
  };
}
