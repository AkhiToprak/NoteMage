import { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import {
  badRequestResponse,
  internalErrorResponse,
  tooManyRequestsResponse,
} from './api-response';
import { db } from './db';
import { anthropic, AI_MODEL, MAX_OUTPUT_TOKENS, MAX_CONTEXT_CHARS } from './anthropic';
import { checkUsageLimit, incrementUsage } from './usage-limits';
import { ALL_TOOLS, extractToolUses } from './ai-tools';
import { buildLegacyColumns } from './quiz-grading';
import { QuizSetV2Schema } from '@notemage/shared';
import { extractText } from './fileProcessing';
import { readFile } from './storage';
import { tiptapJsonToPlainText } from './contentConverter';
import { searchYouTubeVideos } from './youtube';
import { generateAndPersistTitle } from './chat-title';
import { NextResponse } from 'next/server';

export interface ChatStreamChat {
  id: string;
  title: string;
  /** Phase 9: nullable for cross-notebook / inbox-only chats. Used as
   * notebookId on generated FlashcardSet/QuizSet/StudyPlan rows. */
  notebookId: string | null;
  contextPageIds: string[];
  contextDocIds: string[];
}

export interface ChatStreamOptions {
  request: NextRequest;
  userId: string;
  /** notebookId stamped on every ChatMessage row this turn produces.
   * Phase 9.6 — nullable: cross-notebook / inbox-only chats persist messages
   * without a primary notebook id. */
  messageNotebookId: string | null;
  chat: ChatStreamChat;
  userMessage: string;
  mageName: string;
  usedTokens: number;
  tokenLimit: number;
}

export async function startChatStream(opts: ChatStreamOptions): Promise<Response> {
  const {
    request,
    userId,
    messageNotebookId,
    chat,
    userMessage,
    mageName,
    usedTokens,
    tokenLimit,
  } = opts;
  const chatId = chat.id;
  const flashcardSetNotebookId = chat.notebookId;

  try {
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

        if (!text && page.content) {
          text = tiptapJsonToPlainText(page.content);
          if (text) {
            db.page
              .update({ where: { id: page.id }, data: { textContent: text } })
              .catch(() => {});
          }
        }

        if (text) {
          contextParts.push(`[Page: ${page.title}]\n${text}`);
        } else {
          skippedSources.push({
            type: 'page',
            name: page.title,
            reason: page.pageType === 'canvas' ? 'canvas_page' : 'no_text',
          });
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

        if (!text && doc.filePath) {
          try {
            const buffer = await readFile(doc.filePath);
            text = await extractText(buffer, doc.fileType);
            if (text) {
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
          skippedSources.push({
            type: 'document',
            name: doc.fileName,
            reason: 'extraction_failed',
          });
        }
      }
    }

    let contextTruncated = false;
    let contextOriginalChars = 0;
    let contextKeptChars = 0;
    if (contextParts.length > 0) {
      const joined = contextParts.join('\n\n---\n\n');
      contextOriginalChars = joined.length;
      if (joined.length > MAX_CONTEXT_CHARS) {
        const trimmed = joined.slice(0, MAX_CONTEXT_CHARS);
        contextParts.length = 0;
        contextParts.push(
          `${trimmed}\n\n[Note: context was truncated to fit the model's input window. Some source material is not included.]`
        );
        contextTruncated = true;
        contextKeptChars = MAX_CONTEXT_CHARS;
      } else {
        contextKeptChars = joined.length;
      }
    }

    // Phase 9.6 — attach a Sentry breadcrumb when the context load was
    // partial (sources skipped or truncated). Non-fatal: we don't capture
    // an exception here; the breadcrumb travels with whatever request-level
    // error may follow so we can correlate.
    if (skippedSources.length > 0 || contextTruncated) {
      Sentry.addBreadcrumb({
        category: 'chat-stream',
        level: skippedSources.length > 0 ? 'warning' : 'info',
        message: 'chat context load partial',
        data: {
          chatId: chat.id,
          skippedCount: skippedSources.length,
          skippedSummary: skippedSources.slice(0, 3).map((s) => `${s.type}:${s.reason}`).join(','),
          truncated: contextTruncated,
          originalChars: contextOriginalChars,
          keptChars: contextKeptChars,
        },
      });
    }

    const contextStatus = {
      loaded: contextParts.length,
      skipped: skippedSources,
      total: contextParts.length + skippedSources.length,
      truncated: contextTruncated,
      originalChars: contextOriginalChars,
      keptChars: contextKeptChars,
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
    conversationMessages.push({ role: 'user', content: userMessage });

    const shouldGenerateTitle = history.length === 0 && chat.title === 'New Chat';
    const fireTitleGenIfNeeded = async (
      ctrl: ReadableStreamDefaultController<Uint8Array>
    ): Promise<void> => {
      if (!shouldGenerateTitle) return;
      try {
        const newTitle = await generateAndPersistTitle(chatId, userMessage, userId);
        if (newTitle) {
          ctrl.enqueue(sseEvent('chat_title', { title: newTitle }));
        }
      } catch (e) {
        console.error('[chat-stream] title gen failed', e);
      }
    };

    // ── Build system prompt ──
    const systemParts = [
      `You are ${mageName}, an AI study assistant embedded in the Notemage notebook app.`,
      `Your name is ${mageName}. When the user asks your name, respond with "${mageName}".`,
      'Help the user study, understand, and review their notes and documents.',
      'Be concise, clear, and educational. Use markdown formatting when helpful.',
      '',
      'You have access to a `create_flashcards` tool. When the user asks you to create, generate, or make flashcards, use this tool. Create high-quality flashcards with clear questions and concise answers. For complex answers, use bullet points or numbered lists.',
      '',
      'You also have access to a `create_quiz_v2` tool. When the user asks you to create, generate, or make a quiz, test, or multiple-choice questions, use `create_quiz_v2`. The legacy `create_quiz` tool exists only for backward compatibility — prefer `create_quiz_v2`. Mix question kinds intentionally (mc, fill_blank, word_bank, match_pairs, translation, sentence_reorder, equation) — see the tool description for each payload shape. Use mc for factual recall, fill_blank for definitions/short answers, word_bank for ordered grammar/syntax, match_pairs for term/definition pairs, translation for language learning, sentence_reorder for syntax sequencing, equation for math. Aim for variety across a quiz rather than all-MC. For MC questions: 4 options each, distribute the correct answer evenly across positions 0–3, keep all four options similar in length and level of detail, make distractors plausible. Always provide hints and explanations for both correct and incorrect answers to help students learn.',
      '',
      'You also have access to a `create_mindmap` tool. When the user asks you to create, generate, or make a mind map, concept map, or topic overview, use this tool. Structure the content using Markdown headings (# for root, ## for main branches, ### for sub-branches, #### for details). Keep node text concise.',
      '',
      'You also have access to a `create_study_plan` tool. When the user asks you to create, generate, or make a study plan, study schedule, or revision plan, use this tool. Create logical phases that distribute materials across a reasonable timeframe. Only use referenceIds from the notebook inventory provided in context.',
      '',
      'You also have access to a `create_presentation` tool. When the user asks you to create, generate, or make a presentation, slides, PowerPoint, PPT, or deck, use this tool. Follow these rules:',
      '- Every content slide MUST have an ACTION TITLE: a complete sentence stating the takeaway, NOT a topic label. Example: "Early interventions reduce dropout rates by 40%" instead of "Results".',
      '- Use varied slide types: start with a title slide, use section_dividers to organize, two_column for comparisons, and end with a conclusion.',
      '- Pick a themeColor hex that fits the subject (e.g. blue for science, green for biology, red for history).',
      '- Add graphicDescription on slides where a visual would help (charts, diagrams, illustrations). Be specific about what the graphic shows.',
      '- Keep bullets concise: 3-5 per slide, max ~15 words each.',
      '- Aim for 8-15 slides total. Add speaker notes with extra detail.',
      '',
      'You also have access to a `recommend_videos` tool. Use this tool when:',
      '- The user explicitly asks for a video, tutorial, or visual explanation.',
      '- You are explaining a complex visual or procedural topic that would benefit from video (e.g. lab techniques, geometric proofs, historical events, programming tutorials). In this case, call the tool autonomously alongside your text explanation.',
      'Do NOT recommend videos for every question — only when a video would genuinely add value beyond your text explanation. Generate a specific, educational search query.',
    ];

    if (contextParts.length > 0) {
      systemParts.push(
        '\nThe user has provided the following context from their notebook:\n',
        contextParts.join('\n\n---\n\n')
      );
    }

    // ── Usage limit check (scholar_chat) ──
    const chatUsage = await checkUsageLimit(userId, 'scholar_chat');
    if (!chatUsage.allowed) {
      return NextResponse.json(
        {
          error: 'Monthly chat limit reached. Upgrade your plan for more messages.',
          limitReached: true,
        },
        { status: 429 }
      );
    }

    // ── SSE helpers ──
    const encoder = new TextEncoder();
    const sseEvent = (event: string, data: unknown) =>
      encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    // Helper to save messages + optional tool artifacts and return done payload
    async function saveAndBuildDone(
      assistantContent: string,
      inputTokens: number,
      outputTokens: number,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      extras: Record<string, any> = {}
    ) {
      const totalTokens = inputTokens + outputTokens;

      const [userMsg, assistantMsg] = await db.$transaction([
        db.chatMessage.create({
          data: {
            notebookId: messageNotebookId,
            userId,
            chatId,
            role: 'user',
            content: userMessage,
            tokens: inputTokens,
          },
        }),
        db.chatMessage.create({
          data: {
            notebookId: messageNotebookId,
            userId,
            chatId,
            role: 'assistant',
            content: assistantContent,
            tokens: outputTokens,
          },
        }),
      ]);

      await db.notebookChat.update({
        where: { id: chatId },
        data: { updatedAt: new Date() },
      });

      return {
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
        ...extras,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens,
          monthlyUsed: usedTokens + totalTokens,
          monthlyLimit: tokenLimit,
        },
        contextStatus,
      };
    }

    // ── Call Anthropic API (streaming) ──
    const abortController = new AbortController();
    const onAbort = () => abortController.abort();
    request.signal.addEventListener('abort', onAbort);

    const stream = anthropic.messages.stream(
      {
        model: AI_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemParts.join('\n'),
        messages: conversationMessages,
        tools: ALL_TOOLS,
      },
      { signal: abortController.signal }
    );

    return new Response(
      new ReadableStream({
        async start(controller) {
          let fullText = '';

          stream.on('text', (delta) => {
            fullText += delta;
            controller.enqueue(sseEvent('text', { delta }));
          });

          try {
            const response = await stream.finalMessage();

            await incrementUsage(userId, 'scholar_chat');

            const totalTokens = response.usage.input_tokens + response.usage.output_tokens;

            const {
              text: extractedText,
              flashcard: flashcardToolUse,
              quiz: quizToolUse,
              quizV2: quizV2ToolUse,
              mindmap: mindmapToolUse,
              studyPlan: studyPlanToolUse,
              presentation: presentationToolUse,
              youtubeVideos: youtubeVideosToolUse,
            } = extractToolUses(response.content);
            let assistantText = extractedText;

            if (flashcardToolUse) {
              const { title: setTitle, flashcards } = flashcardToolUse.input;

              if (!setTitle || !Array.isArray(flashcards) || flashcards.length === 0) {
                assistantText =
                  assistantText ||
                  'I tried to create flashcards but the format was invalid. Please try again.';
              } else {
                const fcUsage = await checkUsageLimit(userId, 'ai_flashcards');
                if (!fcUsage.allowed) {
                  controller.enqueue(
                    sseEvent('error', {
                      error:
                        'Monthly flashcard generation limit reached. Upgrade your plan for more.',
                    })
                  );
                  controller.close();
                  return;
                }

                const result = await db.$transaction(async (tx) => {
                  const userMsg = await tx.chatMessage.create({
                    data: {
                      notebookId: messageNotebookId,
                      userId,
                      chatId,
                      role: 'user',
                      content: userMessage,
                      tokens: response.usage.input_tokens,
                    },
                  });
                  const fSet = await tx.flashcardSet.create({
                    data: {
                      userId,
                      notebookId: flashcardSetNotebookId,
                      chatId,
                      messageId: '',
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
                  const markerText = assistantText
                    ? `${assistantText}\n\n[flashcard_set:${fSet.id}]`
                    : `I've created a flashcard set "${setTitle}" with ${flashcards.length} cards.\n\n[flashcard_set:${fSet.id}]`;
                  const assistantMsg = await tx.chatMessage.create({
                    data: {
                      notebookId: messageNotebookId,
                      userId,
                      chatId,
                      role: 'assistant',
                      content: markerText,
                      tokens: response.usage.output_tokens,
                    },
                  });
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

                await incrementUsage(userId, 'ai_flashcards');

                controller.enqueue(
                  sseEvent('done', {
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
                    flashcardSet: {
                      id: result.fSet.id,
                      title: result.fSet.title,
                      cardCount: result.fSet.flashcards.length,
                    },
                    usage: {
                      inputTokens: response.usage.input_tokens,
                      outputTokens: response.usage.output_tokens,
                      totalTokens,
                      monthlyUsed: usedTokens + totalTokens,
                      monthlyLimit: tokenLimit,
                    },
                    contextStatus,
                  })
                );
                await fireTitleGenIfNeeded(controller);
                controller.close();
                return;
              }
            }

            if (quizV2ToolUse) {
              const { title: quizTitle, questions } = quizV2ToolUse.input;

              for (const q of questions) {
                if (q.kind !== 'mc') continue;
                const mcPayload = q.payload;
                let correctIdx = mcPayload.correctIndex;
                for (let i = mcPayload.options.length - 1; i > 0; i--) {
                  const j = Math.floor(Math.random() * (i + 1));
                  [mcPayload.options[i], mcPayload.options[j]] = [
                    mcPayload.options[j],
                    mcPayload.options[i],
                  ];
                  if (correctIdx === i) correctIdx = j;
                  else if (correctIdx === j) correctIdx = i;
                }
                mcPayload.correctIndex = correctIdx;
              }

              const parsed = QuizSetV2Schema.safeParse({ title: quizTitle, questions });
              if (!parsed.success) {
                controller.enqueue(
                  sseEvent('error', {
                    error: 'AI returned an invalid quiz',
                    issues: parsed.error.issues,
                  })
                );
                controller.close();
                return;
              }

              const result = await db.$transaction(async (tx) => {
                const userMsg = await tx.chatMessage.create({
                  data: {
                    notebookId: messageNotebookId,
                    userId,
                    chatId,
                    role: 'user',
                    content: userMessage,
                    tokens: response.usage.input_tokens,
                  },
                });
                const qSet = await tx.quizSet.create({
                  data: {
                    userId,
                    notebookId: flashcardSetNotebookId,
                    chatId,
                    messageId: '',
                    title: quizTitle,
                    questions: {
                      create: parsed.data.questions.map((q, i) => ({
                        kind: q.kind,
                        payload: q.payload,
                        question: q.prompt,
                        ...buildLegacyColumns(q.kind, q.payload),
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
                    notebookId: messageNotebookId,
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

              controller.enqueue(
                sseEvent('done', {
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
                    monthlyLimit: tokenLimit,
                  },
                  contextStatus,
                })
              );
              await fireTitleGenIfNeeded(controller);
              controller.close();
              return;
            }

            if (quizToolUse) {
              const { title: quizTitle, questions } = quizToolUse.input;

              for (const q of questions) {
                let correctIdx = q.correctIndex;
                for (let i = q.options.length - 1; i > 0; i--) {
                  const j = Math.floor(Math.random() * (i + 1));
                  [q.options[i], q.options[j]] = [q.options[j], q.options[i]];
                  if (correctIdx === i) correctIdx = j;
                  else if (correctIdx === j) correctIdx = i;
                }
                q.correctIndex = correctIdx;
              }

              if (!quizTitle || !Array.isArray(questions) || questions.length === 0) {
                assistantText =
                  assistantText ||
                  'I tried to create a quiz but the format was invalid. Please try again.';
              } else {
                const result = await db.$transaction(async (tx) => {
                  const userMsg = await tx.chatMessage.create({
                    data: {
                      notebookId: messageNotebookId,
                      userId,
                      chatId,
                      role: 'user',
                      content: userMessage,
                      tokens: response.usage.input_tokens,
                    },
                  });
                  const qSet = await tx.quizSet.create({
                    data: {
                      userId,
                      notebookId: flashcardSetNotebookId,
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
                      notebookId: messageNotebookId,
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

                controller.enqueue(
                  sseEvent('done', {
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
                      monthlyLimit: tokenLimit,
                    },
                    contextStatus,
                  })
                );
                await fireTitleGenIfNeeded(controller);
                controller.close();
                return;
              }
            }

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
                    data: {
                      notebookId: messageNotebookId,
                      userId,
                      chatId,
                      role: 'user',
                      content: userMessage,
                      tokens: response.usage.input_tokens,
                    },
                  });
                  const plan = await tx.studyPlan.create({
                    data: {
                      userId,
                      notebookId: flashcardSetNotebookId,
                      title: planTitle,
                      description: planDesc || null,
                      startDate: today,
                      endDate: planEndDate,
                      source: 'ai',
                    },
                  });
                  for (let i = 0; i < phasesWithDates.length; i++) {
                    const p = phasesWithDates[i];
                    // Phase 10.1 — schema cutover dropped StudyMaterial.
                    // We create phases empty here; Phase 10.3's path
                    // generator orchestrator fills slot/activity content.
                    void p.materials;
                    await tx.studyPhase.create({
                      data: {
                        planId: plan.id,
                        title: p.title,
                        description: p.description || null,
                        sortOrder: i,
                        startDate: p.startDate,
                        endDate: p.endDate,
                        status: i === 0 ? 'active' : 'upcoming',
                      },
                    });
                  }
                  const markerText = assistantText
                    ? `${assistantText}\n\n[study_plan:${plan.id}]`
                    : `I've created a study plan "${planTitle}" with ${phases.length} phases.\n\n[study_plan:${plan.id}]`;
                  const assistantMsg = await tx.chatMessage.create({
                    data: {
                      notebookId: messageNotebookId,
                      userId,
                      chatId,
                      role: 'assistant',
                      content: markerText,
                      tokens: response.usage.output_tokens,
                    },
                  });
                  await tx.notebookChat.update({
                    where: { id: chatId },
                    data: { updatedAt: new Date() },
                  });
                  return { userMsg, assistantMsg, plan };
                });

                controller.enqueue(
                  sseEvent('done', {
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
                    studyPlan: {
                      id: result.plan.id,
                      title: result.plan.title,
                      phaseCount: phases.length,
                    },
                    usage: {
                      inputTokens: response.usage.input_tokens,
                      outputTokens: response.usage.output_tokens,
                      totalTokens,
                      monthlyUsed: usedTokens + totalTokens,
                      monthlyLimit: tokenLimit,
                    },
                    contextStatus,
                  })
                );
                await fireTitleGenIfNeeded(controller);
                controller.close();
                return;
              }
            }

            if (mindmapToolUse) {
              const { title: mapTitle, markdown: mapMarkdown } = mindmapToolUse.input;
              if (mapTitle && mapMarkdown) {
                const markerText =
                  (assistantText ? `${assistantText}\n\n` : '') +
                  `[mindmap_start:${mapTitle}]\n${mapMarkdown}\n[mindmap_end]`;
                const done = await saveAndBuildDone(
                  markerText,
                  response.usage.input_tokens,
                  response.usage.output_tokens
                );
                controller.enqueue(sseEvent('done', done));
                await fireTitleGenIfNeeded(controller);
                controller.close();
                return;
              }
            }

            if (presentationToolUse) {
              const {
                title: presTitle,
                themeColor,
                slides: presSlides,
              } = presentationToolUse.input;
              if (presTitle && Array.isArray(presSlides) && presSlides.length > 0) {
                const pptxUsage = await checkUsageLimit(userId, 'ai_pptx');
                if (!pptxUsage.allowed) {
                  controller.enqueue(
                    sseEvent('error', {
                      error:
                        'Monthly presentation generation limit reached. Upgrade your plan for more.',
                    })
                  );
                  controller.close();
                  return;
                }
                const presJson = JSON.stringify({ themeColor, slides: presSlides });
                const markerText =
                  (assistantText ? `${assistantText}\n\n` : '') +
                  `[presentation_start:${presTitle}]\n${presJson}\n[presentation_end]`;
                const done = await saveAndBuildDone(
                  markerText,
                  response.usage.input_tokens,
                  response.usage.output_tokens
                );
                await incrementUsage(userId, 'ai_pptx');
                controller.enqueue(sseEvent('done', done));
                await fireTitleGenIfNeeded(controller);
                controller.close();
                return;
              }
            }

            if (youtubeVideosToolUse) {
              const { search_query, max_results } = youtubeVideosToolUse.input;
              if (search_query) {
                try {
                  const videos = await searchYouTubeVideos(search_query, max_results ?? 3);
                  if (videos.length > 0) {
                    const videosJson = JSON.stringify(videos);
                    const markerText =
                      (assistantText ? `${assistantText}\n\n` : '') +
                      `[youtube_videos_start:${search_query}]\n${videosJson}\n[youtube_videos_end]`;
                    const done = await saveAndBuildDone(
                      markerText,
                      response.usage.input_tokens,
                      response.usage.output_tokens
                    );
                    controller.enqueue(sseEvent('done', done));
                    await fireTitleGenIfNeeded(controller);
                    controller.close();
                    return;
                  }
                } catch (err) {
                  console.error('[AI Chat] YouTube search failed:', err);
                }
              }
            }

            const done = await saveAndBuildDone(
              assistantText,
              response.usage.input_tokens,
              response.usage.output_tokens
            );
            controller.enqueue(sseEvent('done', done));
            await fireTitleGenIfNeeded(controller);
            controller.close();
          } catch (error: unknown) {
            if (abortController.signal.aborted || request.signal.aborted) {
              try {
                const partialText = fullText || '[generation stopped]';
                const done = await saveAndBuildDone(partialText, 0, 0);
                controller.enqueue(sseEvent('done', done));
                await fireTitleGenIfNeeded(controller);
              } catch {
                controller.enqueue(sseEvent('error', { error: 'Failed to save partial response' }));
              }
              controller.close();
              return;
            }

            console.error('[AI Chat] Streaming error:', error);

            let errorMsg = 'AI service error';
            if (error && typeof error === 'object' && 'status' in error) {
              const apiError = error as { status: number; error?: { message?: string } };
              const msg = apiError.error?.message ?? 'AI service error';
              if (apiError.status === 400 && msg.includes('credit balance')) {
                errorMsg = 'AI service billing issue. Please check your Anthropic API credits.';
              } else if (apiError.status === 401) {
                errorMsg = 'Invalid Anthropic API key. Please check your configuration.';
              } else if (apiError.status === 429) {
                errorMsg = 'AI service rate limit reached. Please wait a moment and try again.';
              } else if (apiError.status === 529 || apiError.status === 503) {
                errorMsg = 'AI service is temporarily overloaded. Please try again in a moment.';
              }
            }

            controller.enqueue(sseEvent('error', { error: errorMsg }));
            controller.close();
          } finally {
            request.signal.removeEventListener('abort', onAbort);
          }
        },
      }),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      }
    );
  } catch (error: unknown) {
    console.error('[AI Chat] Error:', error);

    if (error && typeof error === 'object' && 'status' in error) {
      const apiError = error as { status: number; error?: { message?: string } };
      const msg = apiError.error?.message ?? 'AI service error';

      if (apiError.status === 400 && msg.includes('credit balance')) {
        return badRequestResponse(
          'AI service billing issue. Please check your Anthropic API credits.'
        );
      }
      if (apiError.status === 401) {
        return badRequestResponse('Invalid Anthropic API key. Please check your configuration.');
      }
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
