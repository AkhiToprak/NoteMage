import { redirect } from 'next/navigation';
import { getServerAuthUser } from '@/lib/server-auth';
import { loadExamsOverview } from '@/lib/exam-scope';
import ExamsView, { type Overview } from './ExamsView';

/* Exams (Web). Server component: the overview is resolved during SSR via the
   same loadExamsOverview the /api/user/exams/overview route used, so the first
   byte carries real content instead of a client spinner-then-fetch. */

export const dynamic = 'force-dynamic';

export default async function ExamsPage() {
  const user = await getServerAuthUser();
  if (!user) redirect('/auth/login');

  let data: Overview = { active: [], archived: [] };
  let errored = false;

  try {
    data = await loadExamsOverview(user.id);
  } catch (err) {
    console.error('[exams page]', err);
    errored = true;
  }

  return <ExamsView data={data} errored={errored} />;
}
