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

    // Load notebook inventory
    const sections = await db.section.findMany({
      where: { notebookId },
      include: { pages: { select: { id: true, title: true } } },
    });
    const flashcardSets = await db.flashcardSet.findMany({
      where: { notebookId },
      select: { id: true, title: true },
    });
    const quizSets = await db.quizSet.findMany({
      where: { notebookId },
      select: { id: true, title: true },
    });
    const documents = await db.document.findMany({
      where: { notebookId },
      select: { id: true, fileName: true },
    });

    // Build inventory string with exact IDs
    const inventoryParts: string[] = [];

    if (sections.length > 0) {
      const pageLines: string[] = [];
      for (const s of sections) {
        for (const p of s.pages) {
          pageLines.push(`  - Page: "${p.title}" (id: ${p.id}, section: ${s.title})`);
        }
      }
      if (pageLines.length > 0) {
        inventoryParts.push(`Pages:\n${pageLines.join('\n')}`);
      }
    }

    if (flashcardSets.length > 0) {
      inventoryParts.push(
        `Flashcard Sets:\n${flashcardSets.map((f) => `  - "${f.title}" (id: ${f.id})`).join('\n')}`
      );
    }

    if (quizSets.length > 0) {
      inventoryParts.push(
        `Quiz Sets:\n${quizSets.map((q) => `  - "${q.title}" (id: ${q.id})`).join('\n')}`
      );
    }

    if (documents.length > 0) {
      inventoryParts.push(
        `Documents:\n${documents.map((d) => `  - "${d.fileName}" (id: ${d.id})`).join('\n')}`
      );
    }

    if (inventoryParts.length === 0) {
      return badRequestResponse(
        'This notebook has no content to create a study plan from. Add pages, flashcards, quizzes, or documents first.'
      );
    }

    const inventory = inventoryParts.join('\n\n');

    // Calculate days until exam
    const now = new Date();
    const daysUntilExam = Math.max(
      1,
      Math.ceil((exam.examDate.getTime() - now.getTime()) / 86400000)
    );

    // Collect valid IDs
    const validIds = new Set<string>();
    for (const s of sections) {
      for (const p of s.pages) validIds.add(p.id);
    }
    for (const f of flashcardSets) validIds.add(f.id);
    for (const q of quizSets) validIds.add(q.id);
    for (const d of documents) validIds.add(d.id);

    const systemPrompt = [
      `You are ${mageName}, an AI study assistant. Create a structured study plan for an upcoming exam using ONLY the materials provided below.`,
      'IMPORTANT: Only use the exact referenceId values from the inventory. Do not invent IDs.',
      'Use the correct type for each material: "page" for Pages, "flashcard_set" for Flashcard Sets, "quiz_set" for Quiz Sets, "document" for Documents.',
      '',
      'Guidelines for the study plan:',
      '- Distribute topics across the available days leading up to the exam.',
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
      `Available materials:\n${inventory}`,
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
        // Filter to only valid referenceIds
        const validMaterials = (p.materials || []).filter((m) => validIds.has(m.referenceId));

        await tx.studyPhase.create({
          data: {
            planId: created.id,
            title: p.title,
            description: p.description || null,
            sortOrder: i,
            startDate: p.startDate,
            endDate: p.endDate,
            status: i === 0 ? 'active' : 'upcoming',
            materials:
              validMaterials.length > 0
                ? {
                    create: validMaterials.map((m, j) => ({
                      type: m.type,
                      referenceId: m.referenceId,
                      title: m.title,
                      sortOrder: j,
                    })),
                  }
                : undefined,
          },
        });
      }

      return tx.studyPlan.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          phases: {
            orderBy: { sortOrder: 'asc' },
            include: { materials: { orderBy: { sortOrder: 'asc' } } },
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
