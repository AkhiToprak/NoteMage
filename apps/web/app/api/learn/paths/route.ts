import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
  tooManyRequestsResponse,
  paymentRequiredResponse,
} from '@/lib/api-response';
import { generatePathStructure } from '@/lib/path-generator';
import { persistPlanStructure } from '@/lib/persist-plan-structure';
import { invalidateDashboardCache } from '@/lib/dashboard-data';
import { loadMaterialCorpus, renderMaterialCorpus } from '@/lib/path-corpus';
import { pathContentCap } from '@/lib/path-corpus-fit';
import { loadPathsForUser, serializePath, staleGenerationCutoff } from '@/lib/path-loader';
import { checkUsageLimit, incrementUsage } from '@/lib/usage-limits';
import { costRateLimit, rateLimitKey } from '@/lib/rate-limit';
import { acquireRedisLock, stableHash } from '@/lib/redis-cache';
import { checkTokenBudget } from '@/lib/token-budget';
import type { PathStructureToolInput } from '@/lib/ai-tools';
import { classifySubjects } from '@/lib/path-classifier';
import { normalizePathLanguage } from '@/lib/path-languages';
import { logTelemetry } from '@/lib/telemetry-server';
import { enqueueJob } from '@/lib/background-jobs';

// Phase 10.3 — POST kicks off the two-stage AI path generation. Stage A
// (one inline AI call → `create_path_structure`) returns the section /
// slot skeleton in ~3–5s. We persist the plan + phases + empty slots in
// one transaction with `generationStatus: 'generating'`, then enqueue
// Stage B as a durable background job that fills theory / flashcards /
// quiz activities per slot. The route returns immediately so the client
// can connect to the SSE `/generation` endpoint and watch progress.

// ─────────────────────────────────────────────────────────────────────
// GET — list every plan with annotated slot/activity tree.
// ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const plans = await loadPathsForUser(userId);
    return successResponse(plans.map(serializePath));
  } catch (error) {
    console.error('[learn/paths GET]', error);
    return internalErrorResponse();
  }
}

// ─────────────────────────────────────────────────────────────────────
// POST — create a path (Stage A inline + Stage B queued).
// ─────────────────────────────────────────────────────────────────────

interface CreatePathBody {
  title?: string;
  brief?: string;
  contextNotebookIds?: string[];
  primaryNotebookId?: string | null;
  materialIds?: string[];
  ultra?: boolean;
  /** Per-path Gemini override. Forces every stage through Gemini 2.5
   *  Flash for this generation, regardless of PATH_PROVIDER env vars or
   *  the ultra flag. Toggle from the path-creation UI for testing. */
  gemini?: boolean;
  /** Author-selected content language (BCP-47 lowercase). Persisted as
   *  StudyPlan.language. Validated against the supported set; junk falls
   *  back to 'en'. */
  language?: string;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Bound bursts on this high-COGS AI route. checkUsageLimit/incrementUsage are
    // non-atomic (the increment lands only after the AI call), so without a limiter
    // a rapid burst could slip extra generations past the meter and run up COGS.
    // costRateLimit fails CLOSED in prod so a Redis outage can't uncap the spend.
    const burst = await costRateLimit(rateLimitKey('path-create', request, userId), 5, 60_000);
    if (!burst.success) {
      return tooManyRequestsResponse(
        'Too many path generations in a short window. Please wait a moment and try again.',
        burst.retryAfterMs
      );
    }

    // Per-user concurrent-generation cap. The burst limiter above bounds the
    // request rate, but a user could still hold many Stage-B orchestrators
    // in flight at once, multiplying live
    // COGS. Cap live `generating` runs at 3. Stale rows (a dead orchestrator
    // killed mid-run by a redeploy) don't count — they're reclaimable by
    // regenerate and would otherwise wedge the user out forever.
    const MAX_CONCURRENT_GENERATIONS = 3;
    const liveGenerating = await db.studyPlan.count({
      where: {
        userId,
        generationStatus: 'generating',
        updatedAt: { gte: staleGenerationCutoff() },
      },
    });
    if (liveGenerating >= MAX_CONCURRENT_GENERATIONS) {
      return tooManyRequestsResponse(
        'You already have several paths generating. Wait for one to finish, then try again.'
      );
    }

    const body = (await request.json().catch(() => ({}))) as CreatePathBody;
    const title = body.title?.trim().slice(0, 200);
    if (!title) return badRequestResponse('Title is required');

    const ultra = body.ultra === true;
    const gemini = body.gemini === true;
    // Author-selected language → StudyPlan.language. The creation UI offers
    // the supported set; anything else (or absent) normalises to 'en'.
    const language = normalizePathLanguage(body.language);

    // Usage gate. Ultra paths draw from a separate Pro-only monthly meter
    // (Free's ultra_path limit is 0, so a Free user is rejected here too —
    // defence in depth behind the greyed-out modal toggle). Non-ultra paths
    // use the shared ai_study_plan meter, which also covers the chat-driven
    // path creation flow.
    const usageFeature = ultra ? 'ultra_path' : 'ai_study_plan';
    const usage = await checkUsageLimit(userId, usageFeature);
    if (!usage.allowed) {
      // FREE's ai_study_plan limit is 0 (AI path generation is Pro-only). A 0
      // limit on the non-ultra meter can only mean a FREE user — admins return
      // allowed:true and PRO is unlimited (-1) — so this is a tier gate, not an
      // exhausted quota: answer 402 + upgrade copy. Everything else stays 429.
      if (!ultra && usage.limit === 0) {
        return paymentRequiredResponse(
          'AI path generation is a Pro feature. Upgrade to generate learning paths.'
        );
      }
      return tooManyRequestsResponse(
        ultra
          ? 'Ultra path limit reached — Ultra is a Pro feature, capped at 3 per month.'
          : 'Monthly AI path generation limit reached. Upgrade your plan for more.'
      );
    }

    // Hard ceiling on total AI token spend — the same budget every other AI
    // route enforces. PRO's per-feature ai_study_plan is unlimited (-1), so
    // without this a PRO user could generate unbounded paths; this caps the COGS.
    const { allowed: tokenAllowed, tokenLimit } = await checkTokenBudget(userId);
    if (!tokenAllowed) {
      return tooManyRequestsResponse(
        `Monthly token limit reached (${tokenLimit.toLocaleString()} tokens). Resets on the 1st of next month.`
      );
    }

    const contextNotebookIds = Array.isArray(body.contextNotebookIds)
      ? body.contextNotebookIds.filter((s): s is string => typeof s === 'string')
      : [];
    const primaryNotebookId =
      typeof body.primaryNotebookId === 'string' && body.primaryNotebookId.length > 0
        ? body.primaryNotebookId
        : null;
    const materialIds = Array.isArray(body.materialIds)
      ? body.materialIds.filter((s): s is string => typeof s === 'string')
      : [];

    // Validate notebook ownership for every notebook id the caller passed.
    const allNotebookIds = new Set<string>(contextNotebookIds);
    if (primaryNotebookId) allNotebookIds.add(primaryNotebookId);
    if (allNotebookIds.size > 0) {
      const owned = await db.studyContainer.count({
        where: { id: { in: Array.from(allNotebookIds) }, userId },
      });
      if (owned !== allNotebookIds.size) {
        return badRequestResponse('One or more notebook IDs are invalid');
      }
    }

    // Validate material ownership + load their actual content into a corpus.
    // The corpus carries the real page/document text and flashcard/quiz
    // content — Stage A grounds the path in it instead of bare titles.
    const materials = await loadMaterialCorpus(userId, materialIds);
    if (!materials) {
      return badRequestResponse('One or more material IDs are invalid');
    }
    // Cap the corpus by path type — Ultra gets a larger budget than Basic.
    // Stage B re-renders from the same persisted `ultra`, so both stages
    // build the identical corpus (prompt-cache + grounding consistency).
    const corpus = renderMaterialCorpus(materials, pathContentCap(ultra));

    // Derive the full context notebook set from caller-provided IDs plus
    // every notebook the validated materials originate from.
    const derivedNotebookIds = new Set<string>(allNotebookIds);
    for (const material of materials) {
      if (material.notebookId) derivedNotebookIds.add(material.notebookId);
    }

    // Resolve a guaranteed-non-null primary notebook. Path-generated
    // FlashcardSet / QuizSet rows inherit this id, and the FlashcardViewer
    // / QuizViewer URL-template `notebookId` into every fetch — they
    // cannot run without one. Fallback chain: caller-provided →
    // first derived from materials → user's oldest notebook.
    let resolvedPrimaryNotebookId: string | null = primaryNotebookId;
    if (!resolvedPrimaryNotebookId) {
      const derived = Array.from(derivedNotebookIds);
      if (derived.length > 0) {
        resolvedPrimaryNotebookId = derived[0];
      } else {
        const fallback = await db.studyContainer.findFirst({
          where: { userId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (fallback) resolvedPrimaryNotebookId = fallback.id;
      }
    }
    if (!resolvedPrimaryNotebookId) {
      return badRequestResponse(
        'Create a notebook first — learn paths need somewhere to store generated content.'
      );
    }
    derivedNotebookIds.add(resolvedPrimaryNotebookId);

    const duplicateLock = await acquireRedisLock(
      `lock:path-create:${userId}:${stableHash({
        title,
        brief: body.brief ?? null,
        contextNotebookIds,
        primaryNotebookId: resolvedPrimaryNotebookId,
        materialIds,
        ultra,
        gemini,
        language,
      })}`,
      120
    );
    if (!duplicateLock.acquired) {
      return tooManyRequestsResponse(
        'That path is already being created. Please wait a moment.',
        duplicateLock.retryAfterMs
      );
    }

    try {
      // ── Subject classification (Haiku, ~1s) ──────────────────────────
      const classification = await classifySubjects({
        title,
        brief: body.brief,
        corpus: corpus || undefined,
      });
      logTelemetry(userId, 'path.classifier.result', {
        subjects: classification.subjects,
        weights: classification.weights,
        fallback: classification.fallback,
      });

      // ── Stage A (one AI call, inline) ────────────────────────────────
      let structure: PathStructureToolInput;
      try {
        structure = await generatePathStructure({
          userId,
          title,
          brief: body.brief,
          corpus: corpus || undefined,
          subjects: classification.subjects,
          subjectWeights: classification.weights,
          gemini,
          language,
        });
      } catch (error) {
        console.error('[learn/paths POST] Stage A failed', error);
        return internalErrorResponse('Failed to design path structure. Please try again.');
      }

      // ── Persist plan + phases + empty slots in one transaction ───────
      // Shared verbatim with the onboarding claim (persist-plan-structure.ts).
      const planId = await db.$transaction((tx) =>
        persistPlanStructure(tx, {
          userId,
          notebookId: resolvedPrimaryNotebookId,
          contextNotebookIds: Array.from(derivedNotebookIds),
          materialIds,
          fallbackTitle: title,
          learnerBrief: body.brief,
          structure,
          source: 'ai',
          ultra,
          gemini,
          language,
          subjects: classification.subjects,
          subjectWeights: classification.weights,
          generationStatus: 'generating',
        })
      );
      await invalidateDashboardCache(userId);

      // Stage B durable job. Errors are surfaced to the client through
      // `StudyPlan.generationStatus = "failed"` + the SSE `error` event.
      // `allowRefund` lets Stage B give the reserved credit back if the path
      // generates nothing at all (only the create flow opts in — regenerate is
      // already free, so it must never trigger a second refund).
      try {
        await enqueueJob(
          'path.generate',
          { planId, allowRefund: true },
          {
            dedupeKey: `path:generate:${planId}`,
          }
        );
      } catch (error) {
        await db.studyPlan.update({
          where: { id: planId },
          data: {
            generationStatus: 'failed',
            generationError: 'Could not start path generation. Please try again.',
          },
        }).catch((updateError) => {
          console.error('[learn/paths POST] failed to mark plan failed after enqueue error', {
            planId,
            error: updateError,
          });
        });
        throw error;
      }

      await incrementUsage(userId, usageFeature);

      return createdResponse({ planId, status: 'generating' });
    } finally {
      await duplicateLock.release();
    }
  } catch (error) {
    console.error('[learn/paths POST]', error);
    return internalErrorResponse();
  }
}
