import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

/**
 * Phase 8 — Learn-this-notebook inventory.
 *
 * Returns every assignable material in the notebook as a flat, type-tagged
 * list. The manual mode of LearnPathSetup uses this (when launched from a
 * notebook header) to populate its material picker; cross-notebook mode
 * uses /api/learn/inventory instead. The AI generate route loads the same
 * primitives itself (with richer prompt-shaped strings); this endpoint is
 * the client-friendly shape.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findFirst({
      where: { id: notebookId, userId },
      select: { id: true },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    const [sections, flashcardSets, quizSets, documents] = await Promise.all([
      db.section.findMany({
        where: { notebookId },
        select: {
          id: true,
          title: true,
          pages: { select: { id: true, title: true } },
        },
        orderBy: { sortOrder: 'asc' },
      }),
      // Picker for new path creation — excluding path-generated bundles
      // so a path doesn't list its own previously-generated decks back
      // to the learner as candidate source material.
      db.flashcardSet.findMany({
        where: { notebookId, sourcePathId: null },
        select: { id: true, title: true },
      }),
      db.quizSet.findMany({
        where: { notebookId, sourcePathId: null },
        select: { id: true, title: true },
      }),
      db.document.findMany({
        where: { notebookId },
        select: { id: true, fileName: true, fileType: true },
      }),
    ]);

    const pages: { id: string; type: 'page'; title: string; sectionTitle: string }[] = [];
    for (const s of sections) {
      for (const p of s.pages) {
        pages.push({ id: p.id, type: 'page', title: p.title, sectionTitle: s.title });
      }
    }

    return successResponse({
      pages,
      flashcardSets: flashcardSets.map((f) => ({ id: f.id, type: 'flashcard_set' as const, title: f.title })),
      quizSets: quizSets.map((q) => ({ id: q.id, type: 'quiz_set' as const, title: q.title })),
      documents: documents.map((d) => ({
        id: d.id,
        type: 'document' as const,
        title: d.fileName,
        fileType: d.fileType,
      })),
    });
  } catch (error) {
    console.error('Error loading notebook inventory:', error);
    return internalErrorResponse();
  }
}
