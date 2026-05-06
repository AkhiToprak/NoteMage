export interface SM2Result {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewAt: Date;
}

/**
 * SM-2 spaced repetition algorithm
 * @param quality 0-5 rating (0-2 = wrong, 3 = hard, 4 = good, 5 = easy)
 */
export function sm2(
  quality: number,
  previousEF: number,
  previousInterval: number,
  previousRepetitions: number
): SM2Result {
  let ef = previousEF;
  let interval: number;
  let repetitions: number;

  if (quality < 3) {
    // Wrong answer — reset
    repetitions = 0;
    interval = 1;
  } else {
    // Correct answer
    repetitions = previousRepetitions + 1;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 6;
    } else {
      interval = Math.round(previousInterval * ef);
    }
  }

  // Adjust ease factor
  ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (ef < 1.3) ef = 1.3;

  const nextReviewAt = new Date();
  nextReviewAt.setDate(nextReviewAt.getDate() + interval);
  nextReviewAt.setHours(0, 0, 0, 0);

  return { easeFactor: ef, interval, repetitions, nextReviewAt };
}
