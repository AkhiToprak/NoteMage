'use client';

// Source-highlighting feature — render a block of source text with the cited
// passage wrapped in <mark> and scrolled into view. Falls back to plain text when
// the quote can't be located (fuzzy match in @/lib/source-highlight). Used by the
// text pane and the video transcript pane.

import { useEffect, useMemo, useRef } from 'react';
import { locateQuote } from '@/lib/source-highlight';

const PROSE: React.CSSProperties = {
  margin: 0,
  fontSize: '14px',
  lineHeight: 1.7,
  color: 'var(--on-surface)',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
};

export default function HighlightedText({ text, quote }: { text: string; quote?: string }) {
  const markRef = useRef<HTMLElement | null>(null);

  const segments = useMemo(() => {
    if (!quote) return null;
    const range = locateQuote(text, quote);
    if (!range) return null;
    return {
      before: text.slice(0, range.start),
      match: text.slice(range.start, range.end),
      after: text.slice(range.end),
    };
  }, [text, quote]);

  useEffect(() => {
    if (!segments || !markRef.current) return;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    markRef.current.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }, [segments]);

  if (!segments) {
    return <p style={PROSE}>{text}</p>;
  }

  return (
    <p style={PROSE}>
      {segments.before}
      <mark
        ref={markRef}
        style={{
          background: 'var(--nm-primary-light)',
          color: 'var(--on-surface)',
          boxShadow: '0 0 0 1px var(--nm-primary)',
          borderRadius: '3px',
          padding: '1px 3px',
        }}
      >
        {segments.match}
      </mark>
      {segments.after}
    </p>
  );
}
