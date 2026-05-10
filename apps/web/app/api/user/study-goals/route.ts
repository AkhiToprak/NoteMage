import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

export type GoalKey =
  | 'dailyStudyMinutesGoal'
  | 'weeklyStudyPlansGoal'
  | 'weeklyNotesGoal'
  | 'weeklyChatsGoal';

const GOAL_KEYS: readonly GoalKey[] = [
  'dailyStudyMinutesGoal',
  'weeklyStudyPlansGoal',
  'weeklyNotesGoal',
  'weeklyChatsGoal',
] as const;

const GOAL_BOUNDS: Record<GoalKey, { min: number; max: number }> = {
  dailyStudyMinutesGoal: { min: 1, max: 1440 },
  weeklyStudyPlansGoal: { min: 1, max: 100 },
  weeklyNotesGoal: { min: 1, max: 1000 },
  weeklyChatsGoal: { min: 1, max: 1000 },
};

export function validateGoals(
  input: unknown
): { ok: true; data: Partial<Record<GoalKey, number | null>> } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'goals must be an object' };
  }
  const out: Partial<Record<GoalKey, number | null>> = {};
  for (const key of GOAL_KEYS) {
    if (!(key in (input as Record<string, unknown>))) continue;
    const raw = (input as Record<string, unknown>)[key];
    if (raw === null) {
      out[key] = null;
      continue;
    }
    if (typeof raw !== 'number' || !Number.isInteger(raw)) {
      return { ok: false, error: `${key} must be an integer or null` };
    }
    const { min, max } = GOAL_BOUNDS[key];
    if (raw < min || raw > max) {
      return { ok: false, error: `${key} must be between ${min} and ${max}` };
    }
    out[key] = raw;
  }
  return { ok: true, data: out };
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        dailyStudyMinutesGoal: true,
        weeklyStudyPlansGoal: true,
        weeklyNotesGoal: true,
        weeklyChatsGoal: true,
      },
    });

    return successResponse(
      user ?? {
        dailyStudyMinutesGoal: null,
        weeklyStudyPlansGoal: null,
        weeklyNotesGoal: null,
        weeklyChatsGoal: null,
      }
    );
  } catch {
    return internalErrorResponse();
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json().catch(() => ({}));
    const result = validateGoals(body);
    if (!result.ok) return badRequestResponse(result.error);

    const updated = await db.user.update({
      where: { id: userId },
      data: result.data,
      select: {
        dailyStudyMinutesGoal: true,
        weeklyStudyPlansGoal: true,
        weeklyNotesGoal: true,
        weeklyChatsGoal: true,
      },
    });

    return successResponse(updated);
  } catch {
    return internalErrorResponse();
  }
}
