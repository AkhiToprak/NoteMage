// DB-bound runner for Moderation Layer 1 (P3 of the path-publishing
// plan). The decision logic lives in `./layer1.ts` (pure); this file
// owns loading the SharedPath snapshot, running judgeL1, and writing
// the resulting state machine + audit + notification atomically.
//
// Per cost-budget §7.1 L1 records zero AI cost on its audit rows.

import { db } from '@/lib/db';
import { tiptapJsonToPlainText, collectDiagramColumnStrings } from '@/lib/contentConverter';
import { judgeL1, type L1Judgement, type ScannableField } from './layer1';

export interface L1Result {
  // The resulting SharedPath.moderationStatus after L1.
  status: 'auditing_l2' | 'rejected';
  judgement: L1Judgement;
}

/**
 * Load the full scannable surface of a SharedPath. Walks the path's
 * StudyPlan → phases → slots → activities → theory/flashcards/quiz so
 * P3 honours AC-Moderate-2 (title, description, slot titles, theory,
 * flashcards, quiz stems).
 *
 * Throws if the SharedPath doesn't exist — the publish endpoint creates
 * the row immediately before calling this, so a missing row is a real
 * inconsistency, not a normal "404" we want to suppress.
 */
export async function loadSharedPathSnapshot(sharedPathId: string): Promise<{
  language: string;
  fields: ScannableField[];
}> {
  const sharedPath = await db.sharedPath.findUnique({
    where: { id: sharedPathId },
    select: {
      id: true,
      title: true,
      description: true,
      language: true,
      planId: true,
    },
  });
  if (!sharedPath) {
    throw new Error(`SharedPath ${sharedPathId} not found`);
  }

  const phases = await db.studyPhase.findMany({
    where: { planId: sharedPath.planId },
    orderBy: { sortOrder: 'asc' },
    select: {
      sortOrder: true,
      slots: {
        orderBy: { sortOrder: 'asc' },
        select: {
          sortOrder: true,
          title: true,
          activities: {
            orderBy: { sortOrder: 'asc' },
            select: {
              kind: true,
              title: true,
              theory: { select: { title: true, body: true } },
              flashcardSet: {
                select: {
                  // Path-diagrams revival (Phase 3): set-level reference diagrams
                  // carry author-facing labels; scan them — don't assume the
                  // covering theory's moderation already covered this copy.
                  diagrams: true,
                  flashcards: {
                    orderBy: { sortOrder: 'asc' },
                    select: {
                      question: true,
                      answer: true,
                      // Figure-reuse (P3): figure captions are author-supplied
                      // prose and must face moderation like the card text.
                      images: { orderBy: { sortOrder: 'asc' }, select: { caption: true } },
                    },
                  },
                },
              },
              quizSet: {
                select: {
                  // Path-diagrams revival (Phase 3): see flashcardSet.diagrams.
                  diagrams: true,
                  questions: {
                    orderBy: { sortOrder: 'asc' },
                    select: {
                      question: true,
                      // Figure-reuse (P4): exhibit captions are author-facing
                      // prose and must face moderation like the question text.
                      image: { select: { caption: true } },
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

  const fields: ScannableField[] = [
    { field: 'title', text: sharedPath.title },
    { field: 'description', text: sharedPath.description },
  ];

  for (const phase of phases) {
    const phaseLabel = `phase ${phase.sortOrder + 1}`;
    for (const slot of phase.slots) {
      const slotLabel = `${phaseLabel} / slot ${slot.sortOrder + 1}`;
      fields.push({ field: `${slotLabel} title`, text: slot.title });

      for (const activity of slot.activities) {
        const actLabel = `${slotLabel} / ${activity.kind}`;
        if (activity.kind === 'theory' && activity.theory) {
          fields.push({ field: `${actLabel} title`, text: activity.theory.title });
          const body = tiptapJsonToPlainText(activity.theory.body);
          if (body) fields.push({ field: `${actLabel} body`, text: body });
        } else if (activity.kind === 'flashcards' && activity.flashcardSet) {
          for (const card of activity.flashcardSet.flashcards) {
            fields.push({ field: `${actLabel} card`, text: card.question });
            fields.push({ field: `${actLabel} card`, text: card.answer });
            for (const img of card.images) {
              if (img.caption) {
                fields.push({ field: `${actLabel} card figure`, text: img.caption });
              }
            }
          }
          // Path-diagrams revival (Phase 3): the set-level reference diagrams are
          // author-facing content copied from theory — scan their labels too.
          for (const s of collectDiagramColumnStrings(activity.flashcardSet.diagrams)) {
            fields.push({ field: `${actLabel} diagram`, text: s });
          }
        } else if (activity.kind === 'quiz' && activity.quizSet) {
          for (const q of activity.quizSet.questions) {
            fields.push({ field: `${actLabel} question`, text: q.question });
            if (q.image?.caption) {
              fields.push({ field: `${actLabel} question figure`, text: q.image.caption });
            }
          }
          // Path-diagrams revival (Phase 3): see flashcards above.
          for (const s of collectDiagramColumnStrings(activity.quizSet.diagrams)) {
            fields.push({ field: `${actLabel} diagram`, text: s });
          }
        }
      }
    }
  }

  return { language: sharedPath.language, fields };
}

/**
 * Run Layer 1 against a SharedPath that already exists in the DB
 * (typically just created by the publish endpoint). Atomically:
 *
 *   - judges the snapshot,
 *   - flips SharedPath.moderationStatus to "rejected" or
 *     "auditing_l2",
 *   - appends one ModerationAudit row,
 *   - posts a Notification to the author on reject.
 *
 * Returns the post-L1 status + the judgement. Throws only on hard DB
 * errors; the caller (publish endpoint) catches and 500s.
 */
export async function runLayer1(sharedPathId: string): Promise<L1Result> {
  const snapshot = await loadSharedPathSnapshot(sharedPathId);
  const judgement = judgeL1(snapshot);

  // Look up sharedById + title so the rejection notification carries
  // the human title the author published under. Cheap select, runs
  // outside the transaction so the write set stays tight.
  const sharedPath = await db.sharedPath.findUnique({
    where: { id: sharedPathId },
    select: { sharedById: true, title: true },
  });
  if (!sharedPath) {
    throw new Error(`SharedPath ${sharedPathId} disappeared mid-L1`);
  }

  if (judgement.verdict === 'reject') {
    await db.$transaction([
      db.sharedPath.update({
        where: { id: sharedPathId },
        data: {
          moderationStatus: 'rejected',
          rejectionReason: judgement.rejectionReason,
        },
      }),
      db.moderationAudit.create({
        data: {
          sharedPathId,
          layer: 1,
          verdict: 'reject',
          reasonCode: judgement.reasonCode,
          reasoning: judgement.reasoning,
        },
      }),
      db.notification.create({
        data: {
          userId: sharedPath.sharedById,
          type: 'path_rejected',
          data: {
            shareId: sharedPathId,
            title: sharedPath.title,
            reasonCode: judgement.reasonCode,
            layer: 1,
          },
        },
      }),
    ]);
    return { status: 'rejected', judgement };
  }

  // Pass — record L1 pass row and move to L2 queue. No notification
  // on pass (auditing is intermediate; the author already sees the
  // chip and rail on the status page).
  await db.$transaction([
    db.sharedPath.update({
      where: { id: sharedPathId },
      data: { moderationStatus: 'auditing_l2' },
    }),
    db.moderationAudit.create({
      data: {
        sharedPathId,
        layer: 1,
        verdict: 'pass',
        reasonCode: null,
        reasoning: judgement.reasoning || null,
      },
    }),
  ]);
  return { status: 'auditing_l2', judgement };
}
