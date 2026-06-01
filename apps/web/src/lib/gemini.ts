// Shared singleton + constants for the Google Gemini client. Two places
// already use Gemini (PDF page parsing, multi-PDF subject detection) and
// the learning-path generator joins them with this file. Each callsite
// imports `getGeminiClient()` instead of building its own client, so the
// API-key check + dev-mode caching live in one place.

import { GoogleGenAI } from '@google/genai';

/**
 * Gemini model id for path generation. Path-gen needs Flash, not Lite —
 * the 11-kind quiz schema is more reliable on Flash. Override with
 * `GEMINI_PATH_MODEL` env var (Google rotates ids). This is the resolver's
 * canonical `'flash'` token id (model-routing.ts).
 */
export const GEMINI_PATH_MODEL = process.env.GEMINI_PATH_MODEL ?? 'gemini-2.5-flash';

/**
 * Cheaper Gemini tier (~10x under Haiku) used for the high-volume, lower-stakes
 * generations the cost-composition plan routes off Flash/Haiku: path theory +
 * flashcards, classify, chat title, inline rewrite/summarize, doc summaries.
 * This is the resolver's canonical `'flash-lite'` token id (model-routing.ts).
 * Override with `GEMINI_PATH_MODEL_LITE` (Google rotates ids).
 */
export const GEMINI_PATH_MODEL_LITE =
  process.env.GEMINI_PATH_MODEL_LITE ?? 'gemini-2.5-flash-lite';

/**
 * Gemini model id for free-tier plain chat. Flash-Lite is the cheapest tier
 * (~10x under Haiku) and is plenty for ordinary study Q&A. Generation turns
 * never use this — they stay on Anthropic. Override with `GEMINI_CHAT_MODEL`.
 *
 * NOTE: the cost-composition plan moves plain chat to Flash (for both FREE and
 * PRO) via the resolver's `chat-plain` feature; this constant only backs the
 * LEGACY chat routing now. See model-routing.ts.
 */
export const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL ?? 'gemini-2.5-flash-lite';

/**
 * Hard cap on output tokens per Gemini path-generation response. Mirrors
 * the Anthropic side's `MAX_OUTPUT_TOKENS = 16_000` so capacity isn't
 * accidentally different between providers.
 */
export const GEMINI_MAX_OUTPUT_TOKENS = 16_000;

/**
 * Default hard cap for OPEN-ENDED Gemini text generation (inline edits, doc
 * summaries). Deliberately small: these are short outputs, and a tight cap is
 * the first half of guardrail G4 — it bounds the blast radius of a runaway
 * generation. Per-call sites pass their own cap (e.g. a brief summary uses
 * less); this is the ceiling when none is given.
 */
export const GEMINI_GEN_MAX_OUTPUT_TOKENS = 4_096;

/**
 * Guardrail G4 — detect degenerate open-ended output. Cheap models occasionally
 * fall into a loop (one char/word/line repeated until the token cap). The cap
 * bounds the cost; this catches the pathological text so the caller can reject
 * it and fall back to a stronger model instead of persisting garbage.
 *
 * Conservative thresholds — real prose (even repetitive study notes) stays well
 * under them, so false positives are unlikely:
 *  - a single character repeated ≥ 300× in a row,
 *  - a token (word) repeated ≥ 40× in a row,
 *  - a non-empty line repeated ≥ 25× in a row,
 *  - long output (> 1500 chars) whose unique-word ratio collapses below 4%.
 */
export function isDegenerateText(text: string): boolean {
  if (!text) return false;

  // 1. Single character repeated forever (e.g. "aaaaaa…", "──────…").
  //    `[\s\S]` rather than `.`+dotAll so this stays ES2017-target-safe.
  if (/([\s\S])\1{299,}/.test(text)) return true;

  // 2. Same word repeated back-to-back (e.g. "the the the …").
  if (/(\b\w[\w'-]*\b)(?:\s+\1\b){39,}/i.test(text)) return true;

  // 3. Same non-empty line repeated back-to-back.
  let prevLine: string | null = null;
  let lineRun = 0;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0) {
      prevLine = null;
      lineRun = 0;
      continue;
    }
    if (line === prevLine) {
      lineRun += 1;
      if (lineRun >= 24) return true; // 25 identical lines in a row
    } else {
      prevLine = line;
      lineRun = 0;
    }
  }

  // 4. Vocabulary collapse on long output — catches interleaved loops that the
  //    consecutive checks miss (e.g. "a b a b a b …").
  if (text.length > 1500) {
    const words = text.toLowerCase().match(/\b\w[\w'-]*\b/g) ?? [];
    if (words.length >= 200) {
      const unique = new Set(words).size;
      if (unique / words.length < 0.04) return true;
    }
  }

  return false;
}

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
