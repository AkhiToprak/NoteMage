import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type RouteContext = { params: Promise<{ id: string; sharedId: string }> };

// POST /api/groups/:id/shared/:sharedId/save — save shared content to own library
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: groupId, sharedId } = await context.params;

    // Verify membership
    const membership = await db.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!membership || membership.status !== 'accepted') {
      return forbiddenResponse('You are not a member of this group');
    }

    // Find the shared content
    const shared = await db.groupSharedContent.findUnique({
      where: { id: sharedId },
    });
    if (!shared || shared.groupId !== groupId) {
      return notFoundResponse('Shared content not found');
    }

    const body = await request.json().catch(() => ({}));
    const { targetNotebookId, targetFolderId, targetSectionId } = body as {
      targetNotebookId?: string;
      targetFolderId?: string;
      targetSectionId?: string;
    };

    switch (shared.contentType) {
      case 'notebook': {
        return await saveNotebook(userId, shared.contentId, shared.title, targetFolderId);
      }
      case 'flashcard_set': {
        return await saveFlashcardSet(
          userId,
          shared.contentId,
          shared.title,
          targetNotebookId,
          targetSectionId
        );
      }
      case 'quiz_set': {
        return await saveQuizSet(
          userId,
          shared.contentId,
          shared.title,
          targetNotebookId,
          targetSectionId
        );
      }
      case 'document': {
        return await saveDocument(userId, shared.contentId, shared.title, targetNotebookId);
      }
      default:
        return badRequestResponse('Unsupported content type');
    }
  } catch {
    return internalErrorResponse();
  }
}

async function saveNotebook(
  userId: string,
  sourceNotebookId: string,
  title: string,
  targetFolderId?: string
) {
  const source = await db.notebook.findUnique({
    where: { id: sourceNotebookId },
    include: {
      sections: { include: { pages: true } },
    },
  });
  if (!source) return notFoundResponse('Source notebook not found');

  // Verify folder ownership if provided
  if (targetFolderId) {
    const folder = await db.notebookFolder.findFirst({ where: { id: targetFolderId, userId } });
    if (!folder) return notFoundResponse('Folder not found');
  }

  const result = await db.$transaction(async (tx) => {
    // Clone the notebook
    const newNotebook = await tx.notebook.create({
      data: {
        userId,
        name: `${source.name} (Saved)`,
        description: source.description,
        subject: source.subject,
        color: source.color,
        folderId: targetFolderId || null,
      },
    });

    // Clone sections and pages
    const sectionIdMap = new Map<string, string>();

    // First pass: create sections without parent refs
    for (const section of source.sections) {
      const newSection = await tx.section.create({
        data: {
          notebookId: newNotebook.id,
          title: section.title,
          sortOrder: section.sortOrder,
        },
      });
      sectionIdMap.set(section.id, newSection.id);
    }

    // Second pass: set parent references
    for (const section of source.sections) {
      if (section.parentId && sectionIdMap.has(section.parentId)) {
        await tx.section.update({
          where: { id: sectionIdMap.get(section.id)! },
          data: { parentId: sectionIdMap.get(section.parentId)! },
        });
      }
    }

    // Clone pages
    for (const section of source.sections) {
      for (const page of section.pages) {
        await tx.page.create({
          data: {
            sectionId: sectionIdMap.get(section.id)!,
            title: page.title,
            content: page.content ?? undefined,
            sortOrder: page.sortOrder,
          },
        });
      }
    }

    return newNotebook;
  });

  return successResponse({
    saved: true,
    contentType: 'notebook',
    title: result.name,
    id: result.id,
  });
}

async function getOrCreateNotebook(
  userId: string,
  targetNotebookId: string | undefined,
  fallbackTitle: string
) {
  if (targetNotebookId) {
    const nb = await db.notebook.findFirst({ where: { id: targetNotebookId, userId } });
    if (nb) return nb.id;
  }
  // Create a new notebook to hold the content
  const nb = await db.notebook.create({
    data: { userId, name: fallbackTitle },
  });
  return nb.id;
}

async function saveFlashcardSet(
  userId: string,
  sourceSetId: string,
  title: string,
  targetNotebookId?: string,
  targetSectionId?: string
) {
  const source = await db.flashcardSet.findUnique({
    where: { id: sourceSetId },
    include: { flashcards: true },
  });
  if (!source) return notFoundResponse('Source flashcard set not found');

  const notebookId = await getOrCreateNotebook(userId, targetNotebookId, `${title} (Saved)`);

  // Verify section belongs to the target notebook if provided
  if (targetSectionId) {
    const section = await db.section.findFirst({ where: { id: targetSectionId, notebookId } });
    if (!section) return badRequestResponse('Section not found in this notebook');
  }

  const newSet = await db.flashcardSet.create({
    data: {
      notebookId,
      title: source.title,
      source: 'import',
      sectionId: targetSectionId || null,
      flashcards: {
        create: source.flashcards.map((fc) => ({
          question: fc.question,
          answer: fc.answer,
          sortOrder: fc.sortOrder,
        })),
      },
    },
  });

  return successResponse({
    saved: true,
    contentType: 'flashcard_set',
    title: newSet.title,
    id: newSet.id,
    notebookId,
  });
}

async function saveQuizSet(
  userId: string,
  sourceSetId: string,
  title: string,
  targetNotebookId?: string,
  targetSectionId?: string
) {
  const source = await db.quizSet.findUnique({
    where: { id: sourceSetId },
    include: { questions: true },
  });
  if (!source) return notFoundResponse('Source quiz set not found');

  const notebookId = await getOrCreateNotebook(userId, targetNotebookId, `${title} (Saved)`);

  // Verify section belongs to the target notebook if provided
  if (targetSectionId) {
    const section = await db.section.findFirst({ where: { id: targetSectionId, notebookId } });
    if (!section) return badRequestResponse('Section not found in this notebook');
  }

  const newSet = await db.quizSet.create({
    data: {
      notebookId,
      title: source.title,
      sectionId: targetSectionId || null,
      questions: {
        create: source.questions.map((q) => ({
          question: q.question,
          options: q.options,
          correctIndex: q.correctIndex,
          hint: q.hint,
          correctExplanation: q.correctExplanation,
          wrongExplanation: q.wrongExplanation,
          sortOrder: q.sortOrder,
        })),
      },
    },
  });

  return successResponse({
    saved: true,
    contentType: 'quiz_set',
    title: newSet.title,
    id: newSet.id,
    notebookId,
  });
}

async function saveDocument(
  userId: string,
  sourceDocId: string,
  title: string,
  targetNotebookId?: string
) {
  const source = await db.document.findUnique({
    where: { id: sourceDocId },
  });
  if (!source) return notFoundResponse('Source document not found');

  const notebookId = await getOrCreateNotebook(userId, targetNotebookId, `${title} (Saved)`);

  const newDoc = await db.document.create({
    data: {
      notebookId,
      fileName: source.fileName,
      filePath: source.filePath,
      fileSize: source.fileSize,
      fileType: source.fileType,
      textContent: source.textContent,
    },
  });

  return successResponse({
    saved: true,
    contentType: 'document',
    title: newDoc.fileName,
    id: newDoc.id,
    notebookId,
  });
}
