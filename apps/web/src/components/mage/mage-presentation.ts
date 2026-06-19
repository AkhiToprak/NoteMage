/* Mage Revolution Phase 2 — surface presentation map (pure, client-safe).
 *
 * Turns a context type into the panel's chrome: the icon + label for the
 * context card and the starter prompt chips. Keeping this a plain lookup (no
 * db, no React) means the panel can derive everything it shows from the
 * registered context, and the set stays single-sourced as surfaces are wired.
 *
 * Chip copy follows the in-app voice: terse, action-first, no fabricated
 * specifics. Hints-first surfaces (practice / quiz) avoid "give me the answer";
 * the exam surface stays on readiness + planning, never answers.
 */

import type { MageClientContext, MageContextType } from '@/lib/mage-types';

export interface MagePresentation {
  /** Material Symbols Outlined glyph name. */
  icon: string;
  /** Short surface label shown in the context card. */
  label: string;
  /** Context-specific starter prompts (rendered as chips). */
  chips: string[];
}

const PRESENTATION: Record<MageContextType, MagePresentation> = {
  global: {
    icon: 'auto_awesome',
    label: 'Mage',
    chips: ['What should I study next?', 'Explain a concept', 'Quiz me'],
  },
  home: {
    icon: 'cottage',
    label: 'Home',
    chips: ['What should I study next?', 'How am I doing?', 'Plan my week'],
  },
  lesson: {
    icon: 'menu_book',
    label: 'Lesson',
    chips: ['Explain this simply', 'Give me an example', 'Quiz me on this lesson'],
  },
  practice: {
    icon: 'fitness_center',
    label: 'Practice',
    chips: ['Quiz me on my weak spots', 'What should I review?', 'Explain a tricky concept'],
  },
  path: {
    icon: 'route',
    label: 'Path',
    chips: ['Summarize this path', 'What should I focus on?', 'Where am I struggling?'],
  },
  'my-path': {
    icon: 'route',
    label: 'Path',
    chips: ['What should I study next?', 'Summarize my progress', 'Where am I struggling?'],
  },
  exam: {
    icon: 'school',
    label: 'Exam',
    chips: ['Am I ready?', 'What should I focus on?', 'Make me a study plan'],
  },
  'study-pack': {
    icon: 'folder_open',
    label: 'Study pack',
    chips: ['Summarize this pack', 'What are the key ideas?', 'Quiz me on this pack'],
  },
  material: {
    icon: 'description',
    label: 'Material',
    chips: ['Summarize this material', 'Explain the hard parts', 'Make flashcards from this'],
  },
  'quiz-question': {
    icon: 'quiz',
    label: 'Quiz',
    chips: ['Give me a hint', 'Explain this concept', 'Break down the question'],
  },
  'quiz-result': {
    icon: 'fact_check',
    label: 'Quiz results',
    chips: ['Explain my mistakes', 'What should I review?', 'Quiz me again'],
  },
};

/** Resolve a registered context into its panel presentation (falls back to the
 * global voice for an unknown/empty context). */
export function presentMageContext(ctx: MageClientContext | undefined): MagePresentation {
  const type = ctx?.type;
  return (type && PRESENTATION[type]) || PRESENTATION.global;
}
