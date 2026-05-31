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

// ─────────────────────────────────────────────────────────────────────
// Stage B pruning support — plans/path-generation-reliability.md (Phase 3)
// ─────────────────────────────────────────────────────────────────────

// Minimum theory substance (word count) a learning slot needs before its
// flashcards count as a real generation FAILURE when the model returns none.
// Below this the source material is genuinely too thin to support distinct
// cards, so Stage B PRUNES flashcards (keeping the theory lesson) instead of
// failing the checkpoint. Deliberately conservative: a normal theory section
// runs ~300–500 words, so only a stub trips this.
export const MIN_THEORY_WORDS_FOR_FLASHCARDS = 40;

/**
 * Whether a learning slot's generated theory is too thin to support
 * flashcards — the prune-vs-fail discriminator when no cards come back.
 * Returns false when there's no theory evidence (e.g. a review slot, whose
 * cards draw on earlier material): there, an empty result is a failure to
 * retry, not legitimate thinness.
 */
export function isTheoryTooThinForFlashcards(
  theoryText: string | null | undefined,
): boolean {
  if (!theoryText) return false;
  const words = theoryText.trim().split(/\s+/).filter(Boolean).length;
  // Zero words = the theory itself produced nothing (a broken/blank lesson),
  // not a thin-but-real one. Treat that like "no evidence" and let it
  // fail-and-retry rather than pruning cards to paper over an empty lesson.
  if (words === 0) return false;
  return words < MIN_THEORY_WORDS_FOR_FLASHCARDS;
}
