import { notFound, redirect } from 'next/navigation';
import { getServerUserId } from '@/lib/server-auth';
import { loadResultEntryContext } from '@/lib/exam-result';
import AppShell from '@/components/app/AppShell';
import ExamResultEntryView from './ExamResultEntryView';

/* Exam Mode Phase 5 — Exam Result Entry. Server component: ctx is resolved
   during SSR via loadResultEntryContext (the same fn the GET route used), so
   the first byte carries the grade stepper in the learner's own grading system
   instead of a client spinner-then-fetch. */

export const dynamic = 'force-dynamic';

export default async function ExamResultPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await getServerUserId();
  if (!userId) redirect('/auth/login');

  // Next 16: params is a Promise
  const { id: examId } = await params;

  let ctx: Awaited<ReturnType<typeof loadResultEntryContext>>;
  try {
    ctx = await loadResultEntryContext(userId, examId);
  } catch (err) {
    console.error('[exam result page]', err);
    throw err; // propagate to the nearest error boundary
  }

  if (!ctx) notFound();

  return (
    <AppShell>
      <ExamResultEntryView examId={examId} ctx={ctx} />
    </AppShell>
  );
}
