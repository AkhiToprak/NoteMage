import { describe, expect, it, vi } from 'vitest';
import type { OpenRouterResult } from './openrouter';

const streamOpenRouterText = vi.fn<(...args: unknown[]) => Promise<OpenRouterResult>>();
vi.mock('./openrouter', () => ({
  streamOpenRouterText: (...args: unknown[]) => streamOpenRouterText(...args),
}));

const { streamChatGLM } = await import('./chat-stream-openrouter');

const EMPTY_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  costUsd: 0,
  upstreamCostUsd: 0,
};

function baseOpts() {
  return {
    model: 'z-ai/glm-4.7-flash',
    system: [{ type: 'text' as const, text: 'sys' }],
    messages: [{ role: 'user' as const, content: 'hi' }],
    tools: [],
    toolChoice: { type: 'auto' as const },
    onText: () => {},
  };
}

describe('streamChatGLM — stop_reason mapping', () => {
  it("maps finishReason 'length' → 'max_tokens'", async () => {
    streamOpenRouterText.mockResolvedValue({
      text: 'truncated…',
      toolCalls: [],
      finishReason: 'length',
      usage: EMPTY_USAGE,
      annotations: [],
    });
    const msg = await streamChatGLM(baseOpts());
    expect(msg.stop_reason).toBe('max_tokens');
  });

  it("maps a tool call with finishReason 'stop' → 'tool_use'", async () => {
    streamOpenRouterText.mockResolvedValue({
      text: '',
      toolCalls: [{ name: 'generate_flashcards', arguments: '{"title":"T","flashcards":[]}' }],
      finishReason: 'stop',
      usage: EMPTY_USAGE,
      annotations: [],
    });
    const msg = await streamChatGLM(baseOpts());
    expect(msg.stop_reason).toBe('tool_use');
    expect(msg.content.some((b) => b.type === 'tool_use')).toBe(true);
  });

  it("plain prose with finishReason 'stop' → 'end_turn'", async () => {
    streamOpenRouterText.mockResolvedValue({
      text: 'done',
      toolCalls: [],
      finishReason: 'stop',
      usage: EMPTY_USAGE,
      annotations: [],
    });
    const msg = await streamChatGLM(baseOpts());
    expect(msg.stop_reason).toBe('end_turn');
  });
});
