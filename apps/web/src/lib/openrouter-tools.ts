// Shared converters between the codebase's tool definitions (formerly
// Anthropic-shaped) and the OpenAI-compatible shape OpenRouter/GLM expects. The
// path generator and the chat/Mage stream both reuse those tool defs
// (`input_schema`), so this one place translates them to
// `{ type:'function', function:{ ... } }`.

import type { ToolDef, ToolChoice } from './ai-tool-types';

/** Translate one tool definition (the codebase's `input_schema` shape) to the
 *  OpenAI/OpenRouter shape. */
export function anthropicToolToOpenAI(tool: ToolDef): Record<string, unknown> {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  };
}

/** Translate an array of tool definitions to the OpenAI shape. */
export function anthropicToolsToOpenAI(
  tools: ToolDef[],
): Record<string, unknown>[] {
  return tools.map(anthropicToolToOpenAI);
}

/** Translate the internal `tool_choice` (formerly Anthropic-shaped) to the
 *  OpenAI/OpenRouter `tool_choice`.
 *  Internal: {type:'tool',name} | {type:'auto'} | {type:'none'} | {type:'any'}.
 *  OpenAI: 'auto' | 'none' | 'required' | {type:'function',function:{name}}. */
export function toolChoiceToOpenAI(
  choice: ToolChoice | undefined,
): 'auto' | 'none' | 'required' | Record<string, unknown> | undefined {
  if (!choice) return undefined;
  switch (choice.type) {
    case 'tool':
      return { type: 'function', function: { name: choice.name } };
    case 'any':
      return 'required';
    case 'none':
      return 'none';
    case 'auto':
    default:
      return 'auto';
  }
}
