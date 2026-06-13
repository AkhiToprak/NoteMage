'use client';

import { useId } from 'react';
import { haptics } from '@/lib/haptics';
import { INTERVAL_LABEL, type BillingInterval } from '@/lib/tiers';

const ORDER: readonly BillingInterval[] = ['weekly', 'monthly', 'yearly'];

interface BillingIntervalToggleProps {
  value: BillingInterval;
  onChange: (interval: BillingInterval) => void;
  /** When > 0, a "Save N%" badge floats over the Yearly segment. */
  savingsPct?: number;
  /** Tighter sizing for embedded contexts (onboarding wizard). */
  compact?: boolean;
}

/**
 * Segmented control for switching the displayed price between weekly / monthly /
 * yearly. A single absolutely-positioned indicator slides between the three
 * equal-width segments (transform only — never layout), so the motion stays
 * cheap and respects prefers-reduced-motion. Solid fills only (no gradients).
 */
export default function BillingIntervalToggle({
  value,
  onChange,
  savingsPct = 0,
  compact = false,
}: BillingIntervalToggleProps) {
  const groupId = useId();
  const activeIndex = Math.max(0, ORDER.indexOf(value));

  const segPadV = compact ? 6 : 9;
  const segPadH = compact ? 14 : 22;
  const fontSize = compact ? 12.5 : 14;

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div
        role="radiogroup"
        aria-label="Billing interval"
        style={{
          position: 'relative',
          display: 'inline-flex',
          padding: 4,
          background: 'var(--surface-container-low)',
          border: '1px solid rgba(136,136,168,0.22)',
          borderRadius: 'var(--radius-full)',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.25)',
        }}
      >
        {/* Sliding active-segment indicator */}
        <span
          aria-hidden
          className="bit-indicator"
          style={{
            position: 'absolute',
            top: 4,
            bottom: 4,
            left: 4,
            width: `calc((100% - 8px) / ${ORDER.length})`,
            transform: `translateX(${activeIndex * 100}%)`,
            background: 'var(--surface-container-highest)',
            borderRadius: 'var(--radius-full)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.35), 0 0 0 1px rgba(174,137,255,0.22)',
            transition: 'transform 0.32s cubic-bezier(0.22,1,0.36,1)',
          }}
        />

        {ORDER.map((interval) => {
          const isActive = interval === value;
          const showBadge = interval === 'yearly' && savingsPct > 0;
          return (
            <button
              key={interval}
              type="button"
              role="radio"
              aria-checked={isActive}
              id={`${groupId}-${interval}`}
              onClick={() => {
                if (!isActive) haptics.select();
                onChange(interval);
              }}
              className="bit-segment"
              data-active={isActive ? 'true' : undefined}
              style={{
                position: 'relative',
                zIndex: 1,
                flex: 1,
                whiteSpace: 'nowrap',
                padding: `${segPadV}px ${segPadH}px`,
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-full)',
                fontSize,
                fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                color: isActive ? 'var(--on-surface)' : 'var(--on-surface-variant)',
                cursor: 'pointer',
                transition: 'color 0.25s cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              {INTERVAL_LABEL[interval]}
              {showBadge && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: compact ? -16 : -18,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    padding: compact ? '1px 6px' : '2px 8px',
                    background: 'var(--primary)',
                    border: '1px solid var(--primary-dim)',
                    borderRadius: 'var(--radius-full)',
                    color: 'var(--on-primary)',
                    fontSize: compact ? 9 : 10,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 10px rgba(174,137,255,0.35)',
                    pointerEvents: 'none',
                  }}
                >
                  Save {savingsPct}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      <style>{`
        .bit-segment:hover { color: var(--on-surface); }
        .bit-segment:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }
        .bit-segment:active { transform: translateY(0.5px); }
        @media (prefers-reduced-motion: reduce) {
          .bit-indicator { transition-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  );
}
