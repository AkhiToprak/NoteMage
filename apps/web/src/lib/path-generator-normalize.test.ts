// Unit coverage for the flashcard normalizer (Phase 1 of
// plans/path-generation-reliability.md). The reported bug: a flashcard set
// needed 3-4 manual regenerations while the rest of the path succeeded.
// Root cause — `normalizeFlashcardsInput` dropped any card whose
// question/answer wasn't a plain string, so nested-object values
// (`answer: { text }`) vanished → empty set → spurious "failure".

import { describe, it, expect } from 'vitest';
import { QuizSetV2Schema } from '@notemage/shared';
import {
  normalizeFlashcardsInput,
  normalizeQuizQuestions,
  safeParseQuizQuestions,
  runSemanticChecks,
} from './path-generator-normalize';

describe('normalizeFlashcardsInput', () => {
  it('keeps canonical {question, answer} string pairs', () => {
    const out = normalizeFlashcardsInput({
      title: 'Cells',
      flashcards: [
        { question: 'What is a cell?', answer: 'The basic unit of life.' },
        { question: 'Define organelle', answer: 'A specialized subunit.' },
      ],
    });
    expect(out.title).toBe('Cells');
    expect(out.flashcards).toHaveLength(2);
    expect(out.flashcards[0]).toEqual({
      question: 'What is a cell?',
      answer: 'The basic unit of life.',
    });
  });

  it('absorbs key drift (front/back, q/a, term/definition, prompt/response)', () => {
    const out = normalizeFlashcardsInput({
      title: 't',
      flashcards: [
        { front: 'F1', back: 'B1' },
        { q: 'Q2', a: 'A2' },
        { term: 'T3', definition: 'D3' },
        { prompt: 'P4', response: 'R4' },
      ],
    });
    expect(out.flashcards).toHaveLength(4);
    expect(out.flashcards.map((c) => c.question)).toEqual(['F1', 'Q2', 'T3', 'P4']);
    expect(out.flashcards.map((c) => c.answer)).toEqual(['B1', 'A2', 'D3', 'R4']);
  });

  // The Phase 1 fix: nested-object card sides must survive.
  it('extracts text from nested-object question/answer values', () => {
    const out = normalizeFlashcardsInput({
      title: 't',
      flashcards: [
        { question: { text: 'Nested Q' }, answer: { text: 'Nested A' } },
        { question: { value: 'V-Q' }, answer: { content: 'C-A' } },
        { front: { label: 'L-Q' }, back: 'plain back' },
      ],
    });
    expect(out.flashcards).toHaveLength(3);
    expect(out.flashcards[0]).toEqual({ question: 'Nested Q', answer: 'Nested A' });
    expect(out.flashcards[1]).toEqual({ question: 'V-Q', answer: 'C-A' });
    expect(out.flashcards[2]).toEqual({ question: 'L-Q', answer: 'plain back' });
  });

  it('accepts the array under alias keys (cards / flashCards)', () => {
    const a = normalizeFlashcardsInput({ title: 't', cards: [{ question: 'Q', answer: 'A' }] });
    const b = normalizeFlashcardsInput({ title: 't', flashCards: [{ question: 'Q', answer: 'A' }] });
    expect(a.flashcards).toHaveLength(1);
    expect(b.flashcards).toHaveLength(1);
  });

  it('recovers an index-keyed object instead of an array', () => {
    const out = normalizeFlashcardsInput({
      title: 't',
      flashcards: { '0': { question: 'Q0', answer: 'A0' }, '1': { question: 'Q1', answer: 'A1' } },
    });
    expect(out.flashcards).toHaveLength(2);
  });

  it('drops cards missing a usable side but keeps the rest', () => {
    const out = normalizeFlashcardsInput({
      title: 't',
      flashcards: [
        { question: 'good', answer: 'card' },
        { question: 'lonely' }, // no answer
        { answer: 'orphan' }, // no question
        { question: { wrongKey: 'x' }, answer: 'unreachable' }, // unrecognized nested key
      ],
    });
    expect(out.flashcards).toEqual([{ question: 'good', answer: 'card' }]);
  });

  it('returns an empty set for non-object / missing input (caller treats as failure)', () => {
    expect(normalizeFlashcardsInput(null).flashcards).toEqual([]);
    expect(normalizeFlashcardsInput('nope').flashcards).toEqual([]);
    expect(normalizeFlashcardsInput({ title: 't' }).flashcards).toEqual([]);
    expect(normalizeFlashcardsInput({}).title).toBe('');
  });

  // Figure-reuse (P3): the optional per-card figure object passes through
  // verbatim for the generator to validate; cards without one stay {q,a}-only.
  it('passes a figure object through (figure / image keys) and omits it otherwise', () => {
    const out = normalizeFlashcardsInput({
      title: 't',
      flashcards: [
        {
          question: 'Q1',
          answer: 'A1',
          figure: { imageRef: 'img_1', side: 'back', caption: 'A diagram' },
        },
        { question: 'Q2', answer: 'A2', image: { imageRef: 'img_2', caption: 'Another' } },
        { question: 'Q3', answer: 'A3' },
        { question: 'Q4', answer: 'A4', figure: 'not-an-object' },
      ],
    });
    expect(out.flashcards[0].figure).toEqual({
      imageRef: 'img_1',
      side: 'back',
      caption: 'A diagram',
    });
    expect(out.flashcards[1].figure).toEqual({ imageRef: 'img_2', caption: 'Another' });
    expect(out.flashcards[2].figure).toBeUndefined();
    // A non-object figure is ignored (no key added); the card still survives.
    expect(out.flashcards[3]).toEqual({ question: 'Q4', answer: 'A4' });
  });
});

describe('normalizeQuizQuestions', () => {
  // Figure-reuse (P4): the optional per-question figure object passes through
  // verbatim (figure / image key) for the generator to validate; questions
  // without one carry no figure key.
  it('passes a question figure through and omits it otherwise', () => {
    const out = normalizeQuizQuestions([
      {
        kind: 'mc',
        prompt: 'Q1',
        payload: { options: ['a', 'b', 'c', 'd'], correctIndex: 0 },
        figure: { imageRef: 'img_1', caption: 'An exhibit' },
      },
      {
        kind: 'true_false',
        prompt: 'Q2',
        payload: { correct: true },
        image: { imageRef: 'img_2', caption: 'Via image key' },
      },
      { kind: 'mc', prompt: 'Q3', payload: { options: ['a', 'b', 'c', 'd'], correctIndex: 1 } },
      {
        kind: 'mc',
        prompt: 'Q4',
        payload: { options: ['a', 'b', 'c', 'd'], correctIndex: 2 },
        figure: 'not-an-object',
      },
    ]);
    expect(out[0].figure).toEqual({ imageRef: 'img_1', caption: 'An exhibit' });
    expect(out[1].figure).toEqual({ imageRef: 'img_2', caption: 'Via image key' });
    expect(out[2].figure).toBeUndefined();
    // A non-object figure is ignored; the question still survives.
    expect(out[3].figure).toBeUndefined();
    expect(out[3].prompt).toBe('Q4');
  });
});

describe('normalizeQuizQuestions — payload coercions (Phase 1)', () => {
  it('coerces true_false string/number "correct" to boolean', () => {
    const out = normalizeQuizQuestions([
      { kind: 'true_false', prompt: 'A', payload: { correct: 'true' } },
      { kind: 'true_false', prompt: 'B', payload: { correct: 'False' } },
      { kind: 'true_false', prompt: 'C', payload: { answer: 1 } },
      { kind: 'true_false', prompt: 'D', payload: { correct: true } },
    ]);
    expect(out.map((q) => q.payload.correct)).toEqual([true, false, true, true]);
  });

  it('coerces a numeric timeline year to a string and absorbs key drift', () => {
    const out = normalizeQuizQuestions([
      {
        kind: 'timeline',
        prompt: 'Order these',
        payload: {
          events: [
            { year: 1914, label: 'WWI begins' },
            { date: '1939', event: 'WWII begins' },
          ],
        },
      },
    ]);
    expect(out[0].payload.events).toEqual([
      { year: '1914', label: 'WWI begins' },
      { year: '1939', label: 'WWII begins' },
    ]);
  });

  it('absorbs equation expectedExpression key drift', () => {
    const out = normalizeQuizQuestions([
      { kind: 'equation', prompt: 'Solve', payload: { answer: '2x + 1' } },
    ]);
    expect(out[0].payload.expectedExpression).toBe('2x + 1');
  });
});

describe('safeParseQuizQuestions (Phase 1)', () => {
  const good = (i: number) => ({
    kind: 'mc' as const,
    prompt: `Q${i}`,
    payload: { options: ['a', 'b', 'c', 'd'], correctIndex: 0 },
  });
  // 3 options is structurally invalid (McPayloadSchema requires exactly 4).
  const bad = { kind: 'mc' as const, prompt: 'bad', payload: { options: ['a', 'b', 'c'], correctIndex: 0 } };

  it('drops the unrecoverable question and keeps the good ones above the floor', () => {
    const res = safeParseQuizQuestions([good(1), bad, good(2), good(3)] as never, 3);
    expect(res.dropped).toBe(1);
    expect(res.questions).toHaveLength(3);
  });

  it('returns the original list when salvage would fall below the floor', () => {
    const res = safeParseQuizQuestions([good(1), bad] as never, 3);
    expect(res.dropped).toBe(0);
    expect(res.questions).toHaveLength(2);
  });
});

describe('runSemanticChecks (Phase 1)', () => {
  const parse = (questions: unknown[]) =>
    QuizSetV2Schema.parse({ title: 't', questions }).questions;

  it('passes a clean set', () => {
    const qs = parse([
      { kind: 'mc', prompt: 'Q', payload: { options: ['a', 'b', 'c', 'd'], correctIndex: 1 } },
    ]);
    expect(runSemanticChecks(qs)).toBeNull();
  });

  it('flags duplicate timeline years', () => {
    const qs = parse([
      {
        kind: 'timeline',
        prompt: 'Order',
        payload: {
          events: [
            { year: '1900', label: 'A' },
            { year: '1900', label: 'B' },
            { year: '1950', label: 'C' },
          ],
        },
      },
    ]);
    expect(runSemanticChecks(qs)).toMatch(/duplicate year/i);
  });

  it('flags an unsolvable word_bank (answer not in the bank)', () => {
    const qs = parse([
      {
        kind: 'word_bank',
        prompt: 'Fill it',
        payload: {
          template: 'The capital is {{0}}.',
          slots: [{ correctAnswer: 'Paris' }],
          wordBank: ['London', 'Berlin'],
        },
      },
    ]);
    expect(runSemanticChecks(qs)).toMatch(/unsolvable|missing from wordBank/i);
  });
});
