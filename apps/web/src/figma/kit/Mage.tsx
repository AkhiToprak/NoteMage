'use client';

import Image from 'next/image';
import { Mascot, type MascotPose, type MascotSize } from '@/components/mascot';

/**
 * Figma `_assets` aliases (frame 1:2) → existing Mascot poses. The screens refer
 * to the mascot by the short names used in the Figma file; this map keeps the
 * call sites readable and reuses ALL existing `/public/mascot/*-v2.png` art
 * (nothing is re-imported). `logo` / `icon` render the NoteMage wordmark image.
 */
const ALIASES: Record<string, MascotPose> = {
  default: 'default',
  pointing: 'pointing-right',
  'pointing-left': 'pointing-left',
  'pointing-right': 'pointing-right',
  flashcards: 'holding-flashcards',
  thinking: 'thinking',
  wink: 'wink',
  wand: 'holding-wand',
  scroll: 'holding-scroll',
  pen: 'holding-pen',
  quizzing: 'quizzing',
  headtilt: 'head-tilt',
  celebrate: 'celebrate',
  graduation: 'graduation',
  wave: 'wave',
  chatting: 'chatting',
};

export type MagePose = keyof typeof ALIASES | MascotPose | 'logo' | 'icon' | 'logo-color';

export interface MageProps {
  pose: MagePose;
  size?: MascotSize | number;
  flip?: boolean;
  priority?: boolean;
  alt?: string;
  className?: string;
}

const LOGO_SRC = '/logo_white.png';
/** Purple-on-light wordmark (matches the Figma `mascot:logo` exactly) — for the
 * warm/cream onboarding surfaces where the white wordmark would be invisible. */
const LOGO_COLOR_SRC = '/logo_trimmed.png';

/** Pose wrapper over the app Mascot, plus the logo asset, for the figma screens. */
export function Mage({ pose, size = 'md', flip, priority, alt = '', className }: MageProps) {
  if (pose === 'logo' || pose === 'icon' || pose === 'logo-color') {
    const px = typeof size === 'number' ? size : SIZE_FALLBACK[size];
    return (
      <Image
        src={pose === 'logo-color' ? LOGO_COLOR_SRC : LOGO_SRC}
        alt={alt || 'NoteMage'}
        width={px}
        height={px}
        priority={priority}
        className={className}
        style={{ objectFit: 'contain', height: 'auto' }}
        draggable={false}
      />
    );
  }
  const resolved: MascotPose = ALIASES[pose] ?? (pose as MascotPose);
  return (
    <Mascot pose={resolved} size={size} flip={flip} priority={priority} alt={alt} className={className} />
  );
}

/** Pixel fallback for the logo branch (Mascot owns the real SIZE_PX map). */
const SIZE_FALLBACK: Record<MascotSize, number> = {
  xs: 40,
  sm: 56,
  md: 108,
  lg: 176,
  xl: 264,
};
