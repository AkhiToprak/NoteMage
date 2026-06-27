'use client';

/* Phase E — the shared run surface for a generated practice / mock-exam QuizSet.
 *
 * The set lives under the hidden "Practice with Mage" notebook; the practice-
 * session generator (and the exam overview "Start mock exam" CTA) deep-link here
 * with `?origin=` so the runner knows whether to run formative (practice) or
 * sealed (exam). The runner loads the set by id through the canonical quiz
 * endpoints and renders the cream QuizPlayerShell — so practice + exams share the
 * exact same player as the path checkpoint. Route params resolve the set; the
 * `?origin` / `?examId` query is read client-side (window.location) to keep the
 * page out of a useSearchParams prerender bailout. */

import { use, useState } from 'react';
import QuizSessionRunner, { type RunnerContext } from '@/components/quiz/player/QuizSessionRunner';

interface RunConfig {
  context: RunnerContext;
  examId?: string;
  stepLabel: string;
  breadcrumb: string[];
}

/** Client-only read of the run query (`?origin=…&examId=…`); null during SSR. */
function readRunConfig(): RunConfig {
  const fallback: RunConfig = { context: 'practice', stepLabel: 'Practice', breadcrumb: ['Practice'] };
  if (typeof window === 'undefined') return fallback;
  const params = new URLSearchParams(window.location.search);
  const origin = params.get('origin');
  const examId = params.get('examId') || undefined;
  switch (origin) {
    case 'exam_sim':
      return { context: 'exam', examId, stepLabel: 'Mock exam', breadcrumb: ['Exam', 'Mock exam'] };
    case 'weak_topic':
      return { context: 'practice', stepLabel: 'Weak-spot practice', breadcrumb: ['Practice', 'Weak spots'] };
    case 'mistake_review':
      return { context: 'practice', stepLabel: 'Mistake practice', breadcrumb: ['Practice', 'Mistakes'] };
    default:
      return fallback;
  }
}

export default function PracticeSessionRunPage({
  params,
}: {
  params: Promise<{ notebookId: string; setId: string }>;
}) {
  const { notebookId, setId } = use(params);
  // SSR sees the practice fallback; the client read lands before the set fetch
  // resolves, so the shell renders with the right context (no hydration churn —
  // the body is a loading line until the client fetch completes either way).
  const [cfg] = useState<RunConfig>(() => readRunConfig());

  return (
    <QuizSessionRunner
      notebookId={notebookId}
      setId={setId}
      context={cfg.context}
      examId={cfg.examId}
      stepLabel={cfg.stepLabel}
      breadcrumb={cfg.breadcrumb}
    />
  );
}
