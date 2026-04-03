import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { anthropic, AI_MODEL, MONTHLY_TOKEN_LIMIT } from '@/lib/anthropic';
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
 * POST – AI-generate a study plan from notebook inventory
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    // Token budget check
    const { allowed } = await checkTokenBudget(userId);
    if (!allowed) {
      return tooManyRequestsResponse(
        `Monthly token limit reached (${MONTHLY_TOKEN_LIMIT.toLocaleString()} tokens). Resets on the 1st of next month.`
      );
    }

    // Usage limit check (ai_study_plan)
    const studyPlanUsage = await checkUsageLimit(userId, 'ai_study_plan');
    if (!studyPlanUsage.allowed) {
      return tooManyRequestsResponse('Monthly study plan generation limit reached. Upgrade your plan for more.');
    }

    const body = await request.json().catch(() => ({}));
    const { durationDays, goals } = body as { durationDays?: number; goals?: string };

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
        `Flashcard Sets:\n${flashcardSets.map(f => `  - "${f.title}" (id: ${f.id})`).join('\n')}`
      );
    }

    if (quizSets.length > 0) {
      inventoryParts.push(
        `Quiz Sets:\n${quizSets.map(q => `  - "${q.title}" (id: ${q.id})`).join('\n')}`
      );
    }

    if (documents.length > 0) {
      inventoryParts.push(
        `Documents:\n${documents.map(d => `  - "${d.fileName}" (id: ${d.id})`).join('\n')}`
      );
    }

    if (inventoryParts.length === 0) {
      return badRequestResponse('This notebook has no content to create a study plan from. Add pages, flashcards, quizzes, or documents first.');
    }

    const inventory = inventoryParts.join('\n\n');
    const duration = durationDays && durationDays > 0 ? durationDays : 14;

    const systemPrompt = [
      'You are Scholar, an AI study assistant. Create a structured study plan using ONLY the materials provided below.',
      'IMPORTANT: Only use the exact referenceId values from the inventory. Do not invent IDs.',
      'Use the correct type for each material: "page" for Pages, "flashcard_set" for Flashcard Sets, "quiz_set" for Quiz Sets, "document" for Documents.',
      'Distribute materials logically across phases. Each phase should have a clear focus.',
      `The total plan should span approximately ${duration} days.`,
      goals ? `\nUser goals: ${goals}` : '',
      `\nNotebook: "${notebook.name}"`,
      `\nAvailable materials:\n${inventory}`,
    ].join('\n');

    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Create a study plan for this notebook spanning ${duration} days.${goals ? ` My goals: ${goals}` : ''}`,
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
      description: `[study-plan] Generated study plan for notebook "${notebook.name}"`,
    });

    const { studyPlan: toolUse } = extractToolUses(response.content);

    if (!toolUse) {
      return internalErrorResponse('AI did not generate a valid study plan. Please try again.');
    }

    const input: StudyPlanToolInput = toolUse.input;

    // Collect all valid referenceIds from inventory
    const validIds = new Set<string>();
    for (const s of sections) {
      for (const p of s.pages) validIds.add(p.id);
    }
    for (const f of flashcardSets) validIds.add(f.id);
    for (const q of quizSets) validIds.add(q.id);
    for (const d of documents) validIds.add(d.id);

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

    const planEndDate = phasesWithDates.length > 0
      ? phasesWithDates[phasesWithDates.length - 1].endDate
      : new Date(today.getTime() + duration * 86400000);

    // Create plan + phases + materials in transaction
    const plan = await db.$transaction(async (tx) => {
      const created = await tx.studyPlan.create({
        data: {
          notebookId,
          title: input.title || `Study Plan for ${notebook.name}`,
          description: input.description || null,
          startDate: today,
          endDate: planEndDate,
          source: 'ai',
        },
      });

      for (let i = 0; i < phasesWithDates.length; i++) {
        const p = phasesWithDates[i];
        // Filter to only valid referenceIds
        const validMaterials = (p.materials || []).filter(m => validIds.has(m.referenceId));

        await tx.studyPhase.create({
          data: {
            planId: created.id,
            title: p.title,
            description: p.description || null,
            sortOrder: i,
            startDate: p.startDate,
            endDate: p.endDate,
            status: i === 0 ? 'active' : 'upcoming',
            materials: validMaterials.length > 0
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
    console.error('[Study Plan Generate] Error:', error);

    if (error && typeof error === 'object' && 'status' in error) {
      const apiError = error as { status: number; error?: { message?: string } };
      if (apiError.status === 429) {
        return tooManyRequestsResponse('AI service rate limit reached. Please wait a moment and try again.');
      }
      if (apiError.status === 529 || apiError.status === 503) {
        return internalErrorResponse('AI service is temporarily overloaded. Please try again in a moment.');
      }
    }

    return internalErrorResponse();
  }
}
