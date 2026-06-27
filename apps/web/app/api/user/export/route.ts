import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

// GET /api/user/export — self-serve data export (GDPR Art.20 portability).
// Returns the authenticated user's own data as a single structured JSON
// download. Read-only: no row is created or mutated. Each collection is
// capped (TAKE) as a safety bound, not user-facing pagination — large
// accounts get a representative export rather than an unbounded dump.
//
// Deliberately EXCLUDED: password hash, OAuth/email-confirmation tokens, and
// any third-party billing identifiers. Only fields the user themselves
// provided or can already see are returned.

/** Per-collection safety cap. */
const TAKE = 1000;

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Profile — explicit allowlist; never password/tokens/billing ids.
    const profile = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        tier: true,
        createdAt: true,
      },
    });
    if (!profile) return unauthorizedResponse();

    // Notebooks → sections (tree) → page titles + plain-text mirror. The page
    // `content` (TipTap JSON) and binary attachments are omitted to keep the
    // export a portable, human-readable text dump rather than a full backup.
    const notebooks = await db.studyContainer.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: TAKE,
      select: {
        id: true,
        name: true,
        description: true,
        subject: true,
        color: true,
        createdAt: true,
        sections: {
          orderBy: { sortOrder: 'asc' },
          take: TAKE,
          select: {
            id: true,
            title: true,
            parentId: true,
            sortOrder: true,
            pages: {
              orderBy: { sortOrder: 'asc' },
              take: TAKE,
              select: {
                id: true,
                title: true,
                textContent: true,
                sortOrder: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    // Flashcard sets + their cards (question/answer).
    const flashcardSets = await db.flashcardSet.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: TAKE,
      select: {
        id: true,
        title: true,
        source: true,
        notebookId: true,
        createdAt: true,
        flashcards: {
          orderBy: { sortOrder: 'asc' },
          take: TAKE,
          select: { id: true, question: true, answer: true, sortOrder: true },
        },
      },
    });

    // Quiz sets + their questions.
    const quizSets = await db.quizSet.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: TAKE,
      select: {
        id: true,
        title: true,
        notebookId: true,
        createdAt: true,
        questions: {
          orderBy: { sortOrder: 'asc' },
          take: TAKE,
          select: {
            id: true,
            kind: true,
            question: true,
            options: true,
            correctIndex: true,
            hint: true,
            payload: true,
            sortOrder: true,
          },
        },
      },
    });

    // Study plans / learning paths.
    const studyPlans = await db.studyPlan.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: TAKE,
      select: {
        id: true,
        title: true,
        description: true,
        source: true,
        startDate: true,
        endDate: true,
        subjects: true,
        createdAt: true,
      },
    });

    // Todos.
    const todos = await db.todo.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: TAKE,
      select: { id: true, text: true, completed: true, createdAt: true },
    });

    // Exams.
    const exams = await db.exam.findMany({
      where: { userId },
      orderBy: { examDate: 'asc' },
      take: TAKE,
      select: {
        id: true,
        title: true,
        examDate: true,
        notebookId: true,
        reminders: true,
        createdAt: true,
      },
    });

    const payload = {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      profile,
      notebooks,
      flashcardSets,
      quizSets,
      studyPlans,
      todos,
      exams,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="notemage-export.json"',
      },
    });
  } catch (error) {
    console.error('[user-export] failed', error);
    return internalErrorResponse();
  }
}
