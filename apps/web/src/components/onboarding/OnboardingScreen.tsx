'use client';

import type { ReactNode } from 'react';
import { Mascot, type MascotIdle, type MascotPose } from '@/components/mascot';
import OnboardingProgressBar from './OnboardingProgressBar';

interface OnboardingScreenProps {
  /** Distinct id for the current screen — changing it re-runs the content fade. */
  screenKey: string;
  /** Progress-bar fill, 0–1. */
  progress: number;
  /** When provided, a back chevron is shown that calls this. */
  onBack?: () => void;
  /** When set, a small mascot is shown beside the wordmark. */
  mascotPose?: MascotPose;
  mascotIdle?: MascotIdle;
  /** Optional element pinned to the top-right of the mascot. */
  mascotBadge?: ReactNode;
  /** Bold question heading. */
  heading?: ReactNode;
  /** Supporting line under the heading. */
  subheading?: ReactNode;
  /** Step-level error, shown as a banner above the content. */
  error?: string;
  /** The screen's input(s). */
  children: ReactNode;
  /** Primary CTA label — omit to render no footer (step owns its own button). */
  primaryLabel?: ReactNode;
  onPrimary?: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  /** Secondary CTA, rendered under the primary (e.g. "Skip for now"). */
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryDisabled?: boolean;
  /** Center the footer CTA at its natural width instead of stretching it. */
  compactFooter?: boolean;
}

/**
 * Shared Gizmo-style onboarding shell: progress bar + back chevron, a
 * mascot/wordmark header, a bold question heading, the screen's content, and
 * an optional footer CTA. Step components shrink to just their input.
 */
export default function OnboardingScreen({
  screenKey,
  progress,
  onBack,
  mascotPose,
  mascotIdle,
  mascotBadge,
  heading,
  subheading,
  error,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  primaryLoading,
  secondaryLabel,
  onSecondary,
  secondaryDisabled,
  compactFooter,
}: OnboardingScreenProps) {
  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--surface-container-low)',
        borderRadius: '24px',
        // overflow:visible so absolutely-positioned badges (the billing
        // "Save N%" pill, the "Most Popular" tag) aren't clipped. The page
        // scrolls naturally if a step is taller than the viewport; steps are
        // kept short enough (e.g. the plan step caps its feature list) that
        // this rarely happens.
        padding: 'clamp(16px, 2.4vh, 24px) clamp(18px, 4vw, 30px) clamp(18px, 2.4vh, 28px)',
        boxShadow: '0 32px 64px rgba(0,0,0,0.4)',
        width: '100%',
      }}
    >
      {/* top accent line */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '1px',
          background: 'rgba(174,137,255,0.4)',
          pointerEvents: 'none',
        }}
      />

      {/* progress row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {onBack && (
          <button type="button" className="ob-back-btn" onClick={onBack} aria-label="Go back">
            <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>
              chevron_left
            </span>
          </button>
        )}
        <OnboardingProgressBar value={progress} />
      </div>

      {/* mascot + wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginTop: '14px' }}>
        {mascotPose && (
          <span style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
            <Mascot pose={mascotPose} size="xs" idle={mascotIdle} />
            {mascotBadge && (
              <span
                className="ob-badge"
                style={{ position: 'absolute', top: '-5px', right: '-5px', display: 'flex' }}
              >
                {mascotBadge}
              </span>
            )}
          </span>
        )}
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '16px',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: 'var(--md-h4)',
          }}
        >
          NoteMage
        </span>
      </div>

      {/* heading */}
      {heading && (
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '22px',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: 'var(--on-surface)',
            margin: '14px 0 0',
            lineHeight: 1.25,
          }}
        >
          {heading}
        </h2>
      )}
      {subheading && (
        <p
          style={{
            fontSize: '14px',
            color: 'var(--on-surface-variant)',
            margin: '6px 0 0',
            lineHeight: 1.55,
          }}
        >
          {subheading}
        </p>
      )}

      {/* error */}
      {error && (
        <div
          style={{
            marginTop: '14px',
            padding: '10px 14px',
            borderRadius: '12px',
            background: 'rgba(253,111,133,0.12)',
            color: '#fd6f85',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {/* content */}
      <div key={screenKey} className="ob-fade" style={{ marginTop: '18px' }}>
        {children}
      </div>

      {/* footer */}
      {primaryLabel && (
        <div
          style={{
            marginTop: '22px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: compactFooter ? 'center' : 'stretch',
            gap: '4px',
          }}
        >
          <button
            type="button"
            className={`ob-btn-primary${compactFooter ? ' ob-btn-primary--compact' : ''}`}
            onClick={onPrimary}
            disabled={primaryDisabled || primaryLoading}
            data-loading={primaryLoading ? 'true' : undefined}
          >
            {primaryLabel}
          </button>
          {secondaryLabel && (
            <button
              type="button"
              className="ob-btn-secondary"
              onClick={onSecondary}
              disabled={secondaryDisabled}
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      )}

      <style>{`
        .ob-fade { animation: obFade 0.35s cubic-bezier(0.22,1,0.36,1); }
        @keyframes obFade {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ob-badge { animation: obBadgePop 0.3s cubic-bezier(0.22,1,0.36,1); }
        @keyframes obBadgePop {
          from { opacity: 0; transform: scale(0.4); }
          to   { opacity: 1; transform: scale(1); }
        }
        .ob-back-btn {
          display: flex; align-items: center; justify-content: center;
          width: 34px; height: 34px; flex-shrink: 0; padding: 0;
          border: none; border-radius: 10px;
          background: transparent; color: var(--on-surface-variant);
          cursor: pointer;
          transition: transform 0.2s cubic-bezier(0.22,1,0.36,1);
        }
        .ob-back-btn:hover { background: var(--surface-container-highest); color: var(--on-surface); }
        .ob-back-btn:active { transform: scale(0.94); }
        .ob-back-btn:focus-visible { outline: 2px solid #ae89ff; outline-offset: 2px; }
        .ob-btn-primary {
          width: 100%; padding: 14px 20px;
          border: none; border-radius: 14px;
          background: #ae89ff; color: #2a0066;
          font-size: 15px; font-weight: 700; font-family: inherit;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          box-shadow: 0 8px 24px rgba(174,137,255,0.28);
          transition: transform 0.2s cubic-bezier(0.22,1,0.36,1);
        }
        .ob-btn-primary--compact { width: auto; padding: 14px 48px; }
        .ob-btn-primary:hover:not(:disabled) { transform: scale(1.02); }
        .ob-btn-primary:active:not(:disabled) { transform: scale(0.99); }
        .ob-btn-primary:focus-visible { outline: 2px solid #ae89ff; outline-offset: 3px; }
        .ob-btn-primary:disabled { background: #555578; color: #aaa8c8; box-shadow: none; cursor: not-allowed; }
        .ob-btn-primary[data-loading="true"] { cursor: wait; }
        .ob-btn-secondary {
          width: 100%; padding: 11px;
          border: none; border-radius: 12px;
          background: transparent; color: var(--outline);
          font-size: 14px; font-weight: 600; font-family: inherit;
          cursor: pointer;
          transition: transform 0.2s cubic-bezier(0.22,1,0.36,1);
        }
        .ob-btn-secondary:hover:not(:disabled) { color: var(--on-surface-variant); }
        .ob-btn-secondary:active:not(:disabled) { transform: scale(0.99); }
        .ob-btn-secondary:focus-visible { outline: 2px solid #ae89ff; outline-offset: 2px; }
        .ob-btn-secondary:disabled { cursor: not-allowed; opacity: 0.5; }
        @media (prefers-reduced-motion: reduce) {
          .ob-fade, .ob-badge { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
