// Chat intent routing. The chat surface used to ship all 7 generation tools
// (~2.5–3k tokens) + heavy tool-usage prose on EVERY turn, which forced a
// capable model and re-billed that overhead each message. Instead we classify
// the turn's intent up front: a sync keyword heuristic handles the dominant
// plain-chat case (zero LLM cost/latency), and a small forced-tool GLM-4.7-flash
// call disambiguates the rest. The chat call then loads ONLY the matching tool
// (or none for plain chat). Pattern mirrors `path-classifier.ts`.

import { CLASSIFY_CHAT_INTENT_TOOL, type ClassifyChatIntentToolInput } from './ai-tools';
import { logAiUsage } from './ai-usage';
import { resolveModel } from './model-routing';
import { callOpenRouter } from './openrouter';
import { anthropicToolToOpenAI } from './openrouter-tools';

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

export interface ClassifyChatIntentOpts {
  userMessage: string;
  /** Optional recent-history tail, for follow-ups like "make 10 more". */
  recentTail?: string;
}

/**
 * LLM fallback for ambiguous turns. Cheap (GLM-4.7-flash, forced single-enum
 * tool, tiny output). Degrades to plain `chat` on any error so it never blocks
 * a turn.
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

    // GLM-4.7-flash forced tool (100% reliable on GLM, unlike json_schema). Any
    // failure falls through to the outer catch → plain 'chat'. A non-openrouter
    // pin has no intent path here, so it degrades to 'chat' the same way.
    const resolved = resolveModel('chat-intent');
    if (resolved.provider !== 'openrouter') {
      return { intent: 'chat', via: 'fallback' };
    }
    const r = await callOpenRouter({
      model: resolved.model,
      system: SYSTEM_PROMPT,
      user: lines.join('\n'),
      tools: [anthropicToolToOpenAI(CLASSIFY_CHAT_INTENT_TOOL)],
      toolChoice: { type: 'function', function: { name: CLASSIFY_CHAT_INTENT_TOOL.name } },
      maxTokens: 256,
      disableReasoning: true,
      // Single-enum classification — fully deterministic.
      temperature: 0,
    });
    logAiUsage({
      userId: null,
      feature: 'chat-intent',
      provider: 'openrouter',
      model: resolved.model,
      inputTokens: r.usage.inputTokens,
      outputTokens: r.usage.outputTokens,
      cacheReadTokens: r.usage.cachedTokens,
      costUsd: r.usage.costUsd,
    });
    const call =
      r.toolCalls.find((c) => c.name === CLASSIFY_CHAT_INTENT_TOOL.name) ?? r.toolCalls[0];
    let glmIntent: ChatIntent | undefined;
    if (call) {
      try {
        glmIntent = (JSON.parse(call.arguments) as ClassifyChatIntentToolInput).intent;
      } catch {
        glmIntent = undefined;
      }
    }
    if (glmIntent && VALID_INTENTS.has(glmIntent)) return { intent: glmIntent, via: 'llm' };
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
