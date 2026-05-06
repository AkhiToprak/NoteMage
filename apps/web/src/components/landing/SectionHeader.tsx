'use client';

import { ReactNode } from 'react';

interface SectionHeaderProps {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  align?: 'left' | 'center';
  maxWidth?: number;
}

export default function SectionHeader({
  eyebrow,
  title,
  description,
  align = 'center',
  maxWidth = 720,
}: SectionHeaderProps) {
  return (
    <div
      style={{
        textAlign: align,
        marginBottom: 64,
        maxWidth,
        margin: align === 'center' ? `0 auto 64px` : `0 0 64px`,
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          padding: '7px 14px',
          borderRadius: 'var(--radius-full)',
          background: 'rgba(174, 137, 255, 0.1)',
          border: '1px solid rgba(174, 137, 255, 0.25)',
          marginBottom: 20,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--primary)',
            boxShadow: '0 0 10px var(--primary)',
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-brand)',
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--primary)',
            fontWeight: 600,
          }}
        >
          {eyebrow}
        </span>
      </div>

      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(32px, 4.6vw, 56px)',
          lineHeight: 1.02,
          letterSpacing: '-0.03em',
          fontWeight: 800,
          color: 'var(--on-surface)',
          margin: '0 0 18px 0',
        }}
      >
        {title}
      </h2>

      {description && (
        <p
          style={{
            fontSize: 'clamp(15px, 1.4vw, 18px)',
            lineHeight: 1.65,
            color: 'rgba(237, 233, 255, 0.6)',
            margin: 0,
            fontFamily: 'var(--font-sans)',
          }}
        >
          {description}
        </p>
      )}
    </div>
  );
}
