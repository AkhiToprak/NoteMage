import { redirect } from 'next/navigation';
import { getServerAuthUser } from '@/lib/server-auth';
import { loadMockExamDetail } from '@/lib/mock-exam-loader';
import MockResultsView from './MockResultsView';

/* Exam Mode Phase 3 — mock exam results. Server component: resolves the
   MockExamDetail during SSR via the same loadMockExamDetail the
   /api/user/exams/[id]/mock/[mockId] route uses, so the first byte carries
   real content instead of a client spinner-then-fetch. */

export const dynamic = 'force-dynamic';

export default async function MockResultsPage({
  params,
}: {
  params: Promise<{ id: string; mockId: string }>;
}) {
  const { id: examId, mockId } = await params;

  const user = await getServerAuthUser();
  if (!user) redirect('/auth/login');

  let detail = null;
  let errored = false;

  try {
    detail = await loadMockExamDetail(user.id, examId, mockId);
  } catch (err) {
    console.error('[mock-results page]', err);
    errored = true;
  }

  // Null means unowned/unknown mock → show the not-found state in the View
  // (requiredCorrection: no exam/not-found.tsx exists, so we pass errored-like
  // props to MockResultsView to render the custom event_busy UI rather than
  // calling notFound() which would bubble to the global not-found page).

  // Not yet completed → bounce back to the run screen.
  if (!errored && detail && (detail.mock.status !== 'completed' || !detail.result)) {
    redirect(`/exam/${examId}/mock/${mockId}`);
  }

  return (
    <MockResultsView
      detail={detail}
      examId={examId}
      mockId={mockId}
      errored={errored}
    />
  );
}
