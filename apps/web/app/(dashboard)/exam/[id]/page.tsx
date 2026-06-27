import { notFound, redirect } from 'next/navigation';
import { getServerUserId } from '@/lib/server-auth';
import { loadExamReadiness, loadExamScopeView } from '@/lib/exam-scope';
import { loadPathForUser, serializePath } from '@/lib/path-loader';
import { loadResultEntryContext } from '@/lib/exam-result';
import type { PathPlan } from '@/components/learn/PathView';
import ExamHubView, { type ReadinessResult, type ScopeView } from './ExamHubView';

/* Exam hub — server component. Resolves readiness + scope (and, conditionally,
   the linked path's node tree + whether a result exists once the exam is past)
   during SSR via the same lib fns the API routes use, so the first byte carries
   the hub instead of a client spinner-then-fetch. The scope/date editors, manage
   drawer, and Mage hooks stay client; ExamHubView re-fetches via the API routes
   after a scope/date mutation. */

export const dynamic = 'force-dynamic';

export default async function ExamPathHubPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await getServerUserId();
  if (!userId) redirect('/auth/login');
  const { id: examId } = await params;

  // notFound outside any try so a real 404 isn't swallowed; a load error surfaces
  // to the nearest error boundary (matching the other exam pages).
  const [readiness, scope] = await Promise.all([
    loadExamReadiness(userId, examId),
    loadExamScopeView(userId, examId),
  ]);
  if (!readiness || !scope) notFound();

  const primaryPathId = scope.items.find((it) => it.itemType === 'path')?.itemId ?? null;
  const [linkedPathRaw, hasResult] = await Promise.all([
    primaryPathId ? loadPathForUser(userId, primaryPathId) : Promise.resolve(null),
    readiness.daysUntil < 0
      ? loadResultEntryContext(userId, examId).then((ctx) => ctx?.existing != null)
      : Promise.resolve(false),
  ]);
  const linkedPath = linkedPathRaw ? (serializePath(linkedPathRaw) as unknown as PathPlan) : null;

  return (
    <ExamHubView
      examId={examId}
      readiness={readiness as unknown as ReadinessResult}
      scope={scope as unknown as ScopeView}
      linkedPath={linkedPath}
      hasResult={hasResult}
    />
  );
}
