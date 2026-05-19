// Single source of truth for the slot-kind → activity-kind mapping.
// Shared by the generator (which activities to create), path-gating
// (detecting checkpoints with failed/missing generation), and the loader.

export type PathActivityKind = 'theory' | 'flashcards' | 'quiz';

/**
 * The activity kinds a checkpoint slot of the given kind should contain:
 *   learning                → theory + flashcards
 *   review                  → flashcards + quiz
 *   assessment / final_exam → quiz
 */
export function expectedActivityKinds(kind: string): PathActivityKind[] {
  if (kind === 'learning') return ['theory', 'flashcards'];
  if (kind === 'review') return ['flashcards', 'quiz'];
  return ['quiz'];
}
