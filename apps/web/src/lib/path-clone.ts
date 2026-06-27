// Shared path deep-copy engine.
//
// Used by the guided-tutorial sample materializer
// (src/lib/sample-paths/materialize.ts) to build a StudyPlan's
// phase→slot→activity graph. The "source" shapes below are the minimal subset
// a deep-copy reads; an in-code fixture satisfies them.
//
// Progress is always reset on copy: starsEarned=0, bestPercentage=null,
// activity.completed=false, flashcard SR fields to SM-2 defaults. Blob-backed
// images (theory/flashcard/quiz) copy by `filePath` reference — the blob is
// shared, non-ref-counted storage, so the copy survives the source's deletion.

import { Prisma, type QuestionKind, type GateStrategy } from '@prisma/client';

// 30s — deep-copies of large paths (50+ slots × 4 activities × dozens of
// flashcards) can run wide; Prisma's default 5s transaction timeout would trip
// on the upper end.
export const CLONE_TX_TIMEOUT_MS = 30_000;

// "now → +30 days" — matches the seed defaults so a fresh copy behaves like a
// brand-new manual path in /learn/paths.
export const PLAN_HORIZON_MS = 30 * 24 * 60 * 60 * 1000;

// ── Source shapes the deep-copy consumes ─────────────────────────────────────

export interface CloneSourceTheory {
  title: string;
  body: Prisma.JsonValue;
  images: Array<{
    fileName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
    caption: string | null;
    sortOrder: number;
  }>;
}

export interface CloneSourceFlashcardSet {
  title: string;
  source: string;
  diagrams: Prisma.JsonValue;
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
      caption: string | null;
      sortOrder: number;
    }>;
  }>;
}

export interface CloneSourceQuizSet {
  title: string;
  diagrams: Prisma.JsonValue;
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
    image: {
      fileName: string;
      filePath: string;
      fileSize: number;
      mimeType: string;
      caption: string | null;
      sourcePageImageId: string | null;
    } | null;
  }>;
}

export interface CloneSourceActivity {
  kind: string;
  title: string;
  sortOrder: number;
  theory: CloneSourceTheory | null;
  flashcardSet: CloneSourceFlashcardSet | null;
  quizSet: CloneSourceQuizSet | null;
}

export interface CloneSourceSlot {
  title: string;
  description: string | null;
  kind: string;
  sortOrder: number;
  prerequisiteSlotIds?: string[];
  prunedActivityKinds?: string[];
  activities: CloneSourceActivity[];
}

export interface CloneSourcePhase {
  title: string;
  description: string | null;
  sortOrder: number;
  gateStrategy: GateStrategy;
  slots: CloneSourceSlot[];
}

// ── Deep-copy builders ───────────────────────────────────────────────────────

/**
 * Build the `phases: { create: [...] }` payload for a StudyPlan deep-copy.
 * Prerequisite slot IDs reference source-plan slot IDs that won't exist on the
 * copy, so they're cleared — v1 gating is sequential-by-order and doesn't depend
 * on per-slot prereqs.
 */
export function buildPhasesCreate(
  phases: CloneSourcePhase[],
  ownerUserId: string,
  includeImages: boolean,
  now: Date,
  endDate: Date,
): Prisma.StudyPhaseCreateWithoutPlanInput[] {
  return phases.map((phase) => ({
    title: phase.title,
    description: phase.description,
    sortOrder: phase.sortOrder,
    gateStrategy: phase.gateStrategy,
    status: 'upcoming',
    startDate: now,
    endDate,
    slots: {
      create: phase.slots.map((slot) => ({
        title: slot.title,
        description: slot.description,
        kind: slot.kind,
        sortOrder: slot.sortOrder,
        prerequisiteSlotIds: [],
        prunedActivityKinds: slot.prunedActivityKinds ?? [],
        // Progress reset.
        starsEarned: 0,
        bestPercentage: null,
        activities: {
          create: slot.activities.map((activity) =>
            buildActivityCreate(activity, ownerUserId, includeImages),
          ),
        },
      })),
    },
  }));
}

// Drop `pathImage` nodes from a theory body — used when images are NOT included
// (the embedded refs would 404 without their TheoryImage rows). `pathDiagram`
// nodes are kept (no external assets). Deep-clones first so the source body is
// never mutated.
export function stripPathImageNodes(body: Prisma.JsonValue): Prisma.JsonValue {
  if (!body || typeof body !== 'object') return body;
  const clone = JSON.parse(JSON.stringify(body));
  const visit = (node: { content?: unknown[] } | null | undefined): void => {
    if (!node || typeof node !== 'object' || !Array.isArray(node.content)) return;
    node.content = node.content.filter(
      (c) => !(c && typeof c === 'object' && (c as { type?: string }).type === 'pathImage'),
    );
    for (const child of node.content) visit(child as { content?: unknown[] });
  };
  visit(clone as { content?: unknown[] });
  return clone as Prisma.JsonValue;
}

/**
 * Build the nested-create payload for a single CheckpointActivity. The kind
 * discriminates which of the three mutually-exclusive content pointers
 * (theory | flashcardSet | quizSet) is populated.
 */
export function buildActivityCreate(
  activity: CloneSourceActivity,
  cloneOwnerUserId: string,
  includeImages: boolean,
): Prisma.CheckpointActivityCreateWithoutSlotInput {
  const base: Prisma.CheckpointActivityCreateWithoutSlotInput = {
    kind: activity.kind,
    title: activity.title,
    sortOrder: activity.sortOrder,
    completed: false,
    completedAt: null,
  };

  if (activity.theory) {
    const copyImages = includeImages && activity.theory.images.length > 0;
    base.theory = {
      create: {
        title: activity.theory.title,
        body: (includeImages
          ? activity.theory.body
          : stripPathImageNodes(activity.theory.body)) as Prisma.InputJsonValue,
        images: copyImages
          ? {
              create: activity.theory.images.map((img) => ({
                fileName: img.fileName,
                filePath: img.filePath,
                fileSize: img.fileSize,
                mimeType: img.mimeType,
                caption: img.caption,
                sortOrder: img.sortOrder,
              })),
            }
          : undefined,
      },
    };
    return base;
  }

  if (activity.flashcardSet) {
    base.flashcardSet = {
      create: {
        userId: cloneOwnerUserId,
        title: activity.flashcardSet.title,
        // Copied content surfaces as user-curated ("manual") so it doesn't
        // fight the "your AI-generated cards" cohort filters.
        source: 'manual',
        ...(activity.flashcardSet.diagrams != null
          ? { diagrams: activity.flashcardSet.diagrams as Prisma.InputJsonValue }
          : {}),
        flashcards: {
          create: activity.flashcardSet.flashcards.map((card) => ({
            question: card.question,
            answer: card.answer,
            sortOrder: card.sortOrder,
            // SR state reset to SM-2 defaults.
            easeFactor: 2.5,
            interval: 0,
            repetitions: 0,
            nextReviewAt: null,
            lastReviewAt: null,
            images: card.images.length
              ? {
                  create: card.images.map((img) => ({
                    side: img.side,
                    fileName: img.fileName,
                    filePath: img.filePath,
                    fileSize: img.fileSize,
                    mimeType: img.mimeType,
                    caption: img.caption,
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
        ...(activity.quizSet.diagrams != null
          ? { diagrams: activity.quizSet.diagrams as Prisma.InputJsonValue }
          : {}),
        questions: {
          create: activity.quizSet.questions.map((q) => ({
            kind: q.kind,
            payload:
              q.payload === null ? Prisma.JsonNull : (q.payload as Prisma.InputJsonValue),
            question: q.question,
            options: q.options,
            correctIndex: q.correctIndex,
            hint: q.hint,
            correctExplanation: q.correctExplanation,
            wrongExplanation: q.wrongExplanation,
            sortOrder: q.sortOrder,
            image: q.image
              ? {
                  create: {
                    fileName: q.image.fileName,
                    filePath: q.image.filePath,
                    fileSize: q.image.fileSize,
                    mimeType: q.image.mimeType,
                    caption: q.image.caption,
                    sourcePageImageId: q.image.sourcePageImageId,
                  },
                }
              : undefined,
          })),
        },
      },
    };
    return base;
  }

  // Orphan activity — emit a clickable empty-theory shell rather than failing
  // the whole copy. Logged for triage.
  console.warn(
    '[path-clone] activity has no theory / flashcardSet / quizSet content; emitting empty theory shell',
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
