import { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import type Anthropic from '@anthropic-ai/sdk';
import {
  badRequestResponse,
  internalErrorResponse,
  tooManyRequestsResponse,
} from './api-response';
import { db } from './db';
import { anthropic, AI_MODEL, MAX_OUTPUT_TOKENS, MAX_CONTEXT_CHARS } from './anthropic';
import { checkUsageLimit, incrementUsage } from './usage-limits';
import {
  extractToolUses,
  FLASHCARD_TOOL_WITH_FIGURES,
  QUIZ_TOOL_V2_WITH_FIGURES,
} from './ai-tools';
import { resolveChatIntent } from './chat-intent';
import { CHAT_BASE_INSTRUCTIONS, INTENT_GUIDANCE, INTENT_TOOL } from './chat-guidance';
import {
  loadSourceImages,
  renderImageCatalog,
  resolveFlashcardFigures,
  resolveQuizFigures,
  type SourceImage,
} from './path-image-catalog';
import { copyImage } from './storage';
import { randomUUID } from 'crypto';
import { resolveModel } from './model-routing';
import { logAiUsage } from './ai-usage';
import { streamGeminiChatText } from './chat-stream-gemini';
import type { TierKey } from './tiers';
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
  /** User's billing tier — routes free-form chat to Gemini (FREE) vs
   *  Anthropic (PRO/admin). Generation turns always use Anthropic. */
  tier: TierKey;
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
    tier,
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

    // System prompt + tools are built dynamically below, AFTER the usage
    // check, based on the resolved chat intent (chat-intent.ts).

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

    // ── Resolve intent → build system + tools dynamically ──
    // Plain chat carries NO tools and a minimal prompt; a generation intent
    // carries exactly one forced tool + that intent's guidance. This keeps
    // ~2.5–3k tokens of tool schema + tool prose off the dominant plain-chat
    // path. (chat-intent.ts / chat-guidance.ts.)
    const recentTail = conversationMessages
      .slice(-3, -1)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');
    const intentResult = await resolveChatIntent({ userMessage, recentTail });
    const intent = intentResult.intent;

    // ── Figure-reuse (P5): chat-conditional source-image catalog ──
    // Only flashcards/quiz turns can place a figure, and ONLY from images on the
    // chat's ATTACHED context pages that already carry a caption (no captioning
    // pass inside a chat turn). Attached Documents have no PageImages → never
    // offered. The catalog is deterministic given the context pages, so it rides
    // the cached context block. Chat never invents images — any non-catalog ref
    // is dropped at persist time by resolve{Flashcard,Quiz}Figures.
    let chatImageCatalog = '';
    let chatSourceImages: SourceImage[] = [];
    if (
      (intent === 'flashcards' || intent === 'quiz') &&
      process.env.CHAT_FIGURES_DISABLED !== '1' &&
      chat.contextPageIds.length > 0
    ) {
      try {
        const imgs = await loadSourceImages(userId, chat.contextPageIds);
        const rendered = renderImageCatalog(imgs); // '' when none captioned
        if (rendered) {
          chatImageCatalog = rendered;
          // Validate only against captioned images (the model only ever sees
          // those in the catalog).
          chatSourceImages = imgs.filter((i) => i.caption && i.caption.trim().length > 0);
        }
      } catch (err) {
        Sentry.addBreadcrumb({
          category: 'chat',
          level: 'warning',
          message: 'chat figure catalog load failed',
          data: { message: err instanceof Error ? err.message : String(err) },
        });
      }
    }
    const figuresAvailable = chatImageCatalog.length > 0;

    const systemBlocks: Anthropic.Messages.TextBlockParam[] = [
      { type: 'text', text: CHAT_BASE_INSTRUCTIONS },
    ];
    if (intent !== 'chat') {
      systemBlocks.push({ type: 'text', text: INTENT_GUIDANCE[intent] });
    }
    // Context block = the notebook corpus + (P5) the optional figure catalog.
    // Both are byte-stable for the chat's context, so they ride one 1h-cached
    // block reused across turns.
    let contextBlockText =
      contextParts.length > 0
        ? '\nThe user has provided the following context from their notebook:\n\n' +
          contextParts.join('\n\n---\n\n')
        : '';
    if (figuresAvailable) {
      const figInstr =
        intent === 'flashcards'
          ? 'OPTIONAL FIGURES — a card MAY embed ONE image from the SOURCE FIGURES list below by adding a `"figure"` object to that card: `{ "imageRef": string, "side": "front"|"back", "caption": string }`. Copy each `imageRef` VERBATIM from that list (never invent one); add a figure ONLY to a card it genuinely illustrates; AT MOST 4 cards may carry one; prefer omission. `side` defaults to "front" (the question side).'
          : 'OPTIONAL FIGURES — a question MAY show ONE image from the SOURCE FIGURES list below by adding a `"figure"` object at the QUESTION level (a sibling of `kind`/`prompt`/`payload`, NEVER inside `payload`): `{ "imageRef": string, "caption": string }`. The image renders as an exhibit ABOVE the prompt. Copy each `imageRef` VERBATIM from that list (never invent one); add a figure ONLY to a question it genuinely illustrates; AT MOST 3 questions may carry one; prefer omission.';
      contextBlockText += (contextBlockText ? '\n\n' : '\n') + figInstr + '\n\n' + chatImageCatalog;
    }
    if (contextBlockText) {
      systemBlocks.push({
        type: 'text',
        text: contextBlockText,
        // 1h TTL: chat turns can span >5 min; the byte-stable corpus is the
        // big cacheable block, reused across turns of the same chat.
        cache_control: { type: 'ephemeral', ttl: '1h' },
      });
    }
    // Identity carries the per-user mage name — keep it AFTER the cached
    // corpus block so the cached prefix stays user-independent.
    systemBlocks.push({
      type: 'text',
      text: `You are ${mageName}, an AI study assistant embedded in the Notemage notebook app. Your name is ${mageName}. When the user asks your name, respond with "${mageName}".`,
    });

    // Single forced tool for a generation intent (cloned so we never mutate
    // the shared export); null for plain chat. P5: swap in the figure-enabled
    // flashcard/quiz variant ONLY when a catalog is present, so a turn without
    // imported images never advertises a `figure` field it can't validate.
    const baseToolForIntent: Anthropic.Messages.Tool | null =
      intent === 'chat'
        ? null
        : figuresAvailable && intent === 'flashcards'
          ? FLASHCARD_TOOL_WITH_FIGURES
          : figuresAvailable && intent === 'quiz'
            ? QUIZ_TOOL_V2_WITH_FIGURES
            : INTENT_TOOL[intent];
    const forcedTool: Anthropic.Messages.Tool | null = baseToolForIntent
      ? { ...baseToolForIntent, cache_control: { type: 'ephemeral', ttl: '1h' } }
      : null;

    // Plain chat (no tool) routes via the resolver: the optimized default is
    // Flash for BOTH free and Pro (cheaper than Haiku, better than Flash-Lite).
    // Generation intents always stay on Anthropic. CHAT_GEMINI_DISABLED (in the
    // resolver) forces Anthropic; CHAT_PLAIN_MODEL pins the model. Build a flat
    // Gemini system string (corpus leads for implicit caching) for that path.
    const plainChatModel = intent === 'chat' ? resolveModel('chat-plain', { tier }) : null;
    const useGemini = plainChatModel?.provider === 'gemini';
    const geminiCorpus =
      contextParts.length > 0
        ? '\nThe user has provided the following context from their notebook:\n\n' +
          contextParts.join('\n\n---\n\n')
        : undefined;
    // G5 — Gemini tends to open every turn with a "Hi! I'm <name>…" preamble.
    // The final directive suppresses that so replies start with the answer.
    const geminiSystem = `${CHAT_BASE_INSTRUCTIONS}\n\nYou are ${mageName}, an AI study assistant embedded in the Notemage notebook app. Your name is ${mageName}. When the user asks your name, respond with "${mageName}".\n\nAnswer the user's message directly. Do not begin with a greeting, and do not introduce yourself or restate your name unless the user explicitly asks who you are.`;

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

    const streamParams: Parameters<typeof anthropic.messages.stream>[0] = {
      model: AI_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemBlocks,
      messages: conversationMessages,
    };
    if (forcedTool) {
      streamParams.tools = [forcedTool];
      streamParams.tool_choice = { type: 'tool', name: forcedTool.name };
    }

    return new Response(
      new ReadableStream({
        async start(controller) {
          let fullText = '';
          const enqueueText = (delta: string) => {
            fullText += delta;
            controller.enqueue(sseEvent('text', { delta }));
          };

          // ── Free-tier plain chat → Gemini Flash-Lite ──
          // On a hard Gemini failure BEFORE any text is streamed, fall back to
          // the Anthropic path below. On abort or a mid-stream failure,
          // finalize whatever was streamed as a partial.
          if (useGemini) {
            try {
              const { usage } = await streamGeminiChatText({
                systemInstruction: geminiSystem,
                corpus: geminiCorpus,
                messages: conversationMessages,
                signal: abortController.signal,
                onText: enqueueText,
                model: plainChatModel!.model,
              });

              if (abortController.signal.aborted || request.signal.aborted) {
                const done = await saveAndBuildDone(fullText || '[generation stopped]', 0, 0);
                controller.enqueue(sseEvent('done', done));
                await fireTitleGenIfNeeded(controller);
                controller.close();
                return;
              }

              await incrementUsage(userId, 'scholar_chat');

              Sentry.addBreadcrumb({
                category: 'chat-stream',
                level: 'info',
                message: 'chat gemini usage',
                data: {
                  provider: 'gemini',
                  intent,
                  intentVia: intentResult.via,
                  toolLoaded: 'none',
                  chatId: chat.id,
                  inputTokens: usage.promptTokens,
                  outputTokens: usage.candidatesTokens,
                  cacheReadTokens: usage.cachedTokens,
                  contextChars: contextKeptChars,
                },
              });

              logAiUsage({
                userId,
                feature: 'chat-plain',
                tier,
                provider: 'gemini',
                model: plainChatModel!.model,
                inputTokens: usage.promptTokens,
                outputTokens: usage.candidatesTokens,
                cacheReadTokens: usage.cachedTokens,
              });

              const done = await saveAndBuildDone(
                fullText,
                usage.promptTokens,
                usage.candidatesTokens
              );
              controller.enqueue(sseEvent('done', done));
              await fireTitleGenIfNeeded(controller);
              controller.close();
              return;
            } catch (geminiErr) {
              if (abortController.signal.aborted || request.signal.aborted) {
                const done = await saveAndBuildDone(fullText || '[generation stopped]', 0, 0);
                controller.enqueue(sseEvent('done', done));
                await fireTitleGenIfNeeded(controller);
                controller.close();
                return;
              }
              if (fullText.length > 0) {
                // Failed mid-stream after emitting text — finalize the partial
                // rather than restarting on Anthropic (which would duplicate).
                console.error('[AI Chat] Gemini mid-stream error:', geminiErr);
                const done = await saveAndBuildDone(fullText, 0, 0);
                controller.enqueue(sseEvent('done', done));
                await fireTitleGenIfNeeded(controller);
                controller.close();
                return;
              }
              // Nothing streamed yet — fall back to Anthropic.
              console.error(
                '[AI Chat] Gemini failed pre-stream, falling back to Anthropic:',
                geminiErr
              );
            }
          }

          const stream = anthropic.messages.stream(streamParams, {
            signal: abortController.signal,
          });

          stream.on('text', enqueueText);

          try {
            const response = await stream.finalMessage();

            await incrementUsage(userId, 'scholar_chat');

            const totalTokens = response.usage.input_tokens + response.usage.output_tokens;

            // P1 — record cache hit/miss so we can verify the savings in
            // Sentry. `input_tokens` here is post-cache (user message +
            // history only when the corpus block hits the cache).
            const cacheReadTokens = response.usage.cache_read_input_tokens ?? 0;
            const cacheCreationTokens = response.usage.cache_creation_input_tokens ?? 0;
            Sentry.addBreadcrumb({
              category: 'chat-stream',
              level: 'info',
              message: 'chat anthropic usage',
              data: {
                provider: 'anthropic',
                intent,
                intentVia: intentResult.via,
                toolLoaded: forcedTool?.name ?? 'none',
                chatId: chat.id,
                inputTokens: response.usage.input_tokens,
                outputTokens: response.usage.output_tokens,
                cacheReadTokens,
                cacheCreationTokens,
                contextChars: contextKeptChars,
              },
            });

            logAiUsage({
              userId,
              feature: intent === 'chat' ? 'chat-plain' : 'chat-generate',
              tier,
              provider: 'anthropic',
              model: AI_MODEL,
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
              cacheReadTokens,
              cacheWriteTokens: cacheCreationTokens,
              extra: { intent },
            });

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

                // Figure-reuse (P5): validate the model's per-card figures
                // against the chat catalog (drop hallucinated/duplicate refs,
                // cap 4), then SNAPSHOT each into flashcard-images/{cardId}/…
                // BEFORE the tx — storage I/O must not hold a DB transaction
                // open. Pre-generated card ids let the rows nest into the same
                // create. A copy failure drops that one figure; the card saves.
                const fcFigures = figuresAvailable
                  ? resolveFlashcardFigures(flashcards, chatSourceImages)
                  : [];
                const fcCardIds = flashcards.map(() => randomUUID());
                const fcSnapped = new Map<
                  number,
                  { side: 'front' | 'back'; fileName: string; filePath: string; fileSize: number; mimeType: string; caption: string }[]
                >();
                for (const fig of fcFigures) {
                  try {
                    const dest = `flashcard-images/${fcCardIds[fig.cardIndex]}/${Date.now()}-${fig.cardIndex}`;
                    const { filePath, fileSize } = await copyImage(fig.image.filePath, dest);
                    const list = fcSnapped.get(fig.cardIndex) ?? [];
                    list.push({
                      side: fig.side,
                      fileName: fig.image.fileName,
                      filePath,
                      fileSize,
                      mimeType: fig.image.mimeType,
                      caption: fig.caption,
                    });
                    fcSnapped.set(fig.cardIndex, list);
                  } catch (err) {
                    Sentry.addBreadcrumb({
                      category: 'chat',
                      level: 'warning',
                      message: 'chat flashcard figure copy failed',
                      data: { message: err instanceof Error ? err.message : String(err) },
                    });
                  }
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
                        create: flashcards.map((fc, i) => {
                          const imgs = fcSnapped.get(i);
                          return {
                            id: fcCardIds[i],
                            question: fc.question,
                            answer: fc.answer,
                            sortOrder: i,
                            ...(imgs && imgs.length > 0
                              ? {
                                  images: {
                                    create: imgs.map((s) => ({
                                      side: s.side,
                                      fileName: s.fileName,
                                      filePath: s.filePath,
                                      fileSize: s.fileSize,
                                      mimeType: s.mimeType,
                                      caption: s.caption,
                                      sortOrder: 0,
                                    })),
                                  },
                                }
                              : {}),
                          };
                        }),
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

              const quizUsage = await checkUsageLimit(userId, 'ai_quizzes');
              if (!quizUsage.allowed) {
                controller.enqueue(
                  sseEvent('error', {
                    error: 'Monthly quiz generation limit reached. Upgrade your plan for more.',
                  })
                );
                controller.close();
                return;
              }

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

              // Figure-reuse (P5): validate per-question exhibits against the
              // chat catalog (drop hallucinated/duplicate refs, cap 3), then
              // SNAPSHOT each into quiz-images/{questionId}/… BEFORE the tx.
              // Pre-generated question ids let the row nest into the same
              // create. A copy failure drops that one exhibit; the question saves.
              const qFigures = figuresAvailable
                ? resolveQuizFigures(parsed.data.questions, chatSourceImages)
                : [];
              const qQuestionIds = parsed.data.questions.map(() => randomUUID());
              const qSnapped = new Map<
                number,
                { fileName: string; filePath: string; fileSize: number; mimeType: string; caption: string; sourcePageImageId: string }
              >();
              for (const fig of qFigures) {
                try {
                  const dest = `quiz-images/${qQuestionIds[fig.questionIndex]}/${Date.now()}-${fig.questionIndex}`;
                  const { filePath, fileSize } = await copyImage(fig.image.filePath, dest);
                  qSnapped.set(fig.questionIndex, {
                    fileName: fig.image.fileName,
                    filePath,
                    fileSize,
                    mimeType: fig.image.mimeType,
                    caption: fig.caption,
                    sourcePageImageId: fig.image.id,
                  });
                } catch (err) {
                  Sentry.addBreadcrumb({
                    category: 'chat',
                    level: 'warning',
                    message: 'chat quiz figure copy failed',
                    data: { message: err instanceof Error ? err.message : String(err) },
                  });
                }
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
                      create: parsed.data.questions.map((q, i) => {
                        const snap = qSnapped.get(i);
                        return {
                          id: qQuestionIds[i],
                          kind: q.kind,
                          payload: q.payload,
                          question: q.prompt,
                          ...buildLegacyColumns(q.kind, q.payload),
                          hint: q.hint ?? null,
                          correctExplanation: q.correctExplanation ?? null,
                          wrongExplanation: q.wrongExplanation ?? null,
                          sortOrder: i,
                          ...(snap
                            ? {
                                image: {
                                  create: {
                                    fileName: snap.fileName,
                                    filePath: snap.filePath,
                                    fileSize: snap.fileSize,
                                    mimeType: snap.mimeType,
                                    caption: snap.caption,
                                    sourcePageImageId: snap.sourcePageImageId,
                                  },
                                },
                              }
                            : {}),
                        };
                      }),
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

              await incrementUsage(userId, 'ai_quizzes');

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
                const quizUsage = await checkUsageLimit(userId, 'ai_quizzes');
                if (!quizUsage.allowed) {
                  controller.enqueue(
                    sseEvent('error', {
                      error: 'Monthly quiz generation limit reached. Upgrade your plan for more.',
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

                await incrementUsage(userId, 'ai_quizzes');

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
                const planUsage = await checkUsageLimit(userId, 'ai_study_plan');
                if (!planUsage.allowed) {
                  controller.enqueue(
                    sseEvent('error', {
                      error: 'Monthly study plan limit reached. Upgrade your plan for more.',
                    })
                  );
                  controller.close();
                  return;
                }

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

                await incrementUsage(userId, 'ai_study_plan');

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
