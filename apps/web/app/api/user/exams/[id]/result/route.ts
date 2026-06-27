import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import {
  successResponse,
  badRequestResponse,
  notFoundResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import {
  loadResultEntryContext,
  recordExamResult,
  saveExamReflection,
} from '@/lib/exam-result';
import { isOutcome, isDifficulty } from '@/lib/exam-result-core';

type Params = { params: Promise<{ id: string }> };

/**
 * Exam Mode (Phase 5) — post-exam result endpoints for one exam.
 *
 * GET   — the result-entry context (exam meta + the learner's grading system +
 *         target + any existing result) so the stepper renders in their system.
 * POST  — record / update the result. Converts the entered grade to the neutral
 *         scale, defaults the outcome from the pass mark, returns the values the
 *         client needs to branch to celebration / reflection / report. No AI.
 * PATCH — save the reflection ("what went wrong") reasons + Mage's deterministic
 *         take onto the result. No AI, no meter.
 */

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();
    const { id: examId } = await params;
    const ctx = await loadResultEntryContext(userId, examId);
    if (!ctx) return notFoundResponse('Exam not found');
    return successResponse(ctx);
  } catch (error) {
    console.error('[exams/:id/result GET]', error);
    return internalErrorResponse();
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();
    const { id: examId } = await params;

    const body = (await request.json().catch(() => ({}))) as {
      gradeValue?: unknown;
      outcome?: unknown;
      difficultyFelt?: unknown;
      notes?: unknown;
    };

    const gradeValue =
      typeof body.gradeValue === 'number' || typeof body.gradeValue === 'string' ? body.gradeValue : null;
    if (gradeValue === null || (typeof gradeValue === 'string' && gradeValue.trim() === '')) {
      return badRequestResponse('A grade is required.');
    }

    const result = await recordExamResult(userId, examId, {
      gradeValue,
      outcome: isOutcome(body.outcome) ? body.outcome : undefined,
      difficultyFelt: isDifficulty(body.difficultyFelt) ? body.difficultyFelt : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
    });
    if (!result) return notFoundResponse('Exam not found');
    return successResponse(result);
  } catch (error) {
    console.error('[exams/:id/result POST]', error);
    return internalErrorResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();
    const { id: examId } = await params;

    const body = (await request.json().catch(() => ({}))) as { action?: string; reasons?: unknown };
    if (body.action !== 'reflection') return badRequestResponse('Unknown action.');

    const reasons = Array.isArray(body.reasons) ? body.reasons.filter((r): r is string => typeof r === 'string') : [];
    const saved = await saveExamReflection(userId, examId, reasons);
    if (!saved) return notFoundResponse('Record an exam result before reflecting on it.');
    return successResponse(saved);
  } catch (error) {
    console.error('[exams/:id/result PATCH]', error);
    return internalErrorResponse();
  }
}
