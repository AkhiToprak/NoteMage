// Plain-text streaming bridge to Gemini for free-tier chat. No tools — only
// the plain-chat (intent === 'chat') turn routes here; generation always uses
// Anthropic. Mirrors the call shape of `forcedStructuredCallGemini`
// (path-generator-gemini.ts) but streams text instead of parsing JSON.

import type { Content, GenerateContentConfig } from '@google/genai';
import { getGeminiClient, GEMINI_CHAT_MODEL, GEMINI_MAX_OUTPUT_TOKENS } from './gemini';

export interface GeminiTextUsage {
  promptTokens: number;
  candidatesTokens: number;
  cachedTokens: number;
}

export interface GeminiTextStreamResult {
  fullText: string;
  usage: GeminiTextUsage;
}

export interface StreamGeminiChatTextOpts {
  /** Instruction text (base behaviour + identity). */
  systemInstruction: string;
  /** Optional notebook context. Leads the systemInstruction so the byte-stable
   *  prefix benefits from Gemini implicit caching across turns of a chat. */
  corpus?: string;
  /** Full conversation, oldest first; the LAST entry is the current user turn. */
  messages: { role: 'user' | 'assistant'; content: string }[];
  signal: AbortSignal;
  /** Called with each streamed text delta — enqueue it as an SSE `text` event. */
  onText: (delta: string) => void;
  model?: string;
}

function joinNonEmpty(parts: (string | undefined | null)[]): string {
  return parts.filter((p): p is string => !!p && p.trim().length > 0).join('\n\n');
}

/**
 * Stream a plain-text chat completion from Gemini. Throws on a hard error
 * (missing key, request failure, empty output) so the caller can fall back to
 * Anthropic; returns a partial result (no throw) when the caller's signal is
 * aborted mid-stream.
 */
export async function streamGeminiChatText(
  opts: StreamGeminiChatTextOpts
): Promise<GeminiTextStreamResult> {
  const {
    systemInstruction,
    corpus,
    messages,
    signal,
    onText,
    model = GEMINI_CHAT_MODEL,
  } = opts;

  const client = getGeminiClient();

  const config: GenerateContentConfig = {
    maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
    systemInstruction: joinNonEmpty([corpus, systemInstruction]),
    // Flash-Lite enables thinking by default; thinking tokens bill at the
    // output rate. Plain chat doesn't need it.
    thinkingConfig: { thinkingBudget: 0 },
  };

  // Gemini uses the 'model' role for assistant turns.
  const contents: Content[] = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const stream = await client.models.generateContentStream({ model, contents, config });

  let fullText = '';
  const usage: GeminiTextUsage = { promptTokens: 0, candidatesTokens: 0, cachedTokens: 0 };

  for await (const chunk of stream) {
    if (signal.aborted) break;
    const delta = chunk.text;
    if (delta) {
      fullText += delta;
      onText(delta);
    }
    const u = chunk.usageMetadata;
    if (u) {
      usage.promptTokens = u.promptTokenCount ?? usage.promptTokens;
      usage.candidatesTokens = u.candidatesTokenCount ?? usage.candidatesTokens;
      usage.cachedTokens = u.cachedContentTokenCount ?? usage.cachedTokens;
    }
  }

  if (fullText.trim().length === 0 && !signal.aborted) {
    throw new Error('Gemini returned an empty response');
  }

  return { fullText, usage };
}
