export interface UserStats {
  notebookCount: number;
  currentStreak: number;
  friendCount: number;
  sharedNotebookCount: number;
  groupCount: number;
  hasAllWrongQuiz: boolean;
  hasPerfectFirstTry: boolean;
  userLevel: number;
  usernameChanged: boolean;
  examCount: number;
  folderCount: number;
  sharedStudyMaterialCount: number;
  canvasPageCount: number;
  allTodosDone: boolean;
  scholarNameSet: boolean;
  dailyGoalHit: boolean;
  tutorialCompleted: boolean;
  totalAchievementsUnlocked: number;
  // PR 1 — fields backing the 5 new achievement-bound triggers.
  chatMessageCount: number;
  flashcardReviewCount: number;
  documentCount: number;
  quizSetCount: number;
}

export interface AchievementDef {
  badge: string;
  name: string;
  description: string;
  icon: string; // Material Symbols icon name (used directly, no mapping needed)
  category: 'study' | 'social' | 'streak' | 'content' | 'special';
  checkCondition: (stats: UserStats) => boolean;
  getProgress: (stats: UserStats) => { current: number; target: number };
  /**
   * Cosmetic catalog ids (see src/lib/cosmetics/catalog.ts) granted when this
   * achievement is unlocked for the first time. Empty array means the
   * achievement grants nothing — this is the case for `first_level_up`, which
   * is being removed in PR 3.
   *
   * Wired through `unlockCosmeticsForAchievement(userId, badge)` from the
   * achievement checker. Kept alongside the level-bound unlock path during PR
   * 1; the level path is removed in PR 3.
   */
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
    badge: 'first_level_up',
    name: 'levels to this game',
    description: 'Level up once',
    icon: 'upgrade',
    category: 'study',
    checkCondition: (s) => s.userLevel >= 2,
    getProgress: (s) => ({ current: Math.min(s.userLevel - 1, 1), target: 1 }),
    // Achievement is being killed in PR 3; intentionally grants nothing.
    unlocks: [],
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
    badge: 'all_todos_done',
    name: 'Time for a break!',
    description: "Check off all your To-Do's",
    icon: 'task_alt',
    category: 'study',
    checkCondition: (s) => s.allTodosDone,
    getProgress: (s) => ({ current: s.allTodosDone ? 1 : 0, target: 1 }),
    unlocks: [],
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
    badge: '10_notebooks',
    name: 'librarian',
    description: 'Have 10 notebooks or more',
    icon: 'local_library',
    category: 'content',
    checkCondition: (s) => s.notebookCount >= 10,
    getProgress: (s) => ({ current: Math.min(s.notebookCount, 10), target: 10 }),
    unlocks: ['frame.cosmic', 'bg.aurora-purple'],
  },
  {
    badge: 'first_folder',
    name: 'organizer',
    description: 'Create a folder',
    icon: 'create_new_folder',
    category: 'content',
    checkCondition: (s) => s.folderCount >= 1,
    getProgress: (s) => ({ current: Math.min(s.folderCount, 1), target: 1 }),
    unlocks: ['frame.glow-ember'],
  },
  {
    badge: 'first_canvas',
    name: 'Picasso',
    description: 'Use a canvas',
    icon: 'draw',
    category: 'content',
    checkCondition: (s) => s.canvasPageCount >= 1,
    getProgress: (s) => ({ current: Math.min(s.canvasPageCount, 1), target: 1 }),
    unlocks: ['font.marker', 'bg.geometric-violet'],
  },
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
    badge: 'first_group',
    name: 'in this together',
    description: 'Start your first study group',
    icon: 'group',
    category: 'social',
    checkCondition: (s) => s.groupCount >= 1,
    getProgress: (s) => ({ current: Math.min(s.groupCount, 1), target: 1 }),
    unlocks: ['font.abril'],
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
    badge: 'first_share',
    name: 'influencer',
    description: 'Share a notebook',
    icon: 'share',
    category: 'social',
    checkCondition: (s) => s.sharedNotebookCount >= 1,
    getProgress: (s) => ({ current: Math.min(s.sharedNotebookCount, 1), target: 1 }),
    unlocks: ['font.pressstart'],
  },
  {
    badge: 'share_study_material',
    name: 'plug',
    description: 'Share a flashcard set or quiz',
    icon: 'send',
    category: 'social',
    checkCondition: (s) => s.sharedStudyMaterialCount >= 1,
    getProgress: (s) => ({ current: Math.min(s.sharedStudyMaterialCount, 1), target: 1 }),
    unlocks: ['font.medieval'],
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

  // ── Special ─────────────────────────────────────────────────────────
  {
    badge: 'all_achievements',
    name: 'Notemage',
    description: 'Get all achievements',
    icon: 'auto_awesome',
    category: 'special',
    // Threshold tracks every non-meta achievement; updated when the list
    // grows. PR 1 adds 5 new achievements -> 18 + 5 = 23 non-meta entries.
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
