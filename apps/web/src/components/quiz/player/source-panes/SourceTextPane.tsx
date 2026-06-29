'use client';

// Source-highlighting feature — text/document pane. Renders the extracted source
// text with the cited passage highlighted + scrolled into view; falls back to the
// quote block when no body text is available.

import type { ResolvedSource } from '@/lib/source-anchor';
import HighlightedText from './HighlightedText';
import SourceQuote from './SourceQuote';

const CAPTION: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--on-surface-variant)',
  marginBottom: '10px',
};

export default function SourceTextPane({ source }: { source: ResolvedSource }) {
  if (!source.textContent) {
    return <SourceQuote quote={source.quote} />;
  }
  return (
    <div>
      <span style={CAPTION}>Source passage</span>
      <HighlightedText text={source.textContent} quote={source.quote} />
    </div>
  );
}
