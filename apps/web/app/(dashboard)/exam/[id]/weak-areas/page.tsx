import { notFound, redirect } from 'next/navigation';
import { getServerUserId } from '@/lib/server-auth';
import { loadExamWeakAreas } from '@/lib/exam-scope';
import { loadPathForUser, serializePath } from '@/lib/path-loader';
import type { PathPlan } from '@/components/learn/PathView';
import WeakAreasView, { type WeakAreasResponse } from './WeakAreasView';

/* Exam weak-areas — server component. Resolves the same payload the
   /api/user/exams/[id]/weak-areas GET returned (loadExamWeakAreas) during SSR,
   plus the linked path (for per-topic mission deep-links), so the first byte
   carries real content. Sort toggle + practice-session launches stay client. */

export const dynamic = 'force-dynamic';

export default async function WeakAreasPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await getServerUserId();
  if (!userId) redirect('/auth/login');
  const { id: examId } = await params;

  // notFound outside the try so the 404 isn't swallowed; a readiness/load error
  // surfaces to the nearest error boundary (matching the other exam pages).
  const result = await loadExamWeakAreas(userId, examId);
  if (!result) notFound();

  // The linked path is enrichment only — a failure to load it must NOT break the
  // page (the original client also degraded to no deep-links on path-fetch fail).
  let path: PathPlan | null = null;
  if (result.primaryPathId) {
    try {
      const plan = await loadPathForUser(userId, result.primaryPathId);
      path = plan ? (serializePath(plan) as unknown as PathPlan) : null;
    } catch (err) {
      console.error('[exam weak-areas page] path load', err);
    }
  }

  return <WeakAreasView examId={examId} data={result as unknown as WeakAreasResponse} path={path} />;
}
