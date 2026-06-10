'use client';

interface OnboardingProgressBarProps {
  /** Fill fraction, 0–1. */
  value: number;
}

/**
 * Continuous onboarding progress bar — a solid (never gradient) primary fill
 * that grows from the left. The fill is a full-width pill translated into view
 * via `transform` only, so both ends stay rounded and motion stays cheap.
 */
export default function OnboardingProgressBar({ value }: OnboardingProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div
      role="progressbar"
      aria-label="Onboarding progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      style={{
        position: 'relative',
        flex: 1,
        height: '8px',
        borderRadius: '9999px',
        background: 'var(--surface-container-highest)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '9999px',
          background: '#ae89ff',
          transform: `translateX(${(clamped - 1) * 100}%)`,
          transition: 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />
    </div>
  );
}
