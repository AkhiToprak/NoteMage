import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { awardXP } from '@/lib/xp';
import { checkAndUnlockAchievements } from '@/lib/achievement-checker';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  forbiddenResponse,
  internalErrorResponse,
} from '@/lib/api-response';

const VALID_TYPES = ['copy', 'live_view'] as const;
const VALID_VISIBILITIES = ['public', 'friends', 'specific'] as const;

// POST — share a notebook
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findUnique({
      where: { id: notebookId },
      select: { id: true, userId: true, name: true },
    });

    if (!notebook) return notFoundResponse('Notebook not found');
    if (notebook.userId !== userId) return forbiddenResponse('You do not own this notebook');

    const body = await request.json().catch(() => ({}));
    const { type, visibility, sharedWithIds, title, description, content, tags } = body as {
      type?: string;
      visibility?: string;
      sharedWithIds?: string[];
      title?: string;
      description?: string;
      content?: string;
      tags?: string[];
    };

    // Validate optional publish fields
    const publishTitle = title?.trim().slice(0, 200) || null;
    const publishDescription = description?.trim().slice(0, 10000) || null;
    const publishContent = content?.trim() || null;

    if (!type || !VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
      return badRequestResponse('type must be "copy" or "live_view"');
    }

    if (
      !visibility ||
      !VALID_VISIBILITIES.includes(visibility as (typeof VALID_VISIBILITIES)[number])
    ) {
      return badRequestResponse('visibility must be "public", "friends", or "specific"');
    }

    if (visibility === 'specific') {
      if (!Array.isArray(sharedWithIds) || sharedWithIds.length === 0) {
        return badRequestResponse('sharedWithIds is required for specific visibility');
      }
      if (sharedWithIds.length > 50) {
        return badRequestResponse('Cannot share with more than 50 users at once');
      }
    }

    const requester = await db.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    if (visibility === 'specific' && sharedWithIds) {
      // Validate all recipient IDs are strings
      if (
        sharedWithIds.some((id: unknown) => typeof id !== 'string' || (id as string).length === 0)
      ) {
        return badRequestResponse('All sharedWithIds must be non-empty strings');
      }

      // Deduplicate IDs
      const uniqueIds = [...new Set(sharedWithIds as string[])].filter((id) => id !== userId);

      if (uniqueIds.length === 0) {
        return badRequestResponse('No valid recipients after deduplication');
      }

      // Verify all recipients exist
      const validUsers = await db.user.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true },
      });
      const validUserIds = new Set(validUsers.map((u) => u.id));
      const invalidIds = uniqueIds.filter((id) => !validUserIds.has(id));
      if (invalidIds.length > 0) {
        return badRequestResponse('One or more recipient IDs are invalid');
      }

      // Verify all recipients are friends of the sharer
      const friendships = await db.friendship.findMany({
        where: {
          status: 'accepted',
          OR: [
            { requesterId: userId, addresseeId: { in: uniqueIds } },
            { requesterId: { in: uniqueIds }, addresseeId: userId },
          ],
        },
      });
      const friendIds = new Set(
        friendships.map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId))
      );
      const nonFriendIds = uniqueIds.filter((id) => !friendIds.has(id));
      if (nonFriendIds.length > 0) {
        return badRequestResponse('You can only share with your friends');
      }

      // Share with specific users — skip duplicates
      const shares = await db.$transaction(async (tx) => {
        const created = [];
        for (const recipientId of uniqueIds) {
          // Check if already shared with this user
          const existingShare = await tx.sharedNotebook.findFirst({
            where: { notebookId, sharedById: userId, sharedWithId: recipientId },
          });
          if (existingShare) continue;

          const share = await tx.sharedNotebook.create({
            data: {
              notebookId,
              sharedById: userId,
              sharedWithId: recipientId,
              type,
              visibility: 'specific',
            },
          });
          created.push(share);

          await tx.notification.create({
            data: {
              userId: recipientId,
              type: 'notebook_sent',
              data: {
                sharedNotebookId: share.id,
                notebookId,
                notebookName: notebook.name,
                sharedBy: requester?.username,
                shareType: type,
              },
            },
          });
        }
        return created;
      });

      return createdResponse({ shares, count: shares.length });
    }

    // Community / friends share — create a single share record
    // Validate tags for community shares (at least 1 required, max 15)
    const normalizedTags: string[] = [];
    if (tags && Array.isArray(tags)) {
      for (const raw of tags.slice(0, 15)) {
        if (typeof raw !== 'string') continue;
        const normalized = raw
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '_')
          .replace(/[^a-z0-9_-]/g, '')
          .slice(0, 30);
        if (normalized.length > 0 && !normalizedTags.includes(normalized)) {
          normalizedTags.push(normalized);
        }
      }
    }

    if (normalizedTags.length === 0) {
      return badRequestResponse('At least one tag is required for community shares');
    }

    // Check if already shared with same visibility
    const existing = await db.sharedNotebook.findFirst({
      where: {
        notebookId,
        sharedById: userId,
        sharedWithId: null,
        visibility,
      },
    });

    if (existing) {
      return badRequestResponse('This notebook is already shared with this visibility');
    }

    const share = await db.$transaction(async (tx) => {
      // Create the shared notebook
      const created = await tx.sharedNotebook.create({
        data: {
          notebookId,
          sharedById: userId,
          sharedWithId: null,
          type,
          visibility,
          title: publishTitle,
          description: publishDescription,
          content: publishContent,
        },
      });

      // Upsert tags and create join records
      for (const tagName of normalizedTags) {
        const tag = await tx.tag.upsert({
          where: { name: tagName },
          create: { name: tagName },
          update: {},
        });
        await tx.sharedNotebookTag.create({
          data: { sharedNotebookId: created.id, tagId: tag.id },
        });
      }

      // Create friend activity
      await tx.friendActivity.create({
        data: {
          userId,
          type: 'published',
          targetName: publishTitle || notebook.name,
          targetColor: null,
          targetId: created.id,
        },
      });

      return created;
    });

    // Fetch the share with tags for the response
    const shareWithTags = await db.sharedNotebook.findUnique({
      where: { id: share.id },
      include: {
        tags: { include: { tag: { select: { id: true, name: true } } } },
      },
    });

    // Award XP and check achievements (fire-and-forget)
    awardXP(userId, 'notebook_published').catch(console.error);
    checkAndUnlockAchievements(userId).catch(console.error);

    return createdResponse({
      share: {
        ...shareWithTags,
        tags: shareWithTags?.tags.map((t) => t.tag.name) || [],
      },
    });
  } catch {
    return internalErrorResponse();
  }
}

// GET — get share status of a notebook
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findUnique({
      where: { id: notebookId },
      select: { id: true, userId: true },
    });

    if (!notebook) return notFoundResponse('Notebook not found');
    if (notebook.userId !== userId) return forbiddenResponse('You do not own this notebook');

    const shares = await db.sharedNotebook.findMany({
      where: { notebookId, sharedById: userId },
      include: {
        sharedWith: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
            nameStyle: true,
            equippedTitleId: true,
            equippedFrameId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return successResponse({ shares });
  } catch {
    return internalErrorResponse();
  }
}

// DELETE — unshare a notebook (remove all shares or a specific share)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    const { searchParams } = new URL(request.url);
    const shareId = searchParams.get('shareId');

    if (shareId) {
      // Delete specific share
      const share = await db.sharedNotebook.findUnique({ where: { id: shareId } });
      if (!share) return notFoundResponse('Share not found');
      if (share.notebookId !== notebookId)
        return notFoundResponse('Share not found for this notebook');
      if (share.sharedById !== userId) return forbiddenResponse('You did not create this share');

      await db.sharedNotebook.delete({ where: { id: shareId } });
    } else {
      // Delete all shares for this notebook by this user
      await db.sharedNotebook.deleteMany({
        where: { notebookId, sharedById: userId },
      });
    }

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
