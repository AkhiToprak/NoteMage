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
