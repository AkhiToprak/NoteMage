import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all';
    const search = searchParams.get('search')?.trim().slice(0, 100);
    const subject = searchParams.get('subject')?.trim().slice(0, 100);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));
    const skip = (page - 1) * limit;

    // Build the where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      sharedWithId: null, // community shares only
    };

    if (filter === 'friends') {
      // Get friend IDs
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
      where.OR = [
        { visibility: 'public', sharedById: { in: friendIds } },
        { visibility: 'friends', sharedById: { in: friendIds } },
      ];
    } else if (filter === 'mine') {
      where.sharedById = userId;
    } else {
      // 'all' — public notebooks + friends-visible from actual friends
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
      where.OR = [
        { visibility: 'public' },
        { visibility: 'friends', sharedById: { in: friendIds } },
        { sharedById: userId },
      ];
    }

    // Build notebook filter conditions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notebookWhere: any = {};
    if (search) {
      notebookWhere.name = { contains: search, mode: 'insensitive' };
    }
    if (subject) {
      notebookWhere.subject = { contains: subject, mode: 'insensitive' };
    }

    if (Object.keys(notebookWhere).length > 0) {
      where.notebook = notebookWhere;
    }

    const [shares, total] = await Promise.all([
      db.sharedNotebook.findMany({
        where,
        include: {
          notebook: {
            select: {
              id: true,
              name: true,
              subject: true,
              color: true,
              _count: { select: { sections: true } },
            },
          },
          sharedBy: {
            select: { id: true, username: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.sharedNotebook.count({ where }),
    ]);

    const notebooks = shares.map((s) => ({
      shareId: s.id,
      notebookId: s.notebook.id,
      name: s.notebook.name,
      subject: s.notebook.subject,
      color: s.notebook.color,
      sectionCount: s.notebook._count.sections,
      shareType: s.type,
      visibility: s.visibility,
      downloadCount: s.downloadCount,
      author: s.sharedBy,
      sharedAt: s.createdAt,
    }));

    return successResponse({
      notebooks,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch {
    return internalErrorResponse();
  }
}
