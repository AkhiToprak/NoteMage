import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

/**
 * Phase 9.4 — Cross-notebook learn inventory.
 *
 * Returns every assignable material the user owns, annotated with the
 * source notebook so the Study Pack creation wizard can group items per
 * notebook. Same item shape as `/api/notebooks/[id]/inventory` plus
 * `notebookId`, `notebookName`, `notebookColor`, and `notebookKind`.
 *
 * Ordering: Inbox notebook(s) first, then standard notebooks by
 * `updatedAt DESC`. Within each notebook the per-type ordering mirrors
 * the per-notebook endpoint (sections by `sortOrder`; flashcard/quiz
 * sets/documents by insertion order via Prisma default).
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const notebooks = await db.notebook.findMany({
      where: { userId },
      orderBy: [{ kind: 'asc' }, { updatedAt: 'desc' }],
      select: { id: true, name: true, color: true, kind: true },
    });

    if (notebooks.length === 0) {
      return successResponse({
        pages: [],
        flashcardSets: [],
        quizSets: [],
        documents: [],
      });
    }

    const notebookIds = notebooks.map((n) => n.id);

    const [sections, flashcardSets, quizSets, documents] = await Promise.all([
      db.section.findMany({
        where: { notebookId: { in: notebookIds } },
        select: {
          id: true,
          title: true,
          notebookId: true,
          sortOrder: true,
          pages: { select: { id: true, title: true } },
        },
        orderBy: [{ notebookId: 'asc' }, { sortOrder: 'asc' }],
      }),
      db.flashcardSet.findMany({
        where: { notebookId: { in: notebookIds } },
        select: { id: true, title: true, notebookId: true },
      }),
      db.quizSet.findMany({
        where: { notebookId: { in: notebookIds } },
        select: { id: true, title: true, notebookId: true },
      }),
      db.document.findMany({
        where: { notebookId: { in: notebookIds } },
        select: { id: true, fileName: true, fileType: true, notebookId: true },
      }),
    ]);

    // Build a notebook-id -> annotation map; the resulting arrays inherit
    // the notebook ordering from `notebooks` above so the client just
    // groups by `notebookId` without resorting.
    const orderIndex = new Map<string, number>(notebooks.map((n, i) => [n.id, i]));
    const annotate = <T>(notebookId: string | null) => {
      const nb = notebookId
        ? notebooks.find((n) => n.id === notebookId) ?? null
        : null;
      return {
        notebookId: nb?.id ?? null,
        notebookName: nb?.name ?? null,
        notebookColor: nb?.color ?? null,
        notebookKind: nb?.kind ?? null,
      } as {
        notebookId: string | null;
        notebookName: string | null;
        notebookColor: string | null;
        notebookKind: string | null;
      };
    };
    const sortByNotebook = <T extends { notebookId: string | null }>(items: T[]) =>
      items.slice().sort((a, b) => {
        const ai = a.notebookId ? orderIndex.get(a.notebookId) ?? 0 : 0;
        const bi = b.notebookId ? orderIndex.get(b.notebookId) ?? 0 : 0;
        return ai - bi;
      });

    const pages: Array<{
      id: string;
      type: 'page';
      title: string;
      sectionTitle: string;
      notebookId: string | null;
      notebookName: string | null;
      notebookColor: string | null;
      notebookKind: string | null;
    }> = [];
    for (const s of sections) {
      for (const p of s.pages) {
        pages.push({
          id: p.id,
          type: 'page' as const,
          title: p.title,
          sectionTitle: s.title,
          ...annotate(s.notebookId),
        });
      }
    }

    return successResponse({
      pages: sortByNotebook(pages),
      flashcardSets: sortByNotebook(
        flashcardSets.map((f) => ({
          id: f.id,
          type: 'flashcard_set' as const,
          title: f.title,
          ...annotate(f.notebookId),
        }))
      ),
      quizSets: sortByNotebook(
        quizSets.map((q) => ({
          id: q.id,
          type: 'quiz_set' as const,
          title: q.title,
          ...annotate(q.notebookId),
        }))
      ),
      documents: sortByNotebook(
        documents.map((d) => ({
          id: d.id,
          type: 'document' as const,
          title: d.fileName,
          fileType: d.fileType,
          ...annotate(d.notebookId),
        }))
      ),
    });
  } catch (error) {
    console.error('[learn/inventory GET]', error);
    return internalErrorResponse();
  }
}
