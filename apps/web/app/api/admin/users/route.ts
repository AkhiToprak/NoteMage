import { NextRequest } from 'next/server';
import { getAdminUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  forbiddenResponse,
  internalErrorResponse,
} from '@/lib/api-response';

// GET — list all users (admin only)
export async function GET(request: NextRequest) {
  try {
    const adminId = await getAdminUserId(request);
    if (!adminId) return forbiddenResponse('Admin access required');

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim().slice(0, 100);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));
    const skip = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          username: true,
          avatarUrl: true,
          role: true,
          banned: true,
          banReason: true,
          createdAt: true,
          _count: {
            select: {
              notebooks: true,
              posts: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.user.count({ where }),
    ]);

    return successResponse({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        username: u.username,
        avatarUrl: u.avatarUrl,
        role: u.role,
        banned: u.banned,
        banReason: u.banReason,
        createdAt: u.createdAt,
        notebookCount: u._count.notebooks,
        postCount: u._count.posts,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch {
    return internalErrorResponse();
  }
}
