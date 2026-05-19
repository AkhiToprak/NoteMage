import type Anthropic from '@anthropic-ai/sdk';
import { anthropic, AI_CLASSIFIER_MODEL, MAX_OUTPUT_TOKENS } from './anthropic';
import { CLASSIFY_SUBJECTS_TOOL, type ClassifySubjectsToolInput } from './ai-tools';
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

const SYSTEM_PROMPT = [
  'You classify the subject of a learning path so the generator can pick appropriate question types.',
  'Call the `classify_path_subjects` tool exactly once. Do not produce any text outside the tool call.',
  '',
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
  lines.push('', 'Classify the subject(s) now using the tool.');
  return lines.join('\n');
}

export async function classifySubjects(
  opts: ClassifySubjectsOpts
): Promise<ClassifySubjectsResult> {
  try {
    const response = await anthropic.messages.create({
      model: AI_CLASSIFIER_MODEL,
      max_tokens: Math.min(MAX_OUTPUT_TOKENS, 1024),
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: renderUserPrompt(opts) }],
      tools: [CLASSIFY_SUBJECTS_TOOL],
      tool_choice: { type: 'tool', name: CLASSIFY_SUBJECTS_TOOL.name },
    });
    const block = findToolUse(response.content, CLASSIFY_SUBJECTS_TOOL.name);
    if (!block) {
      return { subjects: ['general'], weights: [1], fallback: true };
    }
    const input = block.input as ClassifySubjectsToolInput;
    if (!input || !Array.isArray(input.subjects) || input.subjects.length === 0) {
      return { subjects: ['general'], weights: [1], fallback: true };
    }
    const ids = coerceSubjectIds(input.subjects.map((s) => s.id));
    if (ids.length === 0) {
      return { subjects: ['general'], weights: [1], fallback: true };
    }
    const rawWeights = input.subjects
      .map((s) => s.weight)
      .filter((_, i) => i < ids.length);
    const { subjects, weights } = normalizeSubjectWeights(ids, rawWeights);
    return { subjects, weights, fallback: false };
  } catch (error) {
    console.error('[path-classifier] classification failed', error);
    return { subjects: ['general'], weights: [1], fallback: true };
  }
}
