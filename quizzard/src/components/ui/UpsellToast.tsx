'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Yellow upgrade-to-Pro toast.
 *
 * Triggered from any client surface that hits a `402 { upgrade: true }`
 * response from the API. Auto-dismisses after `duration` ms (default 6000),
 * with a manual close button.
 *
 * Render in an overlay container — typically once per page near the root —
 * and control via `<UpsellToast open={true} onClose={() => setOpen(false)} />`.
 *
 * Visual language matches the landing-page CTAs: yellow primary
 * (`#ffde59`), spring easing, layered shadow.
 */

interface UpsellToastProps {
  open: boolean;
  onClose: () => void;
  /** Optional override of the headline. Defaults to "Pro feature". */
  title?: string;
  /** Optional override of the description. */
  description?: string;
  /** Auto-dismiss delay in milliseconds. Pass 0 to disable. */
  duration?: number;
  /** Where the upgrade link should point. */
  href?: string;
}

export default function UpsellToast({
  open,
  onClose,
  title = 'Pro feature',
  description = 'Upgrade to Pro to unlock inline AI editing.',
  duration = 6000,
  href = '/pricing',
}: UpsellToastProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  // Auto-dismiss
  useEffect(() => {
    if (!open || duration <= 0) return;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [open, duration, onClose]);

  // Animate out before unmounting so the slide-down transition is visible
  useEffect(() => {
    if (open) return;
    if (!mounted) return;
    const t = setTimeout(() => setMounted(false), 350);
    return () => clearTimeout(t);
  }, [open, mounted]);

  if (!mounted) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 24,
        left: '50%',
        transform: open
          ? 'translate(-50%, 0)'
          : 'translate(-50%, -120%)',
        zIndex: 300,
        maxWidth: 460,
        width: 'calc(100% - 32px)',
        background:
          'linear-gradient(135deg, rgba(255, 222, 89, 0.16) 0%, rgba(255, 222, 89, 0.08) 100%), rgba(20, 18, 44, 0.96)',
        border: '1px solid rgba(255, 222, 89, 0.45)',
        borderRadius: 14,
        padding: '14px 16px 14px 14px',
        boxShadow:
          '0 24px 60px rgba(0, 0, 0, 0.55), 0 8px 24px rgba(255, 222, 89, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        opacity: open ? 1 : 0,
        transition:
          'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Sparkle icon */}
      <div
        aria-hidden
        style={{
          flexShrink: 0,
          width: 36,
          height: 36,
          borderRadius: 10,
          background:
            'linear-gradient(135deg, #ffde59 0%, #ffc94a 100%)',
          color: '#2a2200',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(255, 222, 89, 0.35)',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}
        >
          bolt
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-brand)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#ffde59',
            marginBottom: 4,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.5,
            color: 'rgba(237, 233, 255, 0.85)',
            marginBottom: 10,
          }}
        >
          {description}
        </div>
        <Link
          href={href}
          onClick={onClose}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 999,
            background:
              'linear-gradient(135deg, #ffde59 0%, #ffc94a 100%)',
            color: '#2a2200',
            fontSize: 12,
            fontWeight: 700,
            textDecoration: 'none',
            boxShadow:
              '0 6px 18px rgba(255, 222, 89, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
            transition:
              'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          Upgrade to Pro
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            arrow_forward
          </span>
        </Link>
      </div>

      {/* Close button */}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        style={{
          flexShrink: 0,
          width: 28,
          height: 28,
          borderRadius: 8,
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          color: 'rgba(237, 233, 255, 0.55)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
          close
        </span>
      </button>
    </div>
  );
}
