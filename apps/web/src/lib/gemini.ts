// Shared singleton + constants for the Google Gemini client. Two places
// already use Gemini (PDF page parsing, multi-PDF subject detection) and
// the learning-path generator joins them with this file. Each callsite
// imports `getGeminiClient()` instead of building its own client, so the
// API-key check + dev-mode caching live in one place.

import { GoogleGenAI } from '@google/genai';

/**
 * Gemini model id for path generation. Path-gen needs Flash, not Lite —
 * the 11-kind quiz schema is more reliable on Flash. Override with
 * `GEMINI_PATH_MODEL` env var (Google rotates ids).
 */
export const GEMINI_PATH_MODEL = process.env.GEMINI_PATH_MODEL ?? 'gemini-2.5-flash';

/**
 * Gemini model id for free-tier plain chat. Flash-Lite is the cheapest tier
 * (~10x under Haiku) and is plenty for ordinary study Q&A. Generation turns
 * never use this — they stay on Anthropic. Override with `GEMINI_CHAT_MODEL`.
 */
export const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL ?? 'gemini-2.5-flash-lite';

/**
 * Hard cap on output tokens per Gemini path-generation response. Mirrors
 * the Anthropic side's `MAX_OUTPUT_TOKENS = 16_000` so capacity isn't
 * accidentally different between providers.
 */
export const GEMINI_MAX_OUTPUT_TOKENS = 16_000;

const globalForGemini = globalThis as unknown as { sharedGeminiClient?: GoogleGenAI };

/**
 * Lazily build (and in dev, cache) the Gemini client. Throws if
 * `GEMINI_API_KEY` is unset — that key is already configured for the
 * existing PDF-import flows, so any environment that can reach Gemini
 * has it.
 *
 * Callers that need a softer "no key → fallback" semantic (e.g. the
 * subject-detect flow) should wrap the throw and translate it to `null`
 * locally.
 */
export function getGeminiClient(): GoogleGenAI {
  if (globalForGemini.sharedGeminiClient) return globalForGemini.sharedGeminiClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  const client = new GoogleGenAI({ apiKey });
  if (process.env.NODE_ENV !== 'production') globalForGemini.sharedGeminiClient = client;
  return client;
}
