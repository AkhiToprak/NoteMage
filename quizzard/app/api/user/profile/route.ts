import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { Prisma } from '@prisma/client';
import { checkAndUnlockAchievements } from '@/lib/achievement-checker';
import { COSMETICS } from '@/lib/cosmetics/catalog';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

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
        customGreeting: true,
        scholarName: true,
        nameStyle: true,
        equippedTitleId: true,
        equippedFrameId: true,
        equippedBackgroundId: true,
        customBackgroundUrl: true,
        role: true,
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
    const {
      username,
      name,
      bio,
      dailyGoal,
      age,
      location,
      school,
      lineOfWork,
      profilePrivate,
      hideAchievements,
      customGreeting,
      scholarName,
      nameStyle,
      equippedTitleId,
      equippedFrameId,
      equippedBackgroundId,
      customBackgroundUrl,
    } = body;

    const data: Record<string, unknown> = {};

    if (username !== undefined) {
      if (typeof username !== 'string' || !USERNAME_REGEX.test(username)) {
        return badRequestResponse(
          'Username must be 3–20 characters: letters, numbers, underscores only'
        );
      }
      const normalized = username.toLowerCase();
      const existing = await db.user.findUnique({
        where: { username: normalized },
        select: { id: true },
      });
      if (existing && existing.id !== userId) {
        return badRequestResponse('This username is already taken');
      }
      data.username = normalized;
    }

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

    if (customGreeting !== undefined) {
      if (customGreeting === null) {
        data.customGreeting = null;
      } else if (typeof customGreeting !== 'string' || customGreeting.length > 120) {
        return badRequestResponse('Custom greeting must be a string of at most 120 characters');
      } else {
        data.customGreeting = customGreeting.trim() || null;
      }
    }

    if (scholarName !== undefined) {
      if (scholarName === null) {
        data.scholarName = null;
      } else if (typeof scholarName !== 'string' || scholarName.length > 30) {
        return badRequestResponse('Mage name must be a string of at most 30 characters');
      } else {
        data.scholarName = scholarName.trim() || null;
      }
    }

    // Cosmetic equipping. For each equip request we verify (1) the id exists
    // in the catalog and matches the expected type, and (2) the user owns it
    // via UserCosmetic. Ownership is checked in a single batched query at the
    // end of this block to avoid multiple round-trips.
    const cosmeticChecks: { field: string; value: string; expectedType: string }[] = [];

    if (nameStyle !== undefined) {
      if (nameStyle === null) {
        data.nameStyle = Prisma.JsonNull;
      } else if (
        typeof nameStyle !== 'object' ||
        Array.isArray(nameStyle) ||
        (nameStyle.fontId !== undefined && typeof nameStyle.fontId !== 'string') ||
        (nameStyle.colorId !== undefined && typeof nameStyle.colorId !== 'string')
      ) {
        return badRequestResponse('nameStyle must be { fontId?, colorId? }');
      } else {
        const cleaned: { fontId?: string; colorId?: string } = {};
        if (typeof nameStyle.fontId === 'string') {
          const entry = COSMETICS[nameStyle.fontId];
          if (!entry || entry.type !== 'nameFont') {
            return badRequestResponse('Unknown nameStyle.fontId');
          }
          cosmeticChecks.push({ field: 'nameStyle.fontId', value: nameStyle.fontId, expectedType: 'nameFont' });
          cleaned.fontId = nameStyle.fontId;
        }
        if (typeof nameStyle.colorId === 'string') {
          const entry = COSMETICS[nameStyle.colorId];
          if (!entry || entry.type !== 'nameColor') {
            return badRequestResponse('Unknown nameStyle.colorId');
          }
          cosmeticChecks.push({ field: 'nameStyle.colorId', value: nameStyle.colorId, expectedType: 'nameColor' });
          cleaned.colorId = nameStyle.colorId;
        }
        data.nameStyle = cleaned;
      }
    }

    const equippedFields: [
      'equippedTitleId' | 'equippedFrameId' | 'equippedBackgroundId',
      unknown,
      'title' | 'frame' | 'background',
    ][] = [
      ['equippedTitleId', equippedTitleId, 'title'],
      ['equippedFrameId', equippedFrameId, 'frame'],
      ['equippedBackgroundId', equippedBackgroundId, 'background'],
    ];
    for (const [field, value, expectedType] of equippedFields) {
      if (value === undefined) continue;
      if (value === null) {
        data[field] = null;
        continue;
      }
      if (typeof value !== 'string') {
        return badRequestResponse(`${field} must be a string or null`);
      }
      const entry = COSMETICS[value];
      if (!entry || entry.type !== expectedType) {
        return badRequestResponse(`Unknown ${field}`);
      }
      cosmeticChecks.push({ field, value, expectedType });
      data[field] = value;
    }

    // Admin-only: custom background URL. Must be a string that came from
    // /api/uploads/signed-url with purpose 'admin-background'. We don't
    // re-verify that path here (the upload endpoint already enforces admin
    // role) but we DO reject any non-admin caller trying to write this
    // field, so a regular user can't stick an arbitrary URL on their
    // profile by hand-crafting a PUT.
    if (customBackgroundUrl !== undefined) {
      const caller = await db.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (!caller || caller.role !== 'admin') {
        return badRequestResponse('customBackgroundUrl is admin-only');
      }
      if (customBackgroundUrl === null || customBackgroundUrl === '') {
        data.customBackgroundUrl = null;
      } else if (
        typeof customBackgroundUrl !== 'string' ||
        !/^https?:\/\//i.test(customBackgroundUrl) ||
        customBackgroundUrl.length > 2048
      ) {
        return badRequestResponse('customBackgroundUrl must be an http(s) URL');
      } else {
        data.customBackgroundUrl = customBackgroundUrl;
      }
    }

    // Ownership check: all referenced cosmetics must be in UserCosmetic for
    // this user. Allow-list the 'default' sentinels (level 1 entries) so
    // users can always revert to the default without owning a row — EXCEPT
    // adminOnly cosmetics, which also use `requiredLevel: 1` as a sort
    // sentinel but must never be treated as auto-owned.
    if (cosmeticChecks.length > 0) {
      const idsToCheck = cosmeticChecks
        .map((c) => c.value)
        .filter((id) => {
          const entry = COSMETICS[id];
          if (!entry) return false;
          if (entry.adminOnly) return true;
          return entry.requiredLevel > 1;
        });
      if (idsToCheck.length > 0) {
        const owned = await db.userCosmetic.findMany({
          where: { userId, cosmeticId: { in: idsToCheck } },
          select: { cosmeticId: true },
        });
        const ownedSet = new Set(owned.map((r) => r.cosmeticId));
        const missing = idsToCheck.find((id) => !ownedSet.has(id));
        if (missing) {
          return badRequestResponse(`You do not own cosmetic ${missing}`);
        }
      }
    }

    if (Object.keys(data).length === 0) {
      return badRequestResponse('No valid fields to update');
    }

    // Detect username change for "McLovin" achievement
    if (data.username !== undefined) {
      const currentUser = await db.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });
      if (currentUser && currentUser.username !== data.username) {
        data.usernameChanged = true;
      }
    }

    let updated;
    try {
      updated = await db.user.update({
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
          customGreeting: true,
          scholarName: true,
          nameStyle: true,
          equippedTitleId: true,
          equippedFrameId: true,
          equippedBackgroundId: true,
          customBackgroundUrl: true,
          role: true,
          createdAt: true,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return badRequestResponse('This username is already taken');
      }
      throw err;
    }

    // Fire achievement check for McLovin (username) and lay offs (mage name)
    checkAndUnlockAchievements(userId).catch(console.error);

    return successResponse(updated);
  } catch {
    return internalErrorResponse();
  }
}
