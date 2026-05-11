import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  isCheckpointMaterial,
  isMaterialUnlocked,
  isPhaseUnlocked,
} from '@/lib/path-gating';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ id: string; setId: string }> };

/**
 * GET – fetch a quiz set with all its questions
 *
 * Phase 5: when called with `?material=<materialId>`, the server resolves the
 * StudyMaterial, runs the gate check, and either 403s on a locked node or
 * attaches `isCheckpoint` and `materialId` to the response. Direct calls
 * without `?material=` keep the legacy behavior.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const quizSet = await db.quizSet.findFirst({
      where: { id: setId, notebookId },
      include: {
        questions: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!quizSet) return notFoundResponse('Quiz set not found');

    const materialIdParam = request.nextUrl.searchParams.get('material');
    let isCheckpoint = false;
    let resolvedMaterialId: string | null = null;
    if (materialIdParam) {
      const material = await db.studyMaterial.findFirst({
        where: { id: materialIdParam, type: 'quiz_set', referenceId: setId },
        include: {
          phase: {
            include: {
              plan: {
                include: {
                  phases: {
                    orderBy: { sortOrder: 'asc' },
                    include: { materials: { orderBy: { sortOrder: 'asc' } } },
                  },
                },
              },
              materials: { orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      });
      if (material) {
        const phaseGate = isPhaseUnlocked(material.phase.plan.phases, material.phaseId);
        const materialGate = isMaterialUnlocked(material.phase, material.id, phaseGate.unlocked);
        if (!materialGate.unlocked) {
          return NextResponse.json(
            { success: false, error: 'locked', reason: materialGate.reason ?? phaseGate.reason },
            { status: 403 }
          );
        }
        isCheckpoint = isCheckpointMaterial(material.phase, material.id);
        resolvedMaterialId = material.id;
      }
    }

    return successResponse({
      ...quizSet,
      isCheckpoint,
      materialId: resolvedMaterialId,
    });
  } catch {
    return internalErrorResponse();
  }
}

/**
 * PATCH – update a quiz set (e.g. assign to a section)
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const quizSet = await db.quizSet.findFirst({ where: { id: setId, notebookId } });
    if (!quizSet) return notFoundResponse('Quiz set not found');

    const body = await request.json();
    const { sectionId } = body;

    if (sectionId !== null && sectionId !== undefined) {
      const section = await db.section.findFirst({ where: { id: sectionId, notebookId } });
      if (!section) return badRequestResponse('Section not found in this notebook');
    }

    const updated = await db.quizSet.update({
      where: { id: setId },
      data: { sectionId: sectionId ?? null },
      include: { questions: { orderBy: { sortOrder: 'asc' } } },
    });

    return successResponse(updated);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * DELETE – delete a quiz set and all its questions
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const quizSet = await db.quizSet.findFirst({ where: { id: setId, notebookId } });
    if (!quizSet) return notFoundResponse('Quiz set not found');

    await db.quizSet.delete({ where: { id: setId } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
