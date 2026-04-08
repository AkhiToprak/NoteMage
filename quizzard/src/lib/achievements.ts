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
  totalAchievementsUnlocked: number;
}

export interface AchievementDef {
  badge: string;
  name: string;
  description: string;
  icon: string; // Material Symbols icon name (used directly, no mapping needed)
  category: 'study' | 'social' | 'streak' | 'content' | 'special';
  checkCondition: (stats: UserStats) => boolean;
  getProgress: (stats: UserStats) => { current: number; target: number };
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── Study ───────────────────────────────────────────────────────────
  {
    badge: 'daily_goal',
    name: 'locked in',
    description: 'Hit your daily goal once',
    icon: 'my_location',
    category: 'study',
    checkCondition: (s) => s.dailyGoalHit,
    getProgress: (s) => ({ current: s.dailyGoalHit ? 1 : 0, target: 1 }),
  },
  {
    badge: 'all_wrong_quiz',
    name: "what's 9+10?",
    description: 'Get all answers wrong in a quiz',
    icon: 'sentiment_very_dissatisfied',
    category: 'study',
    checkCondition: (s) => s.hasAllWrongQuiz,
    getProgress: (s) => ({ current: s.hasAllWrongQuiz ? 1 : 0, target: 1 }),
  },
  {
    badge: 'perfect_first_try',
    name: 'built different',
    description: 'Get all answers in a quiz right first try',
    icon: 'military_tech',
    category: 'study',
    checkCondition: (s) => s.hasPerfectFirstTry,
    getProgress: (s) => ({ current: s.hasPerfectFirstTry ? 1 : 0, target: 1 }),
  },
  {
    badge: 'first_level_up',
    name: 'levels to this game',
    description: 'Level up once',
    icon: 'upgrade',
    category: 'study',
    checkCondition: (s) => s.userLevel >= 2,
    getProgress: (s) => ({ current: Math.min(s.userLevel - 1, 1), target: 1 }),
  },
  {
    badge: 'first_exam',
    name: 'tight schedule',
    description: 'Add an exam date',
    icon: 'event',
    category: 'study',
    checkCondition: (s) => s.examCount >= 1,
    getProgress: (s) => ({ current: Math.min(s.examCount, 1), target: 1 }),
  },
  {
    badge: 'all_todos_done',
    name: 'Time for a break!',
    description: "Check off all your To-Do's",
    icon: 'task_alt',
    category: 'study',
    checkCondition: (s) => s.allTodosDone,
    getProgress: (s) => ({ current: s.allTodosDone ? 1 : 0, target: 1 }),
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
  },
  {
    badge: 'first_folder',
    name: 'organizer',
    description: 'Create a folder',
    icon: 'create_new_folder',
    category: 'content',
    checkCondition: (s) => s.folderCount >= 1,
    getProgress: (s) => ({ current: Math.min(s.folderCount, 1), target: 1 }),
  },
  {
    badge: 'first_canvas',
    name: 'Picasso',
    description: 'Use a canvas',
    icon: 'draw',
    category: 'content',
    checkCondition: (s) => s.canvasPageCount >= 1,
    getProgress: (s) => ({ current: Math.min(s.canvasPageCount, 1), target: 1 }),
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
  },
  {
    badge: 'first_group',
    name: 'in this together',
    description: 'Start your first study group',
    icon: 'group',
    category: 'social',
    checkCondition: (s) => s.groupCount >= 1,
    getProgress: (s) => ({ current: Math.min(s.groupCount, 1), target: 1 }),
  },
  {
    badge: 'username_changed',
    name: 'McLovin',
    description: 'Change your username',
    icon: 'badge',
    category: 'social',
    checkCondition: (s) => s.usernameChanged,
    getProgress: (s) => ({ current: s.usernameChanged ? 1 : 0, target: 1 }),
  },
  {
    badge: 'first_share',
    name: 'influencer',
    description: 'Share a notebook',
    icon: 'share',
    category: 'social',
    checkCondition: (s) => s.sharedNotebookCount >= 1,
    getProgress: (s) => ({ current: Math.min(s.sharedNotebookCount, 1), target: 1 }),
  },
  {
    badge: 'share_study_material',
    name: 'plug',
    description: 'Share a flashcard set or quiz',
    icon: 'send',
    category: 'social',
    checkCondition: (s) => s.sharedStudyMaterialCount >= 1,
    getProgress: (s) => ({ current: Math.min(s.sharedStudyMaterialCount, 1), target: 1 }),
  },
  {
    badge: '20_friends',
    name: 'cool kid',
    description: 'Have 20 or more friends',
    icon: 'diversity_3',
    category: 'social',
    checkCondition: (s) => s.friendCount >= 20,
    getProgress: (s) => ({ current: Math.min(s.friendCount, 20), target: 20 }),
  },
  {
    badge: 'scholar_renamed',
    name: 'lay offs',
    description: 'Change the name of your scholar',
    icon: 'edit',
    category: 'social',
    checkCondition: (s) => s.scholarNameSet,
    getProgress: (s) => ({ current: s.scholarNameSet ? 1 : 0, target: 1 }),
  },

  // ── Special ─────────────────────────────────────────────────────────
  {
    badge: 'all_achievements',
    name: 'Quizzard',
    description: 'Get all achievements',
    icon: 'auto_awesome',
    category: 'special',
    checkCondition: (s) => s.totalAchievementsUnlocked >= 17,
    getProgress: (s) => ({ current: Math.min(s.totalAchievementsUnlocked, 17), target: 17 }),
  },
];

export function getAchievementDef(badge: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.badge === badge);
}
