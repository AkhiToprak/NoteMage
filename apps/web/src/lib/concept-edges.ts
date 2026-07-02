/**
 * Weakness Training Phase 4.2a — tier-0 structural `ConceptEdge` derivation.
 * See plans/weakness-training-phase4.md §12.1 (tier 0), §12.2 (schema),
 * §12.3 (cycle prevention + upsert), §12.7 (4.2a sub-phase scope).
 *
 * Tier 0 only: pure DB join over already-persisted `CheckpointSlot` /
 * `Concept` columns, no LLM calls. Tier 1 (Stage-A-piggybacked LLM refs,
 * §12.1) is workstream 4.2b and does NOT live here.
 *
 * Every write goes through {@link upsertConceptEdge}, which never throws —
 * a bad edge is skipped and logged, mirroring the fail-closed idiom in
 * `concept-write.ts` (a single bad edge must never fail path generation or
 * the derivation job).
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import { db } from '@/lib/db';
import { enqueueJob } from '@/lib/background-jobs';

/** Any Prisma client or interactive-transaction client — mirrors
 *  `concept-write.ts`'s `DbClient`. Every edge-writing helper below accepts
 *  this (defaulting to the shared `db`) so `persist-plan-structure.ts` (Phase
 *  4.2b) can compose edge writes inside its own already-open `tx`, since a
 *  freshly-`tx.create()`d `Concept` row is invisible to a standalone `db`
 *  query until that transaction commits. */
type DbClient = PrismaClient | Prisma.TransactionClient;

// ─── Source priority + confidence defaults (also used by 4.2b) ─────────────

/**
 * Higher wins. `upsertConceptEdge` never downgrades an existing edge's
 * source to a lower-priority one on re-derivation (e.g. a `llm_stage_a` edge
 * — 4.2b — is never clobbered by a later `structural_phase_order` re-run).
 */
export const SOURCE_PRIORITY: Record<string, number> = {
  structural_phase_order: 0,
  structural_covers_slot: 1,
  llm_stage_a: 2,
};

export const CONFIDENCE_STRUCTURAL_PHASE_ORDER = 0.35;
export const CONFIDENCE_STRUCTURAL_COVERS_SLOT = 0.55;
export const CONFIDENCE_LLM_STAGE_A = 0.7;

export type ConceptEdgeSource = 'structural_phase_order' | 'structural_covers_slot' | 'llm_stage_a';

const BFS_DEPTH_CAP = 12;

// ─── Cycle prevention ────────────────────────────────────────────────────

/**
 * BFS ancestor walk from `toConceptId` looking for `fromConceptId` over
 * `ConceptEdge` rows scoped to `planId`. If found, adding the edge
 * `fromConceptId -> toConceptId` would close a cycle (since `toConceptId`
 * can already reach `fromConceptId` via existing prerequisite edges).
 *
 * Depth-capped at {@link BFS_DEPTH_CAP} levels; fails OPEN (returns `false`,
 * i.e. "no cycle detected") if the cap is exhausted before the walk
 * terminates — cycles are structurally near-impossible for tier 0 (only
 * links lower->higher sortOrder) and tier 1 (only references
 * earlier-emitted concepts), so this is a defensive backstop, not the
 * primary guarantee, and a stalled walk must never block a legitimate edge.
 *
 * Batches queries one `findMany` per BFS level (`fromConceptId: { in: level
 * } }`), not one query per node.
 */
export async function wouldCreateCycle(
  fromConceptId: string,
  toConceptId: string,
  planId: string,
  client: DbClient = db
): Promise<boolean> {
  if (fromConceptId === toConceptId) return true;

  let frontier = new Set<string>([toConceptId]);
  const visited = new Set<string>([toConceptId]);

  for (let depth = 0; depth < BFS_DEPTH_CAP; depth++) {
    if (frontier.size === 0) return false;

    const edges = await client.conceptEdge.findMany({
      where: { planId, fromConceptId: { in: Array.from(frontier) } },
      select: { toConceptId: true },
    });

    const nextFrontier = new Set<string>();
    for (const edge of edges) {
      if (edge.toConceptId === fromConceptId) return true;
      if (!visited.has(edge.toConceptId)) {
        visited.add(edge.toConceptId);
        nextFrontier.add(edge.toConceptId);
      }
    }
    frontier = nextFrontier;
  }

  // Cap exhausted without finding `fromConceptId` — fail open.
  return false;
}

// ─── Upsert ──────────────────────────────────────────────────────────────

export interface UpsertConceptEdgeParams {
  planId: string;
  fromConceptId: string;
  toConceptId: string;
  source: ConceptEdgeSource;
  confidence: number;
}

/**
 * Create or strengthen one prerequisite edge. Never throws — every rejection
 * path is a `console.warn` + silent skip, so one bad edge can never fail a
 * path generation or the derivation job that calls this in a loop.
 *
 * Guards, in order:
 *  1. Self-edge (`fromConceptId === toConceptId`) — skipped.
 *  2. Same-plan invariant — both concepts must belong to `planId`
 *     (application-enforced, like `ConceptTag`'s closed-enum rule).
 *  3. Cycle check via {@link wouldCreateCycle} — skipped + logged on hit.
 *  4. Source priority ({@link SOURCE_PRIORITY}) — an existing edge is never
 *     downgraded to a lower-priority source; upserting the same or a
 *     stronger source proceeds and overwrites confidence/source.
 *
 * Upserts on the `@@unique([fromConceptId, toConceptId])` pair.
 *
 * @param client Optional Prisma client/tx — defaults to the shared `db`
 *   (the standalone `concept.edges.derive` background job's usage). Phase
 *   4.2b (`persist-plan-structure.ts`) passes its already-open `tx` here,
 *   since the `Concept` rows an LLM-ref edge points at were just created
 *   inside that SAME transaction and are invisible to a `db`-scoped query
 *   until it commits.
 */
export async function upsertConceptEdge(
  params: UpsertConceptEdgeParams,
  client: DbClient = db
): Promise<void> {
  const { planId, fromConceptId, toConceptId, source, confidence } = params;

  if (fromConceptId === toConceptId) return;

  try {
    const [fromConcept, toConcept] = await Promise.all([
      client.concept.findUnique({ where: { id: fromConceptId }, select: { planId: true } }),
      client.concept.findUnique({ where: { id: toConceptId }, select: { planId: true } }),
    ]);

    if (!fromConcept || !toConcept || fromConcept.planId !== planId || toConcept.planId !== planId) {
      console.warn('[concept-edges] skip: concept not found or plan mismatch', {
        planId,
        fromConceptId,
        toConceptId,
      });
      return;
    }

    const existing = await client.conceptEdge.findUnique({
      where: { fromConceptId_toConceptId: { fromConceptId, toConceptId } },
      select: { source: true },
    });

    if (existing) {
      const existingPriority = SOURCE_PRIORITY[existing.source] ?? -1;
      const incomingPriority = SOURCE_PRIORITY[source] ?? -1;
      if (incomingPriority < existingPriority) {
        // Never downgrade an existing stronger source.
        return;
      }
    } else {
      const isCycle = await wouldCreateCycle(fromConceptId, toConceptId, planId, client);
      if (isCycle) {
        console.warn('[concept-edges] skip: would create cycle', {
          planId,
          fromConceptId,
          toConceptId,
        });
        return;
      }
    }

    await client.conceptEdge.upsert({
      where: { fromConceptId_toConceptId: { fromConceptId, toConceptId } },
      update: { source, confidence, planId },
      create: { planId, fromConceptId, toConceptId, source, confidence },
    });
  } catch (error) {
    console.error('[concept-edges] upsertConceptEdge failed (non-fatal)', {
      planId,
      fromConceptId,
      toConceptId,
      source,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

// ─── Tier-0 structural derivation ───────────────────────────────────────

interface SlotRow {
  id: string;
  phaseId: string;
  sortOrder: number;
  kind: string;
  coversSlotIds: string[];
}

/**
 * Derive tier-0 structural edges for every concept in `planId`. Idempotent
 * (re-running is a no-op via {@link upsertConceptEdge}'s upsert) and safe to
 * run retroactively over any already-tagged plan.
 *
 * For concept `C` in slot `S` (phase `P`, sortOrder `N`):
 *  - If `S.kind` is `review`/`assessment` and `S.coversSlotIds` is
 *    non-empty: concepts belonging to those covered slots get the stronger
 *    `structural_covers_slot` edge (Stage A explicitly asserted coverage).
 *  - Otherwise (or in addition, for slots not in `coversSlotIds`): concepts
 *    in the IMMEDIATELY preceding learning slot of the same phase get the
 *    weaker `structural_phase_order` edge — adjacency-by-position, not a
 *    full pairwise join against every earlier slot, to keep total work
 *    bounded and avoid a quadratic edge explosion.
 *
 * Never crosses phase boundaries.
 */
export async function deriveStructuralEdgesForPlan(planId: string): Promise<void> {
  try {
    const slots: SlotRow[] = await db.checkpointSlot.findMany({
      where: { phase: { planId } },
      select: { id: true, phaseId: true, sortOrder: true, kind: true, coversSlotIds: true },
    });

    if (slots.length === 0) return;

    const concepts = await db.concept.findMany({
      where: { planId },
      select: { id: true, slotId: true },
    });

    if (concepts.length === 0) return;

    const conceptIdsBySlot = new Map<string, string[]>();
    for (const concept of concepts) {
      const list = conceptIdsBySlot.get(concept.slotId);
      if (list) list.push(concept.id);
      else conceptIdsBySlot.set(concept.slotId, [concept.id]);
    }

    // Group + order slots by phase (by sortOrder) so "immediately preceding
    // slot in the same phase" is a simple array-index lookup.
    const slotsByPhase = new Map<string, SlotRow[]>();
    for (const slot of slots) {
      const list = slotsByPhase.get(slot.phaseId);
      if (list) list.push(slot);
      else slotsByPhase.set(slot.phaseId, [slot]);
    }
    for (const list of slotsByPhase.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    const slotById = new Map(slots.map((slot) => [slot.id, slot]));

    for (const [, phaseSlots] of slotsByPhase) {
      for (let i = 0; i < phaseSlots.length; i++) {
        const slot = phaseSlots[i];
        const toConceptIds = conceptIdsBySlot.get(slot.id) ?? [];
        if (toConceptIds.length === 0) continue;

        // Strengthened edges: review/assessment slots that explicitly cover
        // earlier slots (Stage A's coversSlotIds) — covered slots stay
        // within the same phase by construction (persist-plan-structure.ts
        // resolves `covers` indices to earlier slots in the same phase).
        const coveredSlotIds = (slot.kind === 'review' || slot.kind === 'assessment')
          ? slot.coversSlotIds.filter((id) => slotById.has(id))
          : [];

        const coveredFromConceptIds = new Set<string>();
        for (const coveredSlotId of coveredSlotIds) {
          const fromConceptIds = conceptIdsBySlot.get(coveredSlotId) ?? [];
          for (const fromConceptId of fromConceptIds) {
            coveredFromConceptIds.add(fromConceptId);
          }
          for (const fromConceptId of fromConceptIds) {
            for (const toConceptId of toConceptIds) {
              await upsertConceptEdge({
                planId,
                fromConceptId,
                toConceptId,
                source: 'structural_covers_slot',
                confidence: CONFIDENCE_STRUCTURAL_COVERS_SLOT,
              });
            }
          }
        }

        // Plain phase-order edges: adjacency-by-position against the
        // immediately preceding slot in the same phase only (bounded work —
        // never a full pairwise join against every earlier slot). Skip a
        // `fromConceptId` already linked via the stronger covers-slot edge
        // above to avoid a redundant upsert call (upsertConceptEdge's
        // source-priority guard would no-op it anyway, but skip early).
        if (i > 0) {
          const prevSlot = phaseSlots[i - 1];
          const fromConceptIds = conceptIdsBySlot.get(prevSlot.id) ?? [];
          for (const fromConceptId of fromConceptIds) {
            if (coveredFromConceptIds.has(fromConceptId)) continue;
            for (const toConceptId of toConceptIds) {
              await upsertConceptEdge({
                planId,
                fromConceptId,
                toConceptId,
                source: 'structural_phase_order',
                confidence: CONFIDENCE_STRUCTURAL_PHASE_ORDER,
              });
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('[concept-edges] deriveStructuralEdgesForPlan failed (non-fatal)', {
      planId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

// ─── Enqueue hook ────────────────────────────────────────────────────────

/**
 * Best-effort post-commit enqueue of the `concept.edges.derive` job for a
 * freshly-persisted plan (phase4 §12.7 "4.2a"). Callers invoke this AFTER
 * their `persistPlanStructure` transaction has committed (never from inside
 * the transaction — enqueueing a job for a plan that later rolls back would
 * point at nothing). Gated on the plan actually having `Concept` rows (i.e.
 * `WEAKNESS_TRAINING_CONCEPTS` was on and Stage A emitted candidates) —
 * checking the DB directly rather than re-importing the flag keeps this a
 * single source of truth and survives a flag flip between persist and here.
 *
 * Deduplicated on `concept.edges.derive:<planId>` so a retried create call
 * (or a future re-derivation trigger) never double-enqueues. Never throws —
 * this must never block or fail path generation.
 */
export async function enqueueStructuralEdgeDerivation(planId: string): Promise<void> {
  try {
    const conceptCount = await db.concept.count({ where: { planId } });
    if (conceptCount === 0) return;

    await enqueueJob(
      'concept.edges.derive',
      { planId },
      { dedupeKey: `concept.edges.derive:${planId}` }
    );
  } catch (error) {
    console.error('[concept-edges] enqueueStructuralEdgeDerivation failed (non-fatal)', {
      planId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
