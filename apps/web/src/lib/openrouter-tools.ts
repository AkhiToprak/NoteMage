// Shared converters between the codebase's Anthropic-shaped tool definitions and
// the OpenAI-compatible shape OpenRouter/GLM expects. The path generator and the
// chat/Mage stream both reuse the existing Anthropic tool defs (`input_schema`),
// so this one place translates them to `{ type:'function', function:{ ... } }`.

import type Anthropic from '@anthropic-ai/sdk';

/** Translate one Anthropic tool definition to the OpenAI/OpenRouter shape. */
export function anthropicToolToOpenAI(tool: Anthropic.Messages.Tool): Record<string, unknown> {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  };
}

/** Translate an array of Anthropic tool definitions to the OpenAI shape. */
export function anthropicToolsToOpenAI(
  tools: Anthropic.Messages.Tool[],
): Record<string, unknown>[] {
  return tools.map(anthropicToolToOpenAI);
}

/** Translate an Anthropic `tool_choice` to the OpenAI/OpenRouter `tool_choice`.
 *  Anthropic: {type:'tool',name} | {type:'auto'} | {type:'none'} | {type:'any'}.
 *  OpenAI: 'auto' | 'none' | 'required' | {type:'function',function:{name}}. */
export function toolChoiceToOpenAI(
  choice: Anthropic.Messages.ToolChoice | undefined,
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
