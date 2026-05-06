import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { sendSignupNotification } from '@/lib/email';
import { verifyAndFulfillCheckout } from '@/lib/stripe-fulfillment';

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

export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Prevent replay — onboarding can only be completed once
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { onboardingComplete: true },
    });
    if (user?.onboardingComplete) {
      return badRequestResponse('Onboarding already completed');
    }

    const body = await request.json().catch(() => ({}));
    const { studyGoals = [], scholarName } = body as {
      studyGoals?: { type: string; target: number }[];
      scholarName?: string | null;
    };

    // Validate mage name
    if (scholarName !== undefined && scholarName !== null) {
      if (typeof scholarName !== 'string' || scholarName.trim().length > 30) {
        return badRequestResponse('Mage name must be at most 30 characters');
      }
    }

    if (!Array.isArray(studyGoals)) {
      return badRequestResponse('studyGoals must be an array');
    }

    for (const goal of studyGoals) {
      if (!VALID_GOAL_TYPES.includes(goal.type as (typeof VALID_GOAL_TYPES)[number])) {
        return badRequestResponse('Invalid goal type');
      }
      if (!Number.isInteger(goal.target) || goal.target < 1 || goal.target > 10_000) {
        return badRequestResponse('Goal target must be a positive integer up to 10000');
      }
    }

    const weekStart = getCurrentWeekStart();

    await db.$transaction(async (tx) => {
      // Delete existing goals for this week to avoid duplicates
      await tx.studyGoal.deleteMany({
        where: { userId, weekStart },
      });

      // Create new goals
      if (studyGoals.length > 0) {
        await tx.studyGoal.createMany({
          data: studyGoals.map((g) => ({
            userId,
            type: g.type,
            target: g.target,
            weekStart,
          })),
        });
      }

      // Mark onboarding complete + sync pages goal → dailyGoal + save mage name
      const pagesGoal = studyGoals.find((g) => g.type === 'pages');
      await tx.user.update({
        where: { id: userId },
        data: {
          onboardingComplete: true,
          ...(scholarName ? { scholarName: scholarName.trim() } : {}),
          ...(pagesGoal
            ? { dailyGoal: Math.min(200, Math.max(1, Math.ceil(pagesGoal.target / 7))) }
            : {}),
        },
      });
    });

    // Read user AFTER transaction for freshest tier.
    // If tier is still FREE, verify directly with Stripe (fallback if webhook hasn't arrived).
    let fullUser = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, tier: true },
    });

    if (fullUser && fullUser.tier === 'FREE') {
      const verifiedTier = await verifyAndFulfillCheckout(userId);
      if (verifiedTier && verifiedTier !== 'FREE') {
        fullUser = { ...fullUser, tier: verifiedTier };
      }
    }

    // Fire-and-forget signup notification
    if (fullUser?.email) {
      sendSignupNotification(fullUser.email, fullUser.tier);
    }

    return successResponse({ success: true });
  } catch {
    return internalErrorResponse();
  }
}
