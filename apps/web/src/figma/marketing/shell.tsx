'use client';

import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { Mage } from '@/figma/kit';
import { ONB } from '../onboarding/shell';
import styles from './marketing.module.css';

/**
 * Marketing / public-site flow — shared foundation.
 *
 * The Figma marketing frames (Landing, link/upload bridges, Pricing, About,
 * Docs, Login) are drawn in the SAME warm palette as onboarding — cream paper,
 * ink text, purple primary, lavender accents, gold sparkles — so this flow
 * re-uses the onboarding `ONB` design system rather than re-deriving it. This
 * shell adds the public-site chrome (top nav + footer), a content-height cream
 * web canvas (`MktWebFrame` — unlike `OnbWebFrame` it is NOT pinned to 1024 and
 * never clips, so the 4080-tall landing scrolls), and re-exports the warm
 * primitives so screens import everything from one place.
 *
 * Web frames are faithful to the 1440 Figma designs; the mobile builds are a
 * DERIVED single-column reflow (these pages are web-only in Figma — flagged as a
 * Known gap in the plan), reusing `OnbMobileFrame`.
 */

// Re-export the warm design-system pieces so marketing screens import from here.
export { ONB, OnbButton, OnbMobileFrame, OnbStatusBar, OnbHomeIndicator, PaperCard, Sparkle } from '../onboarding/shell';

/** Class-name handles for the marketing interaction states (see marketing.module.css). */
export const mkt = {
  root: styles.mktRoot,
  navLink: styles.navLink,
  footLink: styles.footLink,
  tap: styles.tap,
  tapPill: styles.tapPill,
  chev: styles.chev,
  chevOpen: styles.chevOpen,
  trailLit: styles.trailLit,
  bob: styles.bob,
};

/** Base path for every marketing screen (used for in-flow `next/link` routing). */
export const MKT = '/figma/marketing';

/** Marketing-only accent colors not present in the onboarding `ONB` palette.
 * (ONB already covers cream/ink/muted/primary/lavender/line/white/gold/green/red.) */
export const MKTC = {
  /** "Most popular" / accent badge fill (gold) + its ink. */
  badge: '#ffc83d',
  badgeInk: '#5a4410',
  /** About-page sticky-note yellow + ink. */
  note: '#ffe27a',
  noteInk: '#3c3010',
  /** Bridge video-thumbnail navy. */
  videoBg: '#171633',
  /** Pro plan card lavender tint. */
  proTint: '#f3effd',
  /** Comparison-table "Pro" column cream tint. */
  proColumn: '#fff6e6',
} as const;

/* ─────────────────────────────────────────────────────────────────────────
 * Web canvas
 * ──────────────────────────────────────────────────────────────────────── */

export interface MktWebFrameProps {
  children: ReactNode;
  background?: string;
  style?: CSSProperties;
}

/**
 * Full-bleed cream desktop canvas for the 1440-designed marketing pages. Content
 * height (NOT pinned, NOT overflow-hidden) so tall pages (landing 4080, pricing
 * 2568…) scroll naturally inside the stage. Screens build their own centered
 * max-width 1440 content inside.
 */
export function MktWebFrame({ children, background = ONB.cream, style }: MktWebFrameProps) {
  return (
    <div
      className={mkt.root}
      style={{
        width: '100%',
        minHeight: '100%',
        background,
        color: ONB.ink,
        fontFamily: ONB.font,
        position: 'relative',
        overflowX: 'clip',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Chrome — top nav
 * ──────────────────────────────────────────────────────────────────────── */

/** Top-nav destinations (the same trio on every marketing page). */
const NAV_LINKS: { key: 'how' | 'pricing' | 'login'; label: string; href: string }[] = [
  { key: 'how', label: 'How it works', href: `${MKT}/landing` },
  { key: 'pricing', label: 'Pricing', href: `${MKT}/pricing` },
  { key: 'login', label: 'Log in', href: `${MKT}/login` },
];

export interface MktTopNavProps {
  /** Which nav item to render in ink (the current page). */
  active?: 'how' | 'pricing' | 'login';
  /** Override the "Get started" destination (defaults to the onboarding funnel). */
  ctaHref?: string;
  /** Horizontal padding (Figma: 64). */
  padX?: number;
  style?: CSSProperties;
}

/**
 * The public-site header: NoteMage wordmark · How it works / Pricing / Log in ·
 * "Get started" pill. Used on Landing, Pricing, About, Docs. (Login draws its own
 * split layout; the bridges use `MktLogoBar`.)
 */
export function MktTopNav({ active, ctaHref = '/figma/onboarding/01-welcome', padX = 64, style }: MktTopNavProps) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 40,
        height: 84,
        maxWidth: 1440,
        marginInline: 'auto',
        padding: `0 ${padX}px`,
        ...style,
      }}
    >
      <Link href={`${MKT}/landing`} aria-label="NoteMage home" style={{ display: 'inline-flex', lineHeight: 0 }}>
        <Mage pose="logo-color" size={150} alt="NoteMage" priority />
      </Link>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 44, marginLeft: 'auto' }}>
        {NAV_LINKS.map((l) => {
          const on = active === l.key;
          return (
            <Link
              key={l.key}
              href={l.href}
              className={mkt.navLink}
              style={{
                color: on ? ONB.ink : ONB.muted,
                fontFamily: ONB.font,
                fontSize: 16,
                fontWeight: on ? 700 : 500,
                textDecoration: 'none',
              }}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <Link href={ctaHref} style={{ textDecoration: 'none' }}>
        <GetStartedButton />
      </Link>
    </header>
  );
}

/** The purple "Get started" pill used in the header (matches the OnbButton voice). */
function GetStartedButton() {
  return (
    <span
      className={mkt.tapPill}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 52,
        padding: '0 28px',
        borderRadius: 16,
        background: ONB.primary,
        color: ONB.white,
        fontFamily: ONB.font,
        fontSize: 16,
        fontWeight: 600,
        boxShadow: ONB.btnShadow,
        whiteSpace: 'nowrap',
      }}
    >
      Get started
    </span>
  );
}

/** Just the wordmark, top-left — for the bridge screens (B1 / B2). */
export function MktLogoBar({ padX = 64, style }: { padX?: number; style?: CSSProperties }) {
  return (
    <header style={{ maxWidth: 1440, marginInline: 'auto', padding: `40px ${padX}px 0`, ...style }}>
      <Link href={`${MKT}/landing`} aria-label="NoteMage home" style={{ display: 'inline-flex', lineHeight: 0 }}>
        <Mage pose="logo-color" size={150} alt="NoteMage" priority />
      </Link>
    </header>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Chrome — footer
 * ──────────────────────────────────────────────────────────────────────── */

const FOOTER_LINKS = [
  'Pricing',
  'How it works',
  'About',
  'Contact',
  'Docs',
  'Privacy',
  'Terms',
  'Refunds',
  'Legal Notice',
];

const FOOTER_HREF: Record<string, string> = {
  Pricing: `${MKT}/pricing`,
  'How it works': `${MKT}/landing`,
  About: `${MKT}/about`,
  Docs: `${MKT}/docs`,
};

/**
 * The public-site footer: top hairline, centered NoteMage wordmark, a centered
 * link row, then the copyright line. Used on Landing, Pricing, About, Docs.
 */
export function MarketingFooterBar({ style }: { style?: CSSProperties }) {
  return (
    <footer style={{ borderTop: `1px solid ${ONB.line}`, padding: '48px 64px 56px', ...style }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 26 }}>
        <Mage pose="logo-color" size={150} alt="NoteMage" />
      </div>
      <nav
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '14px 28px',
          maxWidth: 760,
          marginInline: 'auto',
        }}
      >
        {FOOTER_LINKS.map((label) => {
          const href = FOOTER_HREF[label];
          const common = {
            className: mkt.footLink,
            style: {
              color: ONB.muted,
              fontFamily: ONB.font,
              fontSize: 15,
              fontWeight: 500,
              textDecoration: 'none',
            } as CSSProperties,
          };
          return href ? (
            <Link key={label} href={href} {...common}>
              {label}
            </Link>
          ) : (
            <span key={label} {...common}>
              {label}
            </span>
          );
        })}
      </nav>
      <p
        style={{
          margin: '26px 0 0',
          textAlign: 'center',
          color: ONB.muted2,
          fontFamily: ONB.font,
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        © 2026 Notemage
      </p>
    </footer>
  );
}
