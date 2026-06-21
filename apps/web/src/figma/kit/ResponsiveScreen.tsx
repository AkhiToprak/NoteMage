'use client';

import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import type { ScreenLoader } from '../registry';
import { useIsDesktop } from './useIsDesktop';
import { useMounted } from './useMounted';

/**
 * Module-level cache so each registry loader maps to ONE lazy component for the
 * lifetime of the page. Resolving here (not in render) keeps state stable across
 * re-renders and satisfies react-hooks/static-components (no component is created
 * during render — render only does a Map lookup).
 */
const lazyCache = new Map<ScreenLoader, LazyExoticComponent<ComponentType>>();

function resolveLazy(loader: ScreenLoader): LazyExoticComponent<ComponentType> {
  let cmp = lazyCache.get(loader);
  if (!cmp) {
    cmp = lazy(loader);
    lazyCache.set(loader, cmp);
  }
  return cmp;
}

export interface ResponsiveScreenProps {
  /** Lazy loader for the mobile (393) build. */
  mobile?: ScreenLoader;
  /** Lazy loader for the web (1440) build. */
  web?: ScreenLoader;
  /**
   * Force a specific size regardless of viewport — used by the gallery's
   * device-frame comparison views (phone shell forces 'mobile', desktop shell
   * forces 'web'). When unset, the size follows the viewport breakpoint.
   */
  force?: 'mobile' | 'web';
}

/**
 * Renders the web build at ≥1024px and the mobile build below — only ONE tree
 * is ever mounted. Single-size screens (mobile-only empty states, web-only
 * marketing) render their one build at all widths.
 *
 * On the responsive (non-forced) view the first paint is gated on `useMounted`
 * so the breakpoint is known before a size is committed (no wrong-size flash).
 */
export function ResponsiveScreen({ mobile, web, force }: ResponsiveScreenProps) {
  const isDesktop = useIsDesktop();
  const mounted = useMounted();

  const wanted: 'mobile' | 'web' = force ?? (isDesktop ? 'web' : 'mobile');
  // Fall back to whichever single size exists if the wanted one isn't built.
  const loader: ScreenLoader | undefined =
    wanted === 'web' ? (web ?? mobile) : (mobile ?? web);

  // Avoid a wrong-size flash on the responsive view: hold the skeleton until the
  // client breakpoint is resolved. Forced views (device frames) skip the gate.
  if (!force && !mounted) return <ScreenSkeleton />;
  if (!loader) return <NotBuilt wanted={wanted} />;

  // `resolveLazy` returns a module-cached lazy component keyed by the stable
  // registry loader reference, so the same component instance is reused across
  // renders (state-stable). The static-components rule can't see through the
  // cache and treats it as created-during-render — a false positive here.
  const Cmp = resolveLazy(loader);
  return (
    <Suspense fallback={<ScreenSkeleton />}>
      {/* eslint-disable-next-line react-hooks/static-components */}
      <Cmp />
    </Suspense>
  );
}

function ScreenSkeleton() {
  return (
    <div
      aria-hidden
      style={{
        width: '100%',
        minHeight: 240,
        display: 'grid',
        placeItems: 'center',
        color: 'var(--ink-40)',
        fontSize: 'var(--fs-sm)',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 28, opacity: 0.5 }}>
        hourglass_empty
      </span>
    </div>
  );
}

function NotBuilt({ wanted }: { wanted: 'mobile' | 'web' }) {
  return (
    <div
      style={{
        width: '100%',
        minHeight: 320,
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--space-8)',
        textAlign: 'center',
        color: 'var(--ink-50)',
      }}
    >
      <div style={{ display: 'grid', gap: 'var(--space-2)', justifyItems: 'center' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 40, opacity: 0.6 }}>
          draft
        </span>
        <strong style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>
          Not built yet
        </strong>
        <span style={{ fontSize: 'var(--fs-sm)' }}>
          No {wanted} build registered for this screen.
        </span>
      </div>
    </div>
  );
}
