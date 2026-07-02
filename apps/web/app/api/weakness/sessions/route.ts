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
import { weaknessTrainingUiEnabled } from '@/lib/feature-flags';
import { deriveConceptMisconception } from '@/lib/concept-misconception';
import { getOrCreatePracticeNotebook } from '@/lib/practice-generator';
import {
  findReusableSessionForConcept,
  generateWeaknessSession,
  getConceptsOnCooldown,
  persistWeaknessQuizSet,
  pickSessionConcepts,
  recordWeaknessSession,
} from '@/lib/weakness-session-generator';

/**
 * POST /api/weakness/sessions — Weakness Training Phase 1B (plan §5, §7.2).
 *
 * Generates a remediation session (re-teach + discriminate + graded re-test
 * per concept, §5.2/§6.4) for one or more of the learner's current weak/rusty
 * concepts, persists it as a `QuizSet`, and returns the deep link the client
 * navigates to. Mirrors `/api/mage/practice-sessions`'s enforcement order:
 *
 *   1. auth,
 *   2. `weaknessTrainingUiEnabled()` kill-switch (404 when off),
 *   3. monthly token budget,
 *   4. server-side Pro gate (§7.2 — viewing weak spots is free, generating a
 *      session is Pro-only; never trust a client-offered action),
 *   5. request-body validation,
 *   6. reuse-before-generate (§5.4) — re-offer the most recent ready/completed
 *      session (<24h) that already covers the requested concept, BEFORE any
 *      quota/rate-limit spend,
 *   7. per-concept cooldown (§5.5) — 429 when the requested concept was
 *      trained within the last 2h,
 *   8. concept selection off the SAME canonical `deriveConceptWeakAreas`
 *      ranking the Weak Spots page reads, with cooldown concepts excluded
 *      from the additional fill slots,
 *   9. the 5/24h anti-farming rate limit (§5.5) — placed AFTER concept
 *      selection so only genuine generation attempts consume a slot,
 *  10. the `ai_quizzes` quota reservation (refunded on any generation
 *      failure so a failed build never costs the learner anything),
 *  11. best-effort misconception lookup (§2.3 tier 1 — never blocks),
 *  12. generate + persist, wrapped so a failure refunds the reservation;
 *      on success, best-effort record the `WeaknessTrainingSession` row that
 *      powers reuse/cooldown for future requests (never fails the response).
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    if (!weaknessTrainingUiEnabled()) {
      return notFoundResponse('Weakness training is unavailable.');
    }

    const { allowed: tokenAllowed, tokenLimit, tier } = await checkTokenBudget(userId);
    if (!tokenAllowed) {
      return tooManyRequestsResponse(
        `Monthly token limit reached (${tokenLimit.toLocaleString()} tokens). Resets on the 1st of next month.`
      );
    }

    // Pro gate (§7.2) — generation is Pro-only; viewing weak spots stays free.
    // `checkTokenBudget` already resolves admins to `tier: 'PRO'` (see
    // token-budget.ts), so a single `tier === 'FREE'` check — the same
    // predicate used at `/api/user/exams/[id]/mock` — covers both the
    // role-admin bypass and the plain free-tier rejection without a second
    // DB read for `role`.
    if (tier === 'FREE') {
      return forbiddenResponse('Training sessions are a Pro feature.');
    }

    const body = await request.json().catch(() => ({}));
    const { conceptId } = body as { conceptId?: unknown };
    if (typeof conceptId !== 'string' || conceptId.trim().length === 0) {
      return badRequestResponse('conceptId is required.');
    }

    const now = new Date();
    const trimmedConceptId = conceptId.trim();

    // Reuse-before-generate (§5.4) — BEFORE any quota/rate-limit spend.
    const reuse = await findReusableSessionForConcept(userId, trimmedConceptId, now);
    if (reuse) {
      return successResponse({
        quizSetId: reuse.quizSetId,
        notebookId: reuse.notebookId,
        conceptCount: 1,
        reused: true,
        quizUrl: `/practice/session/${reuse.notebookId}/${reuse.quizSetId}?origin=remediation`,
      });
    }

    // Per-concept cooldown (§5.5) — a just-trained concept can't be re-targeted yet.
    const cooldownSet = await getConceptsOnCooldown(userId, now);
    if (cooldownSet.has(trimmedConceptId)) {
      return tooManyRequestsResponse(
        "You just trained this — take a short break before training it again."
      );
    }

    const targets = await pickSessionConcepts(userId, trimmedConceptId, now, cooldownSet);
    if (targets.length === 0) {
      return badRequestResponse("No weak concepts to train right now.");
    }

    // Anti-farming cap (§5.5) — placed here, after concept selection, so a
    // request that never had anything to train doesn't burn one of the 5.
    const limit = await costRateLimit(rateLimitKey('weakness-session', request, userId), 5, 24 * 60 * 60 * 1000);
    if (!limit.success) {
      return tooManyRequestsResponse(
        "You've reached today's training limit. Try again later.",
        limit.retryAfterMs
      );
    }

    const reservation = await reserveUsage(userId, 'ai_quizzes');
    if (!reservation.allowed) {
      return tooManyRequestsResponse('You have used up your quiz-generation allowance for this month.');
    }

    // Best-effort misconception lookup (§2.3) — never blocks generation.
    // Prefer the stored tier-2 (LLM-confirmed, de-personalised) label on
    // `ConceptMastery.misconceptionLabel` when present; fall back to the
    // tier-1 deterministic dominant-distractor line otherwise. Tier 2 is
    // async/cooldown-gated so it may not exist yet for a freshly-weak
    // concept — that's expected, not an error.
    const misconceptionByConceptId = new Map<string, string>();
    try {
      const masteryRows = await db.conceptMastery.findMany({
        where: { userId, conceptId: { in: targets.map((t) => t.conceptId) } },
        select: { conceptId: true, misconceptionLabel: true },
      });
      for (const row of masteryRows) {
        if (row.misconceptionLabel) misconceptionByConceptId.set(row.conceptId, row.misconceptionLabel);
      }
    } catch (error) {
      console.error('[weakness/sessions] tier-2 misconception lookup failed', error);
      // Best-effort — fall through to tier-1 for every concept below.
    }

    for (const t of targets) {
      if (misconceptionByConceptId.has(t.conceptId)) continue; // tier-2 label already present
      try {
        const m = await deriveConceptMisconception(t.conceptId);
        if (m) misconceptionByConceptId.set(t.conceptId, m.line);
      } catch {
        // Best-effort — skip this concept's misconception line, never block.
      }
    }

    try {
      const notebookId = await getOrCreatePracticeNotebook(userId);
      const parsed = await generateWeaknessSession({
        userId,
        tier,
        concepts: targets,
        misconceptionByConceptId,
      });
      const quizSetId = await persistWeaknessQuizSet(userId, notebookId, parsed);

      // Record ONLY the concepts that survived AI-output validation and were
      // actually persisted into the QuizSet (`parsed.concepts`), never the
      // pre-generation `targets`. A target whose reteach/discriminate/retest
      // failed validation is dropped by parseWeaknessSession, so recording it
      // here would (a) put a concept with zero session content on the cooldown/
      // reuse window and (b) let a later request "reuse" a QuizSet that trains
      // nothing for it. Cooldown/reuse/achievement bookkeeping must mirror the
      // as-delivered concepts.
      const persistedConceptIds = parsed.concepts.map((c) => c.conceptId);
      const planIdByConcept = new Map(targets.map((t) => [t.conceptId, t.planId]));
      const sourcePathId =
        persistedConceptIds.map((id) => planIdByConcept.get(id)).find((p) => p != null) ?? null;

      // Best-effort session record (§5.4/§5.5 reuse + cooldown bookkeeping) —
      // a failure here must never fail the already-successful response.
      try {
        await recordWeaknessSession(userId, {
          conceptIds: persistedConceptIds,
          quizSetId,
          sourcePathId,
        });
      } catch (e) {
        console.error('[weakness/sessions] recordWeaknessSession failed', e);
      }

      return successResponse({
        quizSetId,
        notebookId,
        conceptCount: persistedConceptIds.length,
        reused: false,
        quizUrl: `/practice/session/${notebookId}/${quizSetId}?origin=remediation`,
      });
    } catch (err) {
      await refundUsage(userId, 'ai_quizzes').catch(() => {});
      console.error('[weakness/sessions] generation failed', err);
      return internalErrorResponse("Couldn't build a training session right now. Try again.");
    }
  } catch (error) {
    console.error('[weakness/sessions POST]', error);
    return internalErrorResponse();
  }
}
