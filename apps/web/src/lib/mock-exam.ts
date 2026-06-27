/**
 * Exam Mode (Phase 3) — timed mock-exam assembly (server).
 *
 * The config model + validation live in the client-safe `mock-exam-config.ts`
 * (re-exported below for back-compat). This module owns only the DB/AI assembly,
 * which REUSES the practice-generator spine end-to-end — `loadExamSimFocus`
 * gathers the corpus + weak topics, `assemblePracticeQuiz` (routed through
 * `resolveModel('exam-mock-questions')` → path-quiz routing, prompt-cached) writes
 * a focused `QuizSet` under the hidden practice notebook, and the canonical
 * `QuizAttempt` route grades it.
 */

import {
  assemblePracticeQuiz,
  getOrCreatePracticeNotebook,
  loadExamSimFocus,
  persistPracticeQuizSet,
} from './practice-generator';
import {
  MOCK_TYPE_PRESETS,
  difficultyInstruction,
  type MockExamConfig,
} from './mock-exam-config';
import type { TierKey } from './tiers';

// Re-export the config surface so existing server callers (routes) can keep
// importing from '@/lib/mock-exam'.
export * from './mock-exam-config';

export interface AssembledMock {
  notebookId: string;
  quizSetId: string;
  questionCount: number;
}

/**
 * Assemble a mock-exam `QuizSet` from an exam's scope + config. Gathers the focus
 * via {@link loadExamSimFocus}, adjusts the focus topics to the config (explicit
 * topics > weakness bias > even coverage), then runs the shared
 * {@link assemblePracticeQuiz} (restricted to the chosen kinds + difficulty steer)
 * and persists under the hidden practice notebook. Throws (caller refunds) when
 * there isn't enough material or generation yields nothing usable.
 */
export async function assembleMockExam(opts: {
  userId: string;
  tier: TierKey;
  examId: string;
  examTitle: string;
  config: MockExamConfig;
}): Promise<AssembledMock> {
  const focus = await loadExamSimFocus(opts.userId, opts.examId);
  if (!focus) {
    throw new Error('mock-exam: not enough scoped material to assemble a set');
  }

  const preset = MOCK_TYPE_PRESETS[opts.config.type];
  // Focus precedence: explicit topic picks → weakness bias (the readiness weak
  // set loadExamSimFocus already gathered) → even coverage (clear the bias).
  const focusTopics =
    opts.config.topics.length > 0
      ? opts.config.topics
      : preset.weaknessFocused
        ? focus.focusTopics
        : [];

  const parsed = await assemblePracticeQuiz({
    userId: opts.userId,
    tier: opts.tier,
    corpus: focus.corpus,
    focusTopics,
    subject: focus.subject,
    title: `${opts.examTitle} — ${preset.label}`,
    count: opts.config.questionCount,
    origin: 'exam_sim',
    kinds: opts.config.questionKinds,
    extraInstruction: difficultyInstruction(opts.config.difficulty),
  });

  // Exam realism: when the learner disabled hints, strip them before persisting
  // so the sealed player shows no hint affordance at all (clean, server-side).
  const persisted =
    opts.config.hints === false
      ? { ...parsed, questions: parsed.questions.map((q) => ({ ...q, hint: undefined })) }
      : parsed;

  const notebookId = await getOrCreatePracticeNotebook(opts.userId);
  const quizSetId = await persistPracticeQuizSet(opts.userId, notebookId, persisted);
  return { notebookId, quizSetId, questionCount: persisted.questions.length };
}
