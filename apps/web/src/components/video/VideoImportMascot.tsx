/* Hallmark · component: video-import-mascot · genre: playful · theme: project (Neon Scholar tokens)
 * states: working (animated scene) · ready · failed · reduced-motion (static)
 * contrast: n/a — decorative, aria-hidden; status copy lives in the host surface
 */
'use client';

import { Mascot } from '@/components/mascot/Mascot';
import type { MascotPose } from '@/components/mascot/poses';

// Animated mascot scene for the video-import working states. While a video is
// ingesting, the mascot takes notes next to a mini video screen and note
// sparkles drift from the screen to its pen. Shared by VideoImportTab
// (preparing + tracking) and VideoInputMask (transcript-lane confirming).
//
// Decorative only: the whole scene is aria-hidden — hosts keep their own
// aria-live status text. Dot colors mirror the mascot burst/sparkle palette
// (mascot.module.css), motion is transform/opacity on the shared spring.

type SceneState = 'working' | 'ready' | 'failed';

const POSE: Record<SceneState, MascotPose> = {
  working: 'writing',
  ready: 'graduation',
  failed: 'thinking',
};

export default function VideoImportMascot({
  state = 'working',
  compact = false,
}: {
  state?: SceneState;
  /** Inline row for tight surfaces (the video card's confirming state). */
  compact?: boolean;
}) {
  const working = state === 'working';

  if (compact) {
    return (
      <span aria-hidden="true" className="nm-vidmascot nm-vidmascot--compact">
        <Mascot pose="writing" size="xs" idle="bounce" />
        <NoteDots />
        <SceneStyles />
      </span>
    );
  }

  return (
    <span aria-hidden="true" className="nm-vidmascot">
      {working && (
        <span className="nm-vidmascot-screen">
          <span className="material-symbols-outlined filled nm-vidmascot-play">play_arrow</span>
        </span>
      )}
      {working && <NoteDots />}
      <Mascot pose={POSE[state]} size="md" idle={working ? 'bounce' : 'none'} />
      <SceneStyles />
    </span>
  );
}

function NoteDots() {
  return (
    <span className="nm-vidmascot-dots">
      <span className="nm-vidmascot-dot nm-vidmascot-dot--1" />
      <span className="nm-vidmascot-dot nm-vidmascot-dot--2" />
      <span className="nm-vidmascot-dot nm-vidmascot-dot--3" />
    </span>
  );
}

function SceneStyles() {
  return (
    <style>{`
      .nm-vidmascot {
        position: relative;
        display: inline-flex;
        align-items: flex-end;
        gap: 14px;
      }
      .nm-vidmascot--compact {
        align-items: center;
        gap: 0;
      }
      .nm-vidmascot-screen {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 64px;
        height: 42px;
        margin-bottom: 12px;
        border-radius: 10px;
        border: 1px solid var(--outline-variant);
        background: var(--surface-container-highest);
        transform: rotate(-4deg);
        flex-shrink: 0;
      }
      .nm-vidmascot-play {
        font-size: 22px;
        color: var(--primary);
      }
      .nm-vidmascot-dots {
        position: absolute;
        left: 56px;
        bottom: 44px;
        width: 0;
        height: 0;
        pointer-events: none;
      }
      .nm-vidmascot--compact .nm-vidmascot-dots {
        left: 30px;
        bottom: 26px;
      }
      .nm-vidmascot-dot {
        position: absolute;
        top: 0;
        left: 0;
        width: 7px;
        height: 7px;
        border-radius: 9999px;
        background: rgba(174, 137, 255, 0.95);
        box-shadow: 0 0 6px 1px rgba(174, 137, 255, 0.45);
        transform: scale(0);
        opacity: 0;
        will-change: transform, opacity;
      }
      .nm-vidmascot-dot--1 {
        animation: nmVidmascotDriftA 1.9s cubic-bezier(0.45, 0, 0.55, 1) infinite;
      }
      .nm-vidmascot-dot--2 {
        background: rgba(255, 222, 89, 0.95);
        box-shadow: 0 0 6px 1px rgba(255, 222, 89, 0.45);
        animation: nmVidmascotDriftB 1.9s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        animation-delay: 0.65s;
      }
      .nm-vidmascot-dot--3 {
        width: 5px;
        height: 5px;
        animation: nmVidmascotDriftA 1.9s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        animation-delay: 1.3s;
      }
      @keyframes nmVidmascotDriftA {
        0% { transform: translate(0, 0) scale(0); opacity: 0; }
        22% { transform: translate(9px, -7px) scale(1); opacity: 0.95; }
        70% { transform: translate(26px, -14px) scale(0.9); opacity: 0.65; }
        100% { transform: translate(38px, -22px) scale(0.3); opacity: 0; }
      }
      @keyframes nmVidmascotDriftB {
        0% { transform: translate(0, 0) scale(0); opacity: 0; }
        22% { transform: translate(7px, -10px) scale(1); opacity: 0.95; }
        70% { transform: translate(22px, -20px) scale(0.9); opacity: 0.65; }
        100% { transform: translate(34px, -30px) scale(0.3); opacity: 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        .nm-vidmascot-dot { animation: none; opacity: 0; }
      }
    `}</style>
  );
}
