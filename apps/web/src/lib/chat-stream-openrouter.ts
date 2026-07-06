// GLM-via-OpenRouter adapter for the chat / Mage stream. Mirrors
// chat-stream-gemini.ts. The whole point is to take chat-stream's existing
// tool-def inputs (system blocks, message history, tool defs, tool_choice —
// the codebase's internal shape, formerly Anthropic-shaped) and return a
// matching `Message` — so chat-stream's post-stream processing
// (`extractToolUses` + every artifact builder + the usage logging) is reused
// verbatim for the GLM path.
//
// Reasoning is disabled by default: GLM-4.7/5.2 are reasoning models, and with
// reasoning ON the thinking tokens consume the output budget so the prose / tool
// call comes back empty (GLM is the only chat path now — no Claude anywhere).

import {
  streamOpenRouterText,
  type OpenRouterMessage,
  type OpenRouterStreamHandlers,
} from './openrouter';
import { anthropicToolsToOpenAI, toolChoiceToOpenAI } from './openrouter-tools';
import type {
  ChatMessageParam,
  ChatTurnResult,
  ContentBlock,
  TextBlockParam,
  ToolChoice,
  ToolDef,
} from './ai-tool-types';

/** Flatten a message/system content (string or text blocks) to plain text. */
function flattenContent(content: string | TextBlockParam[]): string {
  if (typeof content === 'string') return content;
  return content.map((b) => b.text).join('');
}

export interface StreamChatGLMOptions {
  /** GLM model slug (e.g. `z-ai/glm-4.7`). */
  model: string;
  /** chat-stream's `systemBlocks` (cache_control is dropped — GLM caches the
   *  prefix implicitly; keeping the corpus-first ordering preserves hits). */
  system: TextBlockParam[];
  /** chat-stream's `conversationMessages` (already stripped + char-capped). */
  messages: ChatMessageParam[];
  /** chat-stream's `CHAT_TOOLS` (tool defs → converted to OpenAI here). */
  tools: ToolDef[];
  /** chat-stream's `streamParams.tool_choice`. */
  toolChoice: ToolChoice;
  /** Forward prose deltas to the SSE stream. */
  onText: (delta: string) => void;
  signal?: AbortSignal;
  /** Defaults to true (parity with the non-reasoning slots GLM replaces). */
  enableReasoning?: boolean;
  /** Sampling temperature. Undefined ⇒ provider default (~1.0). chat-stream
   *  sets a low value on GENERATION turns (a forced tool emitting structured
   *  JSON) and leaves it unset on prose/Mage turns where creativity is fine. */
  temperature?: number;
  /** Completion ceiling. Unset ⇒ OpenRouter's default (4096) — chat-stream
   *  passes the model ceiling on generation turns so structured JSON isn't
   *  silently truncated. `stop_reason: 'max_tokens'` signals it was hit. */
  maxTokens?: number;
  /** P5 — OpenRouter `plugins` array (e.g. the web plugin). Only forwarded when set. */
  plugins?: Array<Record<string, unknown>>;
  /** P5 — raw (UNTRUSTED) provider annotations (web citations), mirroring `onText`. */
  onAnnotations?: (annotations: unknown[]) => void;
}

/**
 * Stream a chat/Mage turn through GLM and return a neutral `ChatTurnResult`.
 * `content` carries a text block (the streamed prose) followed by a `tool_use`
 * block per GLM tool call (arguments JSON-parsed into `.input`), so
 * `extractToolUses(result.content)` works unchanged. Throws on a missing key or
 * transport error — chat-stream catches it and surfaces the failure (there is
 * no Claude fallback anymore).
 */
export async function streamChatGLM(opts: StreamChatGLMOptions): Promise<ChatTurnResult> {
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
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      signal: opts.signal,
    },
    handlers,
  );

  const content: ContentBlock[] = [];
  if (result.text.length > 0) {
    content.push({ type: 'text', text: result.text });
  }
  result.toolCalls.forEach((tc, i) => {
    let input: unknown = {};
    try {
      input = tc.arguments ? JSON.parse(tc.arguments) : {};
    } catch {
      input = {};
    }
    content.push({ type: 'tool_use', id: `glm_${i}_${tc.name}`, name: tc.name, input });
  });

  return {
    content,
    // 'length' ⇒ cut off at max_tokens (prose or tool-call JSON truncated);
    // chat-stream drops a truncated tool call and warns the user.
    stop_reason:
      result.finishReason === 'length'
        ? 'max_tokens'
        : result.toolCalls.length > 0
          ? 'tool_use'
          : 'end_turn',
    usage: {
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      cache_read_input_tokens: result.usage.cachedTokens,
      cache_creation_input_tokens: 0,
    },
  };
}
