'use client';

// Source-highlighting feature — the verbatim "grounding passage" block, shared by
// the drawer's quote-only fallback and the PDF / video panes (where the original
// can't carry an inline <mark>). Theme-flipping cream↔navy via semantic tokens.

export default function SourceQuote({ quote, label = 'Grounding passage' }: { quote: string; label?: string }) {
  return (
    <figure style={{ margin: 0 }}>
      <figcaption
        style={{
          fontSize: '11px',
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--on-surface-variant)',
          marginBottom: '10px',
        }}
      >
        {label}
      </figcaption>
      <blockquote
        style={{
          margin: 0,
          padding: '16px 18px',
          borderRadius: 'var(--radius-md)',
          borderLeft: '3px solid var(--nm-primary)',
          background: 'var(--nm-primary-light)',
          color: 'var(--on-surface)',
          fontSize: '15px',
          lineHeight: 1.7,
        }}
      >
        {quote}
      </blockquote>
    </figure>
  );
}
