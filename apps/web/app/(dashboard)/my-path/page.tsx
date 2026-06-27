import { redirect } from 'next/navigation';
import { getServerAuthUser } from '@/lib/server-auth';
import { loadPathsForUser, serializePath } from '@/lib/path-loader';
import type { SerializedPath } from '@/lib/path-loader';
import PathsView from './PathsView';

/* Learning paths (Web). Server component: the learner's paths are resolved
   during SSR via the same loadPathsForUser + serializePath the /api/learn/paths
   route used, so the first byte carries the real list instead of a client
   spinner-then-fetch. PathsView holds the interactive chrome (tabs + dialogs)
   and re-fetches client-side after a mutating action. */

export const dynamic = 'force-dynamic';

export default async function PathsPage() {
  const user = await getServerAuthUser();
  if (!user) redirect('/auth/login');

  let paths: SerializedPath[] = [];
  let errored = false;

  try {
    const plans = await loadPathsForUser(user.id);
    paths = plans.map(serializePath);
  } catch (err) {
    console.error('[my-path page]', err);
    errored = true;
  }

  return <PathsView paths={paths} errored={errored} />;
}
