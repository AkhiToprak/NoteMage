import { db } from './db';
import { logTelemetry } from './telemetry-server';
import { resolveModel } from './model-routing';
import { GEMINI_PATH_MODEL_LITE } from './gemini';
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

    // Titling runs on Gemini Flash-Lite. TITLE_MODEL pins the model; a
    // non-Gemini pin (glm-*) has no title path here, so fall back to the Gemini
    // default + model. On any failure the outer catch returns null ('New Chat').
    const resolved = resolveModel('chat-title');
    const titleModel =
      resolved.provider === 'gemini' ? resolved.model : GEMINI_PATH_MODEL_LITE;
    const { text: rawTitle, usage } = await generateGeminiText({
      system: SYSTEM_PROMPT,
      userText: firstUserMessage,
      model: titleModel,
      maxOutputTokens: 32,
      temperature: 0.3,
    });
    logAiUsage({
      userId,
      feature: 'chat-title',
      provider: 'gemini',
      model: titleModel,
      inputTokens: usage.promptTokens,
      outputTokens: usage.candidatesTokens,
      cacheReadTokens: usage.cachedTokens,
    });

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
