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
  | 'sad';

export type MascotIdle = 'none' | 'bounce' | 'float' | 'sway';

export type MascotSize = 'sm' | 'md' | 'lg' | 'xl';

export type MascotOneShot =
  | 'cast'
  | 'celebrate'
  | 'sparkle'
  | 'step-in'
  | 'step-out';

export const SIZE_PX: Record<MascotSize, number> = {
  sm: 48,
  md: 96,
  lg: 160,
  xl: 240,
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
    src: '/mascot/default.png',
    blinkSrc: '/mascot/default-blink.png',
    recommendedSize: 'md',
    recommendedIdle: 'bounce',
  },
  wave: {
    src: '/mascot/wave.png',
    recommendedSize: 'lg',
    recommendedIdle: 'float',
  },
  'pointing-left': {
    src: '/mascot/pointing-left.png',
    recommendedSize: 'sm',
    recommendedIdle: 'bounce',
  },
  'pointing-right': {
    src: '/mascot/pointing-right.png',
    recommendedSize: 'sm',
    recommendedIdle: 'bounce',
  },
  'holding-wand': {
    src: '/mascot/holding-wand.png',
    recommendedSize: 'sm',
    recommendedIdle: 'bounce',
  },
  thinking: {
    src: '/mascot/thinking.png',
    recommendedSize: 'md',
    recommendedIdle: 'sway',
  },
  'holding-scroll': {
    src: '/mascot/holding-scroll.png',
    recommendedSize: 'md',
    recommendedIdle: 'sway',
  },
  'holding-pen': {
    src: '/mascot/holding-pen.png',
    recommendedSize: 'md',
    recommendedIdle: 'bounce',
  },
  graduation: {
    src: '/mascot/graduation.png',
    recommendedSize: 'lg',
    recommendedIdle: 'float',
  },
  celebrate: {
    src: '/mascot/celebrate.png',
    recommendedSize: 'sm',
    recommendedIdle: 'bounce',
  },
  sleeping: {
    src: '/mascot/sleeping.png',
    recommendedSize: 'md',
    recommendedIdle: 'sway',
  },
  sad: {
    src: '/mascot/sad.png',
    recommendedSize: 'lg',
    recommendedIdle: 'none',
  },
};
