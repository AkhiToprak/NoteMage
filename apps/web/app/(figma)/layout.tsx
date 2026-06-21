import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Figma Build · NoteMage',
  description: 'Isolated pixel-fidelity reproduction of the NoteMage Figma screens.',
  robots: { index: false, follow: false },
};

/**
 * Isolated layout for the `/figma` design-fidelity build.
 *
 * It nests inside the root layout (which owns <html>/<body>, the next/font
 * variables, Material Symbols, and Providers) and adds nothing else: no Sidebar,
 * no TopNav, no AppShell, no auth gate. The `[data-theme="dark"]` wrapper forces
 * the dark token set regardless of the user's theme preference — globals.css
 * binds the dark palette to `[data-theme='dark']` precisely so a nested island
 * like this re-establishes it even under a light document root.
 *
 * This route group is a sibling of `(dashboard)`/`(auth)`, so it inherits none
 * of their chrome or auth — isolation is structural.
 */
export default function FigmaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-theme="dark"
      style={{
        minHeight: '100dvh',
        background: 'var(--surface)',
        color: 'var(--on-surface)',
        // Reading order / line-height baseline for the gallery chrome; screens
        // set their own type.
        fontFamily: 'var(--font-sans)',
      }}
    >
      {children}
    </div>
  );
}
