import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  forbiddenResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { canPerformAction } from '@/lib/group-permissions';

type RouteContext = { params: Promise<{ id: string }> };

const VALID_CONTENT_TYPES = ['notebook', 'folder', 'document', 'flashcard_set', 'quiz_set'] as const;
type ContentType = (typeof VALID_CONTENT_TYPES)[number];

const SHARER_SELECT = { id: true, name: true, username: true, avatarUrl: true } as const;

// GET /api/groups/:id/shared — list shared content
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await context.params;

    const membership = await db.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId } },
    });
    if (!membership || membership.status !== 'accepted') {
      return forbiddenResponse('You are not a member of this group');
    }

    const url = new URL(request.url);
    const contentType = url.searchParams.get('contentType');
    const cursor = url.searchParams.get('cursor');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 50);

    const where: Record<string, unknown> = { groupId: id };
    if (contentType && VALID_CONTENT_TYPES.includes(contentType as ContentType)) {
      where.contentType = contentType;
    }
    if (cursor) {
      where.createdAt = { lt: new Date(cursor) };
    }

    const items = await db.groupSharedContent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        sharedBy: { select: SHARER_SELECT },
      },
    });

    let nextCursor: string | null = null;
    if (items.length > limit) {
      const extra = items.pop()!;
      nextCursor = extra.createdAt.toISOString();
    }

    return successResponse({
      items: items.map((item) => ({
        id: item.id,
        groupId: item.groupId,
        sharedById: item.sharedById,
        sharedBy: item.sharedBy,
        contentType: item.contentType,
        contentId: item.contentId,
        title: item.title,
        description: item.description,
        metadata: item.metadata,
        createdAt: item.createdAt,
      })),
      nextCursor,
    });
  } catch {
    return internalErrorResponse();
  }
}

// POST /api/groups/:id/shared — share content into group
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await context.params;

    const membership = await db.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId } },
    });
    if (!membership || membership.status !== 'accepted') {
      return forbiddenResponse('You are not a member of this group');
    }

    // Permission check for classes
    const groupInfo = await db.studyGroup.findUnique({
      where: { id },
      select: { type: true, allowMemberSharing: true },
    });
    if (groupInfo && !canPerformAction(groupInfo.type, membership.role, groupInfo.allowMemberSharing)) {
      return forbiddenResponse('Sharing is restricted by the teacher');
    }

    const body = await request.json();
    const { contentType, contentId } = body;

    if (!contentType || !VALID_CONTENT_TYPES.includes(contentType)) {
      return badRequestResponse('Invalid content type');
    }
    if (!contentId || typeof contentId !== 'string') {
      return badRequestResponse('Content ID is required');
    }

    // Check not already shared
    const existing = await db.groupSharedContent.findUnique({
      where: { groupId_contentType_contentId: { groupId: id, contentType, contentId } },
    });
    if (existing) {
      return badRequestResponse('This content is already shared in the group');
    }

    // Verify ownership and get title/metadata
    let title = '';
    let description: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let metadata: any = {};

    switch (contentType as ContentType) {
      case 'notebook': {
        const nb = await db.notebook.findFirst({ where: { id: contentId, userId } });
        if (!nb) return forbiddenResponse('Notebook not found or not owned by you');
        title = nb.name;
        description = nb.description;
        metadata = { color: nb.color, subject: nb.subject };
        break;
      }
      case 'folder': {
        const folder = await db.notebookFolder.findFirst({ where: { id: contentId, userId } });
        if (!folder) return forbiddenResponse('Folder not found or not owned by you');
        title = folder.name;
        metadata = { color: folder.color };
        break;
      }
      case 'document': {
        const doc = await db.document.findFirst({
          where: { id: contentId, notebook: { userId } },
        });
        if (!doc) return forbiddenResponse('Document not found or not owned by you');
        title = doc.fileName;
        metadata = { fileSize: doc.fileSize, fileType: doc.fileType };
        break;
      }
      case 'flashcard_set': {
        const set = await db.flashcardSet.findFirst({
          where: { id: contentId, notebook: { userId } },
          include: { _count: { select: { flashcards: true } } },
        });
        if (!set) return forbiddenResponse('Flashcard set not found or not owned by you');
        title = set.title;
        metadata = { cardCount: set._count.flashcards };
        break;
      }
      case 'quiz_set': {
        const quiz = await db.quizSet.findFirst({
          where: { id: contentId, notebook: { userId } },
          include: { _count: { select: { questions: true } } },
        });
        if (!quiz) return forbiddenResponse('Quiz set not found or not owned by you');
        title = quiz.title;
        metadata = { questionCount: quiz._count.questions };
        break;
      }
    }

    const shared = await db.groupSharedContent.create({
      data: {
        groupId: id,
        sharedById: userId,
        contentType,
        contentId,
        title,
        description,
        metadata: metadata || undefined,
      },
    });

    // Get sharer info for response and chat message
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, username: true, avatarUrl: true },
    });

    // Create a rich content_share message in the chat
    await db.groupMessage.create({
      data: {
        groupId: id,
        senderId: userId,
        type: 'content_share',
        content: title,
        metadata: {
          sharedId: shared.id,
          contentType,
          contentId,
          contentTitle: title,
          description,
          ...metadata,
        },
      },
    });

    // Notify all other accepted members (fire-and-forget)
    (async () => {
      try {
        const otherMembers = await db.studyGroupMember.findMany({
          where: { groupId: id, status: 'accepted', userId: { not: userId } },
          select: { userId: true },
        });
        if (otherMembers.length > 0) {
          const displayName = user?.name || user?.username || 'Someone';
          await db.notification.createMany({
            data: otherMembers.map((m) => ({
              userId: m.userId,
              type: 'group_content_shared',
              data: {
                groupId: id,
                sharerName: displayName,
                contentTitle: title,
                contentType,
              },
            })),
          });
        }
      } catch { /* notification failure should not break sharing */ }
    })();

    return successResponse({
      id: shared.id,
      groupId: shared.groupId,
      sharedById: shared.sharedById,
      sharedBy: user,
      contentType: shared.contentType,
      contentId: shared.contentId,
      title: shared.title,
      description: shared.description,
      metadata: shared.metadata,
      createdAt: shared.createdAt,
    });
  } catch {
    return internalErrorResponse();
  }
}
