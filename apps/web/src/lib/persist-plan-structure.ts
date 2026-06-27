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

  const plan = await tx.studyPlan.create({
    data: {
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
          kind: slot.kind,
          sortOrder: j,
          coversSlotIds,
        },
      });
      phaseSlotIds.push(created.id);
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
            kind: 'final_exam',
            sortOrder: 0,
          },
        ],
      },
    },
  });

  return plan.id;
}
