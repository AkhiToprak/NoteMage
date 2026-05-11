'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import styles from './mascot.module.css';
import {
  POSES,
  SIZE_PX,
  type MascotIdle,
  type MascotOneShot,
  type MascotPose,
  type MascotSize,
} from './poses';

export interface MascotProps {
  pose: MascotPose;
  size?: MascotSize;
  idle?: MascotIdle;
  oneShot?: MascotOneShot | null;
  onOneShotEnd?: () => void;
  flip?: boolean;
  priority?: boolean;
  pointerPulse?: boolean;
  wandSparkle?: boolean;
  blink?: boolean;
  alt?: string;
  className?: string;
}

const IDLE_CLASS: Record<MascotIdle, string | undefined> = {
  none: undefined,
  bounce: styles.bounce,
  float: styles.float,
  sway: styles.sway,
};

const ROOT_ONE_SHOT_CLASS: Partial<Record<MascotOneShot, string>> = {
  'step-in': styles.stepIn,
  'step-out': styles.stepOut,
};

const FIGURE_ONE_SHOT_CLASS: Partial<Record<MascotOneShot, string>> = {
  cast: styles.cast,
  celebrate: styles.celebrate,
  'cheer-small': styles.cheerSmall,
  'cheer-big': styles.cheerBig,
  comfort: styles.comfort,
};

const BURST_ONE_SHOTS: ReadonlySet<MascotOneShot> = new Set<MascotOneShot>([
  'cast',
  'sparkle',
  'cheer-big',
]);

const BURST_TIMEOUT_MS = 720;

export function Mascot({
  pose,
  size = 'md',
  idle = 'bounce',
  oneShot = null,
  onOneShotEnd,
  flip = false,
  priority = false,
  pointerPulse = false,
  wandSparkle,
  blink,
  alt = '',
  className,
}: MascotProps) {
  const px = SIZE_PX[size];
  const { src, blinkSrc } = POSES[pose];
  const showPulse = pointerPulse && (pose === 'pointing-left' || pose === 'pointing-right');
  const showWandSparkle = (wandSparkle ?? pose === 'holding-wand') && pose === 'holding-wand';
  const showBurst = oneShot !== null && BURST_ONE_SHOTS.has(oneShot);
  const showBlink = (blink ?? pose === 'default') && Boolean(blinkSrc);
  const isDecorative = alt.length === 0;

  const rootRef = useRef<HTMLSpanElement | null>(null);
  const figureRef = useRef<HTMLSpanElement | null>(null);
  const onEndRef = useRef(onOneShotEnd);

  useEffect(() => {
    onEndRef.current = onOneShotEnd;
  }, [onOneShotEnd]);

  useEffect(() => {
    if (!oneShot) return;

    const rootCls = ROOT_ONE_SHOT_CLASS[oneShot];
    const figureCls = FIGURE_ONE_SHOT_CLASS[oneShot];
    const target = rootCls ? rootRef.current : figureCls ? figureRef.current : null;
    const cls = rootCls ?? figureCls;

    if (target && cls) {
      target.classList.remove(cls);
      void target.offsetWidth;
      target.classList.add(cls);

      const handleEnd = () => {
        target.classList.remove(cls);
        onEndRef.current?.();
      };
      target.addEventListener('animationend', handleEnd, { once: true });
      return () => {
        target.removeEventListener('animationend', handleEnd);
        target.classList.remove(cls);
      };
    }

    if (showBurst) {
      const timer = window.setTimeout(() => onEndRef.current?.(), BURST_TIMEOUT_MS);
      return () => window.clearTimeout(timer);
    }
  }, [oneShot, showBurst]);

  const rootClass = [styles.root, className].filter(Boolean).join(' ');
  const pulseClass = [
    styles.pulse,
    pose === 'pointing-left' ? styles.pulseLeft : styles.pulseRight,
  ].join(' ');

  return (
    <span
      ref={rootRef}
      className={rootClass}
      style={{ width: px, height: px }}
      role={isDecorative ? undefined : 'img'}
      aria-label={isDecorative ? undefined : alt}
      aria-hidden={isDecorative ? true : undefined}
    >
      <span className={IDLE_CLASS[idle]}>
        <span ref={figureRef} className={styles.figure}>
          <span
            className={[styles.imageStack, flip ? styles.flip : null].filter(Boolean).join(' ')}
          >
            <Image
              src={src}
              alt={alt}
              width={px}
              height={px}
              priority={priority}
              className={styles.image}
              draggable={false}
            />
            {showBlink && blinkSrc && (
              <Image
                src={blinkSrc}
                alt=""
                aria-hidden="true"
                width={px}
                height={px}
                className={`${styles.image} ${styles.blinkLayer}`}
                draggable={false}
              />
            )}
          </span>
          {showWandSparkle && (
            <span aria-hidden="true" className={styles.wandSparkle}>
              <span
                className={styles.wandSparkleDot}
                style={{ top: '16%', right: '18%', animationDelay: '0s' }}
              />
              <span
                className={styles.wandSparkleDot}
                style={{ top: '28%', right: '8%', animationDelay: '0.6s' }}
              />
              <span
                className={styles.wandSparkleDot}
                style={{ top: '10%', right: '6%', animationDelay: '1.2s' }}
              />
            </span>
          )}
        </span>
      </span>
      {showBurst && (
        <span key={oneShot} aria-hidden="true" className={styles.burst}>
          <span className={`${styles.burstDot} ${styles.burstDot1}`} />
          <span className={`${styles.burstDot} ${styles.burstDot2}`} />
          <span className={`${styles.burstDot} ${styles.burstDot3}`} />
        </span>
      )}
      {showPulse && <span aria-hidden="true" className={pulseClass} />}
    </span>
  );
}
