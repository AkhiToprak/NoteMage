// Moderation Layer 2 — pure decision module (no DB, no model client).
//
// Why split (matches L1's pure/runner shape): the DB-bound runner lives
// in `layer2-runner.ts` so importing this file from vitest doesn't drag
// Prisma in. The model dispatcher lives in `model-call.ts` and is
// imported by the runner — keeping the rubric prompt + payload builder
// + JSON parser in this pure module means tests can cover them without
// hitting either Prisma or the AI providers.
//
// The rubric block is **byte-identical** across every L2 call so
// Anthropic prompt caching activates after the warm-up call (per
// AC-Moderate-9 / P0 §7.2 cache-hit gate ≥ 80%).

import type { ModerationCategory } from '@notemage/shared';
import type { ScannableField } from './layer1';

// Verdict ranges per AC-Moderate-4. `pass`/`reject` are terminal here;
// `flag` escalates to L3.
export type L2Verdict = 'pass' | 'reject' | 'flag';

// The exact shape the model is asked to return. Constrained on both
// providers: Anthropic via the tool schema below, Gemini via the JSON
// mode + post-hoc Zod-shaped check in `parseL2Response`.
export interface L2ModelOutput {
  verdict: L2Verdict;
  // Free-text category from the canonical taxonomy. The runner composes
  // the final reasonCode as `l2.<category>`.
  category: ModerationCategory;
  // Model self-reported confidence 0..1. Surfaced in audit reasoning;
  // not (yet) used for routing.
  confidence: number;
  // Short free-text justification — stored verbatim in
  // ModerationAudit.reasoning for admin / audit visibility.
  reason: string;
}

export interface L2Judgement {
  verdict: L2Verdict;
  /** `l2.<category>` per the §3.3 reasonCode taxonomy, or null on pass. */
  reasonCode: string | null;
  /** Model output stored verbatim into ModerationAudit.reasoning. */
  reasoning: string;
  /** Human copy for the author on terminal reject; null otherwise. */
  rejectionReason: string | null;
  /** When true, the verdict was synthesised because the model errored /
   *  the response failed to parse. Drives telemetry + audit notes. */
  failedClosed: boolean;
}

// Anthropic tool definition. `tool_choice: { type: 'tool', name }` in
// `forcedStructuredCallAnthropic` forces the model to call exactly this
// tool, which constrains the verdict to the schema below.
export const L2_TOOL_NAME = 'submit_moderation_l2_verdict';

export const L2_ANTHROPIC_TOOL = {
  name: L2_TOOL_NAME,
  description:
    'Return the Layer-2 moderation verdict for the provided learning-path snapshot.',
  input_schema: {
    type: 'object' as const,
    properties: {
      verdict: { type: 'string', enum: ['pass', 'reject', 'flag'] },
      category: {
        type: 'string',
        enum: ['adult', 'hateful', 'spam', 'offtopic', 'low_quality', 'copyright', 'other'],
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      reason: { type: 'string', maxLength: 600 },
    },
    required: ['verdict', 'category', 'confidence', 'reason'],
    additionalProperties: false,
  },
};

// Gemini responseSchema mirror of the same shape. Kept inline so the
// two providers stay in lockstep — if the model output shape changes,
// both edits land in this file.
export const L2_GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    verdict: { type: 'STRING', enum: ['pass', 'reject', 'flag'] },
    category: {
      type: 'STRING',
      enum: ['adult', 'hateful', 'spam', 'offtopic', 'low_quality', 'copyright', 'other'],
    },
    confidence: { type: 'NUMBER' },
    reason: { type: 'STRING' },
  },
  required: ['verdict', 'category', 'confidence', 'reason'],
};

// Categories that map onto a terminal `reject` verdict. Anything else
// the model returns with `verdict: 'reject'` is honoured but logged so
// taxonomy drift is visible. `low_quality` and `other` aren't strong
// enough on their own to auto-reject — they escalate to flag instead.
const TERMINAL_REJECT_CATEGORIES: ReadonlySet<ModerationCategory> = new Set([
  'adult',
  'hateful',
  'spam',
  'copyright',
  'offtopic',
]);

/**
 * Build the per-path payload block. This is the variable part of the
 * prompt — it changes per SharedPath. The runner concatenates it onto
 * the cached rubric so the rubric stays byte-identical.
 *
 * The format is deliberately simple newline-prefixed sections so the
 * model has minimal parser ambiguity to deal with.
 */
export function buildL2PathPayload(opts: {
  language: string;
  fields: ReadonlyArray<ScannableField>;
}): string {
  const out: string[] = [];
  out.push('# PATH SNAPSHOT TO AUDIT');
  out.push('');
  out.push(`language: ${opts.language}`);
  out.push('');
  // Hard-cap individual field text so a pathological theory section
  // can't blow past the L2 budget. Per P0 §7.2 a typical path is
  // 8-12K input tokens; we cap each field's contribution so an
  // adversarial 100KB theory body can't shift us past the ceiling.
  const MAX_PER_FIELD_CHARS = 4_000;
  let totalChars = 0;
  const MAX_TOTAL_CHARS = 40_000;
  for (const f of opts.fields) {
    if (!f.text || f.text.trim().length === 0) continue;
    const text = f.text.length > MAX_PER_FIELD_CHARS
      ? `${f.text.slice(0, MAX_PER_FIELD_CHARS)} …[truncated]`
      : f.text;
    if (totalChars + text.length > MAX_TOTAL_CHARS) {
      out.push('---');
      out.push(`[snapshot truncated — exceeded ${MAX_TOTAL_CHARS} chars]`);
      break;
    }
    out.push(`---`);
    out.push(`field: ${f.field}`);
    out.push(text);
    totalChars += text.length;
  }
  out.push('---');
  return out.join('\n');
}

/**
 * The byte-identical rubric prompt. Lives as a const so the prompt-cache
 * key never drifts mid-run. Edits to this prompt invalidate the cache.
 *
 * Keep the rubric *boring*. The model returns the verdict via the
 * forced tool / JSON mode — no need for chain-of-thought in the prompt.
 */
export const L2_RUBRIC = [
  'You are a content moderator for a community learning-path library.',
  'You audit user-published "paths" (Duolingo-style multi-phase learning plans).',
  '',
  '## Decision categories',
  '',
  '- adult       — sexual / explicit content not appropriate for a learning library',
  '- hateful     — slurs, harassment, content targeting a protected group',
  '- spam        — promotional content, link farming, repeated boilerplate, MLM',
  '- copyright   — instructions for piracy, license bypass, cracked-software guides',
  '- offtopic    — not a learnable topic (chat logs, personal journal, untestable opinion)',
  '- low_quality — incoherent, contradictory, or near-empty content',
  '- other       — flag-worthy but does not fit the above',
  '',
  '## Verdict ranges',
  '',
  '- pass    — content is fine for the community library. Use category="other" with confidence describing your certainty of pass.',
  '- reject  — content is unambiguously in one of: adult, hateful, spam, copyright, offtopic. Send the matching category.',
  '- flag    — content is borderline or you are uncertain. ANY ambiguity → flag. Failure-mode of L2 is fail-closed; L3 (stronger model + human) will catch false positives.',
  '',
  '## Rules',
  '',
  '- Output ONLY via the tool call / JSON schema you were given. No prose, no markdown.',
  '- Educational paths legitimately discussing sensitive topics (history of slurs, sex-ed, drug policy, security) should PASS — judge intent and framing, not keyword presence.',
  '- A non-English path is judged by the same standards; do not penalise minor translation artefacts.',
  '- If confidence < 0.7 on a reject, return flag instead.',
  '- low_quality alone → flag, not reject (human-readable quality is judged downstream).',
  '- Reason field: ≤ 60 words. Cite the specific evidence (which slot / field).',
].join('\n');

/**
 * Compose author-facing rejection copy from the model's verdict.
 * Mirrors composeAuthorMessage() in layer1.ts so the publication-status
 * page renders L1 and L2 rejections identically.
 */
function composeAuthorMessage(category: ModerationCategory, reason: string): string {
  const reasonHint = reason.trim().length > 0 ? ` (${reason.trim().slice(0, 280)})` : '';
  switch (category) {
    case 'adult':
      return `l2.${category} — your published path contains explicit or adult content not allowed in the community library${reasonHint}.`;
    case 'hateful':
      return `l2.${category} — your published path contains hateful language${reasonHint}.`;
    case 'spam':
      return `l2.${category} — your published path was flagged as spam or promotion${reasonHint}.`;
    case 'copyright':
      return `l2.${category} — your published path was flagged for piracy / copyright bypass${reasonHint}.`;
    case 'offtopic':
      return `l2.${category} — your published path looks off-topic for a learning resource${reasonHint}.`;
    case 'low_quality':
    case 'other':
    default:
      return `l2.${category} — your published path was flagged by the automatic audit${reasonHint}.`;
  }
}

/**
 * Type-guard parse for the structured model output. The Anthropic tool
 * schema and Gemini responseSchema both constrain the model, but we
 * still defensively validate post-hoc — neither provider is hermetic
 * on every retry, and we treat ANY parse failure as fail-closed=flag
 * per AC-Moderate-5.
 *
 * Throws on parse failure; callers (`judgeL2`) catch and fail closed.
 */
export function parseL2Response(raw: unknown): L2ModelOutput {
  if (!raw || typeof raw !== 'object') {
    throw new Error('L2 response is not an object');
  }
  const obj = raw as Record<string, unknown>;

  const verdict = obj.verdict;
  if (verdict !== 'pass' && verdict !== 'reject' && verdict !== 'flag') {
    throw new Error(`L2 response.verdict invalid: ${String(verdict)}`);
  }

  const category = obj.category;
  const validCategories: ModerationCategory[] = [
    'adult',
    'hateful',
    'spam',
    'offtopic',
    'low_quality',
    'copyright',
    'other',
  ];
  if (typeof category !== 'string' || !validCategories.includes(category as ModerationCategory)) {
    throw new Error(`L2 response.category invalid: ${String(category)}`);
  }

  const confidence = obj.confidence;
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error(`L2 response.confidence invalid: ${String(confidence)}`);
  }

  const reason = obj.reason;
  if (typeof reason !== 'string') {
    throw new Error('L2 response.reason missing or non-string');
  }

  return {
    verdict,
    category: category as ModerationCategory,
    confidence,
    // Clamp the free-text reason so a pathologically long output can't
    // blow past the ModerationAudit.reasoning column on PG. The schema
    // allows @db.Text so this is mostly defensive against runaway costs.
    reason: reason.slice(0, 4_000),
  };
}

/**
 * Synthesise the canonical fail-closed verdict for L2. Called when:
 *   - the model errored / timed out (caller's catch),
 *   - the response failed to parse (parseL2Response threw).
 *
 * Per AC-Moderate-5 the fail-closed default is `flag` so the path lands
 * on the human queue at L3 instead of silently going public.
 */
export function failClosedL2(reasoning: string): L2Judgement {
  return {
    verdict: 'flag',
    reasonCode: 'l2.other',
    reasoning: `[fail-closed] ${reasoning}`.slice(0, 4_000),
    rejectionReason: null,
    failedClosed: true,
  };
}

/**
 * Pure decision function: given a parsed model output, project it onto
 * the canonical L2Judgement shape. Applies the confidence guard
 * (reject + confidence < 0.7 → flag) per the rubric so the runner
 * can't be tricked by a hot-headed model returning reject at 0.3.
 *
 * The runner calls this on success and falls back to `failClosedL2` on
 * any throw inside the model call.
 */
export function projectL2Output(out: L2ModelOutput): L2Judgement {
  // Soft-reject guard — even a model that ignored the rubric's own
  // "confidence < 0.7 → flag" instruction can't slip a low-confidence
  // reject past the runner.
  if (out.verdict === 'reject' && out.confidence < 0.7) {
    return {
      verdict: 'flag',
      reasonCode: `l2.${out.category}`,
      reasoning: `[downgraded reject→flag: confidence ${out.confidence.toFixed(2)} < 0.7] ${out.reason}`.slice(
        0,
        4_000,
      ),
      rejectionReason: null,
      failedClosed: false,
    };
  }

  if (out.verdict === 'reject') {
    if (!TERMINAL_REJECT_CATEGORIES.has(out.category)) {
      // Drift signal — reject with a non-terminal category. Treat as
      // flag so the human queue gets a look, but record the verdict
      // verbatim in reasoning so the drift is visible.
      return {
        verdict: 'flag',
        reasonCode: `l2.${out.category}`,
        reasoning: `[non-terminal-reject category, escalating] ${out.reason}`.slice(0, 4_000),
        rejectionReason: null,
        failedClosed: false,
      };
    }
    return {
      verdict: 'reject',
      reasonCode: `l2.${out.category}`,
      reasoning: out.reason,
      rejectionReason: composeAuthorMessage(out.category, out.reason),
      failedClosed: false,
    };
  }

  if (out.verdict === 'flag') {
    return {
      verdict: 'flag',
      reasonCode: `l2.${out.category}`,
      reasoning: out.reason,
      rejectionReason: null,
      failedClosed: false,
    };
  }

  // pass
  return {
    verdict: 'pass',
    reasonCode: null,
    reasoning: out.reason,
    rejectionReason: null,
    failedClosed: false,
  };
}
