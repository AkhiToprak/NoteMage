import type {
  MascotOneShot,
  MascotPose,
  MascotSize,
} from '@/components/mascot/poses';
import { pickCopy, type CopyTier } from './quiz-reactions-copy';

export type ReactionMode = 'all' | 'minimal' | 'off';

export type ReactionKind =
  | 'streak_small'
  | 'streak_mid'
  | 'streak_big'
  | 'wrong_warn'
  | 'wrong_help'
  | 'perfect_score'
  | 'checkpoint_pass';

export interface ReactionFinalResult {
  percentage: number;
  totalQuestions: number;
  isCheckpoint?: boolean;
  passed?: boolean;
}

export interface ReactionInput {
  correctStreak: number;
  wrongStreak: number;
  lastAnswerCorrect: boolean | null;
  finalResult?: ReactionFinalResult;
}

export interface Reaction {
  kind: ReactionKind;
  pose: MascotPose;
  oneShot: MascotOneShot | null;
  size: MascotSize;
  display: 'corner' | 'overlay' | 'takeover';
  confetti: boolean;
  message: string;
  audio: string | null;
  durationMs: number;
}

const CORNER_DURATION_MS = 1800;
const OVERLAY_DURATION_MS = 2800;

const MINIMAL_ALLOWED: ReadonlySet<ReactionKind> = new Set([
  'wrong_help',
  'perfect_score',
  'checkpoint_pass',
]);

function isPermitted(kind: ReactionKind, mode: ReactionMode): boolean {
  if (mode === 'off') return false;
  if (mode === 'minimal') return MINIMAL_ALLOWED.has(kind);
  return true;
}

function buildReaction(
  kind: ReactionKind,
  tier: CopyTier,
  seed: number,
  overrides: Omit<Reaction, 'kind' | 'message'>,
): Reaction {
  return {
    kind,
    message: pickCopy(tier, seed),
    ...overrides,
  };
}

function bigStreakShouldFire(correctStreak: number): boolean {
  if (correctStreak < 7) return false;
  return (correctStreak - 7) % 5 === 0;
}

export function computeReaction(
  input: ReactionInput,
  mode: ReactionMode,
): Reaction | null {
  if (mode === 'off') return null;

  if (input.finalResult) {
    const { percentage, isCheckpoint, passed } = input.finalResult;

    if (isCheckpoint && passed && isPermitted('checkpoint_pass', mode)) {
      return buildReaction('checkpoint_pass', 'checkpointPass', percentage, {
        pose: 'graduation',
        oneShot: 'celebrate',
        size: 'xl',
        display: 'overlay',
        confetti: true,
        audio: 'checkpoint',
        durationMs: OVERLAY_DURATION_MS,
      });
    }

    if (percentage === 100 && isPermitted('perfect_score', mode)) {
      return buildReaction(
        'perfect_score',
        'perfectScore',
        input.finalResult.totalQuestions,
        {
          pose: 'celebrate',
          oneShot: 'celebrate',
          size: 'xl',
          display: 'overlay',
          confetti: true,
          audio: 'celebration',
          durationMs: OVERLAY_DURATION_MS,
        },
      );
    }

    return null;
  }

  if (input.lastAnswerCorrect === false) {
    if (input.wrongStreak === 3 && isPermitted('wrong_help', mode)) {
      return buildReaction('wrong_help', 'wrongThree', input.wrongStreak, {
        pose: 'sad',
        oneShot: 'comfort',
        size: 'md',
        display: 'corner',
        confetti: false,
        audio: null,
        durationMs: CORNER_DURATION_MS,
      });
    }
    if (input.wrongStreak === 2 && isPermitted('wrong_warn', mode)) {
      return buildReaction('wrong_warn', 'wrongTwo', input.wrongStreak, {
        pose: 'thinking',
        oneShot: null,
        size: 'md',
        display: 'corner',
        confetti: false,
        audio: null,
        durationMs: CORNER_DURATION_MS,
      });
    }
    return null;
  }

  if (input.lastAnswerCorrect === true) {
    if (bigStreakShouldFire(input.correctStreak) && isPermitted('streak_big', mode)) {
      return buildReaction('streak_big', 'streakBig', input.correctStreak, {
        pose: 'celebrate',
        oneShot: 'cheer-big',
        size: 'lg',
        display: 'corner',
        confetti: false,
        audio: 'streak-big',
        durationMs: CORNER_DURATION_MS,
      });
    }
    if (input.correctStreak === 5 && isPermitted('streak_mid', mode)) {
      return buildReaction('streak_mid', 'streakMid', input.correctStreak, {
        pose: 'celebrate',
        oneShot: 'cheer-big',
        size: 'lg',
        display: 'corner',
        confetti: false,
        audio: 'streak-mid',
        durationMs: CORNER_DURATION_MS,
      });
    }
    if (input.correctStreak === 3 && isPermitted('streak_small', mode)) {
      // Full-screen "3 in a row!" Flash-mage takeover (StreakTakeover), shown
      // instead of a corner card. It owns its own sound + dismiss, so the
      // pose/size/confetti/duration fields below are inert for this display.
      return buildReaction('streak_small', 'streakSmall', input.correctStreak, {
        pose: 'wink',
        oneShot: 'cheer-small',
        size: 'md',
        display: 'takeover',
        confetti: false,
        audio: null,
        durationMs: OVERLAY_DURATION_MS,
      });
    }
  }

  return null;
}
