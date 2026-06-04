'use client';

import type { ReactNode } from 'react';

// The study-player's bottom navigation row (prev / reset / next-or-finish). When
// `pinned`, it sticks to the bottom of the scroll container as a thumb-reachable,
// safe-area-aware bar (used on phones in path-checkpoint / hidden-management surfaces,
// where nothing renders after the nav). Otherwise it renders inline exactly as the
// original nav row did, so desktop and the notebook quiz layout are unchanged.
export default function PlayerBottomBar({
  pinned,
  children,
}: {
  pinned: boolean;
  children: ReactNode;
}) {
  if (!pinned) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        {children}
      </div>
    );
  }
  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        alignSelf: 'stretch',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        marginTop: '12px',
        paddingTop: '12px',
        // Clears the iOS home indicator; falls back to 12px where the inset is 0.
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        borderTop: '1px solid var(--outline-variant)',
        background: 'color-mix(in srgb, var(--background) 92%, transparent)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {children}
    </div>
  );
}
