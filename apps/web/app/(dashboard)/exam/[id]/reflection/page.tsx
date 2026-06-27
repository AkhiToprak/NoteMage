/* Exam Mode Phase 5 — Exam Reflection ("What went wrong?") — SERVER PAGE.
 * Resolves the result entry context during SSR so the first byte carries real
 * content instead of a client spinner-then-fetch.
 *
 * Auth: getServerUserId() from @/lib/server-auth (never getServerSession).
 * Data: loadResultEntryContext() from @/lib/exam-result.
 * If no recorded result yet → redirect to /exam/[id]/result (same logic the
 * client previously did via router.replace). */

import { redirect, notFound } from 'next/navigation';
import { getServerUserId } from '@/lib/server-auth';
import { loadResultEntryContext } from '@/lib/exam-result';
import AppShell from '@/components/app/AppShell';
import ExamReflectionView from './ExamReflectionView';

export const dynamic = 'force-dynamic';

export default async function ExamReflectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [userId, { id: examId }] = await Promise.all([getServerUserId(), params]);
  if (!userId) redirect('/auth/login');

  const ctx = await loadResultEntryContext(userId, examId);
  if (!ctx) notFound();
  if (!ctx.existing) redirect(`/exam/${examId}/result`);

  return (
    <AppShell>
      <ExamReflectionView examId={examId} ctx={ctx} />
    </AppShell>
  );
}
