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
import { validateGoals } from '@/lib/study-goals';

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
    const {
      goals = {},
      scholarName,
      name,
      lineOfWork,
      fieldOfStudy,
      school,
    } = body as {
      goals?: unknown;
      scholarName?: string | null;
      name?: string | null;
      lineOfWork?: string | null;
      fieldOfStudy?: string | null;
      school?: string | null;
    };

    if (scholarName !== undefined && scholarName !== null) {
      if (typeof scholarName !== 'string' || scholarName.trim().length > 30) {
        return badRequestResponse('Mage name must be at most 30 characters');
      }
    }

    const validated = validateGoals(goals);
    if (!validated.ok) return badRequestResponse(validated.error);

    const data: Record<string, unknown> = {
      onboardingComplete: true,
      ...validated.data,
    };

    if (scholarName) data.scholarName = scholarName.trim();

    // Identity/personalization screens: first + last name are joined into
    // `name` ("First Last"); the context screen feeds `lineOfWork`.
    if (name !== undefined && name !== null) {
      if (typeof name !== 'string') {
        return badRequestResponse('name must be a string');
      }
      const trimmed = name.trim().slice(0, 100);
      if (trimmed) data.name = trimmed;
    }

    if (lineOfWork !== undefined && lineOfWork !== null) {
      if (typeof lineOfWork !== 'string' || lineOfWork.length > 100) {
        return badRequestResponse('lineOfWork must be at most 100 characters');
      }
      data.lineOfWork = lineOfWork.trim() || null;
    }

    if (fieldOfStudy !== undefined && fieldOfStudy !== null) {
      if (typeof fieldOfStudy !== 'string' || fieldOfStudy.length > 100) {
        return badRequestResponse('fieldOfStudy must be at most 100 characters');
      }
      data.fieldOfStudy = fieldOfStudy.trim() || null;
    }

    // School powers the onboarding "find classmates" peer suggestions — see
    // /api/schools/peers — and shows up on the public profile bento card.
    if (school !== undefined && school !== null) {
      if (typeof school !== 'string' || school.length > 100) {
        return badRequestResponse('school must be at most 100 characters');
      }
      data.school = school.trim() || null;
    }

    await db.user.update({
      where: { id: userId },
      data,
    });

    // Read user AFTER update for the freshest values.
    const fullUser = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, tier: true },
    });

    if (fullUser?.email) {
      sendSignupNotification(fullUser.email, fullUser.tier);
    }

    return successResponse({ success: true });
  } catch {
    return internalErrorResponse();
  }
}
