'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Mascot, type MascotPose } from '@/components/mascot';

interface Props {
  title: string;
  body: string;
  targetRect: DOMRect | null;
  placement: 'auto' | 'fixed-top-right' | 'fixed-bottom-left';
  nextLabel: string;
  /** Render a subtle "PRO" tag by the title (FREE-tier upsell steps). */
  upsell?: boolean;
  /** Zero-based index of this step within the tour, for progress dots. */
  stepIndex?: number;
  /** Total tour steps, for progress dots. */
  stepCount?: number;
  onNext: () => void;
  onSkip: () => void;
}

const TOOLTIP_WIDTH = 320;
const TOOLTIP_GUESS_HEIGHT = 220;
const GAP = 16;
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
  placement: 'auto' | 'fixed-top-right' | 'fixed-bottom-left',
  safeArea: SafeArea,
  isPhone: boolean,
  tooltipHeight: number
): React.CSSProperties {
  const topInset = MARGIN + safeArea.top;
  const rightInset = MARGIN + safeArea.right;
  const leftInset = MARGIN + safeArea.left;
  const bottomInset = MARGIN + safeArea.bottom;

  if (placement === 'fixed-bottom-left') {
    if (isPhone) {
      return {
        bottom: bottomInset,
        left: leftInset,
        right: rightInset,
        width: 'auto',
        maxWidth: `calc(100vw - ${leftInset + rightInset}px)`,
      };
    }
    return {
      bottom: bottomInset,
      left: leftInset,
      width: `min(${TOOLTIP_WIDTH}px, calc(100vw - ${leftInset + rightInset}px))`,
    };
  }

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
  const h = tooltipHeight || TOOLTIP_GUESS_HEIGHT;

  if (isPhone) {
    const placeBelow = usableHeight - rect.bottom >= h + GAP && rect.bottom + GAP >= topInset;
    const top = placeBelow ? rect.bottom + GAP : Math.max(topInset, rect.top - h - GAP);
    return {
      top,
      left: leftInset,
      right: rightInset,
      width: 'auto',
      maxWidth: `calc(100vw - ${leftInset + rightInset}px)`,
    };
  }

  const spaceBelow = usableHeight - rect.bottom;
  const placeBelow = spaceBelow >= h + GAP;
  const top = placeBelow ? rect.bottom + GAP : Math.max(topInset, rect.top - h - GAP);

  let left = rect.left;
  if (left + TOOLTIP_WIDTH + rightInset > vw) {
    left = vw - TOOLTIP_WIDTH - rightInset;
  }
  if (left < leftInset) left = leftInset;

  return { top, left, width: TOOLTIP_WIDTH };
}

function pickPointingPose(
  placement: 'auto' | 'fixed-top-right' | 'fixed-bottom-left',
  rect: DOMRect | null
): Extract<MascotPose, 'pointing-left' | 'pointing-right'> {
  if (placement === 'fixed-top-right') return 'pointing-left';
  if (placement === 'fixed-bottom-left') return 'pointing-right';
  if (!rect) return 'pointing-left';
  return rect.width > 48 ? 'pointing-right' : 'pointing-left';
}

export function TutorialTooltip({
  title,
  body,
  targetRect,
  placement,
  nextLabel,
  upsell = false,
  stepIndex,
  stepCount,
  onNext,
  onSkip,
}: Props) {
  const [opacity, setOpacity] = useState(0);
  const [safeArea, setSafeArea] = useState<SafeArea>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [isPhone, setIsPhone] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [tooltipHeight, setTooltipHeight] = useState(0);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

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

  // Measure rendered tooltip so 'auto' placement can avoid clipping the target
  // when the tooltip is taller than the guess (and reposition above/below).
  useLayoutEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;
    const measure = () => setTooltipHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [title, body]);

  const positionStyle = computePosition(targetRect, placement, safeArea, isPhone, tooltipHeight);
  const pointingPose = pickPointingPose(placement, targetRect);

  return (
    <div
      ref={tooltipRef}
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
        {upsell && (
          <span
            style={{
              flexShrink: 0,
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(255, 222, 89, 0.14)',
              border: '1px solid rgba(255, 222, 89, 0.32)',
              color: '#ffde59',
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Pro
          </span>
        )}
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
          margin: '0 0 16px',
          fontSize: 14,
          lineHeight: 1.5,
          color: 'var(--on-surface-variant)',
        }}
      >
        {body}
      </p>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
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
        {typeof stepIndex === 'number' && stepIndex >= 0 && stepCount ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} aria-hidden>
            {Array.from({ length: stepCount }).map((_, i) => (
              <span
                key={i}
                style={{
                  width: i === stepIndex ? 18 : 6,
                  height: 6,
                  borderRadius: 'var(--radius-full)',
                  background: i === stepIndex ? 'var(--primary)' : 'var(--outline-variant)',
                  transition: reduceMotion ? 'none' : 'background 0.25s cubic-bezier(0.22,1,0.36,1)',
                }}
              />
            ))}
          </div>
        ) : null}
        <button
          onClick={onNext}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 18px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--primary)',
            color: 'var(--background)',
            border: 'none',
            fontSize: 14,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: 'pointer',
            transition: reduceMotion ? 'none' : 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
          }}
          onMouseEnter={(e) => {
            if (!reduceMotion) e.currentTarget.style.transform = 'scale(1.03)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {nextLabel}
          <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
            arrow_forward
          </span>
        </button>
      </div>
    </div>
  );
}
