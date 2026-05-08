import Link from 'next/link';
import { Mascot } from '@/components/mascot';

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        padding: '48px 24px',
        background: 'var(--background)',
        color: 'var(--on-surface)',
        textAlign: 'center',
      }}
    >
      <Mascot pose="sad" size="xl" idle="sway" priority />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <span
          style={{
            fontFamily: 'var(--font-brand)',
            fontSize: '64px',
            fontWeight: 400,
            lineHeight: 1,
            letterSpacing: '0.04em',
            color: 'var(--primary)',
          }}
        >
          404
        </span>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '24px',
            fontWeight: 700,
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          Page not found
        </h1>
        <p
          style={{
            fontSize: '14px',
            color: 'var(--on-surface-variant)',
            margin: 0,
            maxWidth: '320px',
          }}
        >
          The spell missed its mark. Let&apos;s get you back to the spellbook.
        </p>
      </div>
      <Link
        href="/"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 22px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--primary)',
          color: 'var(--on-primary, #1a1a36)',
          fontSize: '14px',
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
          home
        </span>
        Back home
      </Link>
    </div>
  );
}
