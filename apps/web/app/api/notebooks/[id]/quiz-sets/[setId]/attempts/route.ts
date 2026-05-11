import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { checkAndUnlockAchievements } from '@/lib/achievement-checker';
import { grade } from '@/lib/quiz-grading';
import type { UserAnswer } from '@/components/quiz/questionRenderers/types';
import { isCheckpointMaterial } from '@/lib/path-gating';
import { logTelemetry } from '@/lib/telemetry-server';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

interface AnswerSubmission {
  questionId: string;
  // Phase 2 shape: `userAnswer` is a discriminated UserAnswer object.
  userAnswer?: UserAnswer;
  // Legacy MC-only body kept for one release. Converted to a UserAnswer on the
  // way in so the grader and persistence both see the new shape.
  selectedIdx?: number;
}

function normalizeAnswer(a: AnswerSubmission): UserAnswer | null {
  if (a.userAnswer && typeof a.userAnswer === 'object' && typeof a.userAnswer.kind === 'string') {
    return a.userAnswer;
  }
  if (typeof a.selectedIdx === 'number') {
    return { kind: 'mc', selectedIdx: a.selectedIdx };
  }
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; setId: string }> }
) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId } = await params;

    const notebook = await db.notebook.findFirst({
      where: { id: notebookId, userId },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    const quizSet = await db.quizSet.findFirst({
      where: { id: setId, notebookId },
      include: { questions: true },
    });
    if (!quizSet) return notFoundResponse('Quiz set not found');

    const body = await request.json();
    const { answers, timeSpent, materialId } = body as {
      answers: AnswerSubmission[];
      timeSpent?: number;
      // Phase 5 — when this quiz was launched from a Learn Path lesson node,
      // the client passes the StudyMaterial id so the server can auto-complete
      // the material on pass and log a CheckpointAttempt when applicable.
      materialId?: string;
    };

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return badRequestResponse('Answers are required');
    }

    // Centralized kind-aware grading. MC rows on the legacy `options` +
    // `correctIndex` columns (payload = null) fall back inside grade();
    // newer rows whose payload carries the answer key use that. Phase 2A/2B
    // kinds use payload exclusively (legacy columns are sentinel-only).
    const questionMap = new Map(quizSet.questions.map((q) => [q.id, q]));
    let score = 0;
    const answerRecords = answers.map((a) => {
      const question = questionMap.get(a.questionId);
      const normalized = normalizeAnswer(a);
      if (!question || !normalized) {
        return {
          questionId: a.questionId,
          selectedIdx: typeof a.selectedIdx === 'number' ? a.selectedIdx : 0,
          userAnswer: normalized as Prisma.InputJsonValue | undefined,
          isCorrect: false,
        };
      }
      const { isCorrect } = grade(
        question.kind,
        question.payload,
        { options: question.options, correctIndex: question.correctIndex },
        normalized
      );
      if (isCorrect) score++;
      return {
        questionId: a.questionId,
        // Legacy column — MC rows store the option index; non-MC rows pass 0.
        selectedIdx:
          normalized.kind === 'mc'
            ? normalized.selectedIdx
            : typeof a.selectedIdx === 'number'
              ? a.selectedIdx
              : 0,
        userAnswer: normalized as unknown as Prisma.InputJsonValue,
        isCorrect,
      };
    });

    const total = quizSet.questions.length;
    const percentage = total > 0 ? Math.round((score / total) * 100 * 100) / 100 : 0;

    // Phase 7 — replay the answer order to compute the two session-bound
    // achievement signals: longest correct run, and whether a 3-wrong slump
    // was followed by a 5-right comeback in the same session. "Armed" stays
    // sticky once the user hits 3 wrong, so any 5-in-a-row after that point
    // counts as the comeback.
    let correctRun = 0;
    let wrongRun = 0;
    let maxRun = 0;
    let armed = false;
    let hadComeback = false;
    for (const r of answerRecords) {
      if (r.isCorrect) {
        correctRun++;
        wrongRun = 0;
        if (correctRun > maxRun) maxRun = correctRun;
        if (armed && correctRun >= 5) hadComeback = true;
      } else {
        wrongRun++;
        correctRun = 0;
        if (wrongRun >= 3) armed = true;
      }
    }

    const attempt = await db.quizAttempt.create({
      data: {
        quizSetId: setId,
        userId,
        score,
        total,
        percentage,
        timeSpent: timeSpent ?? null,
        answers: {
          create: answerRecords,
        },
      },
      include: { answers: true },
    });

    // Atomic User update — GREATEST/OR is safe under concurrent attempts.
    // Skip the round-trip entirely when there's nothing to advance.
    if (maxRun > 0 || hadComeback) {
      await db.$executeRaw(Prisma.sql`
        UPDATE users
        SET "maxQuizStreakEver" = GREATEST("maxQuizStreakEver", ${maxRun}),
            "everHadComeback"   = "everHadComeback" OR ${hadComeback}
        WHERE id = ${userId}
      `);
    }

    // Phase 5 — Learn Path side effects. Only fires when the client passes a
    // materialId, which only happens for path-launched quizzes. Direct quiz
    // access (no materialId) keeps the legacy behavior: attempt only, no
    // material completion, no checkpoint row.
    let materialCompleted = false;
    let checkpointPassed: boolean | undefined;
    if (materialId) {
      const material = await db.studyMaterial.findFirst({
        where: { id: materialId, type: 'quiz_set', referenceId: setId },
        include: {
          phase: {
            include: { materials: { orderBy: { sortOrder: 'asc' } } },
          },
        },
      });
      if (material) {
        const passed = percentage >= 80;
        if (passed && !material.completed) {
          await db.studyMaterial.update({
            where: { id: material.id },
            data: { completed: true },
          });
          materialCompleted = true;
          // Phase 7 — phase-complete telemetry. The phase is fully done
          // iff this material was the last incomplete one. We have the
          // sibling list pre-loaded, so checking the others is a local op.
          const others = material.phase.materials.filter((m) => m.id !== material.id);
          if (others.every((m) => m.completed)) {
            logTelemetry(userId, 'path.phase_completed', {
              phaseId: material.phaseId,
              planId: material.phase.planId,
            });
          }
        }
        const isCheckpoint = isCheckpointMaterial(material.phase, material.id);
        if (isCheckpoint) {
          await db.checkpointAttempt.create({
            data: {
              phaseId: material.phaseId,
              userId,
              score,
              total,
              percentage,
              passed,
            },
          });
          checkpointPassed = passed;
          if (passed) {
            logTelemetry(userId, 'path.checkpoint_passed', {
              phaseId: material.phaseId,
              planId: material.phase.planId,
              percentage,
            });
          }
        }
      }
    }

    checkAndUnlockAchievements(userId).catch(console.error);

    return createdResponse({
      ...attempt,
      materialCompleted,
      checkpointPassed,
    });
  } catch (error) {
    console.error('Error creating quiz attempt:', error);
    return internalErrorResponse();
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; setId: string }> }
) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId } = await params;

    const notebook = await db.notebook.findFirst({
      where: { id: notebookId, userId },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    const attempts = await db.quizAttempt.findMany({
      where: { quizSetId: setId, userId },
      orderBy: { createdAt: 'desc' },
      include: {
        answers: {
          include: {
            question: {
              select: {
                id: true,
                kind: true,
                payload: true,
                question: true,
                options: true,
                correctIndex: true,
              },
            },
          },
        },
      },
    });

    return successResponse(attempts);
  } catch (error) {
    console.error('Error fetching quiz attempts:', error);
    return internalErrorResponse();
  }
}
