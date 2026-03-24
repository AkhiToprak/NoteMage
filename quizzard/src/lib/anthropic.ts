import Anthropic from '@anthropic-ai/sdk';

const globalForAnthropic = globalThis as unknown as { anthropic: Anthropic };

export const anthropic =
  globalForAnthropic.anthropic ||
  new Anthropic({
    // Reads ANTHROPIC_API_KEY from process.env automatically.
    // To set your key, add it to quizzard/.env.local:
    //   ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
  });

if (process.env.NODE_ENV !== 'production') globalForAnthropic.anthropic = anthropic;

export const AI_MODEL = 'claude-haiku-4-5-20251001';

/** Monthly token budget per user (input + output combined). */
export const MONTHLY_TOKEN_LIMIT = 1_000_000;
