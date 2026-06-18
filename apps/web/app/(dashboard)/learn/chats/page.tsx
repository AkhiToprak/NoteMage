'use client';

// Phase 9.3 — /learn/chats index. The rail lives in chats/layout.tsx; this
// page only renders the right-pane empty state.

import Link from 'next/link';
import { Mascot } from '@/components/mascot/Mascot';

export default function LearnChatsIndexPage() {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
        background: 'var(--background)',
      }}
    >
      <div
        style={{
          maxWidth: '400px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        <Mascot pose="thinking" size="md" idle="float" />
        <div>
          <h2
            style={{
              margin: '0 0 8px',
              fontFamily: 'var(--font-display)',
              fontSize: '20px',
              fontWeight: 700,
              color: 'var(--on-surface)',
              letterSpacing: '-0.02em',
            }}
          >
            Mage works best with your material
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: '14px',
              color: 'var(--on-surface-variant)',
              lineHeight: 1.7,
            }}
          >
            Open a chat from the sidebar, or upload notes so Mage can answer based on your content.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link
            href="/study-packs/new"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              minHeight: '44px',
              padding: '0 18px',
              borderRadius: '10px',
              background: 'var(--accent-strong)',
              color: 'var(--on-primary-container)',
              fontSize: '13px',
              fontWeight: 700,
              fontFamily: 'var(--font-display)',
              textDecoration: 'none',
              outline: 'none',
              transition: 'opacity 0.12s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = '0.85'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = '1'; }}
            onFocus={(e) => { (e.currentTarget as HTMLAnchorElement).style.outline = '3px solid var(--md-h3)'; (e.currentTarget as HTMLAnchorElement).style.outlineOffset = '2px'; }}
            onBlur={(e) => { (e.currentTarget as HTMLAnchorElement).style.outline = 'none'; }}
          >
            <span
              className="material-symbols-outlined"
              aria-hidden
              style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}
            >
              upload_file
            </span>
            Upload material
          </Link>
        </div>
      </div>
    </div>
  );
}
