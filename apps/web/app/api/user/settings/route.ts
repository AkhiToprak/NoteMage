import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

const REACTION_MODES = ['all', 'minimal', 'off'] as const;
type ReactionMode = (typeof REACTION_MODES)[number];

function isReactionMode(value: unknown): value is ReactionMode {
  return typeof value === 'string' && (REACTION_MODES as readonly string[]).includes(value);
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        dailyGoal: true,
        quizReactionsMode: true,
        quizReactionsAudio: true,
      },
    });

    if (!user) return unauthorizedResponse();
    return successResponse(user);
  } catch {
    return internalErrorResponse();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const { dailyGoal, quizReactionsMode, quizReactionsAudio } = body;

    const data: {
      dailyGoal?: number;
      quizReactionsMode?: ReactionMode;
      quizReactionsAudio?: boolean;
    } = {};

    if (dailyGoal !== undefined) {
      if (typeof dailyGoal !== 'number' || dailyGoal < 1 || dailyGoal > 200) {
        return badRequestResponse('dailyGoal must be a number between 1 and 200');
      }
      data.dailyGoal = Math.round(dailyGoal);
    }

    if (quizReactionsMode !== undefined) {
      if (!isReactionMode(quizReactionsMode)) {
        return badRequestResponse('quizReactionsMode must be "all", "minimal", or "off"');
      }
      data.quizReactionsMode = quizReactionsMode;
    }

    if (quizReactionsAudio !== undefined) {
      if (typeof quizReactionsAudio !== 'boolean') {
        return badRequestResponse('quizReactionsAudio must be a boolean');
      }
      data.quizReactionsAudio = quizReactionsAudio;
    }

    if (Object.keys(data).length === 0) {
      return badRequestResponse('No supported settings provided');
    }

    const updated = await db.user.update({
      where: { id: userId },
      data,
      select: {
        dailyGoal: true,
        quizReactionsMode: true,
        quizReactionsAudio: true,
      },
    });

    return successResponse(updated);
  } catch {
    return internalErrorResponse();
  }
}
