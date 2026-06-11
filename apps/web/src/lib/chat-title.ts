import { anthropic } from './anthropic';
import { db } from './db';
import { logTelemetry } from './telemetry-server';
import { resolveModel } from './model-routing';
import { generateGeminiText } from './gemini-text';
import { logAiUsage } from './ai-usage';

const SYSTEM_PROMPT =
  'Return a 3–5 word title for this conversation in plain text. No quotes, no period. Write the title in the same language as the message. Use Title Case only when the language is English.';

function sanitizeTitle(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\.+$/g, '')
    .replace(/\s+/g, ' ');
  if (cleaned.length === 0) return '';
  return cleaned.length > 80 ? cleaned.slice(0, 80).trim() : cleaned;
}

export async function generateAndPersistTitle(
  chatId: string,
  firstUserMessage: string,
  userId: string | null = null
): Promise<string | null> {
  try {
    const current = await db.notebookChat.findUnique({
      where: { id: chatId },
      select: { title: true },
    });
    if (!current || current.title !== 'New Chat') return null;

    // Composition moves titling Haiku → Flash-Lite (TITLE_MODEL overrides;
    // MODEL_COMPOSITION_LEGACY=1 restores Haiku). Both providers run the same
    // tiny system prompt; on any failure the outer catch returns null.
    const resolved = resolveModel('chat-title');
    let rawTitle: string;
    if (resolved.provider === 'gemini') {
      const { text, usage } = await generateGeminiText({
        system: SYSTEM_PROMPT,
        userText: firstUserMessage,
        model: resolved.model,
        maxOutputTokens: 32,
        temperature: 0.3,
      });
      rawTitle = text;
      logAiUsage({
        userId,
        feature: 'chat-title',
        provider: 'gemini',
        model: resolved.model,
        inputTokens: usage.promptTokens,
        outputTokens: usage.candidatesTokens,
        cacheReadTokens: usage.cachedTokens,
      });
    } else {
      const response = await anthropic.messages.create({
        model: resolved.model,
        max_tokens: 30,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: firstUserMessage }],
      });
      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') return null;
      rawTitle = textBlock.text;
      logAiUsage({
        userId,
        feature: 'chat-title',
        provider: 'anthropic',
        model: resolved.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      });
    }

    const title = sanitizeTitle(rawTitle);
    if (!title) return null;

    const latest = await db.notebookChat.findUnique({
      where: { id: chatId },
      select: { title: true },
    });
    if (!latest || latest.title !== 'New Chat') return null;

    await db.notebookChat.update({
      where: { id: chatId },
      data: { title },
    });

    logTelemetry(userId, 'chat.title_generated', {
      chatId,
      titleLength: title.length,
    });

    return title;
  } catch (error) {
    console.error('[chat-title] generation failed for chat', chatId, error);
    const errLabel =
      error instanceof Error ? error.name || error.message : String(error).slice(0, 200);
    logTelemetry(userId, 'chat.title_gen_failed', {
      chatId,
      error: errLabel,
    });
    return null;
  }
}
