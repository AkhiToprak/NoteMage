import { notFound, redirect } from 'next/navigation';
import { getServerUserId } from '@/lib/server-auth';
import { loadPathForUser, serializePath } from '@/lib/path-loader';
import PathDetailView from './PathDetailView';

/* Study screen (Web). Server component: the path is resolved during SSR via the
   same loadPathForUser + serializePath the /api/learn/paths/[planId] route used,
   so the first byte carries the path map — no client spinner-then-fetch. All
   interactivity (slot/activity drawers, viewers, generation polling, stop /
   regenerate) lives in PathDetailView, which seeds from initialPath and only
   re-fetches after a mutation. */

export const dynamic = 'force-dynamic';

export default async function PathDetailPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const userId = await getServerUserId();
  if (!userId) redirect('/auth/login');

  const plan = await loadPathForUser(userId, planId).catch((err) => {
    console.error('[path detail page]', err);
    return null;
  });
  if (!plan) notFound();

  return <PathDetailView planId={planId} initialPath={serializePath(plan)} />;
}
