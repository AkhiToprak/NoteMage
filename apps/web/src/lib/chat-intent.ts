// Chat intent routing. The chat surface used to ship all 7 generation tools
// (~2.5–3k tokens) + heavy tool-usage prose on EVERY turn, which forced a
// capable model and re-billed that overhead each message. Instead we classify
// the turn's intent up front: a sync keyword heuristic handles the dominant
// plain-chat case (zero LLM cost/latency), and a small forced-tool Haiku call
// disambiguates the rest. The chat call then loads ONLY the matching tool (or
// none for plain chat). Pattern mirrors `path-classifier.ts`.

import type Anthropic from '@anthropic-ai/sdk';
import { anthropic, AI_CLASSIFIER_MODEL, MAX_OUTPUT_TOKENS } from './anthropic';
import { CLASSIFY_CHAT_INTENT_TOOL, type ClassifyChatIntentToolInput } from './ai-tools';
import { logAiUsage } from './ai-usage';

export type ChatIntent =
  | 'chat'
  | 'flashcards'
  | 'quiz'
  | 'mindmap'
  | 'study_plan'
  | 'presentation'
  | 'videos';

/** The generation intents — every ChatIntent except plain `chat`. */
export type GenerationIntent = Exclude<ChatIntent, 'chat'>;

export interface ChatIntentResult {
  intent: ChatIntent;
  /** How the intent was decided — surfaced in the Sentry breadcrumb. */
  via: 'heuristic' | 'llm' | 'fallback';
}

export const GENERATION_INTENTS: GenerationIntent[] = [
  'flashcards',
  'quiz',
  'mindmap',
  'study_plan',
  'presentation',
  'videos',
];

// Per-intent keyword signals. Deliberately conservative: a match only flags a
// CANDIDATE intent — it's confirmed by a creation verb (or a standalone
// imperative like "quiz me"), otherwise we defer to the LLM.
const KEYWORDS: Record<GenerationIntent, RegExp> = {
  flashcards: /\bflash\s?cards?\b|\bflashcard set\b/i,
  quiz: /\b(quiz|quizzes|mcq|multiple[-\s]?choice)\b/i,
  mindmap: /\bmind\s?maps?\b|\bconcept maps?\b/i,
  study_plan: /\bstudy plan\b|\bstudy schedule\b|\brevision plan\b|\blearning path\b/i,
  presentation: /\b(presentations?|slides?|power\s?point|ppt|slide deck|deck)\b/i,
  videos: /\b(videos?|tutorials?|youtube)\b/i,
};

const CREATE_VERB =
  /\b(make|create|generate|build|design|draft|prepare|produce|put together|give me|i need|i want|can you (?:make|create|generate|build|give))\b/i;

// Standalone imperatives that are unambiguous on their own (no creation verb
// needed). "quiz me on X" / "test me on X".
const STANDALONE_QUIZ = /\b(quiz|test) me\b/i;

/**
 * Sync keyword classifier — the fast path.
 *
 * Returns:
 * - `'chat'` when no generation keyword appears (the dominant case).
 * - a generation intent when a single intent's keyword appears alongside a
 *   creation verb (e.g. "make flashcards"), or a standalone imperative.
 * - `null` when a generation keyword is present but intent is ambiguous
 *   (keyword without a creation verb, or multiple intents matched) — the
 *   caller should defer to `classifyChatIntent`.
 */
export function heuristicIntent(text: string): ChatIntent | null {
  const lower = text.toLowerCase();

  // Standalone imperative — no creation verb required.
  if (STANDALONE_QUIZ.test(lower)) return 'quiz';

  const matched = GENERATION_INTENTS.filter((intent) => KEYWORDS[intent].test(lower));
  if (matched.length === 0) return 'chat';

  if (matched.length === 1 && CREATE_VERB.test(lower)) return matched[0];

  // Keyword present but no creation verb (e.g. "what is a mind map?"), or
  // several intents matched ("flashcards and a quiz") → let the LLM decide.
  return null;
}

const VALID_INTENTS = new Set<ChatIntent>([
  'chat',
  ...GENERATION_INTENTS,
]);

const SYSTEM_PROMPT = [
  'You route a single chat turn for a study assistant. Call the `classify_chat_intent` tool exactly once. Produce no text outside the tool call.',
  'Pick "chat" unless the user is clearly asking to CREATE one of these artifacts: flashcards, quiz, mindmap, study_plan, presentation, videos.',
  'Questions, explanations, comparisons, and summaries are all "chat" — even when they mention one of those words (e.g. "what is a good quiz question?" is chat).',
  'When unsure, choose "chat".',
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

export interface ClassifyChatIntentOpts {
  userMessage: string;
  /** Optional recent-history tail, for follow-ups like "make 10 more". */
  recentTail?: string;
}

/**
 * LLM fallback for ambiguous turns. Cheap (Haiku, forced single-enum tool,
 * tiny output). Degrades to plain `chat` on any error so it never blocks a
 * turn.
 */
export async function classifyChatIntent(
  opts: ClassifyChatIntentOpts
): Promise<ChatIntentResult> {
  try {
    const lines = [`User message: ${opts.userMessage}`];
    if (opts.recentTail && opts.recentTail.trim().length > 0) {
      lines.push('', 'Recent conversation:', opts.recentTail.trim());
    }
    lines.push('', 'Classify this turn now using the tool.');

    const response = await anthropic.messages.create({
      model: AI_CLASSIFIER_MODEL,
      max_tokens: Math.min(MAX_OUTPUT_TOKENS, 256),
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: lines.join('\n') }],
      tools: [CLASSIFY_CHAT_INTENT_TOOL],
      tool_choice: { type: 'tool', name: CLASSIFY_CHAT_INTENT_TOOL.name },
    });

    logAiUsage({
      userId: null,
      feature: 'chat-intent',
      provider: 'anthropic',
      model: AI_CLASSIFIER_MODEL,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    });

    const block = findToolUse(response.content, CLASSIFY_CHAT_INTENT_TOOL.name);
    const intent = (block?.input as ClassifyChatIntentToolInput | undefined)?.intent;
    if (intent && VALID_INTENTS.has(intent)) {
      return { intent, via: 'llm' };
    }
    return { intent: 'chat', via: 'fallback' };
  } catch (error) {
    console.error('[chat-intent] classification failed', error);
    return { intent: 'chat', via: 'fallback' };
  }
}

/**
 * Resolve a turn's intent: heuristic first (sync, free), LLM only when the
 * heuristic is uncertain.
 */
export async function resolveChatIntent(
  opts: ClassifyChatIntentOpts
): Promise<ChatIntentResult> {
  const fast = heuristicIntent(opts.userMessage);
  if (fast !== null) return { intent: fast, via: 'heuristic' };
  return classifyChatIntent(opts);
}
