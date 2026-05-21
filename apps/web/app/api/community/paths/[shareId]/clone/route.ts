// Phase 9 of plans/path-publishing-community-library.md — clone-on-fork.
//
// POST /api/community/paths/[shareId]/clone — deep-copies an approved
// SharedPath into a private StudyPlan owned by the requester. The clone
// is a forensic snapshot at clone time: future edits the original
// author makes (or republications) do not flow into existing clones
// per AC-Clone-7.
//
// Per P0 spec §4.6:
//   - Auth required (user) → 401 otherwise.
//   - Path must be `moderationStatus === 'approved'` → 404 otherwise
//     (existence-leak guard, same shape as the rest of the public surface).
//   - Idempotent per (userId, sharedPathId): re-cloning returns the
//     existing plan with `alreadyCloned: true` and DOES NOT re-copy or
//     re-increment downloadCount (AC-Clone-5, AC-Clone-6).
//   - Effects on first clone:
//       * transactional deep-copy of StudyPlan + StudyPhase +
//         CheckpointSlot + CheckpointActivity + TheoryContent /
//         FlashcardSet+Flashcard(+FlashcardImage) / QuizSet+QuizQuestion
//         with fresh cuids everywhere (AC-Clone-2);
//       * progress is reset — starsEarned=0, bestPercentage=null,
//         CheckpointActivity.completed=false, flashcard SR fields reset
//         to defaults, no AssessmentAttempt or QuizAttempt copied
//         (AC-Clone-3);
//       * StudyPlan.clonedFromSharedPathId = shareId (AC-Clone-4);
//       * StudyPlan.userId = cloner; FlashcardSet/QuizSet.userId =
//         cloner too — the cloned content belongs to the new owner and
//         survives the original author deleting their account;
//       * SharedPath.downloadCount incremented +1 inside the same
//         transaction so a clone-tx that rolls back can't leak a
//         phantom +1 (AC-Clone-6).
//   - P11 wires the P0 §4.6 "popularity-threshold pre-translation fan-
//     out" post-commit hook: after a real first clone commits we call
//     `triggerPretranslationOnClone` fire-and-forget. It atomically
//     flips `popularityTriggeredAt` iff the (now-incremented)
//     `downloadCount` crossed `POPULARITY_THRESHOLD`, and on the winning
//     flip fans out the popular-language translations. Idempotent re-
//     clones never reach it (they don't increment the counter). Backfill
//     of paths that crossed the threshold pre-P11 is the admin manual-
//     trigger endpoint's job (`/api/admin/paths/[shareId]/pretranslate`).
//
// Why a single interactive `db.$transaction(async (tx) => ...)`:
//   - We need fresh cuids allocated for every row in the graph and the
//     FKs threaded through (StudyPlan.id → StudyPhase.planId →
//     CheckpointSlot.phaseId → CheckpointActivity.slotId →
//     theoryId / flashcardSetId / quizSetId). Prisma's nested-`create`
//     does this in one round-trip, and the interactive transaction
//     wraps it together with the existence-recheck and the
//     downloadCount increment so the four writes either all commit
//     or none do.
//   - FlashcardImage rows copy `filePath` by reference. The blob in
//     storage is shared; deleting the source path or author does NOT
//     reach into the cloned rows because the new FlashcardImage rows
//     live under the cloner's FlashcardSet → Flashcard chain (their
//     own cascade root).
//
// Cost: pure DB. No model call, no email, no notification (cloning is a
// silent action from the source author's POV — they see it in the
// `downloadCount` aggregate, not as a per-event notification). The cost
// gate (P9V) is trivially met by construction.

import { NextRequest } from 'next/server';
import { Prisma, type QuestionKind } from '@prisma/client';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  conflictResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { triggerPretranslationOnClone } from '@/lib/translation/pretranslate';

type Params = { params: Promise<{ shareId: string }> };

interface CloneResponse {
  planId: string;
  alreadyCloned: boolean;
}

// 30s — deep-copies of large paths (50+ slots × 4 activities × dozens of
// flashcards per set) can run wide; Prisma's default 5s transaction
// timeout would trip on the upper end. We're nowhere near connection
// starvation territory at v1 traffic so a longer-than-default ceiling is
// fine here.
const CLONE_TX_TIMEOUT_MS = 30_000;

// Sanity caps on the cloned plan timeline. Re-using "now → +30 days"
// matches the seed defaults so a fresh clone behaves identically to a
// brand-new manual path in /learn/paths.
const PLAN_HORIZON_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { shareId } = await params;

    // Cheap pre-check outside the transaction: avoids opening a tx
    // (and holding a connection) for the common 404 / already-cloned
    // paths. The transaction below re-validates everything — this is
    // an optimisation, not the source of truth.
    const sharedPath = await db.sharedPath.findUnique({
      where: { id: shareId },
      select: { id: true, moderationStatus: true },
    });
    if (!sharedPath || sharedPath.moderationStatus !== 'approved') {
      return notFoundResponse('Path not found');
    }

    const existingClone = await db.studyPlan.findFirst({
      where: { userId, clonedFromSharedPathId: shareId },
      select: { id: true },
    });
    if (existingClone) {
      const payload: CloneResponse = {
        planId: existingClone.id,
        alreadyCloned: true,
      };
      return successResponse(payload);
    }

    // Load the source plan + every nested relation we need to deep-copy.
    // The select shape mirrors AC-Clone-2's "plan + phases + slots +
    // activities + theory/flashcards/quizzes" — exactly the content
    // surface the detail page deliberately hides at preview time
    // (AC-Browse-6) and unlocks via clone.
    const source = await db.sharedPath.findUnique({
      where: { id: shareId },
      select: {
        id: true,
        moderationStatus: true,
        language: true,
        subjects: true,
        title: true,
        description: true,
        plan: {
          select: {
            title: true,
            description: true,
            phases: {
              orderBy: { sortOrder: 'asc' },
              select: {
                title: true,
                description: true,
                sortOrder: true,
                gateStrategy: true,
                slots: {
                  orderBy: { sortOrder: 'asc' },
                  select: {
                    title: true,
                    description: true,
                    kind: true,
                    sortOrder: true,
                    prerequisiteSlotIds: true,
                    activities: {
                      orderBy: { sortOrder: 'asc' },
                      select: {
                        kind: true,
                        title: true,
                        sortOrder: true,
                        theory: {
                          select: { title: true, body: true },
                        },
                        flashcardSet: {
                          select: {
                            title: true,
                            source: true,
                            flashcards: {
                              orderBy: { sortOrder: 'asc' },
                              select: {
                                question: true,
                                answer: true,
                                sortOrder: true,
                                images: {
                                  orderBy: { sortOrder: 'asc' },
                                  select: {
                                    side: true,
                                    fileName: true,
                                    filePath: true,
                                    fileSize: true,
                                    mimeType: true,
                                    sortOrder: true,
                                  },
                                },
                              },
                            },
                          },
                        },
                        quizSet: {
                          select: {
                            title: true,
                            questions: {
                              orderBy: { sortOrder: 'asc' },
                              select: {
                                kind: true,
                                payload: true,
                                question: true,
                                options: true,
                                correctIndex: true,
                                hint: true,
                                correctExplanation: true,
                                wrongExplanation: true,
                                sortOrder: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Defensive — pre-check passed but the path was unpublished between
    // the two reads. Same 404 as the unauthorised path.
    if (!source || source.moderationStatus !== 'approved' || !source.plan) {
      return notFoundResponse('Path not found');
    }

    // Fresh timeline — the cloner is starting now, not at the original
    // author's start date.
    const now = new Date();
    const endDate = new Date(now.getTime() + PLAN_HORIZON_MS);

    const result = await db.$transaction(
      async (tx) => {
        // Re-check inside the tx for the (userId, shareId) idempotency
        // race. Two requests can race past the pre-check at the same
        // microtask; the first to land here wins, the second sees the
        // row and bails with `alreadyCloned: true`. We use the same
        // `findFirst` shape rather than relying on a unique constraint
        // because `StudyPlan` doesn't carry one on (userId,
        // clonedFromSharedPathId) — multiple historical clones of the
        // same SharedPath aren't disallowed at the schema layer, the
        // idempotency is route-level.
        const raceClone = await tx.studyPlan.findFirst({
          where: { userId, clonedFromSharedPathId: shareId },
          select: { id: true },
        });
        if (raceClone) {
          return { planId: raceClone.id, alreadyCloned: true as const };
        }

        // Deep-copy via Prisma's nested create. Prisma allocates fresh
        // cuids for every node and threads the parent FKs through
        // automatically. The cloner's userId is set on StudyPlan +
        // every FlashcardSet/QuizSet so the cloned content belongs to
        // them (cascade-survives the source author leaving).
        const newPlan = await tx.studyPlan.create({
          data: {
            userId,
            title: source.plan.title,
            description: source.plan.description,
            startDate: now,
            endDate,
            source: 'manual',
            // Progress / generation state — every clone starts from a
            // clean slate. Defaults match a freshly-created manual plan.
            generationStatus: 'ready',
            generationProgress: Prisma.JsonNull,
            generationError: null,
            // Snapshot the SharedPath's language + subjects (not the
            // source plan's — the SharedPath snapshot is the canonical
            // surface the cloner picked from).
            language: source.language,
            subjects: source.subjects,
            subjectWeights: source.subjects.map(() => 1),
            // Analytics anchor + the fork edge (AC-Clone-4).
            clonedFromSharedPathId: shareId,
            phases: {
              create: source.plan.phases.map((phase) => ({
                title: phase.title,
                description: phase.description,
                sortOrder: phase.sortOrder,
                gateStrategy: phase.gateStrategy,
                status: 'upcoming',
                // Mirror the plan's window on every phase — the path
                // gating logic doesn't depend on per-phase dates today,
                // but we keep the shape parity-clean with first-party
                // plans.
                startDate: now,
                endDate,
                slots: {
                  create: phase.slots.map((slot) => ({
                    title: slot.title,
                    description: slot.description,
                    kind: slot.kind,
                    sortOrder: slot.sortOrder,
                    // Prerequisite slot IDs reference source-plan slot
                    // IDs, which won't exist on the clone. v1 doesn't
                    // depend on per-slot prereqs (the gateStrategy
                    // sequential default covers the path-walk logic),
                    // so we clear the array on clone — a future P-N
                    // can revisit if slot-level prereqs become load-
                    // bearing. (Schema default is `[]`.)
                    prerequisiteSlotIds: [],
                    // AC-Clone-3 — progress reset.
                    starsEarned: 0,
                    bestPercentage: null,
                    activities: {
                      create: slot.activities.map((activity) =>
                        buildActivityCreate(activity, userId),
                      ),
                    },
                  })),
                },
              })),
            },
          },
          select: { id: true },
        });

        // AC-Clone-6 — downloadCount +1 inside the same transaction so
        // a transaction rollback can't leak a phantom increment, and
        // two concurrent clones can't double-count from the same user
        // (the in-tx race-clone re-check above suppresses the second).
        await tx.sharedPath.update({
          where: { id: shareId },
          data: { downloadCount: { increment: 1 } },
        });

        return { planId: newPlan.id, alreadyCloned: false as const };
      },
      { timeout: CLONE_TX_TIMEOUT_MS },
    );

    // P11 — popularity-gate pre-translation fan-out (P0 §4.6). Only a
    // real first clone can cross the threshold; an idempotent re-clone
    // didn't increment downloadCount so it can't trigger. Fire-and-
    // forget: neither the atomic flip nor the bounded AI fan-out may sit
    // on the clone response's critical path.
    if (!result.alreadyCloned) {
      void triggerPretranslationOnClone(shareId).catch((err) => {
        console.error('[community/paths/[shareId]/clone pretranslation]', err);
      });
    }

    const payload: CloneResponse = {
      planId: result.planId,
      alreadyCloned: result.alreadyCloned,
    };
    return successResponse(payload);
  } catch (error) {
    // Prisma's interactive transaction surfaces deadline / serialisation
    // errors as PrismaClientKnownRequestError — return 409 so the
    // client can re-try without treating the retry as a fresh "first
    // clone" (the idempotency check makes the retry safe either way).
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error('[community/paths/[shareId]/clone Prisma]', error.code, error.message);
      if (error.code === 'P2034' || error.code === 'P2028') {
        return conflictResponse('clone_retry');
      }
    }
    console.error('[community/paths/[shareId]/clone POST]', error);
    return internalErrorResponse();
  }
}

// Build the nested-create payload for a single CheckpointActivity. Kept
// out of line so the main route reads at one altitude.
//
// CheckpointActivity has three mutually-exclusive content pointers
// (`theoryId | flashcardSetId | quizSetId`). The kind discriminates
// which branch is populated; the others stay undefined so Prisma omits
// them from the nested create. A defensive `?? undefined` keeps a
// missing relation from emitting `{ create: undefined }` (Prisma would
// reject it).
function buildActivityCreate(
  activity: {
    kind: string;
    title: string;
    sortOrder: number;
    theory: { title: string; body: Prisma.JsonValue } | null;
    flashcardSet:
      | {
          title: string;
          source: string;
          flashcards: Array<{
            question: string;
            answer: string;
            sortOrder: number;
            images: Array<{
              side: string;
              fileName: string;
              filePath: string;
              fileSize: number;
              mimeType: string;
              sortOrder: number;
            }>;
          }>;
        }
      | null;
    quizSet:
      | {
          title: string;
          questions: Array<{
            kind: QuestionKind;
            payload: Prisma.JsonValue | null;
            question: string;
            options: string[];
            correctIndex: number;
            hint: string | null;
            correctExplanation: string | null;
            wrongExplanation: string | null;
            sortOrder: number;
          }>;
        }
      | null;
  },
  cloneOwnerUserId: string,
): Prisma.CheckpointActivityCreateWithoutSlotInput {
  const base: Prisma.CheckpointActivityCreateWithoutSlotInput = {
    kind: activity.kind,
    title: activity.title,
    sortOrder: activity.sortOrder,
    // AC-Clone-3 — completion / timestamp reset.
    completed: false,
    completedAt: null,
  };

  if (activity.theory) {
    base.theory = {
      create: {
        title: activity.theory.title,
        // TipTap JSON body — Prisma carries it through as-is.
        body: activity.theory.body as Prisma.InputJsonValue,
      },
    };
    return base;
  }

  if (activity.flashcardSet) {
    base.flashcardSet = {
      create: {
        userId: cloneOwnerUserId,
        title: activity.flashcardSet.title,
        // Source on the original FlashcardSet might be "ai" / "import"
        // / etc.; on the clone we want "manual" so the cloned material
        // surfaces as user-curated content in /learn/library views and
        // doesn't fight the "your AI-generated cards" cohort filters.
        source: 'manual',
        flashcards: {
          create: activity.flashcardSet.flashcards.map((card) => ({
            question: card.question,
            answer: card.answer,
            sortOrder: card.sortOrder,
            // SR state — every clone starts at the SM-2 defaults so
            // the cloner's review schedule isn't pre-warped by the
            // original author's review history.
            easeFactor: 2.5,
            interval: 0,
            repetitions: 0,
            nextReviewAt: null,
            lastReviewAt: null,
            // FlashcardImage carries blob references; we deep-copy
            // the metadata so the cloned card points at the same
            // blob. The blob is persistent storage (Supabase) and is
            // NOT ref-counted, so the cloned image continues to work
            // even if the original author later deletes their
            // FlashcardSet (their cascade nukes their own rows, not
            // the blob).
            images: card.images.length
              ? {
                  create: card.images.map((img) => ({
                    side: img.side,
                    fileName: img.fileName,
                    filePath: img.filePath,
                    fileSize: img.fileSize,
                    mimeType: img.mimeType,
                    sortOrder: img.sortOrder,
                  })),
                }
              : undefined,
          })),
        },
      },
    };
    return base;
  }

  if (activity.quizSet) {
    base.quizSet = {
      create: {
        userId: cloneOwnerUserId,
        title: activity.quizSet.title,
        questions: {
          create: activity.quizSet.questions.map((q) => ({
            kind: q.kind,
            // Json payload (kind-specific shape post-Phase-1 backfill);
            // null stays null per the schema's Json? declaration.
            payload:
              q.payload === null
                ? Prisma.JsonNull
                : (q.payload as Prisma.InputJsonValue),
            question: q.question,
            // Legacy MC fields — copied as-is. The Phase 7 backfill in
            // the path-generator plan will port them to `payload`; for
            // P9 we preserve them so MC quizzes keep rendering.
            options: q.options,
            correctIndex: q.correctIndex,
            hint: q.hint,
            correctExplanation: q.correctExplanation,
            wrongExplanation: q.wrongExplanation,
            sortOrder: q.sortOrder,
          })),
        },
      },
    };
    return base;
  }

  // Kind-mismatched / orphan activity — every CheckpointActivity should
  // have exactly one of theory/flashcardSet/quizSet populated, but we
  // shouldn't crash a deep-copy if a legacy source has a malformed row.
  // Surface as a theory-shell-with-empty-body so the activity is at
  // least clickable in the cloned path; the cloner will see an empty
  // viewer rather than the whole clone failing. Logged for triage.
  console.warn(
    '[clone] activity has no theory / flashcardSet / quizSet content; emitting empty theory shell',
    { kind: activity.kind, title: activity.title },
  );
  base.theory = {
    create: {
      title: activity.title,
      body: {} as Prisma.InputJsonValue,
    },
  };
  return base;
}
