'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { useTutorial } from './TutorialContext';
import { TutorialTooltip } from './TutorialTooltip';
import { WelcomeModal } from './WelcomeModal';
import { CompletionModal } from './CompletionModal';
import { SkipConfirmDialog } from './SkipConfirmDialog';
import { getStepConfig, getTourSteps } from './steps';

const SPOTLIGHT_PAD = 8;
const SPOTLIGHT_RADIUS = 12;
// How long to wait for a step's anchor to mount after a route change before
// giving up and floating the tooltip instead of stranding the tour.
const TARGET_GIVE_UP_MS = 2500;
const TARGET_POLL_MS = 120;

export function TutorialOverlay() {
  const { step, hydrated, isPro, isPhone, targetVersion, getTarget, skip, advance } = useTutorial();
  const pathname = usePathname();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [viewport, setViewport] = useState({
    w: typeof window === 'undefined' ? 0 : window.innerWidth,
    h: typeof window === 'undefined' ? 0 : window.innerHeight,
  });
  const [mounted, setMounted] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [targetMissing, setTargetMissing] = useState(false);

  // Tooltip steps have a config; idle/welcome/complete/legacy return undefined.
  const config = useMemo(() => getStepConfig(step, isPro, isPhone), [step, isPro, isPhone]);

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
    if (!config) return;
    if (showSkipConfirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [config, skip, showSkipConfirm]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset measurement when the step/route changes
    setTargetMissing(false);
    setRect(null);

    const targetKey = config?.targetKey;
    if (!targetKey) return;

    let found = false;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let giveUpId: ReturnType<typeof setTimeout> | null = null;
    let ro: ResizeObserver | null = null;
    const main = document.querySelector('main');

    const measure = () => {
      const target = getTarget(targetKey);
      if (!target) return;
      setRect(target.getBoundingClientRect());
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };

    const attach = (target: HTMLElement) => {
      // Targets can sit below the fold (or on a just-navigated page). Use an
      // instant scrollIntoView so the rect is in viewport before we measure.
      const initial = target.getBoundingClientRect();
      const fullyVisible =
        initial.top >= 0 &&
        initial.left >= 0 &&
        initial.bottom <= window.innerHeight &&
        initial.right <= window.innerWidth;
      if (!fullyVisible) {
        target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
      }
      measure();
      ro = new ResizeObserver(measure);
      ro.observe(target);
      main?.addEventListener('scroll', measure, { passive: true });
      window.addEventListener('scroll', measure, { passive: true });
      window.addEventListener('resize', measure);
      const vv = window.visualViewport;
      vv?.addEventListener('resize', measure);
      vv?.addEventListener('scroll', measure);
    };

    const tryFind = (): boolean => {
      const target = getTarget(targetKey);
      if (!target) return false;
      // Anchor present but not laid out (e.g. a collapsed chats rail on phone,
      // or display:none). Keep polling rather than spotlighting a 0×0 box; the
      // give-up timer floats the tooltip if it never becomes visible.
      const box = target.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return false;
      found = true;
      if (pollId) {
        clearInterval(pollId);
        pollId = null;
      }
      if (giveUpId) {
        clearTimeout(giveUpId);
        giveUpId = null;
      }
      attach(target);
      return true;
    };

    // Anchor may not be in the DOM yet (route transition in flight) — poll for
    // it, then fall back to a floating tooltip if it never appears.
    if (!tryFind()) {
      pollId = setInterval(tryFind, TARGET_POLL_MS);
      giveUpId = setTimeout(() => {
        if (pollId) {
          clearInterval(pollId);
          pollId = null;
        }
        if (!found) setTargetMissing(true);
      }, TARGET_GIVE_UP_MS);
    }

    return () => {
      if (pollId) clearInterval(pollId);
      if (giveUpId) clearTimeout(giveUpId);
      ro?.disconnect();
      main?.removeEventListener('scroll', measure);
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      const vv = window.visualViewport;
      vv?.removeEventListener('resize', measure);
      vv?.removeEventListener('scroll', measure);
    };
  }, [config, targetVersion, getTarget, pathname]);

  if (!hydrated || !mounted) return null;
  if (step === 'idle') return null;

  if (step === 'welcome') return <WelcomeModal />;
  if (step === 'complete') return <CompletionModal />;

  if (!config) return null;

  // Anchor declared but not yet located, and we haven't given up — keep the
  // overlay blank rather than flashing a mis-placed tooltip mid-navigation.
  if (config.targetKey && !rect && !targetMissing) return null;

  const floating = Boolean(config.targetKey) && !rect; // anchor missing → float
  const placement = floating ? 'fixed-bottom-left' : config.tooltipPlacement;
  const tourSteps = getTourSteps(isPhone);
  const stepIndex = tourSteps.indexOf(step);

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
        targetRect={floating ? null : rect}
        placement={placement}
        nextLabel={config.nextLabel ?? 'Next'}
        upsell={config.upsell}
        stepIndex={stepIndex}
        stepCount={tourSteps.length}
        onNext={() => advance(config.next ?? 'complete')}
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
      <div onClick={onClick} style={{ ...frame, top: 0, left: 0, right: 0, height: top }} />
      <div onClick={onClick} style={{ ...frame, top: bottom, left: 0, right: 0, bottom: 0 }} />
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
        boxShadow: '0 0 0 2px rgba(174,137,255,0.55), 0 0 24px 4px rgba(174,137,255,0.30)',
        pointerEvents: 'none',
        zIndex: 1100,
      }}
    />
  );
}
