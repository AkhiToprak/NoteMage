import { notFound, redirect } from 'next/navigation';
import { getServerUserId } from '@/lib/server-auth';
import { loadExamReadiness } from '@/lib/exam-scope';
import { loadActiveExamPlanView } from '@/lib/exam-study-plan';
import TodaysPlanView, { type PlanResponse } from './TodaysPlanView';

/* Today's plan — server component. Resolves the same payload the
   /api/user/exams/[id]/plan GET returned (readiness + active plan view) during
   SSR, so the first byte carries the plan instead of a client spinner. The task
   mutations (PATCH status/minutes/mark-done, POST regenerate) stay client-side. */

export const dynamic = 'force-dynamic';

export default async function TodaysPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await getServerUserId();
  if (!userId) redirect('/auth/login');
  const { id: examId } = await params;

  // notFound outside the try so a real 404 isn't swallowed into the error branch.
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
    console.error('[exam plan page]', err);
    errored = true;
  }

  return <TodaysPlanView examId={examId} initialData={data} errored={errored} />;
}
