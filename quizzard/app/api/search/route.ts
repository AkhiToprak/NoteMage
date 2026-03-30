import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

function extractSnippet(text: string, query: string, radius = 50): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, 100) + (text.length > 100 ? '…' : '');
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  let snippet = '';
  if (start > 0) snippet += '…';
  snippet += text.slice(start, end);
  if (end < text.length) snippet += '…';
  return snippet;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const context = searchParams.get('context') || 'home';
    const notebookId = searchParams.get('notebookId');

    if (!q || q.length < 2) {
      return badRequestResponse('Search query must be at least 2 characters');
    }
    const query = q.slice(0, 100);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};

    // --- Users (home + notebooks contexts) ---
    if (context === 'home' || context === 'notebooks') {
      const users = await db.user.findMany({
        where: {
          id: { not: userId },
          OR: [
            { username: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: { id: true, username: true, name: true, avatarUrl: true },
        take: 5,
      });

      const userIds = users.map((u) => u.id);
      const friendships = userIds.length > 0
        ? await db.friendship.findMany({
            where: {
              OR: [
                { requesterId: userId, addresseeId: { in: userIds } },
                { requesterId: { in: userIds }, addresseeId: userId },
              ],
            },
          })
        : [];

      const friendshipMap = new Map<string, { status: string; requesterId: string }>();
      for (const f of friendships) {
        const otherId = f.requesterId === userId ? f.addresseeId : f.requesterId;
        friendshipMap.set(otherId, { status: f.status, requesterId: f.requesterId });
      }

      data.users = users.map((u) => {
        const f = friendshipMap.get(u.id);
        let friendshipStatus = 'none';
        if (f) {
          if (f.status === 'accepted') friendshipStatus = 'accepted';
          else if (f.status === 'pending') {
            friendshipStatus = f.requesterId === userId ? 'pending_sent' : 'pending_received';
          }
        }
        return { ...u, friendshipStatus };
      });
    }

    // --- Own Notebooks (home + notebooks contexts) ---
    if (context === 'home' || context === 'notebooks') {
      data.notebooks = await db.notebook.findMany({
        where: {
          userId,
          name: { contains: query, mode: 'insensitive' },
        },
        select: {
          id: true,
          name: true,
          subject: true,
          color: true,
          description: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      });
    }

    // --- Community / Published Notebooks (home context only) ---
    if (context === 'home') {
      const friendships = await db.friendship.findMany({
        where: {
          status: 'accepted',
          OR: [{ requesterId: userId }, { addresseeId: userId }],
        },
        select: { requesterId: true, addresseeId: true },
      });
      const friendIds = friendships.map((f) =>
        f.requesterId === userId ? f.addresseeId : f.requesterId
      );

      const shares = await db.sharedNotebook.findMany({
        where: {
          sharedWithId: null,
          AND: [
            {
              OR: [
                { visibility: 'public' },
                { visibility: 'friends', sharedById: { in: friendIds } },
                { sharedById: userId },
              ],
            },
            {
              OR: [
                { notebook: { name: { contains: query, mode: 'insensitive' } } },
                { title: { contains: query, mode: 'insensitive' } },
                { tags: { some: { tag: { name: { contains: query.toLowerCase(), mode: 'insensitive' } } } } },
              ],
            },
          ],
        },
        include: {
          notebook: { select: { name: true, subject: true } },
          sharedBy: { select: { username: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      data.communityNotebooks = shares.map((s) => ({
        shareId: s.id,
        name: s.notebook.name,
        title: s.title,
        subject: s.notebook.subject,
        ownerUsername: s.sharedBy.username,
        ownerAvatarUrl: s.sharedBy.avatarUrl,
      }));
    }

    // --- Page Content Search (notebooks + workspace contexts) ---
    if (context === 'notebooks' || context === 'workspace') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pageWhere: any = {
        textContent: { contains: query, mode: 'insensitive' },
      };

      if (context === 'workspace' && notebookId) {
        pageWhere.section = { notebook: { id: notebookId, userId } };
      } else {
        pageWhere.section = { notebook: { userId } };
      }

      const pages = await db.page.findMany({
        where: pageWhere,
        select: {
          id: true,
          title: true,
          textContent: true,
          section: {
            select: {
              title: true,
              notebookId: true,
              notebook: { select: { name: true } },
            },
          },
        },
        take: context === 'workspace' ? 20 : 10,
        orderBy: { updatedAt: 'desc' },
      });

      data.pages = pages.map((p) => ({
        id: p.id,
        title: p.title,
        sectionTitle: p.section.title,
        notebookId: p.section.notebookId,
        notebookName: p.section.notebook.name,
        textSnippet: extractSnippet(p.textContent || '', query),
      }));
    }

    return successResponse(data);
  } catch {
    return internalErrorResponse();
  }
}
