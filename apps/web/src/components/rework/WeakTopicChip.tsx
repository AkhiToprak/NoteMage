'use client';

import * as React from 'react';
import Link from 'next/link';

export interface WeakTopicChipProps {
  topic: string;
  onReview?: () => void;
  href?: string;
}

export function WeakTopicChip({ topic, onReview, href }: WeakTopicChipProps) {
  const [reviewHovered, setReviewHovered] = React.useState(false);

  const reviewAction = href ? (
    <Link
      href={href}
      onMouseEnter={() => setReviewHovered(true)}
      onMouseLeave={() => setReviewHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        padding: '2px 8px',
        borderRadius: 'var(--radius-full)',
        background: reviewHovered ? 'var(--nm-review)' : 'transparent',
        color: reviewHovered ? 'var(--nm-review-ink)' : 'var(--nm-review)',
        border: '1px solid var(--nm-review)',
        fontSize: 'var(--fs-sm)',
        fontWeight: 700,
        fontFamily: 'var(--font-sans)',
        cursor: 'pointer',
        textDecoration: 'none',
        transition:
          'background var(--dur-fast) var(--ease-spring), color var(--dur-fast) var(--ease-spring)',
        whiteSpace: 'nowrap',
        outline: 'none',
      }}
      // focus-visible ring via global CSS — Link renders an <a>
    >
      Review
    </Link>
  ) : onReview ? (
    <button
      type="button"
      onClick={onReview}
      onMouseEnter={() => setReviewHovered(true)}
      onMouseLeave={() => setReviewHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        padding: '2px 8px',
        borderRadius: 'var(--radius-full)',
        background: reviewHovered ? 'var(--nm-review)' : 'transparent',
        color: reviewHovered ? 'var(--nm-review-ink)' : 'var(--nm-review)',
        border: '1px solid var(--nm-review)',
        fontSize: 'var(--fs-sm)',
        fontWeight: 700,
        fontFamily: 'var(--font-sans)',
        cursor: 'pointer',
        transition:
          'background var(--dur-fast) var(--ease-spring), color var(--dur-fast) var(--ease-spring)',
        whiteSpace: 'nowrap',
      }}
    >
      Review
    </button>
  ) : null;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        minHeight: 44,
        padding: '8px 14px',
        borderRadius: 'var(--radius-full)',
        background: 'var(--nm-review-soft)',
        border: '1px solid var(--nm-review)',
        color: 'var(--nm-review)',
        fontSize: 'var(--fs-sm)',
        fontWeight: 600,
        fontFamily: 'var(--font-sans)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <span
        className="material-symbols-outlined"
        aria-hidden
        style={{ fontSize: 16, lineHeight: 1 }}
      >
        priority_high
      </span>
      <span>{topic}</span>
      {reviewAction}
    </div>
  );
}

export default WeakTopicChip;
