// Chat system-prompt building blocks, split out of the old monolithic
// `systemParts` in chat-stream.ts. Each block is a frozen, byte-stable const
// so it stays cache-friendly. The plain-chat core carries NO tool prose; the
// per-intent guidance + its single tool load only when the intent gate picks
// a generation intent. See `chat-intent.ts`.

import type Anthropic from '@anthropic-ai/sdk';
import type { GenerationIntent } from './chat-intent';
import {
  FLASHCARD_TOOL,
  QUIZ_TOOL_V2,
  MINDMAP_TOOL,
  STUDY_PLAN_TOOL,
  PRESENTATION_TOOL,
  YOUTUBE_VIDEOS_TOOL,
} from './ai-tools';

/** The ~plain-chat core — no tool-usage prose. Loaded on every turn. */
export const CHAT_BASE_INSTRUCTIONS = [
  'Help the user study, understand, and review their notes and documents.',
  'Be concise, clear, and educational. Use markdown formatting when helpful.',
].join('\n');

/**
 * Per-intent quality guidance, appended only when generating that artifact.
 * The tool is forced via `tool_choice`, so this prose is about HOW to produce
 * a good artifact (the per-kind payload shapes live in the tool descriptions,
 * not duplicated here).
 */
export const INTENT_GUIDANCE: Record<GenerationIntent, string> = {
  flashcards:
    'Create high-quality flashcards with clear questions and concise answers. For complex answers, use bullet points or numbered lists.',
  quiz: [
    'Create a quiz with `create_quiz_v2`. Mix question kinds intentionally (mc, fill_blank, word_bank, match_pairs, translation, sentence_reorder, equation) — see the tool description for each payload shape.',
    'Use mc for factual recall, fill_blank for definitions/short answers, word_bank for ordered grammar/syntax, match_pairs for term/definition pairs, translation for language learning, sentence_reorder for syntax sequencing, equation for math. Aim for variety across a quiz rather than all-MC.',
    'For MC questions: 4 options each, distribute the correct answer evenly across positions 0–3, keep all four options similar in length and level of detail, make distractors plausible.',
    'Always provide hints and explanations for both correct and incorrect answers to help students learn.',
  ].join('\n'),
  mindmap:
    'Structure the mind map using Markdown headings (# for root, ## for main branches, ### for sub-branches, #### for details). Keep node text concise.',
  study_plan:
    'Create logical phases that distribute materials across a reasonable timeframe. Only use referenceIds from the notebook inventory provided in context.',
  presentation: [
    'Follow these rules for the presentation:',
    '- Every content slide MUST have an ACTION TITLE: a complete sentence stating the takeaway, NOT a topic label. Example: "Early interventions reduce dropout rates by 40%" instead of "Results".',
    '- Use varied slide types: start with a title slide, use section_dividers to organize, two_column for comparisons, and end with a conclusion.',
    '- Pick a themeColor hex that fits the subject (e.g. blue for science, green for biology, red for history).',
    '- Add graphicDescription on slides where a visual would help (charts, diagrams, illustrations). Be specific about what the graphic shows.',
    '- Keep bullets concise: 3-5 per slide, max ~15 words each.',
    '- Aim for 8-15 slides total. Add speaker notes with extra detail.',
  ].join('\n'),
  videos:
    'Generate a specific, educational YouTube search query for the topic the user wants a video on. Make it focused (e.g. "mitosis cell division explained", "integration by parts calculus tutorial").',
};

/** The single tool loaded for each generation intent. */
export const INTENT_TOOL: Record<GenerationIntent, Anthropic.Messages.Tool> = {
  flashcards: FLASHCARD_TOOL,
  quiz: QUIZ_TOOL_V2,
  mindmap: MINDMAP_TOOL,
  study_plan: STUDY_PLAN_TOOL,
  presentation: PRESENTATION_TOOL,
  videos: YOUTUBE_VIDEOS_TOOL,
};
