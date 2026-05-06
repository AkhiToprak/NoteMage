import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

const VALID_GOAL_TYPES = ['hours', 'pages', 'quizzes', 'notebooks'] as const;

function getCurrentWeekStart(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday, 1 = Monday ...
  const diff = day === 0 ? -6 : 1 - day; // offset to Monday
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const weekStart = getCurrentWeekStart();

    const goals = await db.studyGoal.findMany({
      where: { userId, weekStart },
      select: { type: true, target: true },
    });

    return successResponse({ goals });
  } catch {
    return internalErrorResponse();
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json().catch(() => ({}));
    const { goals = [] } = body as {
      goals?: { type: string; target: number }[];
    };

    if (!Array.isArray(goals)) {
      return badRequestResponse('goals must be an array');
    }

    for (const goal of goals) {
      if (!VALID_GOAL_TYPES.includes(goal.type as (typeof VALID_GOAL_TYPES)[number])) {
        return badRequestResponse('Invalid goal type');
      }
      if (!Number.isInteger(goal.target) || goal.target < 1 || goal.target > 10_000) {
        return badRequestResponse('Goal target must be a positive integer up to 10000');
      }
    }

    const weekStart = getCurrentWeekStart();

    await db.$transaction(async (tx) => {
      await tx.studyGoal.deleteMany({
        where: { userId, weekStart },
      });

      if (goals.length > 0) {
        await tx.studyGoal.createMany({
          data: goals.map((g) => ({
            userId,
            type: g.type,
            target: g.target,
            weekStart,
          })),
        });
      }

      // Sync pages goal → User.dailyGoal for dashboard
      const pagesGoal = goals.find((g) => g.type === 'pages');
      if (pagesGoal) {
        await tx.user.update({
          where: { id: userId },
          data: { dailyGoal: Math.min(200, Math.max(1, Math.ceil(pagesGoal.target / 7))) },
        });
      }
    });

    return successResponse({ success: true });
  } catch {
    return internalErrorResponse();
  }
}
