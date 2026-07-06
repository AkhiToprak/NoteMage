import { z } from 'zod';
import { resolveModel } from './model-routing';
import { GEMINI_PATH_MODEL_LITE } from './gemini';
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

/** Provider-neutral raw classifier output (the tool-input schema and the Gemini
 *  JSON output share this shape). */
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

const GEMINI_SYSTEM_PROMPT = [
  INTRO,
  'Return ONLY a JSON object of the form { "subjects": [ { "id": string, "weight": number } ] }. No prose, no markdown.',
  '',
  BUCKETS_AND_RULES,
].join('\n');

const geminiClassifySchema = z.object({
  subjects: z.array(z.object({ id: z.string(), weight: z.number() })).min(1),
});

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

export async function classifySubjects(
  opts: ClassifySubjectsOpts
): Promise<ClassifySubjectsResult> {
  const fallback: ClassifySubjectsResult = { subjects: ['general'], weights: [1], fallback: true };
  try {
    // Classify runs on Gemini Flash-Lite (forced JSON). CLASSIFIER_MODEL pins
    // the model; a non-Gemini pin (e.g. a glm-* token) has no forced-tool
    // classify path here, so fall back to the Gemini default + model.
    const resolved = resolveModel('path-classify');
    const geminiModel =
      resolved.provider === 'gemini'
        ? resolved.model
        : (() => {
            console.warn(
              `[path-classifier] CLASSIFIER_MODEL resolved to a non-Gemini provider ` +
                `(${resolved.provider}); classify is Gemini-only — using the Flash-Lite default`,
            );
            return GEMINI_PATH_MODEL_LITE;
          })();
    const input = await classifyViaGemini(opts, geminiModel);

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
