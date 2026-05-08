import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

const VALID_STEPS = new Set([
  'idle',
  'welcome',
  'step-1-dashboard',
  'step-2-notebook-form',
  'step-3-workspace',
  'step-4-chat-modal',
  'complete',
]);

interface TutorialStateShape {
  step?: string;
  completedAt?: string;
  dismissedAt?: string;
  seenShowcases?: string[];
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = (await request.json().catch(() => ({}))) as {
      step?: string;
      dismissedAt?: string | null;
      reset?: boolean;
      markShowcaseSeen?: string;
    };

    if (body.reset === true) {
      const reset = await db.user.update({
        where: { id: userId },
        data: { tutorialState: Prisma.JsonNull },
        select: { tutorialState: true },
      });
      return successResponse({ tutorialState: reset.tutorialState ?? {} });
    }

    if (body.step !== undefined && !VALID_STEPS.has(body.step)) {
      return badRequestResponse('Invalid tutorial step');
    }

    const existing = await db.user.findUnique({
      where: { id: userId },
      select: { tutorialState: true },
    });
    const current = (existing?.tutorialState ?? {}) as TutorialStateShape;

    const next: TutorialStateShape = { ...current };
    if (body.step !== undefined) next.step = body.step;
    if (body.dismissedAt !== undefined) {
      if (body.dismissedAt === null) {
        delete next.dismissedAt;
      } else {
        next.dismissedAt = body.dismissedAt;
      }
    }
    if (
      typeof body.markShowcaseSeen === 'string' &&
      body.markShowcaseSeen.length > 0 &&
      body.markShowcaseSeen.length <= 64
    ) {
      const seen = Array.isArray(current.seenShowcases) ? [...current.seenShowcases] : [];
      if (!seen.includes(body.markShowcaseSeen)) {
        seen.push(body.markShowcaseSeen);
      }
      next.seenShowcases = seen;
    }

    const updated = await db.user.update({
      where: { id: userId },
      data: { tutorialState: next as unknown as Prisma.InputJsonValue },
      select: { tutorialState: true },
    });

    return successResponse({ tutorialState: updated.tutorialState ?? {} });
  } catch {
    return internalErrorResponse();
  }
}
