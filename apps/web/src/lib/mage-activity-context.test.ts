import { describe, it, expect } from 'vitest';
import {
  buildQuizActivityContext,
  buildFlashcardActivityContext,
  type QuizActivityQuestion,
  type QuizActivityState,
} from './mage-types';

// A canonical MC question with a real answer key on the payload + columns.
const MC_QUESTION: QuizActivityQuestion = {
  id: 'q1',
  kind: 'mc',
  question: 'What is the powerhouse of the cell?',
  options: ['Nucleus', 'Mitochondrion', 'Ribosome', 'Golgi apparatus'],
  correctIndex: 1,
  payload: {
    options: ['Nucleus', 'Mitochondrion', 'Ribosome', 'Golgi apparatus'],
    correctIndex: 1,
    optionFeedback: [
      { explanation: 'The nucleus stores DNA.' },
      null,
      { explanation: 'Ribosomes build proteins.' },
      { explanation: 'The Golgi packages proteins.' },
    ],
  },
  hint: 'It generates ATP.',
  correctExplanation: 'The mitochondrion produces ATP via respiration.',
  wrongExplanation: 'That structure has a different job — think about energy.',
};

describe('buildQuizActivityContext — pre-submit MC', () => {
  const state: QuizActivityState = {
    surface: 'practice',
    isSubmittedOrRevealed: false,
    answer: { kind: 'mc', selectedIdx: 0 },
  };

  it('includes all options in safe', () => {
    const { safe } = buildQuizActivityContext(MC_QUESTION, state);
    expect(safe).toContain('Nucleus');
    expect(safe).toContain('Mitochondrion');
    expect(safe).toContain('Ribosome');
  });

  it('shows what the learner picked', () => {
    const { safe } = buildQuizActivityContext(MC_QUESTION, state);
    expect(safe).toContain('Learner picked option (1): Nucleus');
  });

  it('NEVER marks which option is correct in safe (no answer key)', () => {
    const { safe } = buildQuizActivityContext(MC_QUESTION, state);
    // No "correct" flag, no explanation, no verdict pre-submit.
    expect(safe.toLowerCase()).not.toContain('correct');
    expect(safe).not.toContain('produces ATP via respiration');
  });

  it('returns an empty revealing block pre-submit', () => {
    const { revealing } = buildQuizActivityContext(MC_QUESTION, state);
    expect(revealing).toEqual({});
  });

  it('marks the reveal policy as hint_only for a live question', () => {
    const { safe } = buildQuizActivityContext(MC_QUESTION, state);
    expect(safe).toContain('Reveal policy: hint_only');
  });
});

describe('buildQuizActivityContext — post-submit MC', () => {
  const state: QuizActivityState = {
    surface: 'practice',
    isSubmittedOrRevealed: true,
    answer: { kind: 'mc', selectedIdx: 0 },
    isCorrect: false,
  };

  it('populates revealing.pickedFeedback on a wrong answer', () => {
    const { revealing } = buildQuizActivityContext(MC_QUESTION, state);
    expect(revealing.pickedFeedback).toBe('That structure has a different job — think about energy.');
  });

  it('puts the correct answer ONLY in revealing, never in safe', () => {
    const { safe, revealing } = buildQuizActivityContext(MC_QUESTION, state);
    expect(revealing.correctAnswer).toBe('Mitochondrion');
    expect(revealing.fullExplanation).toBe('The mitochondrion produces ATP via respiration.');
    // safe carries the verdict but not the correct-answer marker / explanation.
    expect(safe).toContain('Verdict: INCORRECT');
    expect(safe).not.toContain('produces ATP via respiration');
  });

  it('populates allOptionFeedback when cheaply available', () => {
    const { revealing } = buildQuizActivityContext(MC_QUESTION, state);
    expect(revealing.allOptionFeedback).toContain('The nucleus stores DNA.');
  });
});

describe('buildQuizActivityContext — mock exam in progress', () => {
  const state: QuizActivityState = {
    surface: 'mock-exam',
    isSubmittedOrRevealed: false,
    answer: { kind: 'mc', selectedIdx: 2 },
    isCorrect: false, // even if a caller leaks this, it must not surface
  };

  it('emits no verdict and no revealing for a sealed exam question', () => {
    const { safe, revealing } = buildQuizActivityContext(MC_QUESTION, state);
    expect(revealing).toEqual({});
    expect(safe).not.toContain('Verdict');
    expect(safe).toContain('Reveal policy: sealed');
  });

  it('shows only the current question draft (its own options + pick)', () => {
    const { safe } = buildQuizActivityContext(MC_QUESTION, state);
    expect(safe).toContain('Learner picked option (3)');
    // No other-question data can appear — the serializer only ever sees one.
    expect(safe).not.toContain('produces ATP via respiration');
  });
});

describe('buildQuizActivityContext — code_write caps', () => {
  // Space-separated words so the redaction regex (long hex/base64 tokens) leaves
  // it intact — we're testing the length cap here, not redaction.
  const huge = 'error line here '.repeat(1000);
  const question: QuizActivityQuestion = {
    kind: 'code_write',
    question: 'Print the sum.',
    payload: {
      language: 'python',
      starterCode: 'def solve():\n    pass',
      tests: [{ stdin: '1 2', expectedStdout: '3' }],
    },
  };
  const state: QuizActivityState = {
    surface: 'practice',
    isSubmittedOrRevealed: true,
    isCorrect: false,
    answer: { kind: 'code_write', language: 'python', code: 'print(3)', passed: false },
    runs: [{ ok: false, exitCode: 1, stdout: huge, stderr: huge }],
  };

  it('truncates a huge stdout/stderr and stays under the caps', () => {
    const { safe } = buildQuizActivityContext(question, state);
    expect(safe).toContain('[truncated]');
    // The whole safe block honours the 6000 cap.
    expect(safe.length).toBeLessThanOrEqual(6000);
    // No 16k blob leaked through — the run stderr is capped well under it.
    expect(safe).not.toContain(huge);
  });

  it('renders language, tests, and pass/fail verdict', () => {
    const { safe } = buildQuizActivityContext(question, state);
    expect(safe).toContain('Language: python');
    expect(safe).toContain('expected=3');
    expect(safe).toContain('FAIL');
  });
});

describe('buildQuizActivityContext — match_pairs partial', () => {
  const question: QuizActivityQuestion = {
    kind: 'match_pairs',
    question: 'Match the term to its meaning.',
    payload: {
      pairs: [
        { left: 'Osmosis', right: 'water movement' },
        { left: 'Diffusion', right: 'particle spread' },
        { left: 'Active transport', right: 'needs energy' },
      ],
    },
    correctExplanation: 'Each term describes a transport mechanism.',
  };
  const state: QuizActivityState = {
    surface: 'practice',
    isSubmittedOrRevealed: false,
    answer: {
      kind: 'match_pairs',
      connections: [{ left: 0, rightLabel: 'water movement' }],
    },
  };

  it('renders partial connections and leftovers without a key leak in safe', () => {
    const { safe } = buildQuizActivityContext(question, state);
    expect(safe).toContain('connected: "Osmosis" → "water movement"');
    expect(safe).toContain('still unconnected (left)');
    expect(safe).toContain('Diffusion');
    // Pre-submit: no correct-mapping key exposed in safe.
    expect(safe).not.toContain('Each term describes a transport mechanism.');
  });
});

describe('buildQuizActivityContext — word_bank partial', () => {
  const question: QuizActivityQuestion = {
    kind: 'word_bank',
    question: 'Fill the sentence.',
    payload: {
      template: 'The {0} is {1}.',
      slots: [{ correctAnswer: 'sky' }, { correctAnswer: 'blue' }],
      wordBank: ['sky', 'blue', 'red', 'ground'],
    },
  };
  const state: QuizActivityState = {
    surface: 'practice',
    isSubmittedOrRevealed: false,
    answer: { kind: 'word_bank', slotAnswers: ['sky', null] },
  };

  it('renders the template, bank, and per-slot fills (null → empty)', () => {
    const { safe } = buildQuizActivityContext(question, state);
    expect(safe).toContain('Template: The {0} is {1}.');
    expect(safe).toContain('Word bank: sky, blue, red, ground');
    expect(safe).toContain('slot 1: sky');
    expect(safe).toContain('slot 2: empty');
  });

  it('does not compose a revealing key pre-submit', () => {
    const { revealing } = buildQuizActivityContext(question, state);
    // The bank words appear in safe (they're on-screen), but pre-submit the
    // answer KEY is never composed into revealing.
    expect(revealing).toEqual({});
    // Post-submit the key would surface in revealing.correctAnswer, not safe.
    const graded = buildQuizActivityContext(question, {
      ...state,
      isSubmittedOrRevealed: true,
      isCorrect: false,
    });
    expect(graded.revealing.correctAnswer).toBe('sky, blue');
    expect(graded.safe).not.toContain('slot 1: sky\n  slot 2: blue'); // key never rebuilt into safe
  });
});

describe('buildQuizActivityContext — redaction', () => {
  it('redacts an sk- API key in a typed fill_blank answer', () => {
    const question: QuizActivityQuestion = { kind: 'fill_blank', question: 'Paste your key.' };
    const state: QuizActivityState = {
      surface: 'practice',
      isSubmittedOrRevealed: false,
      answer: { kind: 'fill_blank', text: 'my key is sk-abcd1234EFGH5678ijkl and that is it' },
    };
    const { safe } = buildQuizActivityContext(question, state);
    expect(safe).toContain('[redacted]');
    expect(safe).not.toContain('sk-abcd1234EFGH5678ijkl');
  });

  it('redacts a JWT in typed code', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dQw4w9WgXcQabcdefghijk';
    const question: QuizActivityQuestion = {
      kind: 'code_write',
      question: 'Auth.',
      payload: { language: 'javascript', starterCode: '', tests: [{ expectedStdout: 'ok' }] },
    };
    const state: QuizActivityState = {
      surface: 'practice',
      isSubmittedOrRevealed: false,
      answer: { kind: 'code_write', language: 'javascript', code: `const t = "${jwt}";`, passed: false },
    };
    const { safe } = buildQuizActivityContext(question, state);
    expect(safe).toContain('[redacted]');
    expect(safe).not.toContain(jwt);
  });

  it('redacts AWS, GitHub, Google, Slack, and Stripe tokens in typed code', () => {
    const tokens = [
      'AKIAABCDEFGHIJKLMNOP',
      'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
      'AIzaSyD-abcdefghijklmnopqrstuvwxyz0123',
      'xoxb-abcdefghij-klmnopqrst',
      'sk_live_abcdefghij1234567890',
    ];
    const question: QuizActivityQuestion = {
      kind: 'code_write',
      question: 'Load the config.',
      payload: { language: 'javascript', starterCode: '', tests: [{ expectedStdout: 'ok' }] },
    };
    const state: QuizActivityState = {
      surface: 'practice',
      isSubmittedOrRevealed: false,
      answer: { kind: 'code_write', language: 'javascript', code: tokens.join('\n'), passed: false },
    };
    const { safe } = buildQuizActivityContext(question, state);
    expect(safe).toContain('[redacted]');
    for (const token of tokens) expect(safe).not.toContain(token);
  });
});

describe('buildFlashcardActivityContext — flip gates the back', () => {
  const card = { front: 'Capital of France?', back: 'Paris', imageCaptions: ['A map of Europe', null] };
  const base = { deckTitle: 'Geography', position: 2, total: 10, lastGrade: 'good' };

  it('pre-flip: back is NOT in safe, but IS in revealing.correctAnswer (server strips it)', () => {
    const { safe, revealing } = buildFlashcardActivityContext(card, { ...base, isFlipped: false });
    expect(safe).toContain('FRONT: Capital of France?');
    expect(safe).toContain('Flip state: front only');
    expect(safe).not.toContain('Paris');
    expect(safe).not.toContain('BACK:');
    expect(safe).toContain('A map of Europe (image not shown to you)');
    expect(safe).toContain('Last self-grade: good');
    expect(revealing.correctAnswer).toBe('Paris');
  });

  it('post-flip: back IS in safe, and revealing is empty', () => {
    const { safe, revealing } = buildFlashcardActivityContext(card, { ...base, isFlipped: true });
    expect(safe).toContain('Flip state: flipped (answer shown)');
    expect(safe).toContain('BACK: Paris');
    expect(revealing).toEqual({});
  });
});

describe('buildQuizActivityContext — partial-safe', () => {
  it('does not throw on an unknown kind with a malformed payload', () => {
    const question = { kind: 'nonsense_kind', question: 'Huh?', payload: 42 } as unknown as QuizActivityQuestion;
    const state: QuizActivityState = { surface: 'practice', isSubmittedOrRevealed: false };
    expect(() => buildQuizActivityContext(question, state)).not.toThrow();
    const { safe } = buildQuizActivityContext(question, state);
    expect(safe).toContain('Huh?');
  });

  it('handles a graded remediation row (surface: remediation) like a graded result', () => {
    const state: QuizActivityState = {
      surface: 'remediation',
      isSubmittedOrRevealed: true,
      answer: { kind: 'mc', selectedIdx: 1 },
      isCorrect: true,
    };
    const { safe, revealing } = buildQuizActivityContext(MC_QUESTION, state);
    expect(safe).toContain('Verdict: CORRECT');
    expect(revealing.correctAnswer).toBe('Mitochondrion');
  });
});
