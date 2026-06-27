import { redirect, notFound } from 'next/navigation';
import { getServerUserId } from '@/lib/server-auth';
import { loadResultEntryContext } from '@/lib/exam-result';
import ExamFeedbackView from './ExamFeedbackView';

/* Exam Mode Phase 5 — Feedback page (server component).
 * Resolves auth + exam result during SSR via loadResultEntryContext — the
 * same fn the /api/user/exams/[id]/result route called, so the first byte
 * carries real content instead of a client spinner-then-fetch.
 *
 * If no result has been recorded yet (ctx.existing == null) we redirect back
 * to the result-entry step before rendering. The interactive form (topic
 * chips + POST mutation) stays client-side in ExamFeedbackView.
 *
 * Route: /exam/[id]/feedback */

export const dynamic = 'force-dynamic';

export default async function ExamFeedbackPage(props: { params: Promise<{ id: string }> }) {
  const [userId, { id: examId }] = await Promise.all([getServerUserId(), props.params]);

  if (!userId) redirect('/auth/login');

  const ctx = await loadResultEntryContext(userId, examId);

  if (!ctx) notFound();

  // No result recorded yet — send user back to result-entry step
  if (ctx.existing == null) redirect(`/exam/${examId}/result`);

  return <ExamFeedbackView examId={examId} exam={ctx.exam} />;
}
