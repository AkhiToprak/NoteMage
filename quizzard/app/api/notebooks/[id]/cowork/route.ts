import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  createdResponse,
  unauthorizedResponse,
  notFoundResponse,
  forbiddenResponse,
  conflictResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ id: string }> };

// POST — create a co-work session (caller becomes host + first participant)
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    // Verify notebook exists and user owns it
    const notebook = await db.notebook.findFirst({
      where: { id: notebookId, userId },
      select: { id: true },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    // Check no active session already exists for this notebook
    const existing = await db.coWorkSession.findFirst({
      where: { notebookId, isActive: true },
      select: { id: true },
    });
    if (existing) return conflictResponse('An active co-work session already exists for this notebook');

    // Create session + add host as first participant in a transaction
    const session = await db.$transaction(async (tx) => {
      const s = await tx.coWorkSession.create({
        data: {
          notebookId,
          hostId: userId,
        },
      });

      await tx.coWorkParticipant.create({
        data: {
          sessionId: s.id,
          userId,
        },
      });

      return s;
    });

    return createdResponse({
      id: session.id,
      notebookId: session.notebookId,
      hostId: session.hostId,
      isActive: session.isActive,
      createdAt: session.createdAt,
    });
  } catch {
    return internalErrorResponse();
  }
}

// GET — get the active co-work session for this notebook (or null)
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    // User must either own the notebook or be a friend of the owner
    const notebook = await db.notebook.findUnique({
      where: { id: notebookId },
      select: { id: true, userId: true },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    if (notebook.userId !== userId) {
      // Check friendship
      const friendship = await db.friendship.findFirst({
        where: {
          status: 'accepted',
          OR: [
            { requesterId: userId, addresseeId: notebook.userId },
            { requesterId: notebook.userId, addresseeId: userId },
          ],
        },
      });
      if (!friendship) return forbiddenResponse('Not authorized to view this notebook');
    }

    const session = await db.coWorkSession.findFirst({
      where: { notebookId, isActive: true },
      include: {
        host: { select: { id: true, username: true, avatarUrl: true } },
        participants: {
          where: { isActive: true },
          include: {
            user: { select: { id: true, username: true, avatarUrl: true } },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!session) {
      return successResponse({ session: null });
    }

    return successResponse({
      session: {
        id: session.id,
        notebookId: session.notebookId,
        hostId: session.hostId,
        host: session.host,
        isActive: session.isActive,
        createdAt: session.createdAt,
        participants: session.participants.map((p) => ({
          id: p.id,
          userId: p.userId,
          user: p.user,
          joinedAt: p.joinedAt,
        })),
      },
    });
  } catch {
    return internalErrorResponse();
  }
}
