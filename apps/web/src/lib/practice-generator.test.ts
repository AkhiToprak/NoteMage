import { describe, it, expect } from 'vitest';
import {
  PRACTICE_QUIZ_KINDS,
  practiceQuizCount,
  practiceOriginForAction,
  selectFocusTopics,
  buildPracticeQuizInstructions,
  buildPracticeFocusTail,
  parsePracticeQuiz,
  practiceQuestionRows,
} from './practice-generator';

// Pure helpers only — the db loaders + the AI call are integration concerns and
// are not exercised here (mirrors exam-readiness.test.ts / quiz-grading.test.ts).

describe('practiceQuizCount', () => {
  it('gives exam simulations more questions than focused sessions', () => {
    expect(practiceQuizCount('exam_sim')).toBe(12);
    expect(practiceQuizCount('weak_topic')).toBe(8);
    expect(practiceQuizCount('manual')).toBe(8);
    expect(practiceQuizCount('mistake_review')).toBe(8);
  });
});

describe('practiceOriginForAction', () => {
  it('maps each quiz-assembling action to its origin', () => {
    expect(practiceOriginForAction('START_WEAK_TOPIC_SESSION')).toBe('weak_topic');
    expect(practiceOriginForAction('START_EXAM_SIMULATION')).toBe('exam_sim');
    expect(practiceOriginForAction('CREATE_PRACTICE_SET')).toBe('manual');
  });

  it('returns null for non-practice actions (EXPLAIN_MISTAKE is a chat turn)', () => {
    expect(practiceOriginForAction('EXPLAIN_MISTAKE')).toBeNull();
    expect(practiceOriginForAction('OPEN_PATH')).toBeNull();
    expect(practiceOriginForAction('REVEAL_ANSWER')).toBeNull();
    expect(practiceOriginForAction('EDIT_EXAM_SCOPE')).toBeNull();
  });
});

describe('selectFocusTopics', () => {
  it('lists weak checkpoint titles before missed-question prompts', () => {
    expect(selectFocusTopics(['Cell Respiration', 'Photosynthesis'], ['What is ATP?'])).toEqual([
      'Cell Respiration',
      'Photosynthesis',
      'What is ATP?',
    ]);
  });

  it('de-dups case-insensitively, keeping the first occurrence', () => {
    expect(selectFocusTopics(['Mitosis', 'mitosis '], ['MITOSIS'])).toEqual(['Mitosis']);
  });

  it('drops empty / whitespace-only entries', () => {
    expect(selectFocusTopics(['', '   ', 'Real Topic'], [' '])).toEqual(['Real Topic']);
  });

  it('caps the list and truncates over-long topics', () => {
    const many = Array.from({ length: 20 }, (_, i) => `Topic ${i}`);
    expect(selectFocusTopics(many, [])).toHaveLength(8);

    const long = 'x'.repeat(300);
    const [only] = selectFocusTopics([long], []);
    expect(only.length).toBe(160);
    expect(only.endsWith('…')).toBe(true);
  });
});

describe('buildPracticeQuizInstructions', () => {
  const text = buildPracticeQuizInstructions(PRACTICE_QUIZ_KINDS);

  it('names every allowed kind and excludes subject-specific ones', () => {
    for (const kind of PRACTICE_QUIZ_KINDS) expect(text).toContain(kind);
    // The payload catalog is restricted to the allowed kinds — no equation/code lines.
    expect(text).toContain('- mc →');
    expect(text).toContain('- match_pairs →');
    expect(text).not.toContain('- equation →');
    expect(text).not.toContain('- code_write →');
  });

  it('is deterministic for a given kind set (cache-stable static block)', () => {
    expect(buildPracticeQuizInstructions(PRACTICE_QUIZ_KINDS)).toBe(text);
  });
});

describe('buildPracticeFocusTail', () => {
  it('lists focus topics as bullets and states the count', () => {
    const tail = buildPracticeFocusTail({ focusTopics: ['Cell Respiration'], count: 8 });
    expect(tail).toContain('Produce about 8 questions.');
    expect(tail).toContain('- Cell Respiration');
    expect(tail).toContain('weak topics');
  });

  it('falls back to even coverage when no focus topics are given', () => {
    const tail = buildPracticeFocusTail({ focusTopics: [], count: 12 });
    expect(tail).toContain('Cover the most important ideas');
    expect(tail).not.toContain('weak topics');
  });

  it('adds a subject line when provided', () => {
    expect(buildPracticeFocusTail({ focusTopics: [], count: 8, subject: 'Biology' })).toContain(
      'Subject area: Biology.'
    );
  });
});

// A realistic raw tool payload (pre-normalization) the way the model emits it.
function rawQuiz(extra: Record<string, unknown> = {}) {
  return {
    title: 'Cell Biology',
    questions: [
      {
        kind: 'mc',
        prompt: 'Which organelle makes ATP?',
        payload: { options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi'], correctIndex: 1 },
        hint: 'Powerhouse of the cell.',
        correctExplanation: 'The mitochondria produces ATP.',
        wrongExplanation: 'Re-read the section on respiration.',
      },
      {
        kind: 'fill_blank',
        prompt: 'The ___ is the powerhouse of the cell.',
        payload: { blank: { acceptableAnswers: ['mitochondria'] } },
      },
    ],
    ...extra,
  };
}

describe('parsePracticeQuiz', () => {
  it('validates a realistic quiz and keeps the practice title', () => {
    const parsed = parsePracticeQuiz(rawQuiz(), 'Fallback Title');
    expect(parsed).not.toBeNull();
    expect(parsed!.questions).toHaveLength(2);
    expect(parsed!.title).toBe('Cell Biology');
  });

  it('uses the fallback title when the model omits one', () => {
    const parsed = parsePracticeQuiz(rawQuiz({ title: '' }), 'Fallback Title');
    expect(parsed!.title).toBe('Fallback Title');
  });

  it('drops questions whose kind is outside the practice set', () => {
    const withEquation = rawQuiz({
      questions: [
        {
          kind: 'mc',
          prompt: 'Which organelle makes ATP?',
          payload: { options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi'], correctIndex: 1 },
        },
        { kind: 'equation', prompt: 'Solve 2 + 2', payload: { expectedExpression: '4' } },
      ],
    });
    const parsed = parsePracticeQuiz(withEquation, 'T');
    expect(parsed!.questions).toHaveLength(1);
    expect(parsed!.questions[0].kind).toBe('mc');
  });

  it('returns null when nothing usable survives', () => {
    expect(parsePracticeQuiz({ title: 'x', questions: [] }, 'T')).toBeNull();
    expect(parsePracticeQuiz(null, 'T')).toBeNull();
  });
});

describe('practiceQuestionRows', () => {
  it('maps validated questions onto QuizQuestion columns (legacy MC columns + payload)', () => {
    const parsed = parsePracticeQuiz(rawQuiz(), 'T')!;
    const rows = practiceQuestionRows(parsed.questions);

    expect(rows).toHaveLength(2);

    const mc = rows[0];
    expect(mc.kind).toBe('mc');
    expect(mc.question).toBe('Which organelle makes ATP?');
    expect(mc.options).toEqual(['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi']);
    expect(mc.correctIndex).toBe(1);
    expect(mc.correctExplanation).toBe('The mitochondria produces ATP.');
    expect(mc.sortOrder).toBe(0);

    const fill = rows[1];
    expect(fill.kind).toBe('fill_blank');
    // Non-MC kinds carry sentinel legacy columns; the real key is in payload.
    expect(fill.options).toEqual([]);
    expect(fill.correctIndex).toBe(0);
    expect(fill.sortOrder).toBe(1);
  });
});
