/**
 * Weakness Training Phase 1A — post-commit concept-tracking orchestration.
 *
 * `trackConceptAttempts` is called by the quiz-sets attempts route AFTER its
 * grading transaction has already committed (plan §4 / Phase 0 finding C —
 * a single hook on `quiz-sets/[setId]/attempts` transparently covers
 * notebook quizzes, path checkpoints, and exam-mode "mock" runs, since they
 * all funnel through the same `QuizViewer` → attempts POST). This module is
 * pure orchestration over the DB write helpers in `concept-write.ts`; it has
 * no opinion on failure handling beyond the local enqueue guards described
 * below — the ROUTE is responsible for wrapping the whole call in
 * try/catch so a thrown error here never blocks the grading response.
 *
 * Phase 3 (§2.3): also enqueues `concept.misconception` for any concept that
 * TRANSITIONS into the `weak` band during this call (i.e. its previous
 * status wasn't already `weak`). The 7-day cooldown itself is enforced by
 * the handler (owned separately) — this module only detects the transition
 * and dedupes the enqueue.
 */

import { db } from '@/lib/db';
import { recordConceptAttempt } from '@/lib/concept-write';
import { enqueueJob } from '@/lib/background-jobs';
import { SOURCE_WEIGHT_FLASHCARD_SELF_GRADE } from '@/lib/concept-mastery';

export interface ConceptTrackingAnswer {
  questionId: string;
  /** `QuestionKind` value, as graded by the route. */
  questionKind: string;
  /** Server-graded correctness — never the client-submitted value. */
  isCorrect: boolean;
  usedHint?: boolean;
  attemptNumber?: number;
  /** Only meaningful for `kind === 'mc'`. */
  numOptions?: number;
}

export interface TrackConceptAttemptsArgs {
  userId: string;
  /** The created `QuizAttempt.id` — dedupe + audit key for every event. */
  sourceAttemptId: string;
  answers: ConceptTrackingAnswer[];
  quizSetId: string;
  now: Date;
}

/**
 * For each graded answer, look up its `ConceptTag` rows and record a
 * concept-attempt event per tag (primary + optional secondary, §2.2). A
 * graded question with ZERO `ConceptTag` rows has its slot resolved (via
 * `QuizSet.checkpointActivity.slotId` — null for notebook-only quizzes,
 * which have no checkpoint and are simply skipped) and a `concept.backfill`
 * job is enqueued for that slot, de-duped per distinct `slotId` within this
 * call via `dedupeKey`. The backfill HANDLER is owned by a sibling agent —
 * this function only declares interest by enqueueing.
 *
 * Resilience: an enqueue failure for one slot is caught and logged locally
 * so it never aborts tracking of the remaining answers. A failure inside
 * `recordConceptAttempt` for one tag is allowed to propagate — the caller
 * (the route) wraps the entire call in try/catch and swallows at that
 * level, per plan §4's failure-safe contract.
 */
export async function trackConceptAttempts(args: TrackConceptAttemptsArgs): Promise<void> {
  const { userId, sourceAttemptId, answers, quizSetId, now } = args;
  if (answers.length === 0) return;

  const questionIds = answers.map((a) => a.questionId);
  const tags = await db.conceptTag.findMany({
    where: { itemType: 'quiz_question', itemId: { in: questionIds } },
  });

  const tagsByQuestionId = new Map<string, typeof tags>();
  for (const tag of tags) {
    const list = tagsByQuestionId.get(tag.itemId);
    if (list) list.push(tag);
    else tagsByQuestionId.set(tag.itemId, [tag]);
  }

  const untaggedQuestionIds: string[] = [];
  const newlyWeakConceptIds = new Set<string>();

  for (const answer of answers) {
    const questionTags = tagsByQuestionId.get(answer.questionId);
    if (!questionTags || questionTags.length === 0) {
      untaggedQuestionIds.push(answer.questionId);
      continue;
    }

    for (const tag of questionTags) {
      const result = await recordConceptAttempt({
        conceptId: tag.conceptId,
        userId,
        itemType: 'quiz_question',
        itemId: answer.questionId,
        sourceAttemptId,
        questionKind: answer.questionKind,
        isCorrect: answer.isCorrect,
        usedHint: answer.usedHint ?? false,
        attemptNumber: answer.attemptNumber ?? 1,
        tagWeight: tag.weight,
        numOptions: answer.numOptions,
        eventAt: now,
      });

      // Phase 3 (§2.3): misconception LLM tier fires on a weak-band
      // TRANSITION only — i.e. this event's tag moved the concept INTO
      // `weak` when it wasn't already there. Replays (`result === null`)
      // and non-transitions (already weak, or landed elsewhere) don't fire.
      if (result && result.band === 'weak' && result.prevStatus !== 'weak') {
        newlyWeakConceptIds.add(tag.conceptId);
      }
    }
  }

  if (untaggedQuestionIds.length > 0) {
    await enqueueBackfillForUntaggedQuestions(quizSetId, untaggedQuestionIds);
  }

  if (newlyWeakConceptIds.size > 0) {
    await enqueueMisconceptionForNewlyWeakConcepts(userId, newlyWeakConceptIds);
  }
}

/**
 * Resolve the slot(s) behind a set of untagged question ids and enqueue one
 * `concept.backfill` job per distinct `slotId` (deduped within this call AND
 * across calls via `dedupeKey: concept.backfill:<slotId>` — the standard
 * `enqueueJob` dedupe-key pattern already used by `reminders.sweep`). A
 * notebook-only `QuizSet` (no `CheckpointActivity` row, hence no slot) is
 * skipped entirely — no backfill signal exists for it yet, which is the
 * intended "no data yet" cold-start state (plan §3.3 / §4), not an error.
 * Each enqueue is individually guarded so one failure doesn't stop the rest.
 */
async function enqueueBackfillForUntaggedQuestions(
  quizSetId: string,
  untaggedQuestionIds: string[]
): Promise<void> {
  void untaggedQuestionIds; // resolved via quizSetId → slot; per-question detail isn't needed by the backfill job
  try {
    const quizSet = await db.quizSet.findUnique({
      where: { id: quizSetId },
      select: { checkpointActivity: { select: { slotId: true } } },
    });
    const slotId = quizSet?.checkpointActivity?.slotId;
    if (!slotId) return; // notebook-only quiz set — no slot to classify yet

    await enqueueJob(
      'concept.backfill',
      { slotId },
      { dedupeKey: `concept.backfill:${slotId}` }
    );
  } catch (error) {
    console.error('[concept-tracking] failed to enqueue concept.backfill', {
      quizSetId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Enqueue misconception tagging for the concepts that transitioned into the
 * `weak` band during this call (plan §2.3 / §4).
 *
 * Phase 5 / audit M2a: ONE per-user debounced batch job replaces the old
 * per-concept fan-out. A 2-minute `runAt` debounce coalesces every concept
 * from a single grading session into one job, and the per-user `dedupeKey`
 * collapses repeats (a still-queued batch owns the key, so a second transition
 * within the window is a no-op — the batch re-queries eligibility at run time
 * and picks it up anyway). The batch handler applies the weak-band, cooldown
 * and hysteresis gates at run time, so this function only needs to KNOW a
 * transition happened, not which concept.
 *
 * Kill switch `MISCONCEPTION_BATCH_DISABLED=1` reverts to the old per-concept
 * enqueues (one job per conceptId, deduped on `concept.misconception:<id>`).
 */
async function enqueueMisconceptionForNewlyWeakConcepts(
  userId: string,
  conceptIds: Set<string>
): Promise<void> {
  if (process.env.MISCONCEPTION_BATCH_DISABLED === '1') {
    for (const conceptId of conceptIds) {
      try {
        await enqueueJob(
          'concept.misconception',
          { conceptId, userId },
          { dedupeKey: `concept.misconception:${conceptId}` }
        );
      } catch (error) {
        console.error('[concept-tracking] failed to enqueue concept.misconception', {
          conceptId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return;
  }

  try {
    await enqueueJob(
      'concept.misconception.batch',
      { userId },
      {
        dedupeKey: `concept.misconception.batch:${userId}`,
        runAt: new Date(Date.now() + 2 * 60_000),
      }
    );
  } catch (error) {
    console.error('[concept-tracking] failed to enqueue concept.misconception.batch', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ─── Flashcard self-grade tracking (Phase 4.3, plan §13.6) ─────────────────

export interface FlashcardGradeInput {
  cardId: string;
  /** 4-button UI value: 0 (Again), 3 (Hard), 4 (Good), 5 (Easy). */
  quality: 0 | 3 | 4 | 5;
}

export interface TrackFlashcardGradesArgs {
  userId: string;
  /** Synthetic per-POST id (a fresh `cuid()`) — dedupe + audit key shared by
   *  every `ConceptAttemptEvent` this call writes, mirroring
   *  `TrackConceptAttemptsArgs.sourceAttemptId` for the quiz path. One batch
   *  POST = one `sourceAttemptId`, satisfying the
   *  `@@unique([sourceAttemptId, conceptId, itemId])` dedupe guard exactly
   *  like a quiz attempt does. */
  sourceAttemptId: string;
  grades: FlashcardGradeInput[];
  now: Date;
}

/**
 * Flashcard sibling to {@link trackConceptAttempts} (plan §13.6). For each
 * graded card, look up its `ConceptTag` rows (`itemType: 'flashcard'`) and
 * record one concept-attempt event per tag at the explicit
 * `SOURCE_WEIGHT_FLASHCARD_SELF_GRADE` discount (§13.2) — self-report nudges
 * confidence but never certifies mastery on its own (worked example: 5
 * "Good" self-grades alone accrue `weightedTotal = 1.75`, still under the
 * 2.5 confidence gate).
 *
 * Button -> event mapping (§13.2):
 *   Again (0) -> isCorrect: false, full-credit multiplier path (irrelevant —
 *     incorrect events always yield eventCorrect=0 regardless of quality).
 *   Hard  (3) -> isCorrect: true, discounted like a hint/retry (`usedHint:
 *     true`) — reuses `qualityMultiplier`'s existing 0.6 struggle-pass
 *     discount rather than inventing a new axis.
 *   Good  (4) / Easy (5) -> isCorrect: true, full credit (`usedHint: false,
 *     attemptNumber: 1`).
 *
 * `questionKind` is persisted as `"flashcard_review"` (§13.2: `chanceP` for
 * an unrecognized kind defaults to 0, i.e. full evidence weight — correct,
 * there is nothing to guess on a self-graded flashcard) and `origin:
 * 'flashcard_review'` (§10.3 — excluded from the Phase 4.4 retest-failure-
 * streak trigger, since a self-graded "Again" is not a failed retest).
 *
 * Untagged cards: unlike {@link trackConceptAttempts}, this function does
 * NOT enqueue `concept.backfill` for untagged cards. `concept.backfill`'s
 * existing dedupe key and payload are slot-scoped (`{ slotId }`,
 * `concept.backfill:<slotId>`), and `FlashcardSet.checkpointActivity` (the
 * same back-relation `QuizSet.checkpointActivity` uses) WOULD make deriving
 * a slot cheap for path-generated review-slot decks — but standalone Study
 * Pack decks (no `CheckpointActivity` row at all) have no slot to backfill
 * against, same cold-start gap `trackConceptAttempts` already accepts for
 * notebook-only quiz sets. Deliberately not wired here per the task's "if
 * flashcards lack the slot linkage the quiz path uses, skip backfill with a
 * code comment stating the gap — do NOT invent new plumbing": the review
 * queue (§13.7, a later sub-phase) draws cards across ALL of a user's sets
 * cross-deck, so scoping a backfill enqueue to only the checkpoint-owned
 * subset here would be a partial, easily-forgotten special case rather than
 * a real fix — left for whichever later phase wires the review queue's own
 * data flow to decide the right scope.
 *
 * Best-effort/never-throws, matching the file's discipline: any failure
 * (lookup, or an individual `recordConceptAttempt` call) is caught and
 * logged, never propagated — callers (the batch grading route, §13.6) run
 * this post-commit and must never let it block the SM-2 write it already
 * committed.
 */
export async function trackFlashcardGrades(args: TrackFlashcardGradesArgs): Promise<void> {
  const { userId, sourceAttemptId, grades, now } = args;
  if (grades.length === 0) return;

  try {
    const cardIds = grades.map((g) => g.cardId);
    const tags = await db.conceptTag.findMany({
      where: { itemType: 'flashcard', itemId: { in: cardIds } },
    });

    const tagsByCardId = new Map<string, typeof tags>();
    for (const tag of tags) {
      const list = tagsByCardId.get(tag.itemId);
      if (list) list.push(tag);
      else tagsByCardId.set(tag.itemId, [tag]);
    }

    for (const grade of grades) {
      const cardTags = tagsByCardId.get(grade.cardId);
      if (!cardTags || cardTags.length === 0) continue; // untagged — see doc comment above

      const isCorrect = grade.quality >= 3;
      const usedHint = grade.quality === 3; // Hard — struggle-pass discount

      for (const tag of cardTags) {
        try {
          await recordConceptAttempt({
            conceptId: tag.conceptId,
            userId,
            itemType: 'flashcard',
            itemId: grade.cardId,
            sourceAttemptId,
            questionKind: 'flashcard_review',
            isCorrect,
            usedHint,
            attemptNumber: 1,
            tagWeight: tag.weight,
            eventAt: now,
            sourceWeight: SOURCE_WEIGHT_FLASHCARD_SELF_GRADE,
            origin: 'flashcard_review',
          });
        } catch (error) {
          console.error('[concept-tracking] failed to record flashcard grade attempt', {
            cardId: grade.cardId,
            conceptId: tag.conceptId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  } catch (error) {
    console.error('[concept-tracking] trackFlashcardGrades failed', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
