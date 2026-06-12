// Path-diagrams-revival (Phase 2) — the per-subject diagram nudge. The dominant
// subject decides the preferred kind; the skeleton must name the exact
// PathDiagramSchema fields so schemaless Flash-Lite can copy the shape. Subjects
// with no natural diagram (math/general) return null so no nudge is injected.

import { describe, it, expect } from 'vitest';
import { subjectDiagramHint, subjectFlashcardGuidanceFragment } from './path-subjects';

describe('subjectDiagramHint', () => {
  it('returns the preferred kind + matching skeleton per subject', () => {
    const coding = subjectDiagramHint(['coding']);
    expect(coding).toContain('Preferred diagram for this subject: steps');
    expect(coding).toContain('"kind": "steps"');
    expect(coding).toContain('"steps":');

    const science = subjectDiagramHint(['science_natural']);
    expect(science).toContain('cycle');
    expect(science).toContain('"nodes":');

    const history = subjectDiagramHint(['history_humanities']);
    expect(history).toContain('timeline');
    expect(history).toContain('"events":');
    expect(history).toContain('"date"');
    expect(history).toContain('"label"');

    const language = subjectDiagramHint(['language']);
    expect(language).toContain('comparison');
    expect(language).toContain('"columns":');
    expect(language).toContain('"rows":');

    const social = subjectDiagramHint(['social_studies']);
    expect(social).toContain('comparison');
  });

  it('returns null for subjects with no preferred kind', () => {
    expect(subjectDiagramHint(['math'])).toBeNull();
    expect(subjectDiagramHint(['general'])).toBeNull();
  });

  it('returns null for an empty subject list', () => {
    expect(subjectDiagramHint([])).toBeNull();
  });

  it('keys off the dominant (first) subject only', () => {
    // First subject wins even when later subjects have a preferred kind.
    expect(subjectDiagramHint(['math', 'history_humanities'])).toBeNull();
    expect(subjectDiagramHint(['history_humanities', 'math'])).toContain('timeline');
  });
});

// Phase 6 (Goal B) — math flashcards become worked-example cards via a
// prompt-only steer. Only `math` carries flashcard guidance; every other
// subject contributes nothing, so the fragment is empty (no behavior change).
describe('subjectFlashcardGuidanceFragment', () => {
  it('emits worked-example guidance for math', () => {
    const math = subjectFlashcardGuidanceFragment(['math']);
    expect(math).toContain('Card style (Mathematics):');
    expect(math).toContain('WORKED-EXAMPLE');
    expect(math).toContain('$…$');
  });

  it('returns empty for subjects with no flashcard guidance', () => {
    for (const s of [
      'coding',
      'science_natural',
      'history_humanities',
      'language',
      'social_studies',
      'general',
    ] as const) {
      expect(subjectFlashcardGuidanceFragment([s])).toBe('');
    }
  });

  it('returns empty for an empty subject list', () => {
    expect(subjectFlashcardGuidanceFragment([])).toBe('');
  });

  it('includes math guidance in a multi-subject mix and skips guidance-less subjects', () => {
    const mixed = subjectFlashcardGuidanceFragment(['math', 'history_humanities']);
    // Only math carries guidance, so the single-entry (singular "Card style")
    // branch is used — guidance-less subjects contribute no line at all.
    expect(mixed).toContain('Card style (Mathematics):');
    expect(mixed).toContain('WORKED-EXAMPLE');
    // history has no flashcard guidance → not listed as its own line.
    expect(mixed).not.toContain('History & Humanities:');
  });
});
