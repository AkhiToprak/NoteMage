'use client';

import { ReactNode, CSSProperties } from 'react';

interface MockFrameProps {
  children?: ReactNode;
  image?: string;
  alt?: string;
  urlLabel?: string;
  cornerLabel?: string;
  accent?: string;
  aspectRatio?: string;
  style?: CSSProperties;
  className?: string;
}

/**
 * Reusable browser-chrome wrapper used for every mockup on the landing page.
 * Renders a dark window chrome (traffic lights + url pill) + a configurable inner
 * surface. Pass either an `image` (placeholder) or custom `children` for bespoke
 * mockups like the Personal Mage chat bubbles.
 */
export default function MockFrame({
  children,
  image,
  alt = '',
  urlLabel = 'notemage.app',
  cornerLabel,
  accent = 'rgba(174, 137, 255, 0.35)',
  aspectRatio = '3024 / 1668',
  style,
  className,
}: MockFrameProps) {
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        borderRadius: 'var(--radius-xl)',
        background: '#1e1a3c',
        border: `1px solid ${accent}`,
        boxShadow:
          '0 48px 120px rgba(140, 82, 255, 0.16), 0 16px 48px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Window chrome bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          borderBottom: '1px solid rgba(140, 82, 255, 0.18)',
          background: '#16142e',
          minWidth: 0,
        }}
      >
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#ff6f85',
              boxShadow: '0 0 8px rgba(253, 111, 133, 0.5)',
            }}
          />
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#ffde59',
              boxShadow: '0 0 8px rgba(255, 222, 89, 0.5)',
            }}
          />
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#8ce5a7',
              boxShadow: '0 0 8px rgba(140, 229, 167, 0.5)',
            }}
          />
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 14px',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(140, 82, 255, 0.18)',
              fontSize: 11,
              color: 'rgba(237, 233, 255, 0.6)',
              fontFamily: 'var(--font-brand)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              minWidth: 0,
              maxWidth: '100%',
              overflow: 'hidden',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 12, color: 'var(--primary)', flexShrink: 0 }}
            >
              auto_awesome
            </span>
            <span
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
              }}
            >
              {urlLabel}
            </span>
          </div>
        </div>

        {cornerLabel ? (
          <div
            style={{
              padding: '4px 10px',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(174, 137, 255, 0.14)',
              color: 'var(--primary)',
              fontSize: 10,
              fontFamily: 'var(--font-brand)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {cornerLabel}
          </div>
        ) : (
          <div style={{ width: 48, flexShrink: 0 }} />
        )}
      </div>

      {/* Inner canvas */}
      <div
        style={{
          position: 'relative',
          aspectRatio,
          width: '100%',
          background: '#181732',
        }}
      >
        {image ? (
          // Placeholder image — use native img so next/image config stays untouched
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
    </div>
  );
}
