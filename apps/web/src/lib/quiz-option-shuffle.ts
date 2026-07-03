import type { McPayload } from '@notemage/shared';

/** Shuffle MC options while preserving answer-key and per-option feedback alignment. */
export function shuffleMcPayloadInPlace(
  payload: McPayload,
  random: () => number = Math.random,
): void {
  let correctIndex = payload.correctIndex;
  for (let i = payload.options.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [payload.options[i], payload.options[j]] = [payload.options[j], payload.options[i]];
    if (payload.optionFeedback) {
      [payload.optionFeedback[i], payload.optionFeedback[j]] = [
        payload.optionFeedback[j],
        payload.optionFeedback[i],
      ];
    }
    if (correctIndex === i) correctIndex = j;
    else if (correctIndex === j) correctIndex = i;
  }
  payload.correctIndex = correctIndex;
}
