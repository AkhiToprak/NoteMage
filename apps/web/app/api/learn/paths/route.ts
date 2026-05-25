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
import { generatePathStructure, generatePath } from '@/lib/path-generator';
import { loadMaterialCorpus, renderMaterialCorpus } from '@/lib/path-corpus';
import { loadPathsForUser, serializePath } from '@/lib/path-loader';
import { checkUsageLimit, incrementUsage } from '@/lib/usage-limits';
import { checkTokenBudget } from '@/lib/token-budget';
import type { PathStructureToolInput } from '@/lib/ai-tools';
import { classifySubjects } from '@/lib/path-classifier';
import { normalizePathLanguage } from '@/lib/path-languages';
import { logTelemetry } from '@/lib/telemetry-server';
import { freeTierAiPathsDisabled } from '@/lib/feature-flags';
import { trackFreeUserPathGenerationBlocked } from '@/lib/telemetry-switchover';

// Phase 10.3 — POST kicks off the two-stage AI path generation. Stage A
// (one inline AI call → `create_path_structure`) returns the section /
// slot skeleton in ~3–5s. We persist the plan + phases + empty slots in
// one transaction with `generationStatus: 'generating'`, then fire
// Stage B off as a background promise that fills theory / flashcards /
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
// POST — create a path (Stage A inline + Stage B fire-and-forget).
// ─────────────────────────────────────────────────────────────────────

/** Compute the path's end date from `targetDays` (1 day = today). */
function endDateFromTargetDays(targetDays: number): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + Math.max(1, targetDays) - 1);
  return { start, end };
}

interface CreatePathBody {
  title?: string;
  brief?: string;
  contextNotebookIds?: string[];
  primaryNotebookId?: string | null;
  targetDays?: number;
  materialIds?: string[];
  ultra?: boolean;
  /** Per-path Gemini override. Forces every stage through Gemini 2.5
   *  Flash for this generation, regardless of PATH_PROVIDER env vars or
   *  the ultra flag. Toggle from the path-creation UI for testing. */
  gemini?: boolean;
  /** Author-selected content language (BCP-47 lowercase). Persisted as
   *  StudyPlan.language and snapshotted onto SharedPath at publish time.
   *  Validated against the supported set; junk falls back to 'en'. */
  language?: string;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = (await request.json().catch(() => ({}))) as CreatePathBody;
    const title = body.title?.trim();
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
      // Phase 12 free-tier switchover (AC-Switch-1). When
      // FREE_TIER_AI_PATHS_DISABLED is on, FREE's ai_study_plan limit is 0
      // (tiers.ts). A 0 limit on the non-ultra meter can only mean a FREE
      // user under the switchover — admins return allowed:true and PRO is
      // unlimited (-1) — so this is a tier gate, not an exhausted quota:
      // answer with 402 + library-pointing copy and drop a telemetry
      // breadcrumb to size the friction. Everything else stays 429.
      if (!ultra && usage.limit === 0 && freeTierAiPathsDisabled()) {
        trackFreeUserPathGenerationBlocked(userId);
        return paymentRequiredResponse(
          'AI path generation is part of Pro. Browse the community library to clone a ready-made path — free.',
        );
      }
      return tooManyRequestsResponse(
        ultra
          ? 'Ultra path limit reached — Ultra is a Pro feature, capped at 3 per month.'
          : 'Monthly AI path generation limit reached. Upgrade your plan for more.',
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

    const targetDays =
      typeof body.targetDays === 'number' && body.targetDays > 0
        ? Math.floor(body.targetDays)
        : 14;

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
      const owned = await db.notebook.count({
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
    const corpus = renderMaterialCorpus(materials);

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
        const fallback = await db.notebook.findFirst({
          where: { userId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (fallback) resolvedPrimaryNotebookId = fallback.id;
      }
    }
    if (!resolvedPrimaryNotebookId) {
      return badRequestResponse(
        'Create a notebook first — learn paths need somewhere to store generated content.',
      );
    }
    derivedNotebookIds.add(resolvedPrimaryNotebookId);

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
        targetDays,
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
    const { start, end } = endDateFromTargetDays(targetDays);
    const planTitle = structure.title?.trim() || title;
    const planDescription = structure.description?.trim() || null;

    const planId = await db.$transaction(async (tx) => {
      const plan = await tx.studyPlan.create({
        data: {
          userId,
          notebookId: resolvedPrimaryNotebookId,
          contextNotebookIds: Array.from(derivedNotebookIds),
          materialIds,
          title: planTitle,
          description: planDescription,
          startDate: start,
          endDate: end,
          source: 'ai',
          ultra,
          gemini,
          language,
          generationStatus: 'generating',
          subjects: classification.subjects,
          subjectWeights: classification.weights,
        },
      });

      for (let i = 0; i < structure.phases.length; i++) {
        const phase = structure.phases[i];
        // Spread the phase dates evenly across the target days.
        const phaseLengthDays = Math.max(
          1,
          Math.floor(targetDays / Math.max(1, structure.phases.length)),
        );
        const phaseStart = new Date(start);
        phaseStart.setDate(phaseStart.getDate() + i * phaseLengthDays);
        const phaseEnd = new Date(phaseStart);
        phaseEnd.setDate(phaseEnd.getDate() + phaseLengthDays - 1);

        await tx.studyPhase.create({
          data: {
            planId: plan.id,
            title: phase.title,
            description: phase.description ?? null,
            sortOrder: i,
            startDate: phaseStart,
            endDate: phaseEnd,
            status: i === 0 ? 'active' : 'upcoming',
            slots: {
              create: phase.slots.map((slot, j) => ({
                title: slot.title,
                description: slot.topicHint,
                kind: slot.kind,
                sortOrder: j,
              })),
            },
          },
        });
      }

      // Append the path-wide Final Exam as its own synthetic phase so it
      // sits visually after every section, unlocks only when all prior
      // slots are complete, and grades the learner against the whole
      // path. One quiz-only slot of kind `final_exam`; Stage B fills it.
      await tx.studyPhase.create({
        data: {
          planId: plan.id,
          title: 'Final Exam',
          description: 'Comprehensive, graded exam covering every section.',
          sortOrder: structure.phases.length,
          startDate: end,
          endDate: end,
          status: 'upcoming',
          slots: {
            create: [
              {
                title: 'Final Exam',
                description: `Path-wide capstone for "${planTitle}". Pulls questions from every section to simulate the real exam.`,
                kind: 'final_exam',
                sortOrder: 0,
              },
            ],
          },
        },
      });

      return plan.id;
    });

    // Stage B fire-and-forget. Errors are surfaced to the client through
    // `StudyPlan.generationStatus = "failed"` + the SSE `error` event.
    void generatePath(planId).catch((err) => {
      console.error('[learn/paths POST] Stage B failed', err);
    });

    await incrementUsage(userId, usageFeature);

    return createdResponse({ planId, status: 'generating' });
  } catch (error) {
    console.error('[learn/paths POST]', error);
    return internalErrorResponse();
  }
}
