'use client';

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import styles from './onboarding.module.css';

/**
 * Onboarding flow — shared foundation (warm/light design system).
 *
 * The Figma "NoteMage Onboarding" frames are drawn in their OWN warm palette
 * (cream paper, ink text, purple primary, lavender accents, gold sparkles) and
 * in Inter — neither matches the app's dark Neon Scholar tokens. So this flow is
 * reproduced 1:1 against the real Figma hex values, collected here as named
 * constants (no scattered magic hex), and typeset in `--font-sans` (Plus Jakarta
 * Sans — the closest available face to the file's Inter, used without a
 * re-import). Every onboarding screen builds on these pieces.
 *
 * Decisions (apply to ALL onboarding screens):
 *  • Palette  → `ONB` below (faithful Figma hex; do NOT use the dark --surface / --nm tokens).
 *  • Type     → `ONB.font` (= var(--font-sans)). Inter → Plus Jakarta substitution.
 *  • Mascot   → <Mage pose="default"> (byte-identical to the Figma asset).
 *  • Logo     → <Mage pose="logo-color"> (= /logo_trimmed.png, purple wordmark).
 *  • Chrome   → mobile screens render their own <OnbStatusBar/> + home indicator
 *               (the gallery PhoneFrame draws no chrome of its own for these).
 */

/** The warm onboarding palette — exact Figma values. */
export const ONB = {
  /** Page background (warm cream paper). */
  cream: '#faf7f0',
  /** Headings, status-bar ink, strong text. */
  ink: '#18202f',
  /** Body / subtitle / secondary text. */
  muted: '#6b7280',
  /** Slightly softer meta text. */
  muted2: '#8b91a0',
  /** Primary brand purple (CTAs, accent text, selected rings). */
  primary: '#7c5cff',
  /** Primary pressed/darker. */
  primaryDark: '#6a4af0',
  /** Deep purple ink used on lavender chips. */
  primaryInk: '#4326b8',
  /** Lavender — decorative halos, chip fills, soft surfaces. */
  lavender: '#ede9ff',
  /** Lavender, one step deeper (inner halo). */
  lavender2: '#e3dcff',
  /** Warm hairline / paper-card border + faint dividers. */
  line: '#ece6d8',
  /** Beige text-line placeholders inside paper cards. */
  paperLine: '#e0d9c9',
  /** White surfaces (paper cards, elevated tiles). */
  white: '#ffffff',
  /** Gold sparkle / accent (success, stars). */
  gold: '#ffc83d',
  /** Success green (correct answers). */
  green: '#1f9d6b',
  greenSoft: '#e7f6ef',
  /** Error / incorrect red. */
  red: '#ef5a78',
  redSoft: '#fdeaee',
  /** The flow's primary type face (Inter → Plus Jakarta). */
  font: 'var(--font-sans)',
  /** Standard CTA elevation. */
  btnShadow: '0 12px 28px rgba(124,92,255,0.34)',
  /** Floating paper-card elevation. */
  paperShadow: '0px 3px 8px rgba(26,19,48,0.05), 0px 14px 34px rgba(58,46,102,0.13)',
  /** Soft card elevation for option/answer cards. */
  cardShadow: '0px 2px 6px rgba(26,19,48,0.05), 0px 12px 28px rgba(58,46,102,0.10)',
} as const;

/* ─────────────────────────────────────────────────────────────────────────
 * Mobile chrome (each onboarding mobile frame includes these, drawn 1:1).
 * ──────────────────────────────────────────────────────────────────────── */

/** Faux iOS status bar in onboarding ink-on-cream (Figma draws `9:41` + signal). */
export function OnbStatusBar({ time = '9:41', color = ONB.ink }: { time?: string; color?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 44,
        padding: '0 22px 0 28px',
        color,
        fontFamily: ONB.font,
        fontSize: 16,
        fontWeight: 600,
        flex: '0 0 auto',
        userSelect: 'none',
      }}
    >
      <span>{time}</span>
      <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 6, height: 12 }}>
        {/* signal bars */}
        <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 12 }}>
          {[4, 6.5, 9, 11.5].map((h, i) => (
            <span key={i} style={{ width: 3, height: h, borderRadius: 1, background: color }} />
          ))}
        </span>
        <span className="material-symbols-outlined filled" style={{ fontSize: 16, color }}>
          wifi
        </span>
        {/* battery */}
        <span
          style={{
            position: 'relative',
            display: 'inline-block',
            width: 24,
            height: 12,
            borderRadius: 3.5,
            border: `1px solid ${color}`,
            opacity: 0.95,
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: 1.5,
              top: 1.5,
              bottom: 1.5,
              width: 16,
              borderRadius: 1.5,
              background: color,
            }}
          />
          <span
            style={{
              position: 'absolute',
              right: -3,
              top: 4,
              width: 2,
              height: 4,
              borderRadius: 1,
              background: color,
              opacity: 0.4,
            }}
          />
        </span>
      </span>
    </div>
  );
}

/** The iOS home-indicator pill, in onboarding ink. */
export function OnbHomeIndicator({ color = ONB.ink }: { color?: string }) {
  return (
    <div
      aria-hidden
      style={{ height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}
    >
      <span style={{ width: 134, height: 5, borderRadius: 3, background: color, opacity: 0.25 }} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Frames
 * ──────────────────────────────────────────────────────────────────────── */

export interface OnbMobileFrameProps {
  children: ReactNode;
  /** Status-bar clock. */
  time?: string;
  /** Hide the status bar (rare). */
  statusBar?: boolean;
  /** Hide the home-indicator pill (rare). */
  homeIndicator?: boolean;
  /** Override the page background (defaults to cream). */
  background?: string;
  /** Extra style on the inner content wrapper. */
  contentStyle?: CSSProperties;
}

/**
 * The 393-wide cream phone column every onboarding mobile screen sits in:
 * own status bar at the top, a flex-grow content area, the home-indicator pill
 * pinned to the bottom. Fluid up to 393 (centered) so it never overflows a
 * narrow phone. The gallery PhoneFrame supplies only the bezel.
 */
export function OnbMobileFrame({
  children,
  time,
  statusBar = true,
  homeIndicator = true,
  background = ONB.cream,
  contentStyle,
}: OnbMobileFrameProps) {
  return (
    <div
      className={styles.onbRoot}
      style={{
        width: '100%',
        maxWidth: 393,
        marginInline: 'auto',
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        background,
        color: ONB.ink,
        fontFamily: ONB.font,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {statusBar && <OnbStatusBar time={time} />}
      <div style={{ flex: '1 0 auto', display: 'flex', flexDirection: 'column', minHeight: 0, ...contentStyle }}>
        {children}
      </div>
      {homeIndicator && <OnbHomeIndicator />}
    </div>
  );
}

export interface OnbWebFrameProps {
  children: ReactNode;
  background?: string;
  style?: CSSProperties;
}

/**
 * The cream desktop canvas for web onboarding frames (1440-designed). Full-bleed
 * background; screens build their own centered max-width content inside.
 */
export function OnbWebFrame({ children, background = ONB.cream, style }: OnbWebFrameProps) {
  return (
    <div
      className={styles.onbRoot}
      style={{
        width: '100%',
        // The Figma web onboarding frames are drawn at 1440×1024; pinning the
        // canvas to that height makes the cream fill the full design height and
        // lets screens distribute content vertically (footers pin to the real
        // bottom via flex:1 / marginTop:auto). Shorter content just gets cream
        // below — matching the full-screen feel.
        minHeight: 1024,
        display: 'flex',
        flexDirection: 'column',
        background,
        color: ONB.ink,
        fontFamily: ONB.font,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Primitives
 * ──────────────────────────────────────────────────────────────────────── */

export interface OnbButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = filled purple; ghost = text/outline; soft = lavender fill. */
  variant?: 'primary' | 'ghost' | 'soft';
  block?: boolean;
  /** Material Symbols glyph before the label. */
  leadingIcon?: string;
  /** Material Symbols glyph after the label. */
  trailingIcon?: string;
  /** Corner radius (Figma: 16 web, 18 mobile). */
  radius?: number;
  /** Height (Figma: 58 web, 56 mobile). */
  height?: number;
  children?: ReactNode;
}

/** Primary onboarding CTA + ghost / soft variants. All interaction states in CSS. */
export function OnbButton({
  variant = 'primary',
  block = false,
  leadingIcon,
  trailingIcon,
  radius = 16,
  height = 56,
  style,
  children,
  ...rest
}: OnbButtonProps) {
  const variantVars: CSSProperties =
    variant === 'primary'
      ? {
          ['--onb-btn-bg' as string]: ONB.primary,
          ['--onb-btn-bg-hover' as string]: ONB.primaryDark,
          ['--onb-btn-fg' as string]: ONB.white,
          boxShadow: ONB.btnShadow,
        }
      : variant === 'soft'
        ? {
            ['--onb-btn-bg' as string]: ONB.lavender,
            ['--onb-btn-bg-hover' as string]: ONB.lavender2,
            ['--onb-btn-fg' as string]: ONB.primaryInk,
          }
        : {
            ['--onb-btn-bg' as string]: 'transparent',
            ['--onb-btn-bg-hover' as string]: 'rgba(124,92,255,0.08)',
            ['--onb-btn-fg' as string]: ONB.primary,
          };
  return (
    <button
      type="button"
      className={styles.btn}
      style={{
        height,
        padding: '0 28px',
        borderRadius: radius,
        fontSize: 17,
        width: block ? '100%' : undefined,
        ...variantVars,
        ...style,
      }}
      {...rest}
    >
      {leadingIcon && (
        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
          {leadingIcon}
        </span>
      )}
      {children}
      {trailingIcon && (
        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
          {trailingIcon}
        </span>
      )}
    </button>
  );
}

/** A four-point sparkle (the decorative gold / purple stars in the Figma file). */
export function Sparkle({
  size = 16,
  color = ONB.gold,
  rotate = 0,
  style,
}: {
  size?: number;
  color?: string;
  rotate?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ transform: rotate ? `rotate(${rotate}deg)` : undefined, display: 'block', ...style }}
    >
      <path
        d="M12 0c.9 6.6 4.4 10.1 11 11-6.6.9-10.1 4.4-11 11-.9-6.6-4.4-10.1-11-11C7.6 10.1 11.1 6.6 12 0Z"
        fill={color}
      />
    </svg>
  );
}

/**
 * A floating "study note" paper card — white sheet, lavender header strip, beige
 * text lines, tilted. `scale` 1 = the mobile 58×76 sheet (web hero uses ~1.8).
 */
export function PaperCard({
  scale = 1,
  rotate = 0,
  style,
}: {
  scale?: number;
  rotate?: number;
  style?: CSSProperties;
}) {
  const w = 58 * scale;
  const h = 76 * scale;
  const line = (top: number, width: number) => (
    <span
      style={{
        position: 'absolute',
        left: 10 * scale,
        top: top * scale,
        width: width * scale,
        height: 4 * scale,
        borderRadius: 2 * scale,
        background: ONB.paperLine,
      }}
    />
  );
  return (
    <div style={{ transform: `rotate(${rotate}deg)`, ...style }}>
      <div
        style={{
          position: 'relative',
          width: w,
          height: h,
          borderRadius: 10 * scale,
          background: ONB.white,
          border: `1px solid ${ONB.line}`,
          boxShadow: ONB.paperShadow,
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 14 * scale,
            background: ONB.lavender,
          }}
        />
        {line(23, 34)}
        {line(33, 40)}
        {line(43, 26)}
        {line(53, 32)}
      </div>
    </div>
  );
}

/** Convenience class-name handles for screens that need the interaction states. */
export const onb = {
  tap: styles.tap,
  tapPill: styles.tapPill,
  spin: styles.spin,
  pulse: styles.pulse,
  root: styles.onbRoot,
};
