import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  createdResponse,
  unauthorizedResponse,
  notFoundResponse,
  forbiddenResponse,
  internalErrorResponse,
} from '@/lib/api-response';

// POST — deep-clone a shared notebook for the authenticated user
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    // Verify the notebook is shared with this user or publicly
    const share = await db.sharedNotebook.findFirst({
      where: {
        notebookId,
        type: 'copy',
        OR: [
          { visibility: 'public' },
          { sharedWithId: userId },
          {
            visibility: 'friends',
            sharedBy: {
              sentFriendRequests: {
                some: { addresseeId: userId, status: 'accepted' },
              },
            },
          },
          {
            visibility: 'friends',
            sharedBy: {
              receivedFriendRequests: {
                some: { requesterId: userId, status: 'accepted' },
              },
            },
          },
        ],
      },
    });

    if (!share) {
      return notFoundResponse('No copyable share found for this notebook');
    }

    // Fetch the full notebook with sections and pages
    const source = await db.notebook.findUnique({
      where: { id: notebookId },
      include: {
        sections: {
          include: {
            pages: {
              select: {
                id: true,
                title: true,
                content: true,
                textContent: true,
                drawingData: true,
                sortOrder: true,
              },
            },
          },
        },
      },
    });

    if (!source) return notFoundResponse('Source notebook not found');

    // Deep-clone in a transaction
    const cloned = await db.$transaction(async (tx) => {
      // Create the new notebook
      const newNotebook = await tx.notebook.create({
        data: {
          userId,
          name: `${source.name} (Copy)`,
          description: source.description,
          subject: source.subject,
          color: source.color,
        },
      });

      // Map old section IDs to new section IDs for parent references
      const sectionMap = new Map<string, string>();

      // First pass: create all sections (without parent refs)
      for (const section of source.sections) {
        const newSection = await tx.section.create({
          data: {
            notebookId: newNotebook.id,
            title: section.title,
            sortOrder: section.sortOrder,
            color: section.color,
          },
        });
        sectionMap.set(section.id, newSection.id);
      }

      // Second pass: set parent references for nested sections
      for (const section of source.sections) {
        if (section.parentId && sectionMap.has(section.parentId)) {
          await tx.section.update({
            where: { id: sectionMap.get(section.id)! },
            data: { parentId: sectionMap.get(section.parentId) },
          });
        }
      }

      // Third pass: clone pages
      for (const section of source.sections) {
        const newSectionId = sectionMap.get(section.id)!;
        for (const page of section.pages) {
          await tx.page.create({
            data: {
              sectionId: newSectionId,
              title: page.title,
              content: page.content ?? undefined,
              textContent: page.textContent,
              drawingData: page.drawingData ?? undefined,
              sortOrder: page.sortOrder,
            },
          });
        }
      }

      return newNotebook;
    });

    return createdResponse({
      notebook: {
        id: cloned.id,
        name: cloned.name,
        subject: cloned.subject,
        color: cloned.color,
      },
    });
  } catch {
    return internalErrorResponse();
  }
}
