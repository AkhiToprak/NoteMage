import { describe, expect, it } from 'vitest';
import { shuffleMcPayloadInPlace } from './quiz-option-shuffle';

describe('shuffleMcPayloadInPlace', () => {
  it('keeps each misconception attached to its answer option', () => {
    const payload = {
      options: ['correct', 'wrong-b', 'wrong-c', 'wrong-d'],
      correctIndex: 0,
      optionFeedback: [
        null,
        { explanation: 'feedback-b' },
        { explanation: 'feedback-c' },
        { explanation: 'feedback-d' },
      ],
    };
    shuffleMcPayloadInPlace(payload, () => 0);
    expect(payload.options[payload.correctIndex]).toBe('correct');
    for (const suffix of ['b', 'c', 'd']) {
      const index = payload.options.indexOf(`wrong-${suffix}`);
      expect(payload.optionFeedback[index]?.explanation).toBe(`feedback-${suffix}`);
    }
  });
});
