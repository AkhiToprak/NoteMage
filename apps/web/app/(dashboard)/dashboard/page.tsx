import { getServerAuthUser } from '@/lib/server-auth';
import { getDashboardData, type DashboardData } from '@/lib/dashboard-data';
import DashboardView from './DashboardView';

/* Dashboard (Web). Server component: the learner's path cockpit is resolved
   during SSR (via the same cached getDashboardData the /api/dashboard route
   uses) so the first byte already carries real content — no client-side
   spinner-then-fetch waterfall. All interactive chrome lives in DashboardView.
   The neighbouring loading.tsx renders the skeleton while this awaits. */

export default async function DashboardPage() {
  const user = await getServerAuthUser();
  const firstName = user ? user.name?.split(' ')[0] || user.username || null : null;

  let data: DashboardData | null = null;
  let errored = false;

  if (user) {
    try {
      data = await getDashboardData(user.id);
    } catch (error) {
      console.error('[dashboard page]', error);
      errored = true;
    }
  } else {
    // Middleware guards /dashboard, so this should be unreachable — but render
    // the error state rather than a misleading "start your first path" if a
    // session ever fails to resolve here.
    errored = true;
  }

  return <DashboardView data={data} firstName={firstName} errored={errored} />;
}
