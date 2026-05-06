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

// Claude Haiku 4.5: 200K input context, 64K max output.
// We budget generously but leave headroom for system prompt, tools, and conversation history.
export const MAX_OUTPUT_TOKENS = 16000;
export const MAX_CONTEXT_CHARS = 400_000;
