'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared card surface (audit item 1). Wraps the 3-tier elevation system from
 * globals.css (.elev-1 base / .elev-2 raised) so cards stop re-inlining bespoke
 * backgrounds, borders and shadows. The elevation classes own bg + hairline +
 * (for elev-2) the inset top-highlight, and theme-flip via the --ink-* tiers.
 *
 *  - elevation=1     base card (page → card step).
 *  - elevation=2     raised / floating (cards that sit above other cards).
 *  - interactive     adds the hover lift + pointer (clickable cards).
 *  - spine="<color>" left accent bar; pads the left edge to --card-pad-spine.
 *  - padding         overrides the default --card-pad (pass false to opt out).
 */
export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  elevation?: 1 | 2;
  interactive?: boolean;
  spine?: string | null;
  padding?: string | number | false;
  as?: React.ElementType;
}

export const Card = React.forwardRef<HTMLElement, CardProps>(function Card(
  {
    elevation = 1,
    interactive = false,
    spine = null,
    padding,
    as: Tag = 'div',
    className,
    style,
    children,
    ...rest
  },
  ref
) {
  const pad = padding === false ? undefined : (padding ?? 'var(--card-pad)');
  return (
    <Tag
      ref={ref}
      className={cn(
        elevation === 2 ? 'elev-2' : 'elev-1',
        interactive && 'elev-interactive',
        className
      )}
      style={{
        position: spine ? 'relative' : undefined,
        overflow: spine ? 'hidden' : undefined,
        padding: pad,
        paddingLeft: spine ? 'var(--card-pad-spine)' : undefined,
        cursor: interactive ? 'pointer' : undefined,
        ...style,
      }}
      {...rest}
    >
      {spine ? (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 6,
            background: spine,
          }}
        />
      ) : null}
      {children}
    </Tag>
  );
});
