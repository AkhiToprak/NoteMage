'use client';

import type { CSSProperties } from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';

export interface ModalDimensions {
  width: CSSProperties['width'];
  maxWidth: CSSProperties['maxWidth'];
  height: CSSProperties['height'];
  maxHeight: CSSProperties['maxHeight'];
  borderRadius: CSSProperties['borderRadius'];
}

/**
 * Shared phone-aware modal sizing. On phone a dialog becomes a full-bleed sheet
 * (100vw × 100dvh, square corners); on tablet/desktop it caps at `maxWidth`,
 * sizes to content, and never exceeds the viewport height (scrolls internally).
 *
 * This is the shared "gold standard" sizing every dialog uses instead of each
 * rolling its own fixed width. Modals are client-only and open on interaction,
 * so the SSR→'desktop' default of useBreakpoint() is irrelevant here.
 *
 * @param maxWidth desktop max width in px (default 480)
 * @param opts.fullScreenOnPhone when true (default), the dialog becomes a
 *   full-bleed sheet on phone. Set false for small confirm dialogs (title +
 *   message + buttons) that should stay centered and compact.
 *
 * @example
 * const dims = useModalDimensions(520);                          // content modal
 * const dims = useModalDimensions(360, { fullScreenOnPhone: false }); // confirm
 * <div style={{ ...dims, display: 'flex', flexDirection: 'column' }}>…</div>
 */
export function useModalDimensions(
  maxWidth = 480,
  opts?: { fullScreenOnPhone?: boolean }
): ModalDimensions {
  const { isPhone } = useBreakpoint();
  const fullScreen = opts?.fullScreenOnPhone ?? true;

  if (isPhone && fullScreen) {
    return {
      width: '100vw',
      maxWidth: 'none',
      height: '100dvh',
      maxHeight: '100dvh',
      borderRadius: 0,
    };
  }

  // Desktop, and phone for compact dialogs: centered, capped, never taller than
  // the viewport (content scrolls internally). On phone `calc(100% - 32px)`
  // keeps 16px gutters even when maxWidth is larger than the screen.
  return {
    width: 'calc(100% - 32px)',
    maxWidth,
    height: undefined,
    maxHeight: 'calc(100dvh - 32px)',
    borderRadius: 'var(--radius-xl)',
  };
}
