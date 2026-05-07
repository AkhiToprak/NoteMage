'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTutorial } from './TutorialContext';
import { TutorialTooltip } from './TutorialTooltip';
import { WelcomeModal } from './WelcomeModal';
import { CompletionModal } from './CompletionModal';
import { SkipConfirmDialog } from './SkipConfirmDialog';
import { STEP_CONFIG } from './steps';
import type { TutorialStep } from './types';

const SPOTLIGHT_PAD = 8;
const SPOTLIGHT_RADIUS = 12;

function isTargetBoundStep(step: TutorialStep): boolean {
  return (
    step === 'step-1-dashboard' ||
    step === 'step-2-notebook-form' ||
    step === 'step-3-workspace' ||
    step === 'step-4-chat-modal'
  );
}

export function TutorialOverlay() {
  const { step, hydrated, targetVersion, getTarget, skip } = useTutorial();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [viewport, setViewport] = useState({
    w: typeof window === 'undefined' ? 0 : window.innerWidth,
    h: typeof window === 'undefined' ? 0 : window.innerHeight,
  });
  const [mounted, setMounted] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- gate portal rendering until after first client paint to avoid SSR mismatch
    setMounted(true);
    setViewport({ w: window.innerWidth, h: window.innerHeight });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close any stale confirmation when the step changes
    setShowSkipConfirm(false);
  }, [step]);

  useEffect(() => {
    if (!isTargetBoundStep(step)) return;
    if (showSkipConfirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, skip, showSkipConfirm]);

  useEffect(() => {
    if (!isTargetBoundStep(step)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear rect when leaving a target-bound step
      setRect(null);
      return;
    }
    const config = STEP_CONFIG[step];
    if (!config?.targetKey) {
      setRect(null);
      return;
    }
    const target = getTarget(config.targetKey);
    if (!target) {
      setRect(null);
      return;
    }

    // Targets like the empty-state "Create Notebook" CTA can sit far below
    // the fold. Without scrolling them into view, the four-frame backdrop
    // covers the whole viewport while the spotlight + tooltip render
    // off-screen, so the tour looks frozen.
    const initial = target.getBoundingClientRect();
    const fullyVisible =
      initial.top >= 0 &&
      initial.left >= 0 &&
      initial.bottom <= window.innerHeight &&
      initial.right <= window.innerWidth;
    if (!fullyVisible) {
      target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    }

    const measure = () => {
      setRect(target.getBoundingClientRect());
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(target);

    const main = document.querySelector('main');
    main?.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);

    // Track iOS keyboard / dynamic toolbar via visualViewport so the cutout
    // and tooltip stay aligned when the keyboard pushes content up.
    const vv = window.visualViewport;
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);

    return () => {
      ro.disconnect();
      main?.removeEventListener('scroll', measure);
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      vv?.removeEventListener('resize', measure);
      vv?.removeEventListener('scroll', measure);
    };
  }, [step, targetVersion, getTarget]);

  if (!hydrated || !mounted) return null;
  if (step === 'idle') return null;

  if (step === 'welcome') return <WelcomeModal />;
  if (step === 'complete') return <CompletionModal />;

  const config = STEP_CONFIG[step];
  if (!config) return null;

  if (config.targetKey && !rect) return null;

  return createPortal(
    <>
      {config.renderBackdrop && rect && (
        <FourFrameBackdrop
          rect={rect}
          viewport={viewport}
          onClick={() => setShowSkipConfirm(true)}
        />
      )}
      {config.renderBackdrop && rect && <SpotlightRing rect={rect} />}
      <TutorialTooltip
        title={config.title}
        body={config.body}
        targetRect={rect}
        placement={config.tooltipPlacement}
        onSkip={skip}
      />
      {showSkipConfirm && (
        <SkipConfirmDialog
          onConfirm={() => {
            setShowSkipConfirm(false);
            skip();
          }}
          onCancel={() => setShowSkipConfirm(false)}
        />
      )}
    </>,
    document.body
  );
}

function FourFrameBackdrop({
  rect,
  viewport,
  onClick,
}: {
  rect: DOMRect;
  viewport: { w: number; h: number };
  onClick: () => void;
}) {
  const top = Math.max(0, rect.top - SPOTLIGHT_PAD);
  const bottom = Math.min(viewport.h, rect.bottom + SPOTLIGHT_PAD);
  const left = Math.max(0, rect.left - SPOTLIGHT_PAD);
  const right = Math.min(viewport.w, rect.right + SPOTLIGHT_PAD);

  const frame: React.CSSProperties = {
    position: 'fixed',
    background: 'rgba(0,0,0,0.65)',
    backdropFilter: 'blur(2px)',
    WebkitBackdropFilter: 'blur(2px)',
    zIndex: 1100,
    cursor: 'pointer',
  };

  return (
    <>
      <div
        onClick={onClick}
        style={{ ...frame, top: 0, left: 0, right: 0, height: top }}
      />
      <div
        onClick={onClick}
        style={{ ...frame, top: bottom, left: 0, right: 0, bottom: 0 }}
      />
      <div
        onClick={onClick}
        style={{ ...frame, top, left: 0, width: left, height: bottom - top }}
      />
      <div
        onClick={onClick}
        style={{
          ...frame,
          top,
          left: right,
          width: viewport.w - right,
          height: bottom - top,
        }}
      />
    </>
  );
}

function SpotlightRing({ rect }: { rect: DOMRect }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: rect.top - SPOTLIGHT_PAD,
        left: rect.left - SPOTLIGHT_PAD,
        width: rect.width + SPOTLIGHT_PAD * 2,
        height: rect.height + SPOTLIGHT_PAD * 2,
        borderRadius: SPOTLIGHT_RADIUS,
        boxShadow:
          '0 0 0 2px rgba(174,137,255,0.55), 0 0 24px 4px rgba(174,137,255,0.30)',
        pointerEvents: 'none',
        zIndex: 1100,
      }}
    />
  );
}
