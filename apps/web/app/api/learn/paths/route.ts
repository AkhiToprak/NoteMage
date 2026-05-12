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
} from '@/lib/api-response';
import { generatePathStructure, generatePath } from '@/lib/path-generator';
import { loadPathsForUser, serializePath } from '@/lib/path-loader';
import { checkUsageLimit, incrementUsage } from '@/lib/usage-limits';
import type { PathStructureToolInput } from '@/lib/ai-tools';

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

type MaterialBucket = {
  page: Array<{ id: string; title: string; sectionTitle: string }>;
  flashcard_set: Array<{ id: string; title: string }>;
  quiz_set: Array<{ id: string; title: string }>;
  document: Array<{ id: string; title: string }>;
};

/**
 * Look up each materialId across pages / flashcard sets / quiz sets /
 * documents (whichever it belongs to) and bucket the results by type.
 * Returns `null` if any id is missing — the caller treats that as a
 * 400 because the AI must only be fed materials the user owns.
 */
async function loadMaterialBucket(
  userId: string,
  materialIds: string[],
): Promise<MaterialBucket | null> {
  if (materialIds.length === 0) {
    return { page: [], flashcard_set: [], quiz_set: [], document: [] };
  }

  const [pages, flashcardSets, quizSets, documents] = await Promise.all([
    db.page.findMany({
      where: { id: { in: materialIds }, section: { notebook: { userId } } },
      select: { id: true, title: true, section: { select: { title: true } } },
    }),
    db.flashcardSet.findMany({
      where: { id: { in: materialIds }, userId },
      select: { id: true, title: true },
    }),
    db.quizSet.findMany({
      where: { id: { in: materialIds }, userId },
      select: { id: true, title: true },
    }),
    db.document.findMany({
      where: { id: { in: materialIds }, notebook: { userId } },
      select: { id: true, fileName: true },
    }),
  ]);

  const seen = new Set<string>([
    ...pages.map((p) => p.id),
    ...flashcardSets.map((f) => f.id),
    ...quizSets.map((q) => q.id),
    ...documents.map((d) => d.id),
  ]);
  if (seen.size !== materialIds.length) {
    return null;
  }

  return {
    page: pages.map((p) => ({
      id: p.id,
      title: p.title,
      sectionTitle: p.section?.title ?? '(unknown section)',
    })),
    flashcard_set: flashcardSets.map((f) => ({ id: f.id, title: f.title })),
    quiz_set: quizSets.map((q) => ({ id: q.id, title: q.title })),
    document: documents.map((d) => ({ id: d.id, title: d.fileName })),
  };
}

/**
 * Render the bucket as a plain-text inventory the AI can ground its
 * section / slot topics in. Mirrors the format the exam plan generator
 * uses so the AI's prior at this task is consistent.
 */
function renderInventory(bucket: MaterialBucket): string {
  const sections: string[] = [];
  if (bucket.page.length > 0) {
    sections.push(
      'Pages:\n' +
        bucket.page
          .map((p) => `  - Page: "${p.title}" (id: ${p.id}, section: ${p.sectionTitle})`)
          .join('\n'),
    );
  }
  if (bucket.flashcard_set.length > 0) {
    sections.push(
      'Flashcard sets:\n' +
        bucket.flashcard_set.map((f) => `  - "${f.title}" (id: ${f.id})`).join('\n'),
    );
  }
  if (bucket.quiz_set.length > 0) {
    sections.push(
      'Quiz sets:\n' +
        bucket.quiz_set.map((q) => `  - "${q.title}" (id: ${q.id})`).join('\n'),
    );
  }
  if (bucket.document.length > 0) {
    sections.push(
      'Documents:\n' +
        bucket.document.map((d) => `  - "${d.title}" (id: ${d.id})`).join('\n'),
    );
  }
  return sections.join('\n\n');
}

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
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Usage gate — same meter as the legacy AI plan endpoint so a single
    // monthly quota covers both surfaces while the chat-driven path
    // creation flow exists alongside this one.
    const usage = await checkUsageLimit(userId, 'ai_study_plan');
    if (!usage.allowed) {
      return tooManyRequestsResponse(
        'Monthly AI path generation limit reached. Upgrade your plan for more.',
      );
    }

    const body = (await request.json().catch(() => ({}))) as CreatePathBody;
    const title = body.title?.trim();
    if (!title) return badRequestResponse('Title is required');

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

    // Validate material ownership + build inventory string.
    const bucket = await loadMaterialBucket(userId, materialIds);
    if (!bucket) {
      return badRequestResponse('One or more material IDs are invalid');
    }
    const inventory = renderInventory(bucket);

    // Derive the full context notebook set from caller-provided IDs plus
    // every notebook the validated materials originate from. We re-query
    // each bucket source for its notebook to keep this in one place.
    const derivedNotebookIds = new Set<string>(allNotebookIds);
    if (bucket.page.length > 0) {
      const pageRows = await db.page.findMany({
        where: { id: { in: bucket.page.map((p) => p.id) } },
        select: { section: { select: { notebookId: true } } },
      });
      for (const row of pageRows) {
        if (row.section?.notebookId) derivedNotebookIds.add(row.section.notebookId);
      }
    }
    if (bucket.flashcard_set.length > 0) {
      const rows = await db.flashcardSet.findMany({
        where: { id: { in: bucket.flashcard_set.map((f) => f.id) } },
        select: { notebookId: true },
      });
      for (const r of rows) if (r.notebookId) derivedNotebookIds.add(r.notebookId);
    }
    if (bucket.quiz_set.length > 0) {
      const rows = await db.quizSet.findMany({
        where: { id: { in: bucket.quiz_set.map((q) => q.id) } },
        select: { notebookId: true },
      });
      for (const r of rows) if (r.notebookId) derivedNotebookIds.add(r.notebookId);
    }
    if (bucket.document.length > 0) {
      const rows = await db.document.findMany({
        where: { id: { in: bucket.document.map((d) => d.id) } },
        select: { notebookId: true },
      });
      for (const r of rows) if (r.notebookId) derivedNotebookIds.add(r.notebookId);
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

    // ── Stage A (one AI call, inline) ────────────────────────────────
    let structure: PathStructureToolInput;
    try {
      structure = await generatePathStructure({
        userId,
        title,
        brief: body.brief,
        targetDays,
        materialInventory: inventory || undefined,
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
          title: planTitle,
          description: planDescription,
          startDate: start,
          endDate: end,
          source: 'ai',
          generationStatus: 'generating',
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

    await incrementUsage(userId, 'ai_study_plan');

    return createdResponse({ planId, status: 'generating' });
  } catch (error) {
    console.error('[learn/paths POST]', error);
    return internalErrorResponse();
  }
}
