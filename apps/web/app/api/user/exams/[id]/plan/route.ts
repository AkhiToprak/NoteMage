import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  notFoundResponse,
  unauthorizedResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { costRateLimit, rateLimitKey } from '@/lib/rate-limit';
import { checkTokenBudget } from '@/lib/token-budget';
import { reserveUsage, refundUsage } from '@/lib/usage-limits';
import { mageGenerationActionsEnabled } from '@/lib/feature-flags';
import { loadExamReadiness } from '@/lib/exam-scope';
import {
  generateExamStudyPlan,
  loadActiveExamPlanView,
  rescheduleActivePlan,
  setPlanItemStatus,
  markTodayDone,
  clampDailyMinutes,
  DEFAULT_DAILY_MINUTES,
} from '@/lib/exam-study-plan';

type Params = { params: Promise<{ id: string }> };

/**
 * Exam Mode (Phase 4) — study-plan endpoints for one exam.
 *
 * GET   — the active plan view (+ exam meta + readiness) for Today's plan + the
 *         calendar. `plan: null` drives the "No study plan" empty state.
 * POST   — generate / regenerate. Free tier gets the deterministic plan (no
 *         tokens); PRO opts into the Mage ordering+rationale pass, metered on
 *         `ai_study_plan` with refund-on-failure. Mirrors the mock route's
 *         security (auth · kill-switch · cost rate-limit · monthly token budget).
 * PATCH  — cheap deterministic adjustments (no AI): reschedule by daily-minutes,
 *         set a task's status, or log today complete.
 */

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: examId } = await params;
    const readiness = await loadExamReadiness(userId, examId);
    if (!readiness) return notFoundResponse('Exam not found');

    const plan = await loadActiveExamPlanView(userId, examId, readiness);
    const primaryPath = readiness.readiness.items.find((it) => it.type === 'path') ?? null;

    return successResponse({
      exam: readiness.exam,
      daysUntil: readiness.daysUntil,
      readiness: readiness.readiness.hasGradedMaterial ? readiness.readiness.readiness : 0,
      hasGradedMaterial: readiness.readiness.hasGradedMaterial,
      hasScope: !readiness.readiness.isEmpty,
      primaryPathId: primaryPath?.id ?? null,
      plan,
    });
  } catch (error) {
    console.error('[exams/:id/plan GET]', error);
    return internalErrorResponse();
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    if (!mageGenerationActionsEnabled()) {
      return notFoundResponse('Study plans are unavailable.');
    }

    const { id: examId } = await params;

    // Regeneration spends tokens (PRO) and DB work (all) — throttle hard.
    const limit = await costRateLimit(rateLimitKey('exam-study-plan', request, userId), 8, 60_000);
    if (!limit.success) {
      return tooManyRequestsResponse('Too many plan requests. Please slow down.', limit.retryAfterMs);
    }

    const { allowed: tokenAllowed, tokenLimit, tier } = await checkTokenBudget(userId);
    if (!tokenAllowed) {
      return tooManyRequestsResponse(
        `Monthly token limit reached (${tokenLimit.toLocaleString()} tokens). Resets on the 1st of next month.`,
      );
    }

    // Ownership — fail closed before any work.
    const exam = await db.exam.findFirst({ where: { id: examId, userId }, select: { id: true } });
    if (!exam) return notFoundResponse('Exam not found');

    const body = (await request.json().catch(() => ({}))) as { dailyMinutesTarget?: unknown };
    const dailyMinutesTarget = body.dailyMinutesTarget != null ? clampDailyMinutes(body.dailyMinutesTarget) : DEFAULT_DAILY_MINUTES;

    // PRO gates the Mage AI pass; free tier always gets the deterministic plan.
    const useAi = tier !== 'FREE';

    // Reserve the AI meter only when we'll actually call Mage (refunded on
    // failure so a failed build never burns an allowance). PRO is pass-through.
    if (useAi) {
      const reservation = await reserveUsage(userId, 'ai_study_plan');
      if (!reservation.allowed) {
        return tooManyRequestsResponse('You have used up your study-plan allowance for this month.');
      }
    }

    try {
      const result = await generateExamStudyPlan({ userId, examId, dailyMinutesTarget, useAi });
      if (!result.ok) {
        if (useAi) await refundUsage(userId, 'ai_study_plan').catch(() => {});
        if (result.code === 'no_material') {
          return badRequestResponse('Add some paths or quizzes to this exam’s coverage first.');
        }
        return notFoundResponse('Exam not found');
      }
      return successResponse({ plan: result.view });
    } catch (err) {
      if (useAi) await refundUsage(userId, 'ai_study_plan').catch(() => {});
      console.error('[exams/:id/plan POST] generation failed', err);
      return internalErrorResponse("Mage couldn't build a study plan right now. Try again in a moment.");
    }
  } catch (error) {
    console.error('[exams/:id/plan POST]', error);
    return internalErrorResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: examId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      dailyMinutesTarget?: unknown;
      itemId?: unknown;
      status?: unknown;
    };

    let view = null;
    switch (body.action) {
      case 'set_daily_minutes':
        view = await rescheduleActivePlan(userId, examId, clampDailyMinutes(body.dailyMinutesTarget));
        break;
      case 'set_item_status': {
        const itemId = typeof body.itemId === 'string' ? body.itemId : '';
        const status = body.status === 'in_progress' || body.status === 'done' || body.status === 'not_started' ? body.status : null;
        if (!itemId || !status) return badRequestResponse('itemId and a valid status are required.');
        view = await setPlanItemStatus(userId, examId, itemId, status);
        break;
      }
      case 'mark_today_done':
        view = await markTodayDone(userId, examId);
        break;
      default:
        return badRequestResponse('Unknown action.');
    }

    if (!view) return notFoundResponse('No active study plan for this exam.');
    return successResponse({ plan: view });
  } catch (error) {
    console.error('[exams/:id/plan PATCH]', error);
    return internalErrorResponse();
  }
}
