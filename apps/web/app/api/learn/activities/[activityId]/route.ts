import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
  forbiddenResponse,
  badRequestResponse,
} from '@/lib/api-response';
import { isSlotUnlocked } from '@/lib/path-gating';
import { logTelemetry } from '@/lib/telemetry-server';

// Phase 10.6 — mark one CheckpointActivity complete.
//
// The drawer calls this when the user finishes an activity (Theory →
// "Mark as read", Flashcards → onComplete, Quiz → finish() — assessment
// quizzes go through the separate /assessment endpoint instead).
//
// Server-side gates:
//   • The activity must belong to a slot that the user owns (via plan).
//   • The slot must be `unlocked` per the full path-gating rules so
//     users can't poke completion writes into a locked future slot.
//   • Once flipped to `completed: true` the row also records
//     `completedAt`. Idempotent: re-PATCHing an already-completed
//     activity is a no-op.

type Params = { params: Promise<{ activityId: string }> };

interface PatchBody {
  completed?: boolean;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { activityId } = await params;
    const body = (await request.json().catch(() => ({}))) as PatchBody;
    if (body.completed !== true) {
      return badRequestResponse('Only `completed: true` is supported.');
    }

    // Load the activity + its plan tree so we can run gate checks.
    const activity = await db.checkpointActivity.findUnique({
      where: { id: activityId },
      include: {
        slot: {
          include: {
            phase: {
              include: {
                plan: {
                  include: {
                    phases: {
                      orderBy: { sortOrder: 'asc' },
                      include: {
                        slots: {
                          orderBy: { sortOrder: 'asc' },
                          include: { activities: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!activity) return notFoundResponse('Activity not found');
    if (activity.slot.phase.plan.userId !== userId) {
      return notFoundResponse('Activity not found');
    }

    const gate = isSlotUnlocked(activity.slot.phase.plan.phases, activity.slot.id);
    if (!gate.unlocked) {
      return forbiddenResponse(`Slot is locked (${gate.reason ?? 'unknown'})`);
    }

    if (!activity.completed) {
      await db.checkpointActivity.update({
        where: { id: activityId },
        data: { completed: true, completedAt: new Date() },
      });
      logTelemetry(userId, 'path.activity.completed', {
        planId: activity.slot.phase.plan.id,
        slotId: activity.slotId,
        slotKind: activity.slot.kind,
        activityId,
        activityKind: activity.kind,
      });
    }

    // Return the updated slot so the drawer can refresh in-place
    // without re-fetching the whole plan tree.
    const slot = await db.checkpointSlot.findUnique({
      where: { id: activity.slotId },
      include: { activities: { orderBy: { sortOrder: 'asc' } } },
    });
    return successResponse({ slot });
  } catch (error) {
    console.error('[learn/activities PATCH]', error);
    return internalErrorResponse();
  }
}
