// Reusable plain-text generation over Gemini — the text-output sibling of
// `forcedStructuredCallGemini` (JSON) and `geminiStructured` (Zod). Used by the
// features the cost-composition plan moves onto Gemini: inline rewrite/summarize
// (streaming) and document summaries (non-streaming).
//
// Both helpers enforce guardrail G4: a hard `maxOutputTokens` cap (so a runaway
// generation can't balloon cost) plus an `isDegenerateText` check that rejects
// looped/repeated output so the caller can fall back to a stronger model rather
// than persist garbage.

import type { Content, GenerateContentConfig } from '@google/genai';
import {
  getGeminiClient,
  GEMINI_GEN_MAX_OUTPUT_TOKENS,
  GEMINI_PATH_MODEL_LITE,
  isDegenerateText,
} from './gemini';

export interface GeminiTextUsage {
  promptTokens: number;
  candidatesTokens: number;
  cachedTokens: number;
}

function baseConfig(
  system: string,
  maxOutputTokens: number,
  temperature: number,
): GenerateContentConfig {
  return {
    systemInstruction: system,
    temperature,
    maxOutputTokens,
    // Flash/Flash-Lite enable thinking by default; thinking tokens bill at the
    // output rate. None of these short text gens need it.
    thinkingConfig: { thinkingBudget: 0 },
  };
}

/**
 * One-shot (non-streaming) plain-text completion from Gemini. Throws on a hard
 * error (missing key, request failure), empty output, or degenerate output —
 * the caller catches and handles it (no Claude fallback; e.g. chat-title just
 * returns null).
 */
export async function generateGeminiText(opts: {
  system: string;
  userText: string;
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  onUsage?: (usage: GeminiTextUsage) => void;
}): Promise<{ text: string; usage: GeminiTextUsage }> {
  const {
    system,
    userText,
    model = GEMINI_PATH_MODEL_LITE,
    maxOutputTokens = GEMINI_GEN_MAX_OUTPUT_TOKENS,
    temperature = 0.3,
    timeoutMs = 60_000,
    onUsage,
  } = opts;

  const client = getGeminiClient();
  const config = baseConfig(system, maxOutputTokens, temperature);
  config.abortSignal = AbortSignal.timeout(timeoutMs);

  const contents: Content[] = [{ role: 'user', parts: [{ text: userText }] }];
  const response = await client.models.generateContent({ model, contents, config });

  const u = response.usageMetadata;
  const usage: GeminiTextUsage = {
    promptTokens: u?.promptTokenCount ?? 0,
    candidatesTokens: u?.candidatesTokenCount ?? 0,
    cachedTokens: u?.cachedContentTokenCount ?? 0,
  };
  onUsage?.(usage);

  const text = response.text ?? '';
  if (text.trim().length === 0) throw new Error('Gemini returned an empty response');
  if (isDegenerateText(text)) throw new Error('Gemini produced degenerate (looped) output');

  return { text, usage };
}

/**
 * Streaming plain-text completion from Gemini for a single system + user prompt
 * (inline edits). Mirrors `streamGeminiChatText` but without the chat message
 * array. Throws on a hard error / empty output / degenerate output so the route
 * can surface an error or fall back; returns a partial when `signal` aborts.
 */
export async function streamGeminiText(opts: {
  system: string;
  userText: string;
  signal: AbortSignal;
  onText: (delta: string) => void;
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<{ fullText: string; usage: GeminiTextUsage }> {
  const {
    system,
    userText,
    signal,
    onText,
    model = GEMINI_PATH_MODEL_LITE,
    maxOutputTokens = GEMINI_GEN_MAX_OUTPUT_TOKENS,
    temperature = 0.3,
  } = opts;

  const client = getGeminiClient();
  const config = baseConfig(system, maxOutputTokens, temperature);
  const contents: Content[] = [{ role: 'user', parts: [{ text: userText }] }];

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

  if (signal.aborted) return { fullText, usage };
  if (fullText.trim().length === 0) throw new Error('Gemini returned an empty response');
  if (isDegenerateText(fullText)) throw new Error('Gemini produced degenerate (looped) output');

  return { fullText, usage };
}
