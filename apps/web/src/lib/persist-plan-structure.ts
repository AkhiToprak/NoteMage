// Shared Stage-A persistence — turns a generated path structure
// (PathStructureToolInput) into the owned StudyPlan + StudyPhase + CheckpointSlot
// tree (plus the path-wide Final Exam phase) inside the caller's transaction.
//
// Factored out of POST /api/learn/paths so the live create route AND the
// onboarding claim (onboarding-real-generation P4, D8 — "materialize, don't
// regenerate") build the identical row shape from the identical code. Anything
// that changes how a path persists changes here, once.

import type { Prisma } from '@prisma/client';
import type { PathStructureToolInput } from './ai-tools';
import { weaknessConceptsEnabled } from './feature-flags';
import { persistSlotConcepts } from './concept-write';
import { upsertConceptEdge, CONFIDENCE_LLM_STAGE_A } from './concept-edges';

// Paths are self-paced: the start/end dates stamped below are internal
// bookkeeping only — nothing in the path UI shows or gates on them. We use a
// fixed span so the non-null StudyPlan / StudyPhase date columns stay valid.
export const DEFAULT_PATH_SPAN_DAYS = 30;

export function defaultPathSpan(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + DEFAULT_PATH_SPAN_DAYS - 1);
  return { start, end };
}

export interface PersistPlanStructureInput {
  userId: string;
  /** Guaranteed-non-null home notebook — generated FlashcardSet/QuizSet rows
   *  inherit it, and the checkpoint viewers URL-template it into every fetch. */
  notebookId: string;
  contextNotebookIds: string[];
  /** Exact material ids Stage B rebuilds the grounding corpus from. */
  materialIds: string[];
  /** User-entered fallback title — Stage A's refined title wins when present. */
  fallbackTitle: string;
  learnerBrief?: string | null;
  /** Stage A skeleton (`GeneratedPathStructure` === `PathStructureToolInput`). */
  structure: PathStructureToolInput;
  source: string; // "ai" | "sample" | …
  ultra: boolean;
  gemini: boolean;
  language: string;
  subjects: string[];
  subjectWeights: number[];
  /** Defaults to "generating" (a fresh path awaiting Stage B). */
  generationStatus?: string;
  /**
   * Pre-generated plan id. Omit to let Prisma mint a cuid (the onboarding claim
   * path). The create route supplies one so it can derive the Stage-A sticky
   * session token (`path-${planId}`) BEFORE the plan is persisted — Stage A and
   * Stage B then share one token and one warm prefix cache. Must be a valid
   * unique id when set.
   */
  planId?: string;
}

/**
 * Create the owned StudyPlan + phases + empty slots (plus the trailing Final
 * Exam phase) from a Stage A structure, inside the caller's transaction, and
 * return the new plan id. Slot `covers` (section-local indices Stage A emitted)
 * are resolved to the ids of earlier slots in the same phase. The caller owns
 * the transaction so it can do related work atomically (e.g. claim creates the
 * notebook + source Document and attaches the preview lesson in the same tx).
 */
export async function persistPlanStructure(
  tx: Prisma.TransactionClient,
  input: PersistPlanStructureInput,
): Promise<string> {
  const { start, end } = defaultPathSpan();
  const planTitle = input.structure.title?.trim() || input.fallbackTitle;
  const planDescription = input.structure.description?.trim() || null;

  // Weakness Training Phase 1A (behind WEAKNESS_TRAINING_CONCEPTS=1): collected
  // during the slot-creation loop below; persisted just before this function
  // returns, INSIDE `tx` but wrapped in a Postgres SAVEPOINT (see below) — not
  // via the default `db` client. `persistPlanStructure` returns before the
  // CALLER's `db.$transaction(...)` commits (both call sites just do `const
  // planId = await db.$transaction((tx) => persistPlanStructure(tx, ...))`),
  // so there is no "after commit" hook available from inside this function
  // without changing that return contract. A bare try/catch around a Prisma
  // call INSIDE an interactive transaction does not work either: once any
  // SQL-level error reaches Postgres, the whole transaction is marked
  // aborted and every later statement on `tx` fails with 25P02, even if the
  // JS exception was caught — catching it only hides the error, it does not
  // undo the abort. A SAVEPOINT is the documented-safe way to make one
  // statement group inside a larger transaction failure-isolated: on error,
  // `ROLLBACK TO SAVEPOINT` undoes just that group and clears the aborted
  // state, letting the rest of `tx` (and the caller's subsequent slot/phase
  // writes) continue normally.
  const pendingSlotConcepts: { slotId: string; candidates: string[]; phaseIndex: number }[] = [];

  // Weakness Training Phase 4.2b (phase4 §12.1 tier 1): Stage A's optional
  // per-slot `prerequisiteConceptRefs` — label strings the model claims are
  // copied verbatim from `conceptCandidates` it emitted in an EARLIER slot of
  // the SAME phase. Queued alongside `pendingSlotConcepts` (same "collect
  // during the slot loop, resolve after concepts exist" shape) and resolved
  // just below, per phase, once every slot in that phase has had its
  // `persistSlotConcepts` call — resolution never needs to look past the
  // phase it was queued in, since refs can only ever point at earlier slots
  // of the same phase (§12.1 "in the SAME structured response... same phase").
  const pendingSlotPrereqRefs: { slotId: string; phaseIndex: number; refs: string[] }[] = [];

  const plan = await tx.studyPlan.create({
    data: {
      // Omit `id` when unset so Prisma's @default(cuid()) still applies.
      ...(input.planId ? { id: input.planId } : {}),
      userId: input.userId,
      notebookId: input.notebookId,
      contextNotebookIds: input.contextNotebookIds,
      materialIds: input.materialIds,
      title: planTitle,
      description: planDescription,
      learnerBrief: input.learnerBrief?.trim().slice(0, 4000) || null,
      startDate: start,
      endDate: end,
      source: input.source,
      ultra: input.ultra,
      gemini: input.gemini,
      language: input.language,
      generationStatus: input.generationStatus ?? 'generating',
      subjects: input.subjects,
      subjectWeights: input.subjectWeights,
    },
  });

  for (let i = 0; i < input.structure.phases.length; i++) {
    const phase = input.structure.phases[i];
    // Spread the phase dates evenly across the target days.
    const phaseLengthDays = Math.max(
      1,
      Math.floor(DEFAULT_PATH_SPAN_DAYS / Math.max(1, input.structure.phases.length)),
    );
    const phaseStart = new Date(start);
    phaseStart.setDate(phaseStart.getDate() + i * phaseLengthDays);
    const phaseEnd = new Date(phaseStart);
    phaseEnd.setDate(phaseEnd.getDate() + phaseLengthDays - 1);

    const studyPhase = await tx.studyPhase.create({
      data: {
        planId: plan.id,
        title: phase.title,
        description: phase.description ?? null,
        sortOrder: i,
        startDate: phaseStart,
        endDate: phaseEnd,
        status: i === 0 ? 'active' : 'upcoming',
      },
    });

    // Create slots in order so each checkpoint's `covers` (section-local indices
    // Stage A emitted) can be resolved to the ids of the earlier slots it tests.
    // Indices are clamped to slots that precede this one.
    const phaseSlotIds: string[] = [];
    for (let j = 0; j < phase.slots.length; j++) {
      const slot = phase.slots[j];
      const coversSlotIds = (slot.covers ?? [])
        .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < j)
        .map((idx) => phaseSlotIds[idx])
        .filter((id): id is string => Boolean(id));
      const created = await tx.checkpointSlot.create({
        data: {
          phaseId: studyPhase.id,
          title: slot.title,
          description: slot.topicHint,
          objective: slot.objective ?? null,
          ...(slot.assessmentSpec
            ? { assessmentSpec: slot.assessmentSpec as unknown as Prisma.InputJsonValue }
            : {}),
          kind: slot.kind,
          sortOrder: j,
          coversSlotIds,
        },
      });
      phaseSlotIds.push(created.id);

      // Weakness Training Phase 1A (behind WEAKNESS_TRAINING_CONCEPTS=1):
      // capture Stage A's `conceptCandidates` for this slot — emitted in the
      // SAME create_path_structure call that already produced topicHint/
      // objective, so this is zero extra LLM round-trips. `conceptCandidates`
      // is read directly off the raw tool-input object (`PathStructureSlot`,
      // ai-tools.ts) here, BEFORE it would otherwise be lost: this field has
      // no corresponding Zod schema anywhere downstream (it never reaches a
      // QuizQuestion/Flashcard payload), so this is the only place it's ever
      // captured. Mirrors the `figure`/`source` loose-hold idiom
      // (packages/shared/src/quiz.ts ~L214-234): held as a plain string[]
      // with zero schema involvement. Only QUEUED here (pure, no I/O) — the
      // actual persistence happens after `tx` commits, below.
      //
      // FLAG-OFF NO-OP: with the flag off, `conceptCandidates` is never
      // emitted by the model (the tool schema omits the property entirely —
      // see ai-tools.ts:PATH_STRUCTURE_TOOL_BASE), so `slot.conceptCandidates`
      // is always undefined and nothing is queued.
      if (weaknessConceptsEnabled() && slot.conceptCandidates && slot.conceptCandidates.length > 0) {
        pendingSlotConcepts.push({ slotId: created.id, candidates: slot.conceptCandidates, phaseIndex: i });
      }

      // Weakness Training Phase 4.2b (phase4 §12.1 tier 1): queue this slot's
      // `prerequisiteConceptRefs` the same way — pure, no I/O, resolved after
      // `tx` commits below. FLAG-OFF NO-OP: with the flag off the tool schema
      // omits `prerequisiteConceptRefs` entirely, so `slot.prerequisiteConceptRefs`
      // is always undefined here.
      if (
        weaknessConceptsEnabled() &&
        slot.prerequisiteConceptRefs &&
        slot.prerequisiteConceptRefs.length > 0
      ) {
        pendingSlotPrereqRefs.push({ slotId: created.id, phaseIndex: i, refs: slot.prerequisiteConceptRefs });
      }
    }
  }

  // Append the path-wide Final Exam as its own synthetic phase so it sits
  // visually after every section, unlocks only when all prior slots are
  // complete, and grades the learner against the whole path. One quiz-only slot
  // of kind `final_exam`; Stage B fills it.
  await tx.studyPhase.create({
    data: {
      planId: plan.id,
      title: 'Final Exam',
      description: 'Comprehensive, graded exam covering every section.',
      sortOrder: input.structure.phases.length,
      startDate: end,
      endDate: end,
      status: 'upcoming',
      slots: {
        create: [
          {
            title: 'Final Exam',
            description: `Path-wide capstone for "${planTitle}". Pulls questions from every section to simulate the real exam.`,
            assessmentSpec: {
              knowledgeType: 'conceptual',
              learnerAction: 'Integrate and apply the path’s major concepts across sections.',
              evidence: 'Correct responses explain relationships and transfer learning beyond memorized examples.',
              difficulty: 'stretch',
              transfer: 'mixed',
              scoringRule: 'Full credit requires correct reasoning across the path’s representative concepts.',
            },
            kind: 'final_exam',
            sortOrder: 0,
          },
        ],
      },
    },
  });

  // Weakness Training Phase 1A (behind WEAKNESS_TRAINING_CONCEPTS=1): persist
  // the queued `conceptCandidates` now that every slot in the plan has a real
  // id. SAVEPOINT-isolated (see the comment above `pendingSlotConcepts`) so a
  // failure here can NEVER roll back or break the plan/phase/slot rows this
  // function exists to create — `ROLLBACK TO SAVEPOINT` discards only this
  // block's writes and clears Postgres's aborted-transaction state, then
  // `RELEASE SAVEPOINT` on the success path is a no-op cleanup. Flag-off /
  // no candidates emitted: `pendingSlotConcepts` is empty and this whole
  // block (including the SAVEPOINT round-trip) never runs.
  // Weakness Training Phase 4.2b (phase4 §12.1 tier 1, §12.7 "4.2b"):
  // accumulate a per-phase `label -> conceptId` map as each slot's concepts
  // are persisted, so `prerequisiteConceptRefs` (queued above) can be
  // resolved against every EARLIER slot's concepts in the same phase once we
  // reach them in the edges block below. `persistSlotConcepts` already
  // returns a map keyed by both slug and verbatim label (see its docstring)
  // — merged in verbatim here since refs are matched by label, mirroring how
  // `attachConceptTags` resolves `conceptKeys`. Declared outside the SAVEPOINT
  // block below so the (separate) edges SAVEPOINT block can still read it
  // even though concept persistence has its own failure-isolated scope.
  const labelToConceptIdByPhase = new Map<number, Map<string, string>>();
  // This slot's OWN newly-created concept ids — needed as the edge
  // `toConceptId`s once a slot's refs resolve.
  const conceptIdsBySlot = new Map<string, string[]>();

  if (pendingSlotConcepts.length > 0) {
    try {
      await tx.$executeRawUnsafe('SAVEPOINT weakness_concepts');
      try {
        for (const { slotId, candidates, phaseIndex } of pendingSlotConcepts) {
          const byKey = await persistSlotConcepts(plan.id, slotId, candidates, tx);

          let phaseMap = labelToConceptIdByPhase.get(phaseIndex);
          if (!phaseMap) {
            phaseMap = new Map<string, string>();
            labelToConceptIdByPhase.set(phaseIndex, phaseMap);
          }
          const slotConceptIds = new Set<string>();
          for (const [label, conceptId] of byKey) {
            phaseMap.set(label, conceptId);
            slotConceptIds.add(conceptId);
          }
          conceptIdsBySlot.set(slotId, Array.from(slotConceptIds));
        }
        await tx.$executeRawUnsafe('RELEASE SAVEPOINT weakness_concepts');
      } catch (innerError) {
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT weakness_concepts');
        throw innerError;
      }
    } catch (error) {
      console.error('[persistPlanStructure] concept persistence failed (non-fatal)', {
        planId: plan.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Weakness Training Phase 4.2b: resolve `prerequisiteConceptRefs`
  // fail-closed — a ref that doesn't exact-match (trim + case-insensitive) a
  // concept label from an EARLIER slot of the SAME phase is silently dropped
  // (logged as a count, never per-ref noise). Own SAVEPOINT, separate from
  // the concept-persistence one above: edges are a strictly downstream
  // concern (they can only resolve against whatever concepts actually made
  // it through the block above — if that block rolled back, every
  // `labelToConceptIdByPhase` lookup below simply misses and the ref is
  // dropped, never a hard failure), and a failure writing edges must never
  // fail path generation or roll back concepts that already committed.
  if (pendingSlotPrereqRefs.length > 0) {
    try {
      await tx.$executeRawUnsafe('SAVEPOINT weakness_concept_edges');
      try {
        let droppedRefCount = 0;
        let resolvedEdgeCount = 0;

        for (const { slotId, phaseIndex, refs } of pendingSlotPrereqRefs) {
          const phaseMap = labelToConceptIdByPhase.get(phaseIndex);
          const toConceptIds = conceptIdsBySlot.get(slotId);
          if (!phaseMap || !toConceptIds || toConceptIds.length === 0) {
            droppedRefCount += refs.length;
            continue;
          }

          // Case-insensitive lookup mirrors `attachConceptTags`'s trim-based
          // resolution (concept-write.ts) — build a lowercased index of the
          // phase's labels once per slot rather than per ref.
          const lowerIndex = new Map<string, string>();
          for (const [label, conceptId] of phaseMap) {
            lowerIndex.set(label.trim().toLowerCase(), conceptId);
          }

          for (const rawRef of refs) {
            const ref = rawRef.trim();
            if (!ref) {
              droppedRefCount += 1;
              continue;
            }
            const fromConceptId = phaseMap.get(ref) ?? lowerIndex.get(ref.toLowerCase());
            if (!fromConceptId) {
              droppedRefCount += 1;
              continue;
            }
            // A ref matching one of THIS slot's own just-created concepts
            // (same label reused, or the model referencing its own slot) is
            // not a valid prerequisite — earlier-slot-only, fail closed.
            if (toConceptIds.includes(fromConceptId)) {
              droppedRefCount += 1;
              continue;
            }

            for (const toConceptId of toConceptIds) {
              await upsertConceptEdge(
                {
                  planId: plan.id,
                  fromConceptId,
                  toConceptId,
                  source: 'llm_stage_a',
                  confidence: CONFIDENCE_LLM_STAGE_A,
                },
                tx
              );
              resolvedEdgeCount += 1;
            }
          }
        }

        if (droppedRefCount > 0 || resolvedEdgeCount > 0) {
          console.warn('[persistPlanStructure] prerequisiteConceptRefs resolved', {
            planId: plan.id,
            resolvedEdgeCount,
            droppedRefCount,
          });
        }
        await tx.$executeRawUnsafe('RELEASE SAVEPOINT weakness_concept_edges');
      } catch (innerError) {
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT weakness_concept_edges');
        throw innerError;
      }
    } catch (error) {
      console.error('[persistPlanStructure] prerequisite edge resolution failed (non-fatal)', {
        planId: plan.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return plan.id;
}
