import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ id: string }> };

/**
 * GET — list every learn path generated *from* this notebook.
 *
 * Phase 9 split a path's notebook linkage into two columns:
 * `StudyPlan.notebookId` (the primary notebook generated content is
 * stamped onto) and `StudyPlan.contextNotebookIds[]` (every source
 * notebook whose materials seeded the plan). A path is "from this
 * notebook" if the notebook id appears in either, so the OR is needed
 * to surface paths the user actually associates with this notebook —
 * not just the ones where it happened to be the primary.
 *
 * The notebook UI (`UnifiedSidebar`) renders this list as a small
 * "Paths" group; the path itself still lives in `/learn/paths/[id]`,
 * and the bundles it generated stay inside the path (filtered out of
 * the notebook's flashcard / quiz lists via `sourcePathId`).
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findFirst({
      where: { id: notebookId, userId },
      select: { id: true },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    const plans = await db.studyPlan.findMany({
      where: {
        userId,
        OR: [
          { notebookId },
          { contextNotebookIds: { has: notebookId } },
        ],
      },
      select: {
        id: true,
        title: true,
        startDate: true,
        endDate: true,
        source: true,
        _count: { select: { phases: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return successResponse(plans);
  } catch {
    return internalErrorResponse();
  }
}
