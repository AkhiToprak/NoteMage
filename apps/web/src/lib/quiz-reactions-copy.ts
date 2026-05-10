// Copy bank for the mascot reaction engine (Phase 3 of the personal-Duolingo rework).
//
// Drafts: first-pass, edit for voice. Tone: encouraging, plain English, no exclamation overload.
// pickCopy() is deterministic when a seed is supplied — the same (tier, seed) pair always
// returns the same line, so a quiz session can avoid back-to-back repeats by seeding with
// the running streak count.

export const QUIZ_REACTION_COPY = {
  streakSmall: [
    'Three in a row.',
    'Nice rhythm.',
    'You’ve got this.',
    'Locked in.',
    'Three. Keep going.',
  ],
  streakMid: [
    'Five strong.',
    'On a roll.',
    'You’re in the zone.',
    'Five clean.',
    'That’s a streak.',
  ],
  streakBig: [
    'Seven and counting.',
    'Unstoppable right now.',
    'Don’t look down.',
    'Streak of the day.',
    'This is your run.',
  ],
  wrongTwo: [
    'Take your time.',
    'No rush — read it again.',
    'Slow it down for a sec.',
    'Worth a re-read.',
    'You’ve got the next one.',
    'Pause, then pick.',
    'One miss is fine.',
    'Breathe, then answer.',
  ],
  wrongThree: [
    'Want a hint?',
    'Let’s look at the hint together.',
    'Hint coming up — take it.',
    'This one’s tricky. Here’s a nudge.',
    'No shame in a hint.',
    'A hint might help here.',
    'Reset — here’s a clue.',
    'Try the hint, then try again.',
  ],
  perfectScore: [
    'Perfect. 100%.',
    'Clean run.',
    'Not one wrong.',
    'Full marks.',
    'Every single one.',
    'Flawless.',
    'You owned this set.',
    'That was a sweep.',
  ],
  checkpointPass: [
    'Section complete.',
    'Checkpoint cleared.',
    'Next phase unlocked.',
    'You earned that.',
    'On to the next stretch.',
    'Phase done — keep moving.',
  ],
  pathComplete: [
    'Path complete.',
    'You finished the whole thing.',
    'From start to finish — done.',
    'That’s a wrap on this path.',
  ],
  lockState: {
    locked: 'Finish the previous lesson to open this one.',
    completePrereqs: 'Complete the lessons before this to unlock it.',
  },
} as const;

export type CopyTier = Exclude<keyof typeof QUIZ_REACTION_COPY, 'lockState'>;

export function pickCopy(tier: CopyTier, seed?: number): string {
  const pool = QUIZ_REACTION_COPY[tier];
  if (seed === undefined) {
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const idx = Math.abs(Math.trunc(seed)) % pool.length;
  return pool[idx];
}

export function pickLockCopy(reason: keyof typeof QUIZ_REACTION_COPY.lockState): string {
  return QUIZ_REACTION_COPY.lockState[reason];
}
