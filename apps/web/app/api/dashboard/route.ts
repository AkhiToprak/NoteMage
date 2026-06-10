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
    const todayUtcStart = new Date();
    todayUtcStart.setUTCHours(0, 0, 0, 0);
    const weekStart = getCurrentWeekStart();

    const [
      user,
      notebooks,
      todayPageCount,
      todayMinutesCount,
      weekNotesCount,
      weekChatsCount,
      weekPlans,
    ] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: {
          dailyGoal: true,
          dailyStudyMinutesGoal: true,
          weeklyStudyPlansGoal: true,
          weeklyNotesGoal: true,
          weeklyChatsGoal: true,
        },
      }),

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

      // Distinct from the weekly page.count below (different date field + window),
      // so the two counts can't be merged. Supporting index tracked in migration backlog.
      db.page.count({
        where: {
          updatedAt: { gte: todayStart },
          section: { notebook: { userId } },
        },
      }),

      db.studyMinute.count({
        where: { userId, minute: { gte: todayUtcStart } },
      }),

      db.page.count({
        where: {
          createdAt: { gte: weekStart },
          section: { notebook: { userId } },
        },
      }),

      db.notebookChat.count({
        where: {
          createdAt: { gte: weekStart },
          notebook: { userId },
        },
      }),

      db.studyPlan.findMany({
        where: {
          notebook: { userId },
          createdAt: { lte: new Date() },
          phases: { some: {} },
        },
        select: {
          phases: { select: { status: true, updatedAt: true } },
        },
      }),
    ]);

    const weekPlansCompleted = weekPlans.filter((plan) => {
      if (plan.phases.length === 0) return false;
      if (!plan.phases.every((phase) => phase.status === 'completed')) return false;
      const lastUpdated = plan.phases.reduce(
        (latest, phase) => (phase.updatedAt > latest ? phase.updatedAt : latest),
        plan.phases[0].updatedAt
      );
      return lastUpdated >= weekStart;
    }).length;

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
      goals: {
        dailyStudyMinutes: user?.dailyStudyMinutesGoal ?? null,
        weeklyStudyPlans: user?.weeklyStudyPlansGoal ?? null,
        weeklyNotes: user?.weeklyNotesGoal ?? null,
        weeklyChats: user?.weeklyChatsGoal ?? null,
      },
      progress: {
        todayStudyMinutes: todayMinutesCount,
        weekStudyPlansCompleted: weekPlansCompleted,
        weekNotesCreated: weekNotesCount,
        weekChatsCreated: weekChatsCount,
      },
    });
  } catch {
    return internalErrorResponse();
  }
}
