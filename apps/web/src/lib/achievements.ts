export interface UserStats {
  currentStreak: number;
  friendCount: number;
  hasAllWrongQuiz: boolean;
  hasPerfectFirstTry: boolean;
  usernameChanged: boolean;
  examCount: number;
  scholarNameSet: boolean;
  dailyGoalHit: boolean;
  tutorialCompleted: boolean;
  totalAchievementsUnlocked: number;
  chatMessageCount: number;
  flashcardReviewCount: number;
  documentCount: number;
  quizSetCount: number;
  // ── Phase 7 — personal learning-path rework signals ─────────────────────
  /** True if any quiz attempt scored 100% on a quiz with ≥5 questions. */
  hasPerfectQuiz: boolean;
  /** Longest consecutive-correct run in any single quiz session, ever. */
  maxQuizStreakEver: number;
  /** True if the user has ever, in one session, hit ≥3 wrong then ≥5 right. */
  everHadComeback: boolean;
  /**
   * Phase 10 — true if any StudyPhase has every slot fully completed (every
   * activity in every slot done). Replaces the old material-based check.
   */
  hasPhaseComplete: boolean;
  /** True if any StudyPlan has every phase fully completed. */
  hasPathComplete: boolean;
  /**
   * Phase 10 — true if the user scored 100% on any slot's assessment activity
   * on the first attempt (queried from `assessment_attempts`).
   */
  hasCheckpointAce: boolean;
  /** True if any single checkpoint slot has every activity completed. */
  hasAnySectionComplete: boolean;
  /** Number of StudyPlans with every phase fully completed. */
  pathCompleteCount: number;
}

export interface AchievementDef {
  badge: string;
  name: string;
  description: string;
  icon: string; // Material Symbols icon name (used directly, no mapping needed)
  category: 'study' | 'social' | 'streak' | 'content' | 'special';
  checkCondition: (stats: UserStats) => boolean;
  getProgress: (stats: UserStats) => { current: number; target: number };
  unlocks: string[];
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── Study ───────────────────────────────────────────────────────────
  {
    badge: 'daily_goal',
    name: 'locked in',
    description: 'Spend an hour in the app in a single day',
    icon: 'my_location',
    category: 'study',
    checkCondition: (s) => s.dailyGoalHit,
    getProgress: (s) => ({ current: s.dailyGoalHit ? 1 : 0, target: 1 }),
    unlocks: ['title.flashcard-fiend', 'bg.mesh'],
  },
  {
    badge: 'all_wrong_quiz',
    name: "what's 9+10?",
    description: 'Get all answers wrong in a quiz',
    icon: 'sentiment_very_dissatisfied',
    category: 'study',
    checkCondition: (s) => s.hasAllWrongQuiz,
    getProgress: (s) => ({ current: s.hasAllWrongQuiz ? 1 : 0, target: 1 }),
    unlocks: ['font.pacifico'],
  },
  {
    badge: 'perfect_first_try',
    name: 'built different',
    description: 'Get all answers in a quiz right first try',
    icon: 'military_tech',
    category: 'study',
    checkCondition: (s) => s.hasPerfectFirstTry,
    getProgress: (s) => ({ current: s.hasPerfectFirstTry ? 1 : 0, target: 1 }),
    unlocks: ['frame.glow-emerald'],
  },
  {
    badge: 'first_exam',
    name: 'tight schedule',
    description: 'Add an exam date',
    icon: 'event',
    category: 'study',
    checkCondition: (s) => s.examCount >= 1,
    getProgress: (s) => ({ current: Math.min(s.examCount, 1), target: 1 }),
    unlocks: ['font.serif'],
  },
  {
    badge: 'apprentice_mage',
    name: 'Apprentice Mage',
    description: 'Complete the welcome tour',
    icon: 'school',
    category: 'study',
    checkCondition: (s) => s.tutorialCompleted,
    getProgress: (s) => ({ current: s.tutorialCompleted ? 1 : 0, target: 1 }),
    unlocks: ['title.apprentice', 'font.display'],
  },
  {
    badge: 'first_chat',
    name: 'talking to myself',
    description: 'Send your first message to your mage assistant',
    icon: 'chat',
    category: 'study',
    checkCondition: (s) => s.chatMessageCount >= 1,
    getProgress: (s) => ({ current: Math.min(s.chatMessageCount, 1), target: 1 }),
    unlocks: ['font.imfell', 'frame.glow-purple'],
  },
  {
    badge: 'flashcard_grind',
    name: 'spaced repetition',
    description: 'Review 50 flashcards',
    icon: 'style',
    category: 'study',
    checkCondition: (s) => s.flashcardReviewCount >= 50,
    getProgress: (s) => ({ current: Math.min(s.flashcardReviewCount, 50), target: 50 }),
    unlocks: ['font.cinzel'],
  },

  // ── Content ─────────────────────────────────────────────────────────
  {
    badge: 'first_upload',
    name: 'loaded in',
    description: 'Upload your first document',
    icon: 'upload_file',
    category: 'content',
    checkCondition: (s) => s.documentCount >= 1,
    getProgress: (s) => ({ current: Math.min(s.documentCount, 1), target: 1 }),
    unlocks: ['font.brand'],
  },
  {
    badge: 'first_quiz_created',
    name: 'quizmaster',
    description: 'Create your first quiz',
    icon: 'quiz',
    category: 'content',
    checkCondition: (s) => s.quizSetCount >= 1,
    getProgress: (s) => ({ current: Math.min(s.quizSetCount, 1), target: 1 }),
    unlocks: ['font.orbitron'],
  },

  // ── Streak ──────────────────────────────────────────────────────────
  {
    badge: '7_day_streak',
    name: 'no days off',
    description: 'Log in for 7 days straight',
    icon: 'local_fire_department',
    category: 'streak',
    checkCondition: (s) => s.currentStreak >= 7,
    getProgress: (s) => ({ current: Math.min(s.currentStreak, 7), target: 7 }),
    unlocks: ['title.night-owl', 'bg.aurora-emerald'],
  },
  {
    badge: '30_day_streak',
    name: 'ok we get it',
    description: 'Log in for 30 days straight',
    icon: 'whatshot',
    category: 'streak',
    checkCondition: (s) => s.currentStreak >= 30,
    getProgress: (s) => ({ current: Math.min(s.currentStreak, 30), target: 30 }),
    unlocks: ['title.polymath', 'frame.pulse-aqua', 'bg.geometric-ember'],
  },

  // ── Social ──────────────────────────────────────────────────────────
  {
    badge: 'first_friend',
    name: "bff's",
    description: 'Add your first friend',
    icon: 'person_add',
    category: 'social',
    checkCondition: (s) => s.friendCount >= 1,
    getProgress: (s) => ({ current: Math.min(s.friendCount, 1), target: 1 }),
    unlocks: ['frame.pulse-rose'],
  },
  {
    badge: 'username_changed',
    name: 'McLovin',
    description: 'Change your username',
    icon: 'badge',
    category: 'social',
    checkCondition: (s) => s.usernameChanged,
    getProgress: (s) => ({ current: s.usernameChanged ? 1 : 0, target: 1 }),
    unlocks: ['title.scholar'],
  },
  {
    badge: '20_friends',
    name: 'cool kid',
    description: 'Have 20 or more friends',
    icon: 'diversity_3',
    category: 'social',
    checkCondition: (s) => s.friendCount >= 20,
    getProgress: (s) => ({ current: Math.min(s.friendCount, 20), target: 20 }),
    unlocks: ['font.bungee', 'bg.aurora-sunset'],
  },
  {
    badge: 'scholar_renamed',
    name: 'lay offs',
    description: 'Change the name of your mage',
    icon: 'edit',
    category: 'social',
    checkCondition: (s) => s.scholarNameSet,
    getProgress: (s) => ({ current: s.scholarNameSet ? 1 : 0, target: 1 }),
    unlocks: ['font.mono'],
  },

  // ── Phase 7 — personal learning-path rework ───────────────────────────────
  {
    badge: 'perfect_quiz',
    name: 'perfectionist',
    description: 'Score 100% on a quiz with at least 5 questions',
    icon: 'verified',
    category: 'study',
    checkCondition: (s) => s.hasPerfectQuiz,
    getProgress: (s) => ({ current: s.hasPerfectQuiz ? 1 : 0, target: 1 }),
    unlocks: ['title.perfectionist'],
  },
  {
    badge: 'streak_10_in_a_row',
    name: 'unstoppable',
    description: 'Get 10 answers correct in a row in a single quiz',
    icon: 'local_fire_department',
    category: 'study',
    checkCondition: (s) => s.maxQuizStreakEver >= 10,
    getProgress: (s) => ({ current: Math.min(s.maxQuizStreakEver, 10), target: 10 }),
    unlocks: ['title.unstoppable'],
  },
  {
    badge: 'phase_complete',
    name: 'pathfinder',
    description: 'Finish every lesson in a learn-path phase',
    icon: 'route',
    category: 'study',
    checkCondition: (s) => s.hasPhaseComplete,
    getProgress: (s) => ({ current: s.hasPhaseComplete ? 1 : 0, target: 1 }),
    unlocks: ['title.pathfinder'],
  },
  {
    badge: 'path_complete',
    name: 'master',
    description: 'Finish every phase of a learn path',
    icon: 'workspace_premium',
    category: 'special',
    checkCondition: (s) => s.hasPathComplete,
    getProgress: (s) => ({ current: s.hasPathComplete ? 1 : 0, target: 1 }),
    unlocks: ['title.master'],
  },
  {
    badge: 'checkpoint_ace',
    name: 'ace',
    description: 'Pass a checkpoint with 100% on your first attempt',
    icon: 'flag',
    category: 'study',
    checkCondition: (s) => s.hasCheckpointAce,
    getProgress: (s) => ({ current: s.hasCheckpointAce ? 1 : 0, target: 1 }),
    unlocks: ['title.ace'],
  },
  {
    badge: 'comeback',
    name: 'comeback kid',
    description: 'Get 5 right in a row after a 3-wrong streak in the same session',
    icon: 'rotate_left',
    category: 'study',
    checkCondition: (s) => s.everHadComeback,
    getProgress: (s) => ({ current: s.everHadComeback ? 1 : 0, target: 1 }),
    unlocks: ['title.comeback-kid'],
  },
  {
    badge: 'first_section',
    name: 'first steps',
    description: 'Finish your first lesson section',
    icon: 'directions_walk',
    category: 'study',
    checkCondition: (s) => s.hasAnySectionComplete,
    getProgress: (s) => ({ current: s.hasAnySectionComplete ? 1 : 0, target: 1 }),
    unlocks: ['title.first-steps'],
  },
  {
    badge: 'two_paths',
    name: 'trailblazer',
    description: 'Finish two full learning paths',
    icon: 'explore',
    category: 'special',
    checkCondition: (s) => s.pathCompleteCount >= 2,
    getProgress: (s) => ({ current: Math.min(s.pathCompleteCount, 2), target: 2 }),
    unlocks: ['title.trailblazer'],
  },

  // ── Special ─────────────────────────────────────────────────────────
  {
    badge: 'all_achievements',
    name: 'Notemage',
    description: 'Get all achievements',
    icon: 'auto_awesome',
    category: 'special',
    // Bump when adding a non-meta achievement. (Unlock logic uses the dynamic
    // NON_META_BADGES.length in achievement-checker; this drives the progress UI.)
    checkCondition: (s) => s.totalAchievementsUnlocked >= 23,
    getProgress: (s) => ({ current: Math.min(s.totalAchievementsUnlocked, 23), target: 23 }),
    unlocks: [
      'title.archmage',
      'font.unifraktur',
      'bg.constellation',
      'frame.prism',
      'color.primary',
    ],
  },
];

export function getAchievementDef(badge: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.badge === badge);
}
