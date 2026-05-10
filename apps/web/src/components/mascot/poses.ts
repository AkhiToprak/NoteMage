export type MascotPose =
  | 'default'
  | 'wave'
  | 'pointing-left'
  | 'pointing-right'
  | 'holding-wand'
  | 'thinking'
  | 'holding-scroll'
  | 'holding-pen'
  | 'graduation'
  | 'celebrate'
  | 'sleeping'
  | 'sad'
  | 'writing'
  | 'painting'
  | 'holding-flashcards'
  | 'quizzing'
  | 'chatting'
  | 'wink'
  | 'peek'
  | 'shrug'
  | 'bow'
  | 'head-tilt'
  | 'hide-behind-hat';

export type MascotIdle = 'none' | 'bounce' | 'float' | 'sway';

export type MascotSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export type MascotOneShot = 'cast' | 'celebrate' | 'sparkle' | 'step-in' | 'step-out';

export const SIZE_PX: Record<MascotSize, number> = {
  xs: 40,
  sm: 56,
  md: 108,
  lg: 176,
  xl: 264,
};

export interface PoseEntry {
  src: string;
  blinkSrc?: string;
  recommendedSize: MascotSize;
  recommendedIdle: MascotIdle;
}

export const SILHOUETTE_SRC = '/mascot/default-silhouette-32.png';

export const POSES: Record<MascotPose, PoseEntry> = {
  default: {
    src: '/mascot/default-v2.png',
    blinkSrc: '/mascot/default-blink-v2.png',
    recommendedSize: 'md',
    recommendedIdle: 'bounce',
  },
  wave: {
    src: '/mascot/wave-v2.png',
    recommendedSize: 'lg',
    recommendedIdle: 'float',
  },
  'pointing-left': {
    src: '/mascot/pointing-left-v2.png',
    recommendedSize: 'sm',
    recommendedIdle: 'bounce',
  },
  'pointing-right': {
    src: '/mascot/pointing-right-v2.png',
    recommendedSize: 'sm',
    recommendedIdle: 'bounce',
  },
  'holding-wand': {
    src: '/mascot/holding-wand-v2.png',
    recommendedSize: 'sm',
    recommendedIdle: 'bounce',
  },
  thinking: {
    src: '/mascot/thinking-v2.png',
    recommendedSize: 'md',
    recommendedIdle: 'sway',
  },
  'holding-scroll': {
    src: '/mascot/holding-scroll-v2.png',
    recommendedSize: 'md',
    recommendedIdle: 'sway',
  },
  'holding-pen': {
    src: '/mascot/holding-pen-v2.png',
    recommendedSize: 'md',
    recommendedIdle: 'bounce',
  },
  graduation: {
    src: '/mascot/graduation-v2.png',
    recommendedSize: 'lg',
    recommendedIdle: 'float',
  },
  celebrate: {
    src: '/mascot/celebrate-v2.png',
    recommendedSize: 'sm',
    recommendedIdle: 'bounce',
  },
  sleeping: {
    src: '/mascot/sleeping-v2.png',
    recommendedSize: 'md',
    recommendedIdle: 'sway',
  },
  sad: {
    src: '/mascot/sad-v2.png',
    recommendedSize: 'lg',
    recommendedIdle: 'none',
  },
  writing: {
    src: '/mascot/writing-v2.png',
    recommendedSize: 'sm',
    recommendedIdle: 'bounce',
  },
  painting: {
    src: '/mascot/painting-v2.png',
    recommendedSize: 'sm',
    recommendedIdle: 'bounce',
  },
  'holding-flashcards': {
    src: '/mascot/holding-flashcards-v2.png',
    recommendedSize: 'sm',
    recommendedIdle: 'bounce',
  },
  quizzing: {
    src: '/mascot/quizzing-v2.png',
    recommendedSize: 'sm',
    recommendedIdle: 'sway',
  },
  chatting: {
    src: '/mascot/chatting-v2.png',
    recommendedSize: 'sm',
    recommendedIdle: 'bounce',
  },
  wink: {
    src: '/mascot/wink-v2.png',
    recommendedSize: 'sm',
    recommendedIdle: 'none',
  },
  peek: {
    src: '/mascot/peek-v2.png',
    recommendedSize: 'sm',
    recommendedIdle: 'none',
  },
  shrug: {
    src: '/mascot/shrug-v2.png',
    recommendedSize: 'sm',
    recommendedIdle: 'none',
  },
  bow: {
    src: '/mascot/bow-v2.png',
    recommendedSize: 'sm',
    recommendedIdle: 'none',
  },
  'head-tilt': {
    src: '/mascot/head-tilt-v2.png',
    recommendedSize: 'sm',
    recommendedIdle: 'none',
  },
  'hide-behind-hat': {
    src: '/mascot/hide-behind-hat-v2.png',
    recommendedSize: 'sm',
    recommendedIdle: 'none',
  },
};

export const HOVER_POSES: readonly MascotPose[] = [
  'wink',
  'peek',
  'shrug',
  'bow',
  'head-tilt',
  'hide-behind-hat',
];
