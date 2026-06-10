import type { Notebook } from '@prisma/client';
import { db } from './db';

const INBOX_NAME = 'Inbox';
const INBOX_COLOR = '#5b6b9c';

export async function getOrCreateInboxNotebook(userId: string): Promise<Notebook> {
  const existing = await db.notebook.findFirst({
    where: { userId, kind: 'inbox' },
  });
  if (existing) return existing;

  return db.notebook.create({
    data: {
      userId,
      name: INBOX_NAME,
      color: INBOX_COLOR,
      kind: 'inbox',
    },
  });
}

export function isInboxNotebook(notebook: { kind: string }): boolean {
  return notebook.kind === 'inbox';
}

/**
 * Resolve a guaranteed-non-null notebook to host path-generated / cloned
 * FlashcardSet + QuizSet rows. Those rows MUST carry a `notebookId` because the
 * Flashcard / Quiz viewers URL-template it into every fetch (and the attempt
 * endpoint scopes the set by `{ id, notebookId }`), so they cannot run without
 * one.
 *
 * Prefer the user's oldest real notebook — matches first-party path generation,
 * which inherits the plan's primary notebook. Fall back to the hidden Inbox
 * notebook so a paths-first learner who cloned a community path WITHOUT ever
 * creating a notebook can still launch its quizzes. The bundle stays out of
 * notebook surfaces via `sourcePathId`, so the host choice is invisible either
 * way.
 */
export async function resolvePathHostNotebookId(userId: string): Promise<string> {
  const oldest = await db.notebook.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (oldest) return oldest.id;
  const inbox = await getOrCreateInboxNotebook(userId);
  return inbox.id;
}
