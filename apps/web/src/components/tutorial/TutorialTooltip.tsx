'use client';

import { useEffect, useState } from 'react';
import { Mascot, type MascotPose } from '@/components/mascot';

interface Props {
  title: string;
  body: string;
  targetRect: DOMRect | null;
  placement: 'auto' | 'fixed-top-right';
  onSkip: () => void;
}

const TOOLTIP_WIDTH = 320;
const TOOLTIP_GUESS_HEIGHT = 150;
const GAP = 12;
const MARGIN = 16;

interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

function readSafeArea(): SafeArea {
  if (typeof window === 'undefined') return { top: 0, right: 0, bottom: 0, left: 0 };
  const probe = document.createElement('div');
  probe.style.cssText = `
    position: fixed;
    inset: 0;
    pointer-events: none;
    visibility: hidden;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  `;
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const sa = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
  document.body.removeChild(probe);
  return sa;
}

function computePosition(
  rect: DOMRect | null,
  placement: 'auto' | 'fixed-top-right',
  safeArea: SafeArea,
  isPhone: boolean
): React.CSSProperties {
  const topInset = MARGIN + safeArea.top;
  const rightInset = MARGIN + safeArea.right;
  const leftInset = MARGIN + safeArea.left;
  const bottomInset = MARGIN + safeArea.bottom;

  if (placement === 'fixed-top-right' || !rect) {
    if (isPhone) {
      return {
        top: topInset,
        left: leftInset,
        right: rightInset,
        width: 'auto',
        maxWidth: `calc(100vw - ${leftInset + rightInset}px)`,
      };
    }
    return {
      top: topInset,
      right: rightInset,
      width: `min(${TOOLTIP_WIDTH}px, calc(100vw - ${leftInset + rightInset}px))`,
    };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const usableHeight = vh - bottomInset;

  if (isPhone) {
    const placeBelow =
      usableHeight - rect.bottom >= TOOLTIP_GUESS_HEIGHT + GAP &&
      rect.bottom + GAP >= topInset;
    const top = placeBelow
      ? rect.bottom + GAP
      : Math.max(topInset, rect.top - TOOLTIP_GUESS_HEIGHT - GAP);
    return {
      top,
      left: leftInset,
      right: rightInset,
      width: 'auto',
      maxWidth: `calc(100vw - ${leftInset + rightInset}px)`,
    };
  }

  const spaceBelow = usableHeight - rect.bottom;
  const placeBelow = spaceBelow >= TOOLTIP_GUESS_HEIGHT + GAP;
  const top = placeBelow
    ? rect.bottom + GAP
    : Math.max(topInset, rect.top - TOOLTIP_GUESS_HEIGHT - GAP);

  let left = rect.left;
  if (left + TOOLTIP_WIDTH + rightInset > vw) {
    left = vw - TOOLTIP_WIDTH - rightInset;
  }
  if (left < leftInset) left = leftInset;

  return { top, left, width: TOOLTIP_WIDTH };
}

function pickPointingPose(
  placement: 'auto' | 'fixed-top-right',
  rect: DOMRect | null
): Extract<MascotPose, 'pointing-left' | 'pointing-right'> {
  if (placement === 'fixed-top-right') return 'pointing-left';
  if (!rect) return 'pointing-left';
  // For auto placement the tooltip's left edge sits at (or near) rect.left,
  // so the mascot at the tooltip's leading edge is around rect.left + 24.
  // If the target's center is right of that, point right; otherwise left.
  return rect.width > 48 ? 'pointing-right' : 'pointing-left';
}

export function TutorialTooltip({ title, body, targetRect, placement, onSkip }: Props) {
  const [opacity, setOpacity] = useState(0);
  const [safeArea, setSafeArea] = useState<SafeArea>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [isPhone, setIsPhone] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot media-query + safe-area read on mount; subsequent updates come from the resize listener below
      setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      setIsPhone(window.matchMedia('(max-width: 767px)').matches);
    }
    setSafeArea(readSafeArea());

    const onResize = () => {
      setIsPhone(window.matchMedia('(max-width: 767px)').matches);
      setSafeArea(readSafeArea());
    };
    window.addEventListener('resize', onResize);

    const id = requestAnimationFrame(() => setOpacity(1));
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(id);
    };
  }, []);

  const positionStyle = computePosition(targetRect, placement, safeArea, isPhone);
  const pointingPose = pickPointingPose(placement, targetRect);

  return (
    <div
      role="dialog"
      aria-live="polite"
      style={{
        position: 'fixed',
        zIndex: 1101,
        background: 'var(--surface-container-high)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        padding: '18px 20px',
        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        color: 'var(--on-surface)',
        opacity,
        transform: opacity === 0 ? 'translateY(-8px)' : 'translateY(0)',
        transition: reduceMotion
          ? 'none'
          : 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
        ...positionStyle,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <Mascot
          key={title}
          pose={pointingPose}
          size="sm"
          idle="bounce"
          oneShot="step-in"
          pointerPulse
        />
        <h4
          style={{
            margin: 0,
            flex: 1,
            minWidth: 0,
            fontSize: 16,
            fontWeight: 700,
            fontFamily: 'var(--font-display)',
            color: 'var(--on-surface)',
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h4>
        <button
          onClick={onSkip}
          aria-label="Skip tour"
          style={{
            background: 'transparent',
            border: 'none',
            padding: 4,
            margin: -4,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--on-surface-variant)',
            cursor: 'pointer',
            borderRadius: 'var(--radius-sm)',
            flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
            close
          </span>
        </button>
      </div>
      <p
        style={{
          margin: '0 0 12px',
          fontSize: 14,
          lineHeight: 1.5,
          color: 'var(--on-surface-variant)',
        }}
      >
        {body}
      </p>
      <button
        onClick={onSkip}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--on-surface-variant)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textDecoration: 'underline',
        }}
      >
        Skip tour
      </button>
    </div>
  );
}
