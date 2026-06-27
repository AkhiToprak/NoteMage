import { redirect } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/app/AppShell';
import ui from '@/components/app/ui.module.css';
import styles from './Report.module.css';
import { getServerAuthToken } from '@/lib/server-auth';
import { mageGenerationActionsEnabled } from '@/lib/feature-flags';
import { checkTokenBudget } from '@/lib/token-budget';
import { loadExamReport } from '@/lib/exam-result';
import ExamReportViewPage from './ExamReportView';

/* Exam report — server component. Resolves exam data during SSR so the first
   byte carries real content instead of a client spinner-then-fetch. The 'noresult'
   and 'error' empty states are rendered here since ExamReportView only accepts
   a resolved ExamReportView prop. */

export const dynamic = 'force-dynamic';

export default async function ExamReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const token = await getServerAuthToken();
  if (!token?.id) redirect('/auth/login');

  const userId = token.id as string;
  const { id: examId } = await params;

  let useAi = false;
  if (mageGenerationActionsEnabled()) {
    const { allowed, tier } = await checkTokenBudget(userId);
    useAi = allowed && (tier as string) !== 'FREE';
  }

  let report = null;
  let errored = false;

  try {
    report = await loadExamReport(userId, examId, { useAi });
  } catch (err) {
    console.error('[exam report page]', err);
    errored = true;
  }

  if (errored) {
    return (
      <AppShell>
        <div className={styles.center}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 40, color: 'var(--muted)' }}>
            error
          </span>
          <h1 className={styles.centerTitle}>Couldn&apos;t load the report</h1>
          <Link href={`/exam/${examId}`} className={`${ui.btn} ${ui.secondary}`}>
            Back to exam
          </Link>
        </div>
      </AppShell>
    );
  }

  if (report === null) {
    return (
      <AppShell>
        <div className={styles.center}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 40, color: 'var(--muted)' }}>
            assignment_late
          </span>
          <h1 className={styles.centerTitle}>No result recorded yet</h1>
          <Link href={`/exam/${examId}/result`} className={`${ui.btn} ${ui.primary}`}>
            Enter your result
          </Link>
        </div>
      </AppShell>
    );
  }

  return <ExamReportViewPage examId={examId} data={report} />;
}
