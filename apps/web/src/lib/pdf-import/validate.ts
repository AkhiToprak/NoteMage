import type { ZodError } from 'zod';
import { docModelSchema, type DocModelBlock } from './doc-model';
import { normalizeDocModelShape } from './normalize';

/** Outcome of parsing one model response into validated DocModel blocks. */
export interface ParseResult {
  ok: boolean;
  /** The validated block list — present when `ok`. */
  blocks?: DocModelBlock[];
  /** A compact, model-readable error — present when not `ok`; fed to the repair retry. */
  error?: string;
}

/** Cap on issues reported back to the model so the repair turn stays small. */
const MAX_REPORTED_ISSUES = 20;

/**
 * The first COMPLETE JSON value starting at `start`, found by depth counting
 * (string- and escape-aware). Returns null when the value never closes
 * (truncated output).
 */
function scanBalanced(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Pull a JSON value out of a model response. Handles a bare value, a value
 * inside a markdown code fence, a value embedded in surrounding prose, AND a
 * value followed by trailing junk — including a duplicated second JSON object
 * (observed live: Flash-Lite emitting the page JSON twice). The FIRST
 * balanced value wins; only a value that never closes (truncated output)
 * falls back to the first-to-last slice, whose parse failure then drives the
 * repair retry.
 */
export function extractJson(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  const firstObj = candidate.indexOf('{');
  const firstArr = candidate.indexOf('[');

  let start: number;
  let lastClose: string;
  if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
    start = firstArr;
    lastClose = ']';
  } else if (firstObj !== -1) {
    start = firstObj;
    lastClose = '}';
  } else {
    return null;
  }

  const balanced = scanBalanced(candidate, start);
  if (balanced !== null) return balanced;

  const end = candidate.lastIndexOf(lastClose);
  if (end <= start) return null;
  return candidate.slice(start, end + 1);
}

function formatZodError(error: ZodError): string {
  const shown = error.issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${path}: ${issue.message}`;
  });
  const extra = error.issues.length - shown.length;
  if (extra > 0) shown.push(`...and ${extra} more issue(s).`);
  return shown.join('\n');
}

/**
 * Parse one raw model response into validated DocModel blocks. Extracts the
 * JSON, parses it, tolerates a bare block array (the contract is
 * `{ blocks: [...] }` but models often drop the wrapper), then validates
 * against the strict `docModelSchema`. Never throws — failures come back as
 * `{ ok: false, error }`, where `error` is suitable to feed a repair retry.
 */
export function parseDocModelBlocks(raw: string): ParseResult {
  const candidate = extractJson(raw);
  if (candidate === null) {
    return { ok: false, error: 'No JSON value was found in the model output.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `The model output is not valid JSON: ${message}` };
  }

  const wrapped = Array.isArray(parsed) ? { blocks: parsed } : parsed;

  // G3 — coerce drifted table-cell shapes to bare run arrays before validating,
  // so a well-meaning shape ({runs:…}, paragraph-wrapped, bare string) parses
  // instead of losing the whole table to the heuristic fallback.
  const normalized = normalizeDocModelShape(wrapped);

  const result = docModelSchema.safeParse(normalized);
  if (!result.success) {
    return { ok: false, error: formatZodError(result.error) };
  }
  return { ok: true, blocks: result.data.blocks };
}
