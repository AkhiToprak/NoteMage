// Unit coverage for the flashcard normalizer (Phase 1 of
// plans/path-generation-reliability.md). The reported bug: a flashcard set
// needed 3-4 manual regenerations while the rest of the path succeeded.
// Root cause — `normalizeFlashcardsInput` dropped any card whose
// question/answer wasn't a plain string, so nested-object values
// (`answer: { text }`) vanished → empty set → spurious "failure".

import { describe, it, expect } from 'vitest';
import { normalizeFlashcardsInput, normalizeQuizQuestions } from './path-generator-normalize';

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
