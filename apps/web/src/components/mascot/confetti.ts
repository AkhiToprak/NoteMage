'use client';

import confetti from 'canvas-confetti';

const MASCOT_CONFETTI_COLORS = ['#ae89ff', '#ffde59', '#b9c3ff', '#8348f6'] as const;

export interface MascotConfettiOptions {
  origin?: HTMLElement | null;
  particleCount?: number;
  spread?: number;
  zIndex?: number;
}

export function fireMascotConfetti({
  origin,
  particleCount = 80,
  spread = 70,
  zIndex = 1200,
}: MascotConfettiOptions = {}): void {
  if (typeof window === 'undefined') return;

  confetti({
    particleCount,
    spread,
    startVelocity: 38,
    ticks: 220,
    decay: 0.92,
    scalar: 0.95,
    gravity: 0.95,
    origin: computeOrigin(origin),
    colors: [...MASCOT_CONFETTI_COLORS],
    disableForReducedMotion: true,
    zIndex,
  });
}

function computeOrigin(el: HTMLElement | null | undefined): { x: number; y: number } {
  if (!el) return { x: 0.5, y: 0.5 };
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return { x: 0.5, y: 0.5 };
  return {
    x: clamp01((rect.left + rect.width / 2) / window.innerWidth),
    y: clamp01((rect.top + rect.height * 0.2) / window.innerHeight),
  };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
