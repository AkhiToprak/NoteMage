import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { anthropic, AI_MODEL, MONTHLY_TOKEN_LIMIT } from '@/lib/anthropic';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { recordActivity } from '@/lib/activity';
import { awardXP } from '@/lib/xp';
import { checkAndUnlockAchievements } from '@/lib/achievement-checker';
import { ALL_TOOLS, extractToolUses } from '@/lib/ai-tools';
import { extractText } from '@/lib/fileProcessing';
import { readFile } from '@/lib/storage';
import { tiptapJsonToPlainText } from '@/lib/contentConverter';

type Params = { params: Promise<{ id: string; chatId: string }> };

/**
 * GET – list messages for a chat (paginated if needed later)
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, chatId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const chat = await db.notebookChat.findFirst({ where: { id: chatId, notebookId } });
    if (!chat) return notFoundResponse('Chat not found');

    const messages = await db.chatMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        tokens: true,
        createdAt: true,
      },
    });

    return successResponse(messages);
  } catch {
    return internalErrorResponse();
  }
}

/**
 * POST – send a user message and get an AI response
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Record activity (fire-and-forget)
    recordActivity(userId, 'message').catch(() => {});

    // Award XP and check achievements (fire-and-forget)
    awardXP(userId, 'message_sent').catch(console.error);
    checkAndUnlockAchievements(userId).catch(console.error);

    // Per-IP request rate limit: 20 requests per minute
    const ip = getClientIp(request);
    const reqLimit = rateLimit(`ai-chat:${ip}`, 20, 60_000);
    if (!reqLimit.success) {
      return tooManyRequestsResponse('Too many requests. Please slow down.', reqLimit.retryAfterMs);
    }

    const { id: notebookId, chatId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const chat = await db.notebookChat.findFirst({ where: { id: chatId, notebookId } });
    if (!chat) return notFoundResponse('Chat not found');

    // ── Token budget check (1M tokens/month per user) ──
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const tokenUsage = await db.chatMessage.aggregate({
      where: {
        userId,
        createdAt: { gte: startOfMonth },
        tokens: { not: null },
      },
      _sum: { tokens: true },
    });

    const usedTokens = tokenUsage._sum.tokens ?? 0;
    if (usedTokens >= MONTHLY_TOKEN_LIMIT) {
      return tooManyRequestsResponse(
        `Monthly token limit reached (${MONTHLY_TOKEN_LIMIT.toLocaleString()} tokens). Resets on the 1st of next month.`
      );
    }

    // ── Parse user message ──
    const body = await request.json().catch(() => ({}));
    const { message } = body as { message?: string };

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return badRequestResponse('Message cannot be empty');
    }
    if (message.length > 10_000) {
      return badRequestResponse('Message is too long (max 10,000 characters)');
    }

    // ── Build context from selected pages & documents ──
    const contextParts: string[] = [];
    const skippedSources: { type: 'page' | 'document'; name: string; reason: string }[] = [];

    if (chat.contextPageIds.length > 0) {
      const pages = await db.page.findMany({
        where: { id: { in: chat.contextPageIds } },
        select: { id: true, title: true, textContent: true, content: true, pageType: true },
      });
      for (const page of pages) {
        let text = page.textContent;

        // Fallback: extract plain text from TipTap JSON content
        if (!text && page.content) {
          text = tiptapJsonToPlainText(page.content);
          if (text) {
            // Persist so we don't re-extract next time
            db.page.update({ where: { id: page.id }, data: { textContent: text } }).catch(() => {});
          }
        }

        if (text) {
          contextParts.push(`[Page: ${page.title}]\n${text}`);
        } else {
          skippedSources.push({ type: 'page', name: page.title, reason: page.pageType === 'canvas' ? 'canvas_page' : 'no_text' });
        }
      }
    }

    if (chat.contextDocIds.length > 0) {
      const docs = await db.document.findMany({
        where: { id: { in: chat.contextDocIds } },
        select: { id: true, fileName: true, fileType: true, filePath: true, textContent: true },
      });
      for (const doc of docs) {
        let text = doc.textContent;

        // Lazy re-extraction: if textContent is missing, try to extract from the stored file
        if (!text && doc.filePath) {
          try {
            const buffer = await readFile(doc.filePath);
            text = await extractText(buffer, doc.fileType);
            if (text) {
              // Persist so we don't re-extract next time
              await db.document.update({
                where: { id: doc.id },
                data: { textContent: text },
              });
            }
          } catch (err) {
            console.error('[AI Chat] Lazy re-extraction failed:', doc.fileName, doc.fileType, err);
          }
        }

        if (text) {
          contextParts.push(`[Document: ${doc.fileName}]\n${text}`);
        } else {
          skippedSources.push({ type: 'document', name: doc.fileName, reason: 'extraction_failed' });
        }
      }
    }

    const contextStatus = {
      loaded: contextParts.length,
      skipped: skippedSources,
      total: contextParts.length + skippedSources.length,
    };

    // ── Load conversation history ──
    const history = await db.chatMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });

    const conversationMessages = history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Add the new user message
    conversationMessages.push({ role: 'user', content: message.trim() });

    // ── Build system prompt ──
    const systemParts = [
      'You are Scholar, an AI study assistant embedded in the Quizzard notebook app.',
      'Help the user study, understand, and review their notes and documents.',
      'Be concise, clear, and educational. Use markdown formatting when helpful.',
      '',
      'You have access to a `create_flashcards` tool. When the user asks you to create, generate, or make flashcards, use this tool. Create high-quality flashcards with clear questions and concise answers. For complex answers, use bullet points or numbered lists.',
      '',
      'You also have access to a `create_quiz` tool. When the user asks you to create, generate, or make a quiz, test, or multiple-choice questions, use this tool. Create challenging but fair questions with 4 options each. Always provide hints and explanations for both correct and incorrect answers to help students learn.',
      '',
      'You also have access to a `create_mindmap` tool. When the user asks you to create, generate, or make a mind map, concept map, or topic overview, use this tool. Structure the content using Markdown headings (# for root, ## for main branches, ### for sub-branches, #### for details). Keep node text concise.',
      '',
      'You also have access to a `create_study_plan` tool. When the user asks you to create, generate, or make a study plan, study schedule, or revision plan, use this tool. Create logical phases that distribute materials across a reasonable timeframe. Only use referenceIds from the notebook inventory provided in context.',
    ];

    if (contextParts.length > 0) {
      systemParts.push(
        '\nThe user has provided the following context from their notebook:\n',
        contextParts.join('\n\n---\n\n')
      );
    }

    // ── Call Anthropic API (with tools) ──
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 4096,
      system: systemParts.join('\n'),
      messages: conversationMessages,
      tools: ALL_TOOLS,
    });

    const totalTokens = response.usage.input_tokens + response.usage.output_tokens;

    // ── Extract text and tool_use blocks from response ──
    const { text: extractedText, flashcard: flashcardToolUse, quiz: quizToolUse, mindmap: mindmapToolUse, studyPlan: studyPlanToolUse } = extractToolUses(response.content);
    let assistantText = extractedText;

    // ── If tool_use: create flashcards in DB ──
    let flashcardSetData: { id: string; title: string; cardCount: number } | null = null;

    if (flashcardToolUse) {
      const { title: setTitle, flashcards } = flashcardToolUse.input;

      // Validate
      if (!setTitle || !Array.isArray(flashcards) || flashcards.length === 0) {
        // Fallback: treat as text-only response
        assistantText = assistantText || 'I tried to create flashcards but the format was invalid. Please try again.';
      } else {
        // Create flashcard set + cards in a transaction, along with messages
        const result = await db.$transaction(async (tx) => {
          // Save user message
          const userMsg = await tx.chatMessage.create({
            data: {
              notebookId,
              userId,
              chatId,
              role: 'user',
              content: message.trim(),
              tokens: response.usage.input_tokens,
            },
          });

          // Create flashcard set
          const fSet = await tx.flashcardSet.create({
            data: {
              notebookId,
              chatId,
              messageId: '', // placeholder, updated below
              title: setTitle,
              source: 'ai',
              flashcards: {
                create: flashcards.map((fc, i) => ({
                  question: fc.question,
                  answer: fc.answer,
                  sortOrder: i,
                })),
              },
            },
            include: { flashcards: true },
          });

          // Build assistant content with marker
          const markerText = assistantText
            ? `${assistantText}\n\n[flashcard_set:${fSet.id}]`
            : `I've created a flashcard set "${setTitle}" with ${flashcards.length} cards.\n\n[flashcard_set:${fSet.id}]`;

          // Save assistant message
          const assistantMsg = await tx.chatMessage.create({
            data: {
              notebookId,
              userId,
              chatId,
              role: 'assistant',
              content: markerText,
              tokens: response.usage.output_tokens,
            },
          });

          // Update flashcard set with message ID
          await tx.flashcardSet.update({
            where: { id: fSet.id },
            data: { messageId: assistantMsg.id },
          });

          await tx.notebookChat.update({
            where: { id: chatId },
            data: { updatedAt: new Date() },
          });

          return { userMsg, assistantMsg, fSet };
        });

        flashcardSetData = {
          id: result.fSet.id,
          title: result.fSet.title,
          cardCount: result.fSet.flashcards.length,
        };

        return successResponse({
          userMessage: {
            id: result.userMsg.id,
            role: result.userMsg.role,
            content: result.userMsg.content,
            createdAt: result.userMsg.createdAt,
          },
          assistantMessage: {
            id: result.assistantMsg.id,
            role: result.assistantMsg.role,
            content: result.assistantMsg.content,
            createdAt: result.assistantMsg.createdAt,
          },
          flashcardSet: flashcardSetData,
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            totalTokens,
            monthlyUsed: usedTokens + totalTokens,
            monthlyLimit: MONTHLY_TOKEN_LIMIT,
          },
          contextStatus,
        });
      }
    }

    // ── If tool_use: create quiz in DB ──
    if (quizToolUse) {
      const { title: quizTitle, questions } = quizToolUse.input;

      if (!quizTitle || !Array.isArray(questions) || questions.length === 0) {
        assistantText = assistantText || 'I tried to create a quiz but the format was invalid. Please try again.';
      } else {
        const result = await db.$transaction(async (tx) => {
          const userMsg = await tx.chatMessage.create({
            data: {
              notebookId,
              userId,
              chatId,
              role: 'user',
              content: message.trim(),
              tokens: response.usage.input_tokens,
            },
          });

          const qSet = await tx.quizSet.create({
            data: {
              notebookId,
              chatId,
              messageId: '',
              title: quizTitle,
              questions: {
                create: questions.map((q, i) => ({
                  question: q.question,
                  options: q.options,
                  correctIndex: q.correctIndex,
                  hint: q.hint ?? null,
                  correctExplanation: q.correctExplanation ?? null,
                  wrongExplanation: q.wrongExplanation ?? null,
                  sortOrder: i,
                })),
              },
            },
            include: { questions: true },
          });

          const markerText = assistantText
            ? `${assistantText}\n\n[quiz_set:${qSet.id}]`
            : `I've created a quiz "${quizTitle}" with ${questions.length} questions.\n\n[quiz_set:${qSet.id}]`;

          const assistantMsg = await tx.chatMessage.create({
            data: {
              notebookId,
              userId,
              chatId,
              role: 'assistant',
              content: markerText,
              tokens: response.usage.output_tokens,
            },
          });

          await tx.quizSet.update({
            where: { id: qSet.id },
            data: { messageId: assistantMsg.id },
          });

          await tx.notebookChat.update({
            where: { id: chatId },
            data: { updatedAt: new Date() },
          });

          return { userMsg, assistantMsg, qSet };
        });

        return successResponse({
          userMessage: {
            id: result.userMsg.id,
            role: result.userMsg.role,
            content: result.userMsg.content,
            createdAt: result.userMsg.createdAt,
          },
          assistantMessage: {
            id: result.assistantMsg.id,
            role: result.assistantMsg.role,
            content: result.assistantMsg.content,
            createdAt: result.assistantMsg.createdAt,
          },
          quizSet: {
            id: result.qSet.id,
            title: result.qSet.title,
            questionCount: result.qSet.questions.length,
          },
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            totalTokens,
            monthlyUsed: usedTokens + totalTokens,
            monthlyLimit: MONTHLY_TOKEN_LIMIT,
          },
          contextStatus,
        });
      }
    }

    // ── If tool_use: create study plan in DB ──
    if (studyPlanToolUse) {
      const { title: planTitle, description: planDesc, phases } = studyPlanToolUse.input;

      if (planTitle && Array.isArray(phases) && phases.length > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let cursor = new Date(today);

        const phasesWithDates = phases.map((p) => {
          const start = new Date(cursor);
          const end = new Date(cursor);
          end.setDate(end.getDate() + Math.max(1, p.durationDays) - 1);
          cursor = new Date(end);
          cursor.setDate(cursor.getDate() + 1);
          return { ...p, startDate: start, endDate: end };
        });

        const planEndDate = phasesWithDates[phasesWithDates.length - 1].endDate;

        const result = await db.$transaction(async (tx) => {
          const userMsg = await tx.chatMessage.create({
            data: { notebookId, userId, chatId, role: 'user', content: message.trim(), tokens: response.usage.input_tokens },
          });

          const plan = await tx.studyPlan.create({
            data: {
              notebookId,
              title: planTitle,
              description: planDesc || null,
              startDate: today,
              endDate: planEndDate,
              source: 'ai',
            },
          });

          for (let i = 0; i < phasesWithDates.length; i++) {
            const p = phasesWithDates[i];
            const validMaterials = (p.materials || []).filter(m => m.referenceId && m.title);
            await tx.studyPhase.create({
              data: {
                planId: plan.id,
                title: p.title,
                description: p.description || null,
                sortOrder: i,
                startDate: p.startDate,
                endDate: p.endDate,
                status: i === 0 ? 'active' : 'upcoming',
                materials: validMaterials.length > 0
                  ? { create: validMaterials.map((m, j) => ({ type: m.type, referenceId: m.referenceId, title: m.title, sortOrder: j })) }
                  : undefined,
              },
            });
          }

          const markerText = assistantText
            ? `${assistantText}\n\n[study_plan:${plan.id}]`
            : `I've created a study plan "${planTitle}" with ${phases.length} phases.\n\n[study_plan:${plan.id}]`;

          const assistantMsg = await tx.chatMessage.create({
            data: { notebookId, userId, chatId, role: 'assistant', content: markerText, tokens: response.usage.output_tokens },
          });

          await tx.notebookChat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });

          return { userMsg, assistantMsg, plan };
        });

        return successResponse({
          userMessage: { id: result.userMsg.id, role: result.userMsg.role, content: result.userMsg.content, createdAt: result.userMsg.createdAt },
          assistantMessage: { id: result.assistantMsg.id, role: result.assistantMsg.role, content: result.assistantMsg.content, createdAt: result.assistantMsg.createdAt },
          studyPlan: { id: result.plan.id, title: result.plan.title, phaseCount: phases.length },
          usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, totalTokens, monthlyUsed: usedTokens + totalTokens, monthlyLimit: MONTHLY_TOKEN_LIMIT },
          contextStatus,
        });
      }
    }

    // ── If tool_use: embed mindmap markdown inline in message ──
    if (mindmapToolUse) {
      const { title: mapTitle, markdown: mapMarkdown } = mindmapToolUse.input;

      if (mapTitle && mapMarkdown) {
        const markerText = (assistantText ? `${assistantText}\n\n` : '')
          + `[mindmap_start:${mapTitle}]\n${mapMarkdown}\n[mindmap_end]`;

        const [userMsg, assistantMsg] = await db.$transaction([
          db.chatMessage.create({
            data: {
              notebookId,
              userId,
              chatId,
              role: 'user',
              content: message.trim(),
              tokens: response.usage.input_tokens,
            },
          }),
          db.chatMessage.create({
            data: {
              notebookId,
              userId,
              chatId,
              role: 'assistant',
              content: markerText,
              tokens: response.usage.output_tokens,
            },
          }),
        ]);

        await db.notebookChat.update({
          where: { id: chatId },
          data: { updatedAt: new Date() },
        });

        return successResponse({
          userMessage: {
            id: userMsg.id,
            role: userMsg.role,
            content: userMsg.content,
            createdAt: userMsg.createdAt,
          },
          assistantMessage: {
            id: assistantMsg.id,
            role: assistantMsg.role,
            content: assistantMsg.content,
            createdAt: assistantMsg.createdAt,
          },
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            totalTokens,
            monthlyUsed: usedTokens + totalTokens,
            monthlyLimit: MONTHLY_TOKEN_LIMIT,
          },
          contextStatus,
        });
      }
    }

    // ── Standard text-only response path ──
    const [userMsg, assistantMsg] = await db.$transaction([
      db.chatMessage.create({
        data: {
          notebookId,
          userId,
          chatId,
          role: 'user',
          content: message.trim(),
          tokens: response.usage.input_tokens,
        },
      }),
      db.chatMessage.create({
        data: {
          notebookId,
          userId,
          chatId,
          role: 'assistant',
          content: assistantText,
          tokens: response.usage.output_tokens,
        },
      }),
    ]);

    // Touch chat updatedAt
    await db.notebookChat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    return successResponse({
      userMessage: {
        id: userMsg.id,
        role: userMsg.role,
        content: userMsg.content,
        createdAt: userMsg.createdAt,
      },
      assistantMessage: {
        id: assistantMsg.id,
        role: assistantMsg.role,
        content: assistantMsg.content,
        createdAt: assistantMsg.createdAt,
      },
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens,
        monthlyUsed: usedTokens + totalTokens,
        monthlyLimit: MONTHLY_TOKEN_LIMIT,
      },
      contextStatus,
    });
  } catch (error: unknown) {
    console.error('[AI Chat] Error:', error);

    // Surface Anthropic API errors with useful messages
    if (error && typeof error === 'object' && 'status' in error) {
      const apiError = error as { status: number; error?: { message?: string } };
      const msg = apiError.error?.message ?? 'AI service error';

      if (apiError.status === 400 && msg.includes('credit balance')) {
        return badRequestResponse('AI service billing issue. Please check your Anthropic API credits.');
      }
      if (apiError.status === 401) {
        return badRequestResponse('Invalid Anthropic API key. Please check your configuration.');
      }
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
