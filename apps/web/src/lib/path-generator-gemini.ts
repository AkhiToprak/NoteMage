// Gemini-side mirror of `forcedToolCall` (path-generator.ts:150).
//
// Same retry semantics (2 attempts, exponential backoff 1s/2s, onUsage
// invoked per attempt), but uses Gemini's JSON mode (`responseMimeType:
// 'application/json'` + optional `responseSchema`) instead of Anthropic's
// forced tool_choice. The returned value is the parsed JSON cast to `T`;
// the caller (`path-generator.ts`) feeds it through the same Zod
// validators used for the Anthropic side, so the two paths are
// apples-to-apples downstream.

import type { Content, Schema } from '@google/genai';
import { getGeminiClient, GEMINI_PATH_MODEL, GEMINI_MAX_OUTPUT_TOKENS } from './gemini';

export interface GeminiUsage {
  /** Gemini `usageMetadata.promptTokenCount` — total input tokens. */
  promptTokens: number;
  /** Gemini `usageMetadata.candidatesTokenCount` — total output tokens. */
  candidatesTokens: number;
  /** Gemini `usageMetadata.cachedContentTokenCount` — only populated when
   *  an explicit `CachedContent` resource was attached. Implicit cache
   *  hits do not surface a token count (the discount is applied silently),
   *  so a low value here does not mean caching is broken. */
  cachedTokens: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call Gemini in JSON mode and return the parsed structured output.
 *
 * Retries up to `maxAttempts` times with exponential backoff (1s, 2s, …)
 * on any thrown error (network, parse failure, empty response). Mirrors
 * the retry shape of `forcedToolCall` so the activity-level retry loop
 * in `path-generator.ts` (which adds 3 more attempts with corrective
 * prompts) behaves the same regardless of provider.
 *
 * On a successful attempt, calls `onUsage` with the Gemini usage shape;
 * the caller (`path-generator-routing.ts` dispatcher) normalizes into
 * the unified `NormalizedUsage`.
 *
 * Throws after exhausting retries. The caller catches and retries
 * again at the activity level.
 */
export async function forcedStructuredCallGemini<T>(opts: {
  /** Full system instruction. The corpus block is baked in as the
   *  leading text so implicit caching (Gemini 2.5 Flash) can match it
   *  byte-identically across every Stage A + Stage B call in a run. */
  systemInstruction: string;
  /** Optional Gemini `responseSchema`. When omitted, only
   *  `responseMimeType: 'application/json'` is set — Zod still enforces
   *  the shape after the call. */
  responseSchema?: object;
  /** Optional user-turn message. Defaults to "Generate now." */
  userMessage?: string;
  /** Max attempts at the call level. Default 2. */
  maxAttempts?: number;
  /** Override the default Gemini model id. */
  model?: string;
  /** Invoked with the token usage of every attempt, retries included. */
  onUsage?: (usage: GeminiUsage) => void;
}): Promise<T> {
  const {
    systemInstruction,
    responseSchema,
    userMessage = 'Generate now.',
    maxAttempts = 2,
    model = GEMINI_PATH_MODEL,
    onUsage,
  } = opts;

  const client = getGeminiClient();
  const contents: Content[] = [{ role: 'user', parts: [{ text: userMessage }] }];

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await client.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
          // Gemini 2.5 Flash enables thinking by default; thinking tokens
          // are billed at the output rate and can easily double the
          // per-call cost. For structured path generation the shape is
          // already enforced by the prompt + Zod post-validation, so the
          // extra reasoning adds little value — disable it.
          thinkingConfig: { thinkingBudget: 0 },
          ...(responseSchema ? { responseSchema: responseSchema as Schema } : {}),
        },
      });

      const usage = response.usageMetadata;
      if (usage) {
        onUsage?.({
          promptTokens: usage.promptTokenCount ?? 0,
          candidatesTokens: usage.candidatesTokenCount ?? 0,
          cachedTokens: usage.cachedContentTokenCount ?? 0,
        });
      }

      const text = response.text;
      if (!text || text.trim().length === 0) {
        throw new Error('Gemini returned an empty response');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (parseErr) {
        throw new Error(
          `Gemini response was not valid JSON: ${
            parseErr instanceof Error ? parseErr.message : String(parseErr)
          }`,
        );
      }
      return parsed as T;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const delay = 1000 * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`forcedStructuredCallGemini failed after ${maxAttempts} attempts`);
}
