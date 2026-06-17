'use client';

import type { ReactNode } from 'react';
import { Mascot } from '@/components/mascot/Mascot';
import type { MascotPose, MascotSize } from '@/components/mascot/poses';

// Mascot + caption used across the guided tutorial (the build stages in
// app/(dashboard)/tutorial and the in-player coach line). Presentational only.

export function TutorialNarrator({
  pose = 'pointing-right',
  size = 'lg',
  caption,
}: {
  pose?: MascotPose;
  size?: MascotSize | number;
  caption?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-6)',
        textAlign: 'center',
      }}
    >
      <Mascot pose={pose} size={size} idle="float" />
      {caption ? (
        <p
          style={{
            margin: 0,
            maxWidth: 460,
            fontSize: 'var(--fs-base)',
            lineHeight: 1.6,
            color: 'var(--on-surface-variant)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {caption}
        </p>
      ) : null}
    </div>
  );
}

export default TutorialNarrator;
