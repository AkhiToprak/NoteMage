import { notFound, redirect } from 'next/navigation';
import { getServerUserId } from '@/lib/server-auth';
import { flashcardReviewQueueEnabled } from '@/lib/feature-flags';
import { loadReviewQueue } from '@/lib/flashcard-review-queue';
import ReviewQueueView from './ReviewQueueView';

/**
 * Weakness Training Phase 4.3c (plans/weakness-training-phase4.md §13.7,
 * §13.8) — `/practice/review`, the schedule-driven due-card queue. Loaded
 * server-side (mirrors `/profile/weak-spots/page.tsx`) so the client never
 * fetches on mount; the client only POSTs grades at the end of the session.
 *
 * Flag-gated on `FLASHCARD_REVIEW_QUEUE` — with it off the route doesn't
 * exist (`notFound()`), matching how the weak-spots surface stays hidden
 * rather than half-rendering. No new sidebar slot (plan §13.7).
 */
export const dynamic = 'force-dynamic';

export default async function ReviewQueuePage() {
  if (!flashcardReviewQueueEnabled()) {
    notFound();
  }

  const userId = await getServerUserId();
  if (!userId) redirect('/auth/login');

  const queue = await loadReviewQueue(userId, new Date());

  return <ReviewQueueView queue={queue} />;
}
