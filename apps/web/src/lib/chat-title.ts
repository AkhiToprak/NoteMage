import { anthropic } from './anthropic';
import { db } from './db';
import { logTelemetry } from './telemetry-server';

const TITLE_MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT =
  'Return a 3–5 word title for this conversation in plain text. No quotes, no period. Use Title Case.';

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
): Promise<void> {
  try {
    const current = await db.notebookChat.findUnique({
      where: { id: chatId },
      select: { title: true },
    });
    if (!current || current.title !== 'New Chat') return;

    const response = await anthropic.messages.create({
      model: TITLE_MODEL,
      max_tokens: 30,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: firstUserMessage }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return;

    const title = sanitizeTitle(textBlock.text);
    if (!title) return;

    const latest = await db.notebookChat.findUnique({
      where: { id: chatId },
      select: { title: true },
    });
    if (!latest || latest.title !== 'New Chat') return;

    await db.notebookChat.update({
      where: { id: chatId },
      data: { title },
    });

    // Phase 9.6 — fire-and-forget telemetry. logTelemetry is synchronous and
    // returns void; never awaited, never throws.
    logTelemetry(userId, 'chat.title_generated', {
      chatId,
      titleLength: title.length,
    });
  } catch (error) {
    console.error('[chat-title] generation failed for chat', chatId, error);
    // Phase 9.6 — surface failure to telemetry without blocking. Trim to
    // name/message so we don't dump a full stack into the log line.
    const errLabel =
      error instanceof Error ? error.name || error.message : String(error).slice(0, 200);
    logTelemetry(userId, 'chat.title_gen_failed', {
      chatId,
      error: errLabel,
    });
  }
}
