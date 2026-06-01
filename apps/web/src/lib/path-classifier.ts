import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { anthropic, MAX_OUTPUT_TOKENS } from './anthropic';
import { CLASSIFY_SUBJECTS_TOOL } from './ai-tools';
import { resolveModel } from './model-routing';
import { geminiStructured } from './gemini-structured';
import { logAiUsage } from './ai-usage';
import {
  coerceSubjectIds,
  normalizeSubjectWeights,
  type SubjectId,
} from './path-subjects';

export interface ClassifySubjectsOpts {
  title: string;
  brief?: string;
  /** Optional rendered material corpus — an excerpt is read to detect subject. */
  corpus?: string;
}

export interface ClassifySubjectsResult {
  subjects: SubjectId[];
  weights: number[];
  /** True when classification failed and `general` was used as a fallback. */
  fallback: boolean;
}

/** Provider-neutral raw classifier output (Anthropic tool input + Gemini JSON
 *  share this shape). */
interface RawClassify {
  subjects: { id: string; weight: number }[];
}

const INTRO =
  'You classify the subject of a learning path so the generator can pick appropriate question types.';

// Bucket list + weighting rules — shared verbatim by both providers so the only
// difference between them is the "how to emit" line.
const BUCKETS_AND_RULES = [
  'Pick from EXACTLY these seven buckets — never invent new ones, never alter the spelling:',
  '- coding — programming, software engineering, algorithms, CS theory.',
  '- math — algebra, calculus, statistics, discrete math, geometry.',
  '- science_natural — physics, chemistry, biology, anatomy, geology, astronomy.',
  '- history_humanities — history, geography, art history, philosophy, religion, classics.',
  '- language — learning a foreign language (vocab, grammar, translation). NOT linguistics, NOT programming languages.',
  '- social_studies — law, economics, business, finance, psychology, sociology, political science, medicine, public health.',
  '- general — fallback only.',
  '',
  'Rules:',
  '- Return 1–3 entries sorted by weight, highest first. Weights should sum to ~1.0.',
  '- Single-subject inputs: ONE entry with weight 1.',
  '- Multi-subject inputs (engineering = math + science_natural, biochemistry = science_natural + math, history of mathematics = history_humanities + math): RETURN MORE THAN ONE entry with realistic relative weights.',
  '- Use `general` ONLY when the topic genuinely fits nothing else. Never combine `general` with another subject.',
].join('\n');

const ANTHROPIC_SYSTEM_PROMPT = [
  INTRO,
  'Call the `classify_path_subjects` tool exactly once. Do not produce any text outside the tool call.',
  '',
  BUCKETS_AND_RULES,
].join('\n');

const GEMINI_SYSTEM_PROMPT = [
  INTRO,
  'Return ONLY a JSON object of the form { "subjects": [ { "id": string, "weight": number } ] }. No prose, no markdown.',
  '',
  BUCKETS_AND_RULES,
].join('\n');

const geminiClassifySchema = z.object({
  subjects: z.array(z.object({ id: z.string(), weight: z.number() })).min(1),
});

function findToolUse(
  content: Anthropic.Messages.ContentBlock[],
  name: string
): Extract<Anthropic.Messages.ContentBlock, { type: 'tool_use' }> | null {
  for (const block of content) {
    if (block.type === 'tool_use' && block.name === name) return block;
  }
  return null;
}

// The subject is detectable from a modest excerpt — cap the corpus fed to the
// cheap, uncached classifier call rather than shipping the full corpus to it.
const CLASSIFIER_CORPUS_CHARS = 16_000;

function renderUserPrompt(opts: ClassifySubjectsOpts): string {
  const lines: string[] = [`Path title: "${opts.title}"`];
  if (opts.brief && opts.brief.trim().length > 0) {
    lines.push(`Learner brief: ${opts.brief.trim()}`);
  }
  const corpus = opts.corpus?.trim();
  if (corpus && corpus.length > 0) {
    const excerpt =
      corpus.length > CLASSIFIER_CORPUS_CHARS
        ? `${corpus.slice(0, CLASSIFIER_CORPUS_CHARS)}\n… [excerpt truncated]`
        : corpus;
    lines.push('', 'Source material excerpt:', excerpt);
  }
  lines.push('', 'Classify the subject(s) now.');
  return lines.join('\n');
}

/** Gemini Flash-Lite branch — JSON mode + Zod validate + corrective retry (G2). */
async function classifyViaGemini(
  opts: ClassifySubjectsOpts,
  model: string
): Promise<RawClassify> {
  let usage: { promptTokens: number; candidatesTokens: number; cachedTokens: number } | undefined;
  const data = await geminiStructured({
    schema: geminiClassifySchema,
    system: GEMINI_SYSTEM_PROMPT,
    userText: renderUserPrompt(opts),
    model,
    maxOutputTokens: 256,
    onUsage: (u) => {
      usage = u;
    },
  });
  logAiUsage({
    userId: null,
    feature: 'path-classify',
    provider: 'gemini',
    model,
    inputTokens: usage?.promptTokens ?? 0,
    outputTokens: usage?.candidatesTokens ?? 0,
    cacheReadTokens: usage?.cachedTokens ?? 0,
  });
  return data;
}

/** Anthropic forced-tool branch (legacy default / CLASSIFIER_PROVIDER=anthropic). */
async function classifyViaAnthropic(
  opts: ClassifySubjectsOpts,
  model: string
): Promise<RawClassify | null> {
  const response = await anthropic.messages.create({
    model,
    max_tokens: Math.min(MAX_OUTPUT_TOKENS, 1024),
    system: ANTHROPIC_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: renderUserPrompt(opts) }],
    tools: [CLASSIFY_SUBJECTS_TOOL],
    tool_choice: { type: 'tool', name: CLASSIFY_SUBJECTS_TOOL.name },
  });
  logAiUsage({
    userId: null,
    feature: 'path-classify',
    provider: 'anthropic',
    model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
  });
  const block = findToolUse(response.content, CLASSIFY_SUBJECTS_TOOL.name);
  if (!block) return null;
  return block.input as RawClassify;
}

export async function classifySubjects(
  opts: ClassifySubjectsOpts
): Promise<ClassifySubjectsResult> {
  const fallback: ClassifySubjectsResult = { subjects: ['general'], weights: [1], fallback: true };
  try {
    // Composition moves classify Haiku → Flash-Lite (CLASSIFIER_MODEL /
    // CLASSIFIER_PROVIDER override; MODEL_COMPOSITION_LEGACY=1 restores Haiku).
    const resolved = resolveModel('path-classify');
    const input =
      resolved.provider === 'gemini'
        ? await classifyViaGemini(opts, resolved.model)
        : await classifyViaAnthropic(opts, resolved.model);

    if (!input || !Array.isArray(input.subjects) || input.subjects.length === 0) {
      return fallback;
    }
    const ids = coerceSubjectIds(input.subjects.map((s) => s.id));
    if (ids.length === 0) {
      return fallback;
    }
    const rawWeights = input.subjects.map((s) => s.weight).filter((_, i) => i < ids.length);
    const { subjects, weights } = normalizeSubjectWeights(ids, rawWeights);
    return { subjects, weights, fallback: false };
  } catch (error) {
    console.error('[path-classifier] classification failed', error);
    return fallback;
  }
}
