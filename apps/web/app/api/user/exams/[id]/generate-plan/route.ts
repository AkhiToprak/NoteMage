import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getAuthUserId } from '@/lib/auth';
import { getMageName } from '@/lib/scholar';
import { db } from '@/lib/db';
import { anthropic, AI_MODEL, MAX_OUTPUT_TOKENS } from '@/lib/anthropic';
import { checkTokenBudget, recordTokenUsage } from '@/lib/token-budget';
import {
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { STUDY_PLAN_TOOL, extractToolUses } from '@/lib/ai-tools';
import type { StudyPlanToolInput } from '@/lib/ai-tools';
import { checkUsageLimit, incrementUsage } from '@/lib/usage-limits';
import { loadMaterialCorpus, renderMaterialCorpus } from '@/lib/path-corpus';

type Params = { params: Promise<{ id: string }> };

/**
 * POST – Generate a study plan for an exam using Claude AI.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const token = await getToken({ req: request });
    const mageName = getMageName(token?.scholarName as string | undefined);

    const { id: examId } = await params;

    // Fetch exam with notebook info
    const exam = await db.exam.findFirst({
      where: { id: examId, userId },
      include: {
        notebook: true,
        studyPlan: { select: { id: true } },
      },
    });

    if (!exam) return notFoundResponse('Exam not found');

    if (exam.studyPlan) {
      return badRequestResponse(
        'This exam already has a linked study plan. Delete it first to generate a new one.'
      );
    }

    // Token budget check
    const { allowed, tokenLimit } = await checkTokenBudget(userId);
    if (!allowed) {
      return tooManyRequestsResponse(
        `Monthly token limit reached (${tokenLimit.toLocaleString()} tokens). Resets on the 1st of next month.`
      );
    }

    // Usage limit check (ai_study_plan)
    const studyPlanUsage = await checkUsageLimit(userId, 'ai_study_plan');
    if (!studyPlanUsage.allowed) {
      return tooManyRequestsResponse(
        'Monthly study plan generation limit reached. Upgrade your plan for more.'
      );
    }

    const notebookId = exam.notebookId;

    // Enumerate every material in the notebook, then load their actual
    // content into a corpus the AI can plan from — page/document text and
    // flashcard/quiz content, not just titles.
    const [pages, documents, flashcardSets, quizSets] = await Promise.all([
      db.page.findMany({ where: { section: { notebookId } }, select: { id: true } }),
      db.document.findMany({ where: { notebookId }, select: { id: true } }),
      db.flashcardSet.findMany({ where: { notebookId }, select: { id: true } }),
      db.quizSet.findMany({ where: { notebookId }, select: { id: true } }),
    ]);
    const materialIds = [
      ...pages.map((p) => p.id),
      ...documents.map((d) => d.id),
      ...flashcardSets.map((f) => f.id),
      ...quizSets.map((q) => q.id),
    ];
    const materials = (await loadMaterialCorpus(userId, materialIds)) ?? [];
    if (materials.length === 0) {
      return badRequestResponse(
        'This notebook has no content to create a study plan from. Add pages, flashcards, quizzes, or documents first.'
      );
    }
    const corpus = renderMaterialCorpus(materials);

    // Calculate days until exam
    const now = new Date();
    const daysUntilExam = Math.max(
      1,
      Math.ceil((exam.examDate.getTime() - now.getTime()) / 86400000)
    );

    const systemPrompt = [
      `You are ${mageName}, an AI study assistant. Create a structured study plan for an upcoming exam, based on the source materials provided below.`,
      '',
      'Guidelines for the study plan:',
      '- Break the material into topics and distribute them across the available days leading up to the exam.',
      '- Prioritize harder or larger topics earlier so there is time for review.',
      '- Include review/revision phases in the days right before the exam.',
      '- Account for weekends by assigning a lighter study load on Saturday and Sunday.',
      `- The total plan should span exactly ${daysUntilExam} days.`,
      '',
      `Exam: "${exam.title}"`,
      `Exam date: ${exam.examDate.toISOString().split('T')[0]}`,
      `Days until exam: ${daysUntilExam}`,
      `Notebook: "${exam.notebook.name}"`,
      '',
      'SOURCE MATERIALS — base every phase on what these actually contain:',
      corpus,
    ].join('\n');

    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Create a study plan for my "${exam.title}" exam in ${daysUntilExam} days. Distribute the materials wisely, prioritize harder topics early, include review days, and keep weekends lighter.`,
        },
      ],
      tools: [STUDY_PLAN_TOOL],
      tool_choice: { type: 'tool', name: 'create_study_plan' },
    });

    // Record token usage
    const totalTokens = response.usage.input_tokens + response.usage.output_tokens;
    await recordTokenUsage({
      notebookId,
      userId,
      tokens: totalTokens,
      description: `[exam-plan] Generated study plan for exam "${exam.title}"`,
    });

    const { studyPlan: toolUse } = extractToolUses(response.content);

    if (!toolUse) {
      return internalErrorResponse('AI did not generate a valid study plan. Please try again.');
    }

    const input: StudyPlanToolInput = toolUse.input;

    // Compute phase dates sequentially from today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let cursor = new Date(today);

    const phasesWithDates = input.phases.map((p) => {
      const start = new Date(cursor);
      const end = new Date(cursor);
      end.setDate(end.getDate() + Math.max(1, p.durationDays) - 1);
      cursor = new Date(end);
      cursor.setDate(cursor.getDate() + 1);
      return { ...p, startDate: start, endDate: end };
    });

    const planEndDate =
      phasesWithDates.length > 0
        ? phasesWithDates[phasesWithDates.length - 1].endDate
        : new Date(today.getTime() + daysUntilExam * 86400000);

    // Create plan + phases + materials in transaction, linked to exam
    const plan = await db.$transaction(async (tx) => {
      const created = await tx.studyPlan.create({
        data: {
          userId,
          notebookId,
          title: input.title || `Study Plan for ${exam.title}`,
          description: input.description || null,
          startDate: today,
          endDate: planEndDate,
          source: 'ai',
          examId: exam.id,
        },
      });

      for (let i = 0; i < phasesWithDates.length; i++) {
        const p = phasesWithDates[i];
        // Phase 10 — the schema replaced StudyMaterial with CheckpointSlot +
        // CheckpointActivity, so exam-plan phases are created empty; the AI's
        // per-phase `materials` output is intentionally unused here.
        void p.materials;

        await tx.studyPhase.create({
          data: {
            planId: created.id,
            title: p.title,
            description: p.description || null,
            sortOrder: i,
            startDate: p.startDate,
            endDate: p.endDate,
            status: i === 0 ? 'active' : 'upcoming',
          },
        });
      }

      return tx.studyPlan.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          phases: {
            orderBy: { sortOrder: 'asc' },
            include: {
              slots: {
                orderBy: { sortOrder: 'asc' },
                include: { activities: { orderBy: { sortOrder: 'asc' } } },
              },
            },
          },
        },
      });
    });

    // Increment ai_study_plan usage after successful creation
    await incrementUsage(userId, 'ai_study_plan');

    return createdResponse(plan);
  } catch (error: unknown) {
    console.error('[Exam Generate Plan] Error:', error);

    if (error && typeof error === 'object' && 'status' in error) {
      const apiError = error as { status: number; error?: { message?: string } };
      if (apiError.status === 429) {
        return tooManyRequestsResponse(
          'AI service rate limit reached. Please wait a moment and try again.'
        );
      }
      if (apiError.status === 529 || apiError.status === 503) {
        return internalErrorResponse(
          'AI service is temporarily overloaded. Please try again in a moment.'
        );
      }
    }

    return internalErrorResponse();
  }
}
