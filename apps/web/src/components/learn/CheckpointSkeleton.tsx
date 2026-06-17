'use client';

import type { CSSProperties } from 'react';

// Skeleton placeholders for checkpoint activities. Two exports:
//   - CheckpointSkeletonBody: just the content shapes (prose / card / options),
//     dropped into a viewer's own loading branch (the viewer supplies the
//     header + overlay shell).
//   - CheckpointSkeletonOverlay: a full-screen overlay (header + body) used to
//     bridge the gap while the guided tutorial hops to the next activity, so
//     the path map never flashes behind the transition.
//
// No gradients (house rule): the shimmer is a plain opacity pulse on solid
// blocks, disabled under prefers-reduced-motion.

type CheckpointKind = 'theory' | 'flashcards' | 'quiz';

const SHIMMER_CSS = `
  @keyframes nmSkelPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  .nm-skel { animation: nmSkelPulse 1.4s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) { .nm-skel { animation: none; } }
`;

function Block({ w, h, r, style }: { w?: number | string; h: number; r?: string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      className="nm-skel"
      style={{
        display: 'block',
        width: w ?? '100%',
        height: h,
        borderRadius: r ?? 'var(--radius-sm)',
        background: 'var(--surface-container-high)',
        ...style,
      }}
    />
  );
}

/** Content-only skeleton (no header) for use inside a viewer's loading state. */
export function CheckpointSkeletonBody({ kind }: { kind: CheckpointKind }) {
  return (
    <div
      aria-hidden
      style={{
        maxWidth: '720px',
        width: '100%',
        margin: '0 auto',
        padding: '4px 0 24px',
      }}
    >
      <style>{SHIMMER_CSS}</style>
      {kind === 'theory' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Block w="55%" h={26} style={{ marginBottom: 10 }} />
          {[ '92%', '100%', '85%', '97%', '70%' ].map((w, i) => (
            <Block key={i} w={w} h={14} />
          ))}
          <Block w="40%" h={20} style={{ margin: '14px 0 6px' }} />
          {[ '96%', '88%', '100%', '60%' ].map((w, i) => (
            <Block key={`b${i}`} w={w} h={14} />
          ))}
        </div>
      ) : kind === 'flashcards' ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 20,
            paddingTop: 'clamp(8px, 4vh, 40px)',
          }}
        >
          <div
            className="nm-skel"
            style={{
              width: '100%',
              maxWidth: 560,
              height: 'min(58vh, 380px)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--surface-container)',
              border: '1px solid var(--outline-variant)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              padding: 24,
            }}
          >
            <Block w={110} h={12} r="var(--radius-full)" />
            <Block w="80%" h={18} />
            <Block w="60%" h={18} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: 560 }}>
            <Block w={44} h={44} r="var(--radius-full)" />
            <Block w={140} h={44} r="var(--radius-full)" />
            <Block w={44} h={44} r="var(--radius-full)" />
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Block w={90} h={12} r="var(--radius-full)" style={{ marginBottom: 6 }} />
          <Block w="95%" h={18} />
          <Block w="78%" h={18} style={{ marginBottom: 12 }} />
          {[0, 1, 2, 3].map((i) => (
            <Block key={i} h={48} r="var(--radius-md)" style={{ border: '1px solid var(--outline-variant)', background: 'var(--surface-container)' }} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Full-screen overlay skeleton (header + body), matching the viewer shell. */
export function CheckpointSkeletonOverlay({
  kind,
  zIndex = 1300,
}: {
  kind: CheckpointKind;
  zIndex?: number;
}) {
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>{SHIMMER_CSS}</style>
      <header
        style={{
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderBottom: '1px solid var(--outline-variant)',
          background: 'var(--surface-container-low)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Block w={88} h={16} r="var(--radius-full)" />
          <Block w={180} h={18} />
        </div>
        <Block w={44} h={44} r="var(--radius-full)" />
      </header>
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0, padding: 'clamp(16px, 3vh, 24px) 20px 0' }}>
        <CheckpointSkeletonBody kind={kind} />
      </div>
    </div>
  );
}

export default CheckpointSkeletonOverlay;
