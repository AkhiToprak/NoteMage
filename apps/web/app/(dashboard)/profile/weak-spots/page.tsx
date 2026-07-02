import { notFound, redirect } from 'next/navigation';
import { getServerUserId } from '@/lib/server-auth';
import { db } from '@/lib/db';
import { weaknessTrainingUiEnabled } from '@/lib/feature-flags';
import {
  deriveConceptWeakAreas,
  attachUpstreamGapHints,
  type ConceptEdgeForHints,
  type PrereqMasteryRowForHints,
} from '@/lib/concept-weak-areas';
import { loadConceptWeakAreaRows } from '@/lib/concept-weak-areas-loader';
import { maybeEnqueueDedupBackfill } from '@/lib/concept-dedup';
import { resolveNudgesForUser } from '@/lib/weakness-nudges';
import WeakSpotsView, { type WeakSpotsData, type WeakSpotAreaWithMergeInfo } from './WeakSpotsView';

/**
 * Weakness Training Phase 1B — user-facing "Weak spots" surface (plan §6.1,
 * §6.3, §6.5, §7.2). Polished counterpart to the Phase 1A internal debug view
 * (`../weak-spots-debug/page.tsx`) — same data load
 * (`loadConceptWeakAreaRows` → `deriveConceptWeakAreas`, Phase 4.1a §11.5),
 * but flag-gated on `WEAKNESS_TRAINING_UI` (independent of the Phase 1A
 * concept-tagging flag) and rendered through the cream `AppShell` design
 * system with a "Train this" CTA per concept.
 *
 * Lives inside the existing `(dashboard)` AppShell — no new sidebar slot (§6.1).
 * With the flag off, the route doesn't exist (`notFound()`), matching how the
 * debug view stays dark rather than half-rendering a disabled surface.
 */

export const dynamic = 'force-dynamic';

export default async function WeakSpotsPage() {
  if (!weaknessTrainingUiEnabled()) {
    notFound();
  }

  const userId = await getServerUserId();
  if (!userId) redirect('/auth/login');

  const user = await db.user.findUnique({ where: { id: userId }, select: { tier: true, role: true } });
  const isPro = user?.tier === 'PRO' || user?.role === 'admin';

  const now = new Date();
  const concepts = await loadConceptWeakAreaRows(userId);

  // Weakness Training Phase 4.1b (phase4 §11.7) — lazy backfill trigger.
  // Fire-and-forget: this page render must never block or fail on it.
  try {
    await maybeEnqueueDedupBackfill(userId);
  } catch {
    // best-effort — never let backfill enqueueing affect the page render
  }

  // Weakness Training Phase 4.4a (phase4 §14.1) — on-read resolve. Visiting
  // this page is the "user acted on the nudge" signal; flip any
  // nudged/escalated WeaknessNudgeLog rows to resolved. Fire-and-forget —
  // resolveNudgesForUser never throws, but void+catch is a second backstop
  // so it can never block or fail this render either way.
  void resolveNudgesForUser(userId).catch(() => {});

  const result = deriveConceptWeakAreas({ concepts, now, scope: { scope: 'all-paths' } });

  // Weakness Training Phase 4.2b (phase4 §12.6) — best-effort upstream-gap
  // hints. Never blocks or fails the page render: any error here just leaves
  // `areas` as `deriveConceptWeakAreas` produced them (no hints attached).
  let areasWithHints = result.areas;
  try {
    if (result.areas.length > 0) {
      const areaConceptIds = result.areas.map((a) => a.conceptId);

      // Edges into the weak set, highest confidence first. `toConceptId`/
      // `fromConceptId` are resolved through `canonicalId ?? id` below (§10.1
      // "canonical resolution is read-time, everywhere") — a raw ConceptEdge
      // row can point at either endpoint's PRE-merge id, but `areaConceptIds`
      // (from the loader) are already canonical, so a raw `toConceptId` match
      // against them would silently miss any edge into a merged-away sibling.
      const rawEdges = await db.conceptEdge.findMany({
        where: { toConcept: { OR: [{ id: { in: areaConceptIds } }, { canonicalId: { in: areaConceptIds } }] } },
        select: {
          confidence: true,
          fromConcept: { select: { id: true, canonicalId: true } },
          toConcept: { select: { id: true, canonicalId: true } },
        },
        orderBy: { confidence: 'desc' },
      });

      const edges: ConceptEdgeForHints[] = rawEdges.map((e) => ({
        fromConceptId: e.fromConcept.canonicalId ?? e.fromConcept.id,
        toConceptId: e.toConcept.canonicalId ?? e.toConcept.id,
        confidence: e.confidence,
      }));

      const prereqConceptIds = Array.from(new Set(edges.map((e) => e.fromConceptId)));
      let prereqMasteryRows: PrereqMasteryRowForHints[] = [];
      if (prereqConceptIds.length > 0) {
        const prereqRows = await loadConceptWeakAreaRows(userId, { conceptIds: prereqConceptIds });
        prereqMasteryRows = prereqRows.map((r) => ({
          conceptId: r.conceptId,
          label: r.label,
          weightedCorrect: r.weightedCorrect,
          weightedTotal: r.weightedTotal,
          attemptCount: r.attemptCount,
          lastAttemptAt: r.lastAttemptAt,
          lastCorrectAt: r.lastCorrectAt,
          peakLcb: r.peakLcb,
        }));
      }

      areasWithHints = attachUpstreamGapHints(result.areas, edges, prereqMasteryRows, now);
    }
  } catch (error) {
    console.error('[weak-spots] upstream-gap hint attachment failed (non-fatal)', {
      userId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // Weakness Training Phase 4.2b (phase4 §11.6) — join `mergedSlotCount`
  // (loader-only field, `deriveConceptWeakAreas` never carries it through)
  // back onto each area by `conceptId`. `concepts` (the loader's raw output)
  // and `areasWithHints` share `conceptId` as the join key.
  const mergedSlotCountByConceptId = new Map(concepts.map((c) => [c.conceptId, c.mergedSlotCount]));
  const areasWithMergeInfo: WeakSpotAreaWithMergeInfo[] = areasWithHints.map((area) => ({
    ...area,
    mergedSlotCount: mergedSlotCountByConceptId.get(area.conceptId),
  }));
  const hasMultiSlotMerge = areasWithMergeInfo.some((a) => (a.mergedSlotCount ?? 0) > 1);

  // Serializable subset only — the areas/coverage/coldStart the client needs
  // to render. `byBand` is derivable from `areas` client-side but passing it
  // through keeps the view a straight mirror of the canonical result shape.
  // `byBand` is rebuilt from `areasWithMergeInfo` (not `result.byBand`) so the
  // hint/merge-attached area objects — not the pre-hint ones — are what the
  // client actually renders in each band group.
  const data: WeakSpotsData = {
    areas: areasWithMergeInfo,
    byBand: {
      weak: areasWithMergeInfo.filter((a) => a.band === 'weak'),
      rusty: areasWithMergeInfo.filter((a) => a.band === 'rusty'),
    },
    coverage: result.coverage,
    coldStart: result.coldStart,
    hasMultiSlotMerge,
  };

  return <WeakSpotsView data={data} isPro={isPro} />;
}
