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

// Path-generation model split. Classification is a cheap routing decision —
// Haiku is fast and accurate enough for a closed enum of 7 buckets.
// Generation (theory / flashcards / quiz / structure) benefits from Sonnet's
// better instruction following: the subject-aware prompts ask the model to
// stay inside a per-subject palette of question kinds, and Sonnet drifts
// less. Per-call cost is ~4–5x Haiku; absolute cost stays bounded because
// path generation is user-initiated and rare.
export const AI_CLASSIFIER_MODEL = 'claude-haiku-4-5-20251001';
export const AI_GENERATION_MODEL = 'claude-sonnet-4-6';

// Hard cap on output tokens per AI response. Kept at 16000: generation
// calls are non-streaming, and the Anthropic SDK rejects a non-streaming
// request whose max_tokens implies a possible >10-minute runtime — which
// 32000 does on Sonnet ("Streaming is required…"). Raising this further
// requires switching forcedToolCall to streaming. Does not affect cost.
export const MAX_OUTPUT_TOKENS = 16000;
export const MAX_CONTEXT_CHARS = 400_000;
