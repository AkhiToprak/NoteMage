import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        bio: true,
        avatarUrl: true,
        dailyGoal: true,
        age: true,
        location: true,
        school: true,
        lineOfWork: true,
        profilePrivate: true,
        hideAchievements: true,
        createdAt: true,
      },
    });

    if (!user) return unauthorizedResponse();

    return successResponse(user);
  } catch {
    return internalErrorResponse();
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const { name, bio, dailyGoal, age, location, school, lineOfWork, profilePrivate, hideAchievements } = body;

    const data: Record<string, unknown> = {};

    if (name !== undefined) {
      if (name === null) {
        data.name = null;
      } else if (typeof name !== 'string' || name.length > 100) {
        return badRequestResponse('Name must be a string of at most 100 characters');
      } else {
        data.name = name.trim() || null;
      }
    }

    if (bio !== undefined) {
      if (bio === null) {
        data.bio = null;
      } else if (typeof bio !== 'string' || bio.length > 160) {
        return badRequestResponse('Bio must be a string of at most 160 characters');
      } else {
        data.bio = bio.trim() || null;
      }
    }

    if (dailyGoal !== undefined) {
      if (typeof dailyGoal !== 'number' || dailyGoal < 1 || dailyGoal > 200) {
        return badRequestResponse('dailyGoal must be a number between 1 and 200');
      }
      data.dailyGoal = Math.round(dailyGoal);
    }

    if (age !== undefined) {
      if (age === null) {
        data.age = null;
      } else if (typeof age !== 'number' || age < 1 || age > 150 || !Number.isInteger(age)) {
        return badRequestResponse('Age must be an integer between 1 and 150');
      } else {
        data.age = age;
      }
    }

    if (location !== undefined) {
      if (location === null) {
        data.location = null;
      } else if (typeof location !== 'string' || location.length > 100) {
        return badRequestResponse('Location must be at most 100 characters');
      } else {
        data.location = location.trim() || null;
      }
    }

    if (school !== undefined) {
      if (school === null) {
        data.school = null;
      } else if (typeof school !== 'string' || school.length > 100) {
        return badRequestResponse('School must be at most 100 characters');
      } else {
        data.school = school.trim() || null;
      }
    }

    if (lineOfWork !== undefined) {
      if (lineOfWork === null) {
        data.lineOfWork = null;
      } else if (typeof lineOfWork !== 'string' || lineOfWork.length > 100) {
        return badRequestResponse('Line of work must be at most 100 characters');
      } else {
        data.lineOfWork = lineOfWork.trim() || null;
      }
    }

    if (profilePrivate !== undefined) {
      if (typeof profilePrivate !== 'boolean') {
        return badRequestResponse('profilePrivate must be a boolean');
      }
      data.profilePrivate = profilePrivate;
    }

    if (hideAchievements !== undefined) {
      if (typeof hideAchievements !== 'boolean') {
        return badRequestResponse('hideAchievements must be a boolean');
      }
      data.hideAchievements = hideAchievements;
    }

    if (Object.keys(data).length === 0) {
      return badRequestResponse('No valid fields to update');
    }

    const updated = await db.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        username: true,
        name: true,
        bio: true,
        avatarUrl: true,
        dailyGoal: true,
        age: true,
        location: true,
        school: true,
        lineOfWork: true,
        profilePrivate: true,
        hideAchievements: true,
        createdAt: true,
      },
    });

    return successResponse(updated);
  } catch {
    return internalErrorResponse();
  }
}
