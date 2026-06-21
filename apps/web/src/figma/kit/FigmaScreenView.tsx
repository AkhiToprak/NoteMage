'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getAdjacent, getScreen, FLOWS } from '../registry';
import { ResponsiveScreen } from './ResponsiveScreen';
import { PhoneFrame } from './PhoneFrame';
import { FButton } from './FButton';

type ViewMode = 'responsive' | 'phone' | 'desktop' | 'both';

const MODES: { key: ViewMode; label: string; icon: string }[] = [
  { key: 'responsive', label: 'Responsive', icon: 'devices' },
  { key: 'phone', label: 'Phone', icon: 'smartphone' },
  { key: 'desktop', label: 'Desktop', icon: 'desktop_windows' },
  { key: 'both', label: 'Both', icon: 'compare' },
];

export interface FigmaScreenViewProps {
  slug: string;
}

/**
 * The single-screen stage behind the `[...slug]` route. Renders the screen via
 * the responsive switch by default, with forced phone/desktop/side-by-side
 * device frames for direct comparison against Figma, plus within-flow Back/Next.
 */
export function FigmaScreenView({ slug }: FigmaScreenViewProps) {
  const entry = getScreen(slug);
  const [mode, setMode] = useState<ViewMode>('responsive');

  if (!entry) {
    return (
      <div style={{ padding: 'var(--space-12)', color: 'var(--on-surface)' }}>
        Unknown screen: <code>{slug}</code> · <Link href="/figma">back to gallery</Link>
      </div>
    );
  }

  const { prev, next } = getAdjacent(slug);
  const flowLabel = FLOWS.find((f) => f.id === entry.flow)?.label ?? entry.flow;

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {/* Control bar — the gallery chrome, not part of the reproduced screen. */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100, // --z-sticky
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
          padding: '10px var(--space-6)',
          background: 'rgba(16,16,42,0.86)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid var(--ink-08)',
        }}
      >
        <Link
          href="/figma"
          aria-label="Back to gallery"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: 'var(--ink-60)',
            textDecoration: 'none',
            fontSize: 'var(--fs-sm)',
            fontWeight: 600,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
            grid_view
          </span>
          Gallery
        </Link>

        <div style={{ display: 'grid', lineHeight: 1.2 }}>
          <strong style={{ fontFamily: 'var(--font-display)', color: 'var(--on-surface)', fontSize: 'var(--fs-md)' }}>
            {entry.title}
          </strong>
          <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--ink-50)' }}>
            {flowLabel}
            {entry.nodeMobile && ` · m ${entry.nodeMobile}`}
            {entry.nodeWeb && ` · w ${entry.nodeWeb}`}
          </span>
        </div>

        {/* View-mode segmented control. */}
        <div
          role="tablist"
          aria-label="View mode"
          style={{
            display: 'inline-flex',
            gap: 2,
            padding: 3,
            borderRadius: 'var(--radius-full)',
            background: 'var(--surface-container)',
            marginLeft: 'auto',
          }}
        >
          {MODES.map((m) => {
            const isOn = m.key === mode;
            return (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={isOn}
                onClick={() => setMode(m.key)}
                title={m.label}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: 'var(--radius-full)',
                  background: isOn ? 'var(--nm-primary)' : 'transparent',
                  color: isOn ? 'var(--on-primary-container)' : 'var(--ink-60)',
                  fontSize: 'var(--fs-sm)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  {m.icon}
                </span>
                <span style={{ display: 'inline' }}>{m.label}</span>
              </button>
            );
          })}
        </div>

        {/* Within-flow Back / Next. */}
        <div style={{ display: 'inline-flex', gap: 'var(--space-2)' }}>
          {prev ? (
            <Link href={`/figma/${prev.slug}`}>
              <FButton variant="secondary" size="sm" leadingIcon="chevron_left">
                Prev
              </FButton>
            </Link>
          ) : (
            <FButton variant="secondary" size="sm" leadingIcon="chevron_left" disabled>
              Prev
            </FButton>
          )}
          {next ? (
            <Link href={`/figma/${next.slug}`}>
              <FButton variant="secondary" size="sm" trailingIcon="chevron_right">
                Next
              </FButton>
            </Link>
          ) : (
            <FButton variant="secondary" size="sm" trailingIcon="chevron_right" disabled>
              Next
            </FButton>
          )}
        </div>
      </div>

      {/* Stage. */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {mode === 'responsive' && (
          <ResponsiveScreen mobile={entry.mobile} web={entry.web} />
        )}

        {mode === 'phone' && (
          <div style={{ display: 'grid', placeItems: 'center', padding: 'var(--space-12)' }}>
            <PhoneFrame showStatusBar={false} showHomeIndicator={false}>
              <ResponsiveScreen mobile={entry.mobile} web={entry.web} force="mobile" />
            </PhoneFrame>
          </div>
        )}

        {mode === 'desktop' && (
          <div style={{ overflow: 'auto', padding: 'var(--space-8)' }}>
            <DesktopFrame>
              <ResponsiveScreen mobile={entry.mobile} web={entry.web} force="web" />
            </DesktopFrame>
          </div>
        )}

        {mode === 'both' && (
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-12)',
              alignItems: 'flex-start',
              overflow: 'auto',
              padding: 'var(--space-12)',
            }}
          >
            <PhoneFrame showStatusBar={false} showHomeIndicator={false}>
              <ResponsiveScreen mobile={entry.mobile} web={entry.web} force="mobile" />
            </PhoneFrame>
            <DesktopFrame>
              <ResponsiveScreen mobile={entry.mobile} web={entry.web} force="web" />
            </DesktopFrame>
          </div>
        )}
      </div>
    </div>
  );
}

/** 1440 desktop shell (natural size; the container scrolls if the window is narrower). */
function DesktopFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 1440,
        flex: '0 0 auto',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        border: '1px solid var(--ink-12)',
        background: 'var(--surface)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}
    >
      {children}
    </div>
  );
}
