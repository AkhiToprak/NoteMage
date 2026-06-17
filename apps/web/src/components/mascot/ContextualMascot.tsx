'use client';

import { useCallback, useRef, useState } from 'react';
import { Mascot } from './Mascot';
import { HOVER_POSES, POSES } from './poses';
import type { MascotIdle, MascotPose, MascotSize } from './poses';

interface ContextualMascotProps {
  pose: MascotPose;
  size?: MascotSize | number;
  idle?: MascotIdle;
  alt?: string;
  className?: string;
}

function pickRandomHoverPose(exclude: MascotPose | null): MascotPose {
  const pool = HOVER_POSES.filter((p) => p !== exclude);
  const next = pool[Math.floor(Math.random() * pool.length)];
  return next ?? HOVER_POSES[0];
}

export function ContextualMascot({
  pose,
  size = 'xs',
  idle,
  alt = '',
  className,
}: ContextualMascotProps) {
  const [hoverPose, setHoverPose] = useState<MascotPose | null>(null);
  const lastHoverRef = useRef<MascotPose | null>(null);

  const handleEnter = useCallback(() => {
    const next = pickRandomHoverPose(lastHoverRef.current);
    lastHoverRef.current = next;
    setHoverPose(next);
  }, []);

  const handleLeave = useCallback(() => {
    setHoverPose(null);
  }, []);

  const displayPose = hoverPose ?? pose;
  const displayIdle =
    hoverPose !== null ? POSES[hoverPose].recommendedIdle : (idle ?? POSES[pose].recommendedIdle);

  return (
    <span
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      tabIndex={-1}
      className={className}
      style={{ display: 'inline-flex', lineHeight: 0, cursor: 'pointer' }}
    >
      <Mascot pose={displayPose} size={size} idle={displayIdle} alt={alt} blink={false} />
    </span>
  );
}
