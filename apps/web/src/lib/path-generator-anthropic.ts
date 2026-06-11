// Anthropic-side wrapper for path-generation calls. Extracted from
// `path-generator.ts` so it sits next to the Gemini mirror
// (`path-generator-gemini.ts`) and the dispatcher (`path-generator-
// routing.ts`) can import both without circular references.
//
// Semantics are identical to the prior in-line `forcedToolCall`:
// `tool_choice` forced to a single tool, exponential backoff retries
// (1s, 2s, …), optional model override, `onUsage` callback per attempt.

import Anthropic from '@anthropic-ai/sdk';
import { anthropic, AI_GENERATION_MODEL, MAX_OUTPUT_TOKENS } from './anthropic';

type ToolUseBlock = Extract<Anthropic.Messages.ContentBlock, { type: 'tool_use' }>;

function findToolUse(
  content: Anthropic.Messages.ContentBlock[],
  name: string,
): ToolUseBlock | null {
  for (const block of content) {
    if (block.type === 'tool_use' && block.name === name) {
      return block;
    }
  }
  return null;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Errors that are deterministic — retrying byte-identical requests will
 *  always fail. Rethrow immediately instead of burning retry budget. */
function isNonRetryable(error: unknown): boolean {
  return (
    error instanceof Anthropic.BadRequestError ||
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError ||
    error instanceof Anthropic.NotFoundError
  );
}

/**
 * Call Anthropic with `tool_choice` forced to the named tool. Passes the full
 * `tools` array so the tools render at a stable byte position across stages —
 * changing `tool_choice` alone does not invalidate the prompt cache. Retries
 * up to `maxAttempts` times with exponential backoff (1s, 2s, …) on
 * transient errors (429 / 5xx / overloaded / truncation). Non-retryable
 * 4xx errors (400 / 401 / 403 / 404) are rethrown immediately.
 */
export async function forcedStructuredCallAnthropic<T>(opts: {
  system: string | Anthropic.Messages.TextBlockParam[];
  tool: Anthropic.Messages.Tool;
  /**
   * Full ordered tool array to send on every call. Keeping this array
   * byte-identical across stages lets the prompt-cache cover the tools block.
   * Defaults to `[tool]` for backward-compatible callers (translation,
   * moderation) that only ever send one tool.
   */
  tools?: Anthropic.Messages.Tool[];
  /** Optional extra user message body. Defaults to "Generate now." */
  userMessage?: string;
  maxAttempts?: number;
  /** Override the default generation model. */
  model?: string;
  /** Called with the token usage of every attempt, retries included. */
  onUsage?: (usage: Anthropic.Messages.Usage) => void;
}): Promise<T> {
  const {
    system,
    tool,
    tools,
    userMessage = 'Generate now.',
    maxAttempts = 2,
    model = AI_GENERATION_MODEL,
    onUsage,
  } = opts;
  const toolArray = tools ?? [tool];
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        messages: [{ role: 'user', content: userMessage }],
        tools: toolArray,
        tool_choice: { type: 'tool', name: tool.name },
      });
      onUsage?.(response.usage);
      if (response.stop_reason === 'max_tokens') {
        throw new Error(`${tool.name} response was truncated (stop_reason: max_tokens)`);
      }
      const block = findToolUse(response.content, tool.name);
      if (!block) {
        throw new Error(
          `AI did not call ${tool.name} (stop_reason: ${response.stop_reason ?? 'unknown'})`,
        );
      }
      return block.input as T;
    } catch (error) {
      lastError = error;
      // Non-retryable: a byte-identical retry will always fail.
      if (isNonRetryable(error)) throw error;
      if (attempt < maxAttempts) {
        const delay = 1000 * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`forcedStructuredCallAnthropic(${tool.name}) failed after ${maxAttempts} attempts`);
}
