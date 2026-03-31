import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

// GET /api/groups — list groups the user is a member of
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const memberships = await db.studyGroupMember.findMany({
      where: { userId },
      include: {
        group: {
          include: {
            _count: {
              select: {
                members: true,
                notebooks: true,
              },
            },
            owner: {
              select: { id: true, name: true, username: true, avatarUrl: true },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const groups = memberships.map((m) => ({
      id: m.group.id,
      name: m.group.name,
      description: m.group.description,
      avatarUrl: m.group.avatarUrl,
      ownerId: m.group.ownerId,
      owner: m.group.owner,
      role: m.role,
      memberCount: m.group._count.members,
      notebookCount: m.group._count.notebooks,
      joinedAt: m.joinedAt,
      createdAt: m.group.createdAt,
      updatedAt: m.group.updatedAt,
    }));

    return successResponse({ groups, count: groups.length });
  } catch {
    return internalErrorResponse();
  }
}

// POST /api/groups — create a new group
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const { name, description } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return badRequestResponse('Group name is required');
    }

    if (name.trim().length > 100) {
      return badRequestResponse('Group name must be 100 characters or less');
    }

    const group = await db.studyGroup.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        ownerId: userId,
        members: {
          create: {
            userId,
            role: 'owner',
          },
        },
      },
      include: {
        owner: {
          select: { id: true, name: true, username: true, avatarUrl: true },
        },
        _count: {
          select: { members: true, notebooks: true },
        },
      },
    });

    return createdResponse({
      id: group.id,
      name: group.name,
      description: group.description,
      avatarUrl: group.avatarUrl,
      ownerId: group.ownerId,
      owner: group.owner,
      memberCount: group._count.members,
      notebookCount: group._count.notebooks,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    });
  } catch {
    return internalErrorResponse();
  }
}
