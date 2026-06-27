import { notFound, redirect } from 'next/navigation';
import { getServerUserId } from '@/lib/server-auth';
import { loadExamReadiness } from '@/lib/exam-scope';
import { loadActiveExamPlanView } from '@/lib/exam-study-plan';
import CalendarView, { type PlanResponse } from './CalendarView';

/* Study calendar — server component. Resolves the same payload the
   /api/user/exams/[id]/plan GET returned (readiness + active plan view) during
   SSR, so the first byte carries the calendar instead of a client
   spinner-then-fetch. The slider/regenerate mutations stay client-side. */

export const dynamic = 'force-dynamic';

export default async function StudyCalendarPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await getServerUserId();
  if (!userId) redirect('/auth/login');
  const { id: examId } = await params;

  // Not-found resolves to a 404 BEFORE the try/catch so notFound()'s throw is
  // never swallowed into the error branch. A readiness DB error surfaces to the
  // nearest error boundary (rare); a plan-load error degrades to the in-shell
  // "couldn't load" state via the errored flag.
  const readiness = await loadExamReadiness(userId, examId);
  if (!readiness) notFound();

  let data: PlanResponse | null = null;
  let errored = false;
  try {
    const plan = await loadActiveExamPlanView(userId, examId, readiness);
    const primaryPath = readiness.readiness.items.find((it) => it.type === 'path') ?? null;
    data = {
      exam: readiness.exam,
      daysUntil: readiness.daysUntil,
      readiness: readiness.readiness.hasGradedMaterial ? readiness.readiness.readiness : 0,
      hasGradedMaterial: readiness.readiness.hasGradedMaterial,
      hasScope: !readiness.readiness.isEmpty,
      primaryPathId: primaryPath?.id ?? null,
      plan,
    };
  } catch (err) {
    console.error('[exam calendar page]', err);
    errored = true;
  }

  return <CalendarView examId={examId} initialData={data} errored={errored} />;
}
