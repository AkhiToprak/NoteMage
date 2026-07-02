import { notFound, redirect } from 'next/navigation';
import { getServerUserId } from '@/lib/server-auth';
import { loadExamWeakAreas } from '@/lib/exam-scope';
import { loadPathForUser, serializePath } from '@/lib/path-loader';
import type { PathPlan } from '@/components/learn/PathView';
import { db } from '@/lib/db';
import { weaknessTrainingUiEnabled } from '@/lib/feature-flags';
import { deriveConceptWeakAreas, type ConceptWeakAreaRow } from '@/lib/concept-weak-areas';
import WeakAreasView, { type WeakAreasResponse } from './WeakAreasView';

/* Exam weak-areas — server component. Resolves the same payload the
   /api/user/exams/[id]/weak-areas GET returned (loadExamWeakAreas) during SSR,
   plus the linked path (for per-topic mission deep-links), so the first byte
   carries real content. Sort toggle + practice-session launches stay client.

   Weakness Training Phase 2 (plan §6.1 "Entry points" / §7.1 item 3): this
   screen keeps its existing slot-level `deriveWeakAreas` rollup (all exam
   scope types, incl. non-path items) untouched, and ADDITIVELY gains a
   concept-level link-out to /profile/weak-spots. The link-out's count is
   computed via the SAME canonical `deriveConceptWeakAreas` the Weak Spots
   page uses, scoped to this exam's primary path, so the two surfaces can
   never disagree on severity. It is enrichment only — flag-gated and
   wrapped so a failure here never breaks the slot-level page. */

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

  // Concept-level link-out count (plan §6.1) — additive enrichment only, never
  // allowed to break the page. Uses the SAME deriveConceptWeakAreas the Weak
  // Spots page calls, scoped to this exam's primary path.
  let conceptWeakSpots = 0;
  if (weaknessTrainingUiEnabled() && result.primaryPathId) {
    try {
      const masteryRows = await db.conceptMastery.findMany({
        where: { userId, concept: { planId: result.primaryPathId } },
        include: { concept: true },
      });
      const concepts: ConceptWeakAreaRow[] = masteryRows.map((m) => ({
        conceptId: m.conceptId,
        label: m.concept.label,
        planId: m.concept.planId,
        slotId: m.concept.slotId,
        status: m.status,
        weightedCorrect: m.weightedCorrect,
        weightedTotal: m.weightedTotal,
        attemptCount: m.attemptCount,
        lastAttemptAt: m.lastAttemptAt,
        lastCorrectAt: m.lastCorrectAt,
        peakLcb: m.peakLcb,
      }));
      const conceptResult = deriveConceptWeakAreas({
        concepts,
        now: new Date(),
        scope: { scope: 'path', planId: result.primaryPathId },
      });
      conceptWeakSpots = conceptResult.areas.length;
    } catch (err) {
      console.error('[exam weak-areas page] concept load', err);
    }
  }

  return (
    <WeakAreasView
      examId={examId}
      data={result as unknown as WeakAreasResponse}
      path={path}
      conceptWeakSpots={conceptWeakSpots}
    />
  );
}
