import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

function getCurrentWeekStart(): Date {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = getCurrentWeekStart();

    const [user, notebooks, todayPageCount, studyGoals] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: { dailyGoal: true },
      }),

      // Recent 3 notebooks sorted by last updated
      db.notebook.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 3,
        select: {
          id: true,
          name: true,
          subject: true,
          color: true,
          updatedAt: true,
          _count: { select: { sections: true } },
          sections: {
            select: { _count: { select: { pages: true } } },
          },
        },
      }),

      // Pages updated today across all user's notebooks
      db.page.count({
        where: {
          updatedAt: { gte: todayStart },
          section: {
            notebook: { userId },
          },
        },
      }),

      // Current week's study goals
      db.studyGoal.findMany({
        where: { userId, weekStart },
        select: { type: true, target: true, current: true },
      }),
    ]);

    const recentActivity = notebooks.map((nb) => {
      const totalPages = nb.sections.reduce((sum, s) => sum + s._count.pages, 0);
      return {
        id: nb.id,
        name: nb.name,
        subject: nb.subject,
        color: nb.color,
        updatedAt: nb.updatedAt.toISOString(),
        pageCount: totalPages,
      };
    });

    return successResponse({
      dailyGoal: user?.dailyGoal ?? 10,
      todayPages: todayPageCount,
      recentActivity,
      studyGoals: studyGoals.map((g) => ({ type: g.type, target: g.target, current: g.current })),
    });
  } catch {
    return internalErrorResponse();
  }
}
