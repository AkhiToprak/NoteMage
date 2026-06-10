// Phase 7 of plans/path-generation-reliability.md — the quiz prompt must show
// the model ONLY the question kinds a subject permits, in BOTH the kind menu
// and the payload catalog. Offering forbidden kinds is what makes weaker models
// emit them and trip the kind-filter regeneration.

import { describe, it, expect } from 'vitest';
import { quizPayloadCatalogFor } from './ai-tools';
import { buildQuizPrompt, type SlotContentContext } from './path-prompts';
import { allowedKindsForSubjects, type SubjectId } from './path-subjects';
import type { PathSlotKind } from './ai-tools';

const ALL_KINDS = [
  'mc',
  'true_false',
  'fill_blank',
  'word_bank',
  'match_pairs',
  'translation',
  'sentence_reorder',
  'equation',
  'code_output',
  'code_write',
  'timeline',
] as const;

describe('quizPayloadCatalogFor', () => {
  it('emits only the requested kinds, plus the header', () => {
    const cat = quizPayloadCatalogFor(['mc', 'true_false']);
    expect(cat).toContain('Payload shapes');
    expect(cat).toContain('- mc →');
    expect(cat).toContain('- true_false →');
    expect(cat).not.toContain('- timeline →');
    expect(cat).not.toContain('- code_write →');
    expect(cat).not.toContain('- match_pairs →');
  });

  it('falls back to the full catalog for empty input', () => {
    const cat = quizPayloadCatalogFor([]);
    expect(cat).toContain('- timeline →');
    expect(cat).toContain('- code_write →');
    expect(cat).toContain('- mc →');
  });
});

function quizCtx(subjects: SubjectId[], slotKind: PathSlotKind = 'assessment'): SlotContentContext {
  return {
    pathTitle: 'P',
    pathDescription: 'D',
    phaseTitle: 'Ph',
    phaseDescription: 'PhD',
    slotTitle: 'S',
    slotKind,
    slotTopicHint: 'a topic',
    hasSourceMaterials: false,
    subjects,
    subjectWeights: subjects.map(() => 1 / subjects.length),
  };
}

describe('buildQuizPrompt — menu + catalog reflect allowed kinds', () => {
  it('lists a kind in the menu AND catalog iff the subject allows it', () => {
    const subjects: SubjectId[] = ['general'];
    const allowed = new Set(allowedKindsForSubjects(subjects));
    const { system } = buildQuizPrompt(quizCtx(subjects));

    for (const k of ALL_KINDS) {
      // Menu lines use an em-dash ("- mc — …"); catalog lines an arrow ("- mc → …").
      expect(system.includes(`- ${k} —`)).toBe(allowed.has(k));
      expect(system.includes(`- ${k} →`)).toBe(allowed.has(k));
    }
  });

  it('no longer hardcodes the "11 enum values" wording', () => {
    const { system } = buildQuizPrompt(quizCtx(['general']));
    expect(system).not.toContain('one of the 11 enum values');
    expect(system).toContain('one of the allowed kinds listed below');
  });
});
