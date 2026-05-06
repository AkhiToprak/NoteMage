import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { awardXP } from '@/lib/xp';
import { checkAndUnlockAchievements } from '@/lib/achievement-checker';
import {
  createdResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ id: string; sectionId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, sectionId } = await params;

    const notebook = await db.notebook.findFirst({
      where: { id: notebookId, userId },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    const section = await db.section.findFirst({
      where: { id: sectionId, notebookId },
    });
    if (!section) return notFoundResponse('Section not found in this notebook');

    const body = await request.json();
    const { title, pageType } = body;

    const maxOrder = await db.page.aggregate({
      where: { sectionId },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

    const page = await db.page.create({
      data: {
        sectionId,
        title: title || 'Untitled',
        pageType: pageType === 'canvas' ? 'canvas' : 'text',
        sortOrder,
      },
    });

    // Award XP and check achievements (fire-and-forget)
    awardXP(userId, 'page_created').catch(console.error);
    checkAndUnlockAchievements(userId).catch(console.error);

    return createdResponse(page);
  } catch {
    return internalErrorResponse();
  }
}
