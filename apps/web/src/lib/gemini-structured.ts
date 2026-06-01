// Guardrail G2 — reusable "Gemini JSON → Zod-validate → retry-with-corrective".
//
// Path generation already does this pattern (forcedStructuredCallGemini parses,
// path-generator.ts validates + retries with a corrective notice). This extracts
// the same loop into a small generic so non-path Gemini-JSON callers (subject
// classify, and any future structured Gemini call) get validated output with a
// corrective retry — instead of each re-implementing extract/parse/validate.
//
// On each attempt: call Gemini in JSON mode, parse tolerantly (G1), Zod-validate.
// On a validation/parse failure, the next attempt's prompt carries a corrective
// notice quoting the error. Throws after `maxAttempts`.

import type { Content, GenerateContentConfig, Schema } from '@google/genai';
import type { z } from 'zod';
import { getGeminiClient, GEMINI_PATH_MODEL_LITE, GEMINI_GEN_MAX_OUTPUT_TOKENS } from './gemini';
import { parseJsonLoose } from './json-util';

export interface GeminiStructuredUsage {
  promptTokens: number;
  candidatesTokens: number;
  cachedTokens: number;
}

/** Trim a Zod error so the corrective retry prompt stays small. */
function truncate(message: string, max = 500): string {
  return message.length > max ? `${message.slice(0, max)}…` : message;
}

export async function geminiStructured<T>(opts: {
  /** Zod schema the parsed JSON must satisfy. */
  schema: z.ZodType<T>;
  /** System instruction (the rules + JSON-shape description). */
  system: string;
  /** User-turn text (the actual content to act on). */
  userText: string;
  model?: string;
  /** Call-level attempts (each retry adds a corrective notice). Default 2. */
  maxAttempts?: number;
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /** Optional Gemini constrained-decoding schema. Usually omit — the shape is
   *  described in `system` and enforced by Zod (Gemini rejects complex schemas). */
  responseSchema?: object;
  onUsage?: (usage: GeminiStructuredUsage) => void;
}): Promise<T> {
  const {
    schema,
    system,
    userText,
    model = GEMINI_PATH_MODEL_LITE,
    maxAttempts = 2,
    maxOutputTokens = GEMINI_GEN_MAX_OUTPUT_TOKENS,
    temperature = 0,
    timeoutMs = 30_000,
    responseSchema,
    onUsage,
  } = opts;

  const client = getGeminiClient();
  let lastError = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const userTurn =
      attempt === 1
        ? userText
        : [
            userText,
            '',
            '--- RETRY NOTICE ---',
            `Your previous response was invalid: ${lastError}`,
            'Return ONLY a JSON value that exactly matches the required shape. No prose, no markdown.',
          ].join('\n');

    const config: GenerateContentConfig = {
      systemInstruction: system,
      temperature,
      maxOutputTokens,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
      abortSignal: AbortSignal.timeout(timeoutMs),
      ...(responseSchema ? { responseSchema: responseSchema as Schema } : {}),
    };
    const contents: Content[] = [{ role: 'user', parts: [{ text: userTurn }] }];

    try {
      const response = await client.models.generateContent({ model, contents, config });
      const u = response.usageMetadata;
      onUsage?.({
        promptTokens: u?.promptTokenCount ?? 0,
        candidatesTokens: u?.candidatesTokenCount ?? 0,
        cachedTokens: u?.cachedContentTokenCount ?? 0,
      });

      const text = response.text ?? '';
      if (text.trim().length === 0) throw new Error('empty response');

      const parsed = parseJsonLoose(text);
      const result = schema.safeParse(parsed);
      if (result.success) return result.data;
      lastError = truncate(result.error.message);
    } catch (err) {
      lastError = truncate(err instanceof Error ? err.message : String(err));
    }
  }

  throw new Error(`geminiStructured failed after ${maxAttempts} attempts: ${lastError}`);
}
