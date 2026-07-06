// Gemini-shaped response schemas for the 4 path-generation tools.
//
// `ai-tools.ts` authors each tool's `input_schema` (the codebase's shape,
// formerly Anthropic-shaped) — that file is the single source of truth. We
// derive the Gemini equivalents here by running each schema through
// `toGeminiSchema`, so the two providers never drift.
//
// Gemini's structured-output schema is an OpenAPI 3.0 subset: types are
// UPPERCASE strings ('STRING', 'OBJECT', 'ARRAY', …), `additionalProperties`
// is not supported, and leftover keys like `cache_control` must be
// stripped. The Zod validators in `@notemage/shared` still run after the
// call and enforce the strict shapes (especially the quiz `payload`
// discriminated union, which is intentionally left loose here so we
// don't hit Gemini's known reliability gap on 11-variant `anyOf`).

import {
  PATH_STRUCTURE_TOOL,
  THEORY_SECTION_TOOL,
  FLASHCARDS_FOR_SLOT_TOOL,
  QUIZ_FOR_SLOT_TOOL,
} from './ai-tools';

const TYPE_MAP: Record<string, string> = {
  string: 'STRING',
  number: 'NUMBER',
  integer: 'INTEGER',
  boolean: 'BOOLEAN',
  array: 'ARRAY',
  object: 'OBJECT',
};

const DROPPED_KEYS = new Set(['cache_control', 'additionalProperties', '$schema']);

/**
 * Convert the codebase's JSON Schema (`input_schema`, formerly Anthropic-shaped)
 * into a Gemini `responseSchema`. Recursive — handles nested `properties`,
 * `items`, and enum arrays. Pass-through for `description`, `enum`, `required`,
 * `minItems`, `maxItems`. Drops leftover and unsupported keys.
 */
export function toGeminiSchema(schema: unknown): object {
  return convert(schema) as object;
}

function convert(node: unknown): unknown {
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(convert);

  const src = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(src)) {
    if (DROPPED_KEYS.has(key)) continue;

    if (key === 'type' && typeof value === 'string') {
      out.type = TYPE_MAP[value] ?? value;
      continue;
    }

    if (key === 'properties' && value && typeof value === 'object') {
      const props: Record<string, unknown> = {};
      for (const [propKey, propVal] of Object.entries(value as Record<string, unknown>)) {
        props[propKey] = convert(propVal);
      }
      out.properties = props;
      continue;
    }

    if (key === 'items') {
      out.items = convert(value);
      continue;
    }

    out[key] = value;
  }

  return out;
}

export const PATH_STRUCTURE_SCHEMA_GEMINI = toGeminiSchema(PATH_STRUCTURE_TOOL.input_schema);
export const THEORY_SECTION_SCHEMA_GEMINI = toGeminiSchema(THEORY_SECTION_TOOL.input_schema);
export const FLASHCARDS_FOR_SLOT_SCHEMA_GEMINI = toGeminiSchema(
  FLASHCARDS_FOR_SLOT_TOOL.input_schema,
);
export const QUIZ_FOR_SLOT_SCHEMA_GEMINI = toGeminiSchema(QUIZ_FOR_SLOT_TOOL.input_schema);
