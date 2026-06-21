'use client';

import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { Mage } from '@/figma/kit';
import { ONB, OnbStatusBar } from '../onboarding/shell';
import styles from './app-shell.module.css';

/**
 * App-shell flow — shared foundation (warm/light design system).
 *
 * The Figma app-shell frames (Dashboard, Profile, Learning paths) are drawn in
 * the SAME warm palette as onboarding — cream paper, ink text, purple primary,
 * lavender accents, gold sparkles, the existing Mage mascot — so this flow
 * re-uses the onboarding `ONB` design system rather than re-deriving it. This
 * shell adds the persistent app chrome the marketing/onboarding flows don't have:
 *  • a 190-wide left **sidebar** on web (wordmark · Dashboard/Paths/Progress/
 *    Profile nav · pinned "Ask Mage" card), and
 *  • a 4-tab **bottom nav** on mobile (Dashboard/Paths/Progress/Profile),
 * plus the frames that host them (`AppWebFrame` / `AppMobileFrame`). It re-exports
 * the warm primitives so screens import everything from one place.
 *
 * Web frames are faithful to the 1440 Figma designs (sidebar 190 + content); the
 * mobile builds are faithful to the 393 frames (own status bar + pinned tab bar).
 */

// Re-export the warm design-system pieces so app-shell screens import from here.
export { ONB, OnbButton, OnbStatusBar, OnbHomeIndicator, Sparkle, PaperCard } from '../onboarding/shell';

/** Base path for every app-shell screen (used for in-flow `next/link` routing). */
export const APP = '/figma/app-shell';

/** Class-name handles for the app-shell interaction states (see app-shell.module.css). */
export const app = {
  root: styles.appRoot,
  navItem: styles.navItem,
  card: styles.card,
  pill: styles.pill,
  link: styles.link,
};

/**
 * App-shell-only accent tones not present in the onboarding `ONB` palette.
 * (ONB already covers cream/ink/muted/muted2/primary/primaryInk/lavender/lavender2/
 * line/white/gold/green/red and the shadow presets.) These are the exact extra
 * Figma hex values from the Dashboard/Profile frames.
 */
export const APPC = {
  /** Warm grey-brown meta text ("8 units · 42 lessons …"). */
  metaWarm: '#9a8f7e',
  /** Amber "Review queue" card — fill / border / icon-chip / ink. */
  amberBg: '#fcefd9',
  amberBorder: '#f0dbb4',
  amberChip: '#fbe3c2',
  amberInk: '#8a5a12',
  /** White "New path" button outline (faint lavender-grey). */
  btnBorder: '#d9d2ea',
  /** Mage-tip card outline (faint purple). */
  tipBorder: '#e6dffb',
  /** Mobile bottom-nav inactive tab grey (lighter than the sidebar's #6b7280). */
  navInactive: '#a1a7b3',
  /** Pro upsell card purple (Profile). */
  pro: '#7c5cff',
  /** Card elevations (exact Figma box-shadows). */
  shadow: {
    /** Hero path card. */
    path: '0px 12px 30px rgba(124,92,255,0.14), 0px 2px 8px rgba(26,19,48,0.05)',
    /** Study-plan rows / list rows. */
    row: '0px 4px 12px rgba(58,46,102,0.05)',
    /** Study-tool tiles. */
    tool: '0px 5px 16px rgba(58,46,102,0.07)',
    /** Right-rail cards (today's goal, next checkpoint). */
    rail: '0px 5px 16px rgba(58,46,102,0.06)',
    /** Mage-tip card. */
    tip: '0px 8px 22px rgba(124,92,255,0.12)',
    /** Small white pill (New path). */
    pill: '0px 3px 8px rgba(58,46,102,0.05)',
    /** Bottom-nav bar (upward). */
    nav: '0px -2px 16px rgba(26,19,48,0.06)',
  },
} as const;

/* ─────────────────────────────────────────────────────────────────────────
 * Nav model — one source of truth for the sidebar + the bottom tab bar.
 * ──────────────────────────────────────────────────────────────────────── */

export type AppTab = 'dashboard' | 'paths' | 'progress' | 'profile';

interface NavDef {
  key: AppTab;
  label: string;
  /** Material Symbols glyph (icon system rule — no icon packages). */
  icon: string;
  href: string;
}

const NAV: readonly NavDef[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'space_dashboard', href: `${APP}/dashboard` },
  { key: 'paths', label: 'Paths', icon: 'route', href: `${APP}/learning-paths` },
  { key: 'progress', label: 'Progress', icon: 'bar_chart', href: `${APP}/dashboard` },
  { key: 'profile', label: 'Profile', icon: 'person', href: `${APP}/profile` },
] as const;

/* ─────────────────────────────────────────────────────────────────────────
 * Web — left sidebar (190px)
 * ──────────────────────────────────────────────────────────────────────── */

export interface AppSidebarProps {
  active: AppTab;
  /** "Ask Mage" card subtitle (Figma varies it per screen). */
  askSubtitle?: string;
}

/**
 * The persistent 190-wide app rail: NoteMage wordmark, the four nav items
 * (active = lavender pill + purple), and the "Ask Mage" card pinned to the
 * bottom. Stretches to the full content height (parent flex `align-items:
 * stretch`) so the Ask-Mage card always sits at the bottom.
 */
export function AppSidebar({ active, askSubtitle = 'About this path' }: AppSidebarProps) {
  return (
    <aside
      style={{
        width: 190,
        flex: '0 0 auto',
        background: ONB.white,
        borderRight: `1px solid ${ONB.line}`,
        display: 'flex',
        flexDirection: 'column',
        padding: '34px 12px 16px',
        position: 'sticky',
        top: 0,
        alignSelf: 'stretch',
      }}
    >
      <Link
        href={`${APP}/dashboard`}
        aria-label="NoteMage home"
        style={{ display: 'inline-flex', lineHeight: 0, paddingLeft: 12, marginBottom: 30 }}
      >
        <Mage pose="logo-color" size={118} alt="NoteMage" priority />
      </Link>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {NAV.map((n) => {
          const on = n.key === active;
          return (
            <Link
              key={n.key}
              href={n.href}
              aria-current={on ? 'page' : undefined}
              className={app.navItem}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                height: 44,
                padding: '0 16px',
                borderRadius: 12,
                background: on ? ONB.lavender : 'transparent',
                color: on ? ONB.primary : ONB.muted,
                textDecoration: 'none',
              }}
            >
              <span
                className={on ? 'material-symbols-outlined filled' : 'material-symbols-outlined'}
                style={{ fontSize: 20 }}
              >
                {n.icon}
              </span>
              <span style={{ fontFamily: ONB.font, fontSize: 14.5, fontWeight: on ? 600 : 500 }}>
                {n.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* "Ask Mage" card pinned to the bottom. */}
      <Link
        href={`${APP}/dashboard`}
        className={app.card}
        style={{
          marginTop: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 64,
          padding: '0 10px',
          borderRadius: 16,
          background: ONB.lavender,
          textDecoration: 'none',
        }}
      >
        <Mage pose="default" size={46} alt="" />
        <span style={{ display: 'grid', lineHeight: 1.25 }}>
          <span style={{ fontFamily: ONB.font, fontSize: 13, fontWeight: 700, color: ONB.primary }}>
            Ask Mage
          </span>
          <span style={{ fontFamily: ONB.font, fontSize: 11, fontWeight: 500, color: ONB.muted }}>
            {askSubtitle}
          </span>
        </span>
      </Link>
    </aside>
  );
}

export interface AppWebFrameProps {
  active: AppTab;
  children: ReactNode;
  /** "Ask Mage" card subtitle. */
  askSubtitle?: string;
  /** Canvas min-height (Figma frame height — e.g. 940 dashboard, 716 profile). */
  minHeight?: number;
  /** Override the main content padding. */
  mainPadding?: string;
  /** Extra style on the <main> content wrapper. */
  mainStyle?: CSSProperties;
}

/**
 * The desktop app canvas: cream full-bleed, the sticky 190 sidebar on the left,
 * and a flexible scrollable <main> on the right. Designed at 1440 (sidebar 190 +
 * content); the sidebar stretches to the tallest content so the Ask-Mage card
 * pins to the bottom.
 */
export function AppWebFrame({
  active,
  children,
  askSubtitle,
  minHeight = 940,
  mainPadding = '34px 40px 40px 34px',
  mainStyle,
}: AppWebFrameProps) {
  return (
    <div
      className={app.root}
      style={{
        display: 'flex',
        width: '100%',
        minHeight,
        background: ONB.cream,
        color: ONB.ink,
        fontFamily: ONB.font,
        position: 'relative',
        overflowX: 'clip',
      }}
    >
      <AppSidebar active={active} askSubtitle={askSubtitle} />
      <main style={{ flex: 1, minWidth: 0, padding: mainPadding, ...mainStyle }}>{children}</main>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Mobile — bottom tab bar + frame
 * ──────────────────────────────────────────────────────────────────────── */

export interface AppBottomNavProps {
  active: AppTab;
}

/**
 * The mobile app tab bar: white, top hairline + upward shadow, four tabs
 * (active = purple icon/label + a short accent bar above it; inactive = grey
 * #a1a7b3), and the iOS home-indicator pill below. Pinned to the bottom of the
 * mobile frame.
 */
export function AppBottomNav({ active }: AppBottomNavProps) {
  return (
    <div style={{ flex: '0 0 auto' }}>
      <nav
        style={{
          display: 'flex',
          background: ONB.white,
          borderTop: `1px solid ${ONB.line}`,
          boxShadow: APPC.shadow.nav,
          paddingTop: 2,
        }}
      >
        {NAV.map((n) => {
          const on = n.key === active;
          const color = on ? ONB.primary : APPC.navInactive;
          return (
            <Link
              key={n.key}
              href={n.href}
              aria-current={on ? 'page' : undefined}
              className={app.navItem}
              style={{
                position: 'relative',
                flex: 1,
                display: 'grid',
                justifyItems: 'center',
                gap: 4,
                padding: '12px 0 14px',
                textDecoration: 'none',
                color,
              }}
            >
              {on && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 26,
                    height: 3,
                    borderRadius: 2,
                    background: ONB.primary,
                  }}
                />
              )}
              <span
                className={on ? 'material-symbols-outlined filled' : 'material-symbols-outlined'}
                style={{ fontSize: 24 }}
              >
                {n.icon}
              </span>
              <span style={{ fontFamily: ONB.font, fontSize: 10.5, fontWeight: on ? 600 : 500 }}>
                {n.label}
              </span>
            </Link>
          );
        })}
      </nav>
      <div style={{ background: ONB.white, display: 'flex', justifyContent: 'center', paddingBottom: 8 }}>
        <span style={{ width: 134, height: 5, borderRadius: 3, background: 'rgba(24,32,47,0.35)' }} />
      </div>
    </div>
  );
}

export interface AppMobileFrameProps {
  active: AppTab;
  children: ReactNode;
  /** Status-bar clock. */
  time?: string;
  /** Page background (defaults to cream). */
  background?: string;
  /** Extra style on the scrollable content wrapper. */
  contentStyle?: CSSProperties;
}

/**
 * The 393-wide cream phone column every app-shell mobile screen sits in: own
 * status bar at the top, a flex-grow content area (the page body), and the
 * bottom tab bar pinned to the bottom. Centered & capped at 393 so it never
 * overflows a narrow phone.
 */
export function AppMobileFrame({ active, children, time, background = ONB.cream, contentStyle }: AppMobileFrameProps) {
  return (
    <div
      className={app.root}
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
      <OnbStatusBar time={time} />
      <div style={{ flex: '1 0 auto', display: 'flex', flexDirection: 'column', minHeight: 0, ...contentStyle }}>
        {children}
      </div>
      <AppBottomNav active={active} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Small shared bits used across app-shell screens.
 * ──────────────────────────────────────────────────────────────────────── */

/** The lavender-on-white "MAGE TIP" card (Mage mascot + gold sparkle + copy). */
export function MageTip({
  children,
  width,
  style,
}: {
  children: ReactNode;
  width?: number | string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        position: 'relative',
        background: ONB.white,
        border: `1.4px solid ${APPC.tipBorder}`,
        borderRadius: 18,
        boxShadow: APPC.shadow.tip,
        padding: '16px 18px',
        width,
        overflow: 'hidden',
        ...style,
      }}
    >
      <p
        style={{
          margin: 0,
          fontFamily: ONB.font,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.6,
          color: ONB.primary,
        }}
      >
        MAGE TIP
      </p>
      <p
        style={{
          margin: '6px 0 0',
          fontFamily: ONB.font,
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1.35,
          color: ONB.ink,
          maxWidth: 210,
        }}
      >
        {children}
      </p>
    </div>
  );
}
