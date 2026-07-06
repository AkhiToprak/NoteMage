// Guardrail G1 — tolerant JSON parsing for model output.
//
// Cheaper models (and GLM when not in forced-tool mode) often wrap JSON in a
// ```json … ``` fence or sandwich it in prose ("Here is the JSON: { … }. Hope
// that helps!"). `JSON.parse` chokes on both. These helpers strip the fence and
// extract the first balanced JSON value, so any GLM-/Gemini-JSON path (essay
// check, classify, doc summaries-as-JSON) can parse reliably.
//
// Use `parseJsonLoose` when a parse failure should surface as an error, or
// `tryParseJsonLoose` when you want `null` and a fallback instead.

/**
 * Strip a Markdown code fence from model output. Returns the inner content of
 * the first ``` … ``` block (json-tagged or not) if one exists, otherwise the
 * trimmed input unchanged.
 */
export function stripCodeFences(raw: string): string {
  const fenced = raw.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : raw).trim();
}

/**
 * Extract the first balanced JSON object or array from a string, walking the
 * structure so trailing prose (or a second value) can't over-capture. Respects
 * string literals + escapes. Returns the matched JSON text, or null when no
 * balanced value is found.
 */
export function extractBalancedJson(input: string): string | null {
  const objAt = input.indexOf('{');
  const arrAt = input.indexOf('[');
  let start: number;
  if (objAt === -1) start = arrAt;
  else if (arrAt === -1) start = objAt;
  else start = Math.min(objAt, arrAt);
  if (start === -1) return null;

  const open = input[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === open) {
      depth += 1;
    } else if (ch === close) {
      depth -= 1;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Parse model output as JSON, tolerating code fences and surrounding prose.
 * Tries a direct parse first (fast path for clean output), then falls back to
 * extracting the first balanced JSON value. Throws if nothing parses.
 */
export function parseJsonLoose<T = unknown>(raw: string): T {
  const text = stripCodeFences(raw);
  try {
    return JSON.parse(text) as T;
  } catch {
    // fall through to balanced extraction
  }
  const candidate = extractBalancedJson(text);
  if (candidate === null) {
    throw new Error('No JSON value found in model output');
  }
  return JSON.parse(candidate) as T;
}

/** Like `parseJsonLoose` but returns null instead of throwing. */
export function tryParseJsonLoose<T = unknown>(raw: string): T | null {
  try {
    return parseJsonLoose<T>(raw);
  } catch {
    return null;
  }
}
