import type { ZodError } from 'zod';
import { docModelSchema, type DocModelBlock } from './doc-model';

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
 * Pull a JSON value out of a model response. Handles three shapes:
 * a bare value, a value inside a markdown code fence, and a value embedded
 * in surrounding prose. Returns the object or array literal, or null when
 * none is found. Validity is left to `JSON.parse` — no brace balancing.
 */
export function extractJson(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  const firstObj = candidate.indexOf('{');
  const firstArr = candidate.indexOf('[');

  let start: number;
  let end: number;
  if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
    start = firstArr;
    end = candidate.lastIndexOf(']');
  } else if (firstObj !== -1) {
    start = firstObj;
    end = candidate.lastIndexOf('}');
  } else {
    return null;
  }
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

  const result = docModelSchema.safeParse(wrapped);
  if (!result.success) {
    return { ok: false, error: formatZodError(result.error) };
  }
  return { ok: true, blocks: result.data.blocks };
}
