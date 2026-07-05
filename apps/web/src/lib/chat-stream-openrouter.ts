// GLM-via-OpenRouter adapter for the chat / Mage stream. Mirrors
// chat-stream-gemini.ts. The whole point is to take chat-stream's existing
// ANTHROPIC-shaped inputs (system blocks, message history, tool defs,
// tool_choice) and return an ANTHROPIC-shaped `Message` — so chat-stream's
// post-stream processing (`extractToolUses` + every artifact builder + the
// usage logging) is reused verbatim for the GLM path.
//
// Reasoning is disabled by default: GLM-4.7/5.2 are reasoning models, and with
// reasoning ON the thinking tokens consume the output budget so the prose / tool
// call comes back empty (this replaces non-reasoning Haiku/Sonnet anyway).

import type Anthropic from '@anthropic-ai/sdk';
import {
  streamOpenRouterText,
  type OpenRouterMessage,
  type OpenRouterStreamHandlers,
} from './openrouter';
import { anthropicToolsToOpenAI, toolChoiceToOpenAI } from './openrouter-tools';

type AnthropicChatMessage = {
  role: 'user' | 'assistant';
  content: string | Anthropic.Messages.TextBlockParam[];
};

/** Flatten an Anthropic message/system content (string or text blocks) to plain text. */
function flattenContent(content: string | Anthropic.Messages.TextBlockParam[]): string {
  if (typeof content === 'string') return content;
  return content.map((b) => b.text).join('');
}

export interface StreamChatGLMOptions {
  /** GLM model slug (e.g. `z-ai/glm-4.7`). */
  model: string;
  /** chat-stream's `systemBlocks` (cache_control is dropped — GLM caches the
   *  prefix implicitly; keeping the corpus-first ordering preserves hits). */
  system: Anthropic.Messages.TextBlockParam[];
  /** chat-stream's `conversationMessages` (already stripped + char-capped). */
  messages: AnthropicChatMessage[];
  /** chat-stream's `CHAT_TOOLS` (Anthropic shape → converted to OpenAI here). */
  tools: Anthropic.Messages.Tool[];
  /** chat-stream's `streamParams.tool_choice`. */
  toolChoice: Anthropic.Messages.ToolChoice;
  /** Forward prose deltas to the SSE stream. */
  onText: (delta: string) => void;
  signal?: AbortSignal;
  /** Defaults to true (parity with the non-reasoning slots GLM replaces). */
  enableReasoning?: boolean;
  /** P5 — OpenRouter `plugins` array (e.g. the web plugin). Only forwarded when set. */
  plugins?: Array<Record<string, unknown>>;
  /** P5 — raw (UNTRUSTED) provider annotations (web citations), mirroring `onText`. */
  onAnnotations?: (annotations: unknown[]) => void;
}

/**
 * Stream a chat/Mage turn through GLM and return an Anthropic-shaped `Message`.
 * `content` carries a text block (the streamed prose) followed by a `tool_use`
 * block per GLM tool call (arguments JSON-parsed into `.input`), so
 * `extractToolUses(response.content)` works unchanged. Throws on a missing key
 * or transport error — chat-stream catches it and falls back to Anthropic.
 */
export async function streamChatGLM(opts: StreamChatGLMOptions): Promise<Anthropic.Messages.Message> {
  const systemText = opts.system.map((b) => b.text).join('\n\n');
  const messages: OpenRouterMessage[] = opts.messages.map((m) => ({
    role: m.role,
    content: flattenContent(m.content),
  }));

  const handlers: OpenRouterStreamHandlers = {
    onText: opts.onText,
    onAnnotations: opts.onAnnotations,
  };
  const result = await streamOpenRouterText(
    {
      model: opts.model,
      system: systemText,
      messages,
      tools: anthropicToolsToOpenAI(opts.tools),
      toolChoice: toolChoiceToOpenAI(opts.toolChoice),
      disableReasoning: opts.enableReasoning !== true,
      plugins: opts.plugins,
      signal: opts.signal,
    },
    handlers,
  );

  const content: Anthropic.Messages.ContentBlock[] = [];
  if (result.text.length > 0) {
    content.push({ type: 'text', text: result.text, citations: null } as Anthropic.Messages.TextBlock);
  }
  result.toolCalls.forEach((tc, i) => {
    let input: unknown = {};
    try {
      input = tc.arguments ? JSON.parse(tc.arguments) : {};
    } catch {
      input = {};
    }
    content.push({
      type: 'tool_use',
      id: `glm_${i}_${tc.name}`,
      name: tc.name,
      input,
    } as Anthropic.Messages.ToolUseBlock);
  });

  const usage = {
    input_tokens: result.usage.inputTokens,
    output_tokens: result.usage.outputTokens,
    cache_read_input_tokens: result.usage.cachedTokens,
    cache_creation_input_tokens: 0,
  } as unknown as Anthropic.Messages.Usage;

  return {
    id: 'glm-msg',
    type: 'message',
    role: 'assistant',
    model: opts.model,
    content,
    stop_reason: result.toolCalls.length > 0 ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage,
  } as unknown as Anthropic.Messages.Message;
}
