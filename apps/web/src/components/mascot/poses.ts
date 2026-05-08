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
};
