export type NodeType = 'lesson' | 'quiz' | 'review' | 'boss';

export const NODE_META: Record<
  NodeType,
  { label: string; icon: string; color: string; soft: string; ink: string }
> = {
  lesson: {
    label: 'Lesson',
    icon: 'menu_book',
    color: 'var(--nm-lesson)',
    soft: 'var(--nm-lesson-soft)',
    ink: 'var(--nm-lesson-ink)',
  },
  quiz: {
    label: 'Quiz',
    icon: 'quiz',
    color: 'var(--nm-quiz)',
    soft: 'var(--nm-quiz-soft)',
    ink: 'var(--nm-quiz-ink)',
  },
  review: {
    label: 'Review',
    icon: 'repeat',
    color: 'var(--nm-review)',
    soft: 'var(--nm-review-soft)',
    ink: 'var(--nm-review-ink)',
  },
  boss: {
    label: 'Boss Test',
    icon: 'fort',
    color: 'var(--nm-boss)',
    soft: 'var(--nm-boss-soft)',
    ink: 'var(--nm-boss-ink)',
  },
};

/**
 * Maps a 0-100 readiness value to the appropriate semantic color token.
 * >= 75 → complete (green), >= 50 → review (amber), < 50 → boss (red).
 */
export function readinessColor(value: number): string {
  if (value >= 75) return 'var(--nm-complete)';
  if (value >= 50) return 'var(--nm-review)';
  return 'var(--nm-boss)';
}
