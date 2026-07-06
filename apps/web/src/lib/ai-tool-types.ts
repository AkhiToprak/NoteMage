// Provider-neutral shapes for the app's tool + chat plumbing.
//
// These used to be `Anthropic.Messages.*` types from the `@anthropic-ai/sdk`.
// The Claude paths are gone (path gen + Mage + chat run on GLM via OpenRouter,
// with Gemini for plain chat / classify), but the whole codebase still speaks
// this "Anthropic-shaped" vocabulary internally: tool definitions carry
// `input_schema`, chat builds text-block system arrays, and the GLM/Gemini
// adapters return a Message-shaped result so the post-stream processing is
// shared. This module keeps that vocabulary as plain structural types with no
// SDK dependency. The OpenRouter converters (`openrouter-tools.ts`) translate
// these to the OpenAI/`function` shape at the provider boundary.

/** JSON-schema object describing a tool's input. Kept loose (the SDK typed this
 *  as an open object too — individual tools cast their concrete schema in). */
export interface ToolInputSchema {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

/** A tool definition. Structurally identical to the old `Anthropic.Messages.Tool`
 *  for the fields the app reads (`name`, `description`, `input_schema`). */
export interface ToolDef {
  name: string;
  description?: string;
  input_schema: ToolInputSchema;
}

/** Ephemeral cache-control marker. GLM caches its prefix implicitly and Gemini
 *  ignores it, so nothing consumes this at runtime anymore — it survives only so
 *  the text-block SHAPES the chat path builds stay valid without the SDK type. */
export interface CacheControlEphemeral {
  type: 'ephemeral';
  ttl?: '5m' | '1h';
}

/** A `text` block in a system / message content array. */
export interface TextBlockParam {
  type: 'text';
  text: string;
  cache_control?: CacheControlEphemeral;
}

/** A returned `text` content block (adapters build these). */
export interface TextBlock {
  type: 'text';
  text: string;
}

/** A returned `tool_use` content block: the model's forced/auto tool call. */
export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

/** The content blocks the app reads off a turn result. `extractToolUses` and the
 *  path/classify `findToolUse` helpers switch on `.type` over this union. */
export type ContentBlock = TextBlock | ToolUseBlock;

/** Forced/auto/none/any tool selection (translated to OpenAI shape downstream). */
export type ToolChoice =
  | { type: 'tool'; name: string }
  | { type: 'auto' }
  | { type: 'none' }
  | { type: 'any' };

/** One turn of the anthropic-shaped message arrays chat-stream builds: user /
 *  assistant, content either a plain string or an array of text blocks. */
export interface ChatMessageParam {
  role: 'user' | 'assistant';
  content: string | TextBlockParam[];
}

/** Token usage on a turn result. Optional cache fields default to 0 at the read
 *  site — GLM sets them, Gemini has its own usage shape. */
export interface TurnUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/** What `streamChatGLM` returns, and what chat-stream's post-stream processing
 *  consumes (`content`, `stop_reason`, `usage`). Replaces the SDK `Message`. */
export interface ChatTurnResult {
  content: ContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | null;
  usage: TurnUsage;
}

/**
 * Hard cap on output tokens per non-streaming AI response, formerly exported by
 * anthropic.ts. Still read by the Gemini chat path and the intent/classify
 * dispatchers to bound their `max_tokens`.
 */
export const MAX_OUTPUT_TOKENS = 16_000;
