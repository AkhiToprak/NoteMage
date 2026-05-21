'use client';

import { ReactNode, CSSProperties } from 'react';

interface MockFrameProps {
  children?: ReactNode;
  image?: string;
  alt?: string;
  /** Deprecated: browser chrome was removed. Kept so existing callers compile. */
  urlLabel?: string;
  cornerLabel?: string;
  accent?: string;
  aspectRatio?: string;
  style?: CSSProperties;
  className?: string;
}

/**
 * Screenshot frame for landing mockups. A plain `<figure>` with a hairline
 * border and a soft shadow — deliberately NOT a re-drawn browser window
 * (no traffic-light dots, no fake URL pill; the visitor already has a browser).
 * Pass either an `image` (real screenshot) or custom `children`. `cornerLabel`
 * renders as a small product badge in the top-left corner.
 */
export default function MockFrame({
  children,
  image,
  alt = '',
  cornerLabel,
  accent = 'rgba(174, 137, 255, 0.35)',
  aspectRatio = '3024 / 1668',
  style,
  className,
}: MockFrameProps) {
  return (
    <figure
      className={className}
      style={{
        position: 'relative',
        margin: 0,
        borderRadius: 'var(--radius-xl)',
        background: '#181732',
        border: `1px solid ${accent}`,
        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Screenshot surface */}
      <div
        style={{
          position: 'relative',
          aspectRatio,
          width: '100%',
          background: '#181732',
        }}
      >
        {image ? (
          // Real screenshot — native img so next/image config stays untouched
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={alt}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        ) : (
          children
        )}
      </div>

      {/* Product badge — a caption, not browser chrome */}
      {cornerLabel ? (
        <figcaption
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            padding: '5px 12px',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(12, 10, 26, 0.66)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: `1px solid ${accent}`,
            color: 'var(--primary)',
            fontSize: 10,
            fontFamily: 'var(--font-brand)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          {cornerLabel}
        </figcaption>
      ) : null}
    </figure>
  );
}
