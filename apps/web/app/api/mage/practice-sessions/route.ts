import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { costRateLimit, rateLimitKey } from '@/lib/rate-limit';
import { checkTokenBudget } from '@/lib/token-budget';
import { reserveUsage, refundUsage } from '@/lib/usage-limits';
import { mageGenerationActionsEnabled } from '@/lib/feature-flags';
import { expandMageContext } from '@/lib/mage-context';
import type { MageActionId, MageClientContext } from '@/lib/mage-types';
import {
  assemblePracticeQuiz,
  getOrCreatePracticeNotebook,
  loadPracticeFocus,
  persistPracticeQuizSet,
  practiceOriginForAction,
  practiceQuizCount,
} from '@/lib/practice-generator';

/**
 * POST /api/mage/practice-sessions — execute a medium-risk "generate" Mage
 * action (Phase 7). The panel confirms the card, then POSTs `{ action, context }`.
 *
 * Security (decision 5 / R5 — never trust that an action was offered):
 *   1. auth + global cost rate limit + monthly token budget,
 *   2. RE-AUTHORIZE the thin client context via `expandMageContext` (drops ids
 *      the user doesn't own) and only proceed if the requested action is in the
 *      server's freshly-derived `allowedActions` for that context (this also
 *      re-enforces the Pro gate — generation actions are never offered to FREE),
 *   3. RE-RESERVE the `ai_quizzes` quota atomically (refunded if generation
 *      fails), so offering a card can never bypass the meter.
 *
 * On success it assembles a focused `QuizSet` under the hidden practice notebook
 * and returns its deep link; the learner takes it through the EXISTING study-pack
 * quiz viewer, graded by the canonical attempt route (zero new grading code).
 */
const PRACTICE_ACTIONS: ReadonlySet<string> = new Set<MageActionId>([
  'START_WEAK_TOPIC_SESSION',
  'START_EXAM_SIMULATION',
  'CREATE_PRACTICE_SET',
]);

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Kill-switch: with generation cards pulled, a stray POST 404s.
    if (!mageGenerationActionsEnabled()) {
      return notFoundResponse('Practice sessions are unavailable.');
    }

    // Generation spends real tokens — throttle harder than the chat send.
    const limit = await costRateLimit(rateLimitKey('mage-practice', request, userId), 10, 60_000);
    if (!limit.success) {
      return tooManyRequestsResponse('Too many practice requests. Please slow down.', limit.retryAfterMs);
    }

    const { allowed: tokenAllowed, tokenLimit, tier } = await checkTokenBudget(userId);
    if (!tokenAllowed) {
      return tooManyRequestsResponse(
        `Monthly token limit reached (${tokenLimit.toLocaleString()} tokens). Resets on the 1st of next month.`
      );
    }

    const body = await request.json().catch(() => ({}));
    const { action, context } = body as { action?: string; context?: MageClientContext };

    if (!action || typeof action !== 'string' || !PRACTICE_ACTIONS.has(action)) {
      return badRequestResponse('Unknown or unsupported practice action.');
    }
    const origin = practiceOriginForAction(action as MageActionId);
    if (!origin) return badRequestResponse('Unknown or unsupported practice action.');

    // Re-authorize the client context + re-derive the server's action menu.
    const resolved = await expandMageContext(userId, context ?? null, { tier });
    if (!resolved.allowedActions.includes(action as MageActionId)) {
      // Not offered for this (authorized) context — Pro gate, missing ids, or a
      // forged request. Never trust the client that the card was on the menu.
      return forbiddenResponse('That practice action is not available here.');
    }

    // Gather the focus pool + corpus from the authorized ids.
    const focus = await loadPracticeFocus(userId, origin, resolved.ids);
    if (!focus) {
      return badRequestResponse(
        "There isn't enough studied material here yet to build a practice set."
      );
    }

    // Re-reserve the generation quota atomically. PRO is unlimited (pass-through);
    // refunded below if the AI call fails so a failure never burns an allowance.
    const reservation = await reserveUsage(userId, 'ai_quizzes');
    if (!reservation.allowed) {
      return tooManyRequestsResponse(
        'You have used up your quiz-generation allowance for this month.'
      );
    }

    const session = await db.practiceSession.create({
      data: {
        userId,
        origin,
        examId: focus.examId ?? null,
        sourcePathId: focus.sourcePathId ?? null,
        status: 'assembling',
      },
      select: { id: true },
    });

    try {
      const parsed = await assemblePracticeQuiz({
        userId,
        tier,
        corpus: focus.corpus,
        focusTopics: focus.focusTopics,
        subject: focus.subject,
        title: focus.title,
        count: practiceQuizCount(origin),
        origin,
      });
      const notebookId = await getOrCreatePracticeNotebook(userId);
      const quizSetId = await persistPracticeQuizSet(userId, notebookId, parsed);

      await db.practiceSession.update({
        where: { id: session.id },
        data: { quizSetId, status: 'ready' },
      });

      return successResponse({
        sessionId: session.id,
        quizSetId,
        notebookId,
        questionCount: parsed.questions.length,
        quizUrl: `/study-packs/${notebookId}/quizzes/${quizSetId}`,
      });
    } catch (err) {
      // Generation failed — refund the reservation so it costs the learner
      // nothing, and leave the session row in `assembling` for diagnostics.
      await refundUsage(userId, 'ai_quizzes').catch(() => {});
      console.error('[mage/practice-sessions] generation failed', err);
      return internalErrorResponse("Mage couldn't build a practice set right now. Try again in a moment.");
    }
  } catch (error) {
    console.error('[mage/practice-sessions POST]', error);
    return internalErrorResponse();
  }
}
