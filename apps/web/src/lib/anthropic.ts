import Anthropic from '@anthropic-ai/sdk';

const globalForAnthropic = globalThis as unknown as { anthropic: Anthropic };

export const anthropic =
  globalForAnthropic.anthropic ||
  new Anthropic({
    // Reads ANTHROPIC_API_KEY from process.env automatically.
    // To set your key, add it to apps/web/.env.local:
    //   ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
  });

if (process.env.NODE_ENV !== 'production') globalForAnthropic.anthropic = anthropic;

export const AI_MODEL = 'claude-haiku-4-5-20251001';

// Path-generation model routing is now owned by model-routing.ts
// (`resolveModel`). The constants below remain as base references used by
// non-path callers (inline AI, page-generate, chat, PDF escalation).
// Per-stage path routing (structure/theory/flashcards/quiz, basic vs ultra)
// is resolved centrally in model-routing.ts; do not duplicate routing logic here.
export const AI_CLASSIFIER_MODEL = 'claude-haiku-4-5-20251001';
// SONNET REMOVED (cost). Sonnet ($15/M output) is no longer the heavy-generation
// model anywhere — GLM-5.2 replaced it via the resolver (model-routing.ts), and
// every remaining Anthropic consumer of this constant (chat GLM→Claude fallback,
// PDF vision escalation, path-gen Anthropic fallback default) now lands on Haiku.
// Kept as a named constant — not a raw literal — so there is a single place to
// flip if Sonnet is ever deliberately reinstated. Do NOT point this back at
// 'claude-sonnet-4-6' without an explicit cost decision.
export const AI_GENERATION_MODEL = 'claude-haiku-4-5-20251001';
export const AI_GENERATION_MODEL_LITE = 'claude-haiku-4-5-20251001';

// Hard cap on output tokens per AI response. Kept at 16000: generation
// calls are non-streaming, and the Anthropic SDK rejects a non-streaming
// request whose max_tokens implies a possible >10-minute runtime — which
// 32000 does on Sonnet ("Streaming is required…"). Raising this further
// requires switching forcedToolCall to streaming. Does not affect cost.
export const MAX_OUTPUT_TOKENS = 16000;
export const MAX_CONTEXT_CHARS = 400_000;
