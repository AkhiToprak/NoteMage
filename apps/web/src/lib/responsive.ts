import type { CSSProperties } from 'react';
import type { Breakpoint } from '@/hooks/useBreakpoint';

interface ResponsiveStyles {
  /** Base styles applied at all breakpoints */
  base: CSSProperties;
  /** Override styles for phone (0–767px) */
  phone?: CSSProperties;
  /** Override styles for tablet (768–1023px) */
  tablet?: CSSProperties;
  /** Override styles for desktop (1024px+) */
  desktop?: CSSProperties;
}

/**
 * Merges base styles with breakpoint-specific overrides.
 * Avoids messy ternaries in component inline styles.
 *
 * @example
 * const style = responsiveStyle(bp, {
 *   base: { padding: 32, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' },
 *   tablet: { gridTemplateColumns: 'repeat(2, 1fr)', padding: 20 },
 *   phone: { gridTemplateColumns: '1fr', padding: 16 },
 * });
 */
export function responsiveStyle(bp: Breakpoint, styles: ResponsiveStyles): CSSProperties {
  const { base, phone, tablet, desktop } = styles;

  switch (bp) {
    case 'phone':
      return { ...base, ...phone };
    case 'tablet':
      return { ...base, ...tablet };
    case 'desktop':
      return { ...base, ...desktop };
    default:
      return base;
  }
}

/**
 * Picks a value based on the current breakpoint.
 * Useful for single-value responsive logic.
 *
 * @example
 * const padding = responsiveValue(bp, { phone: 16, tablet: 20, desktop: 32 });
 * const cols = responsiveValue(bp, { phone: 1, tablet: 2, desktop: 3 });
 */
export function responsiveValue<T>(bp: Breakpoint, values: { phone: T; tablet: T; desktop: T }): T {
  return values[bp];
}
