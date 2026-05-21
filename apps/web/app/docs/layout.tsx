import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Docs · Notemage',
  description:
    'How to use Notemage — notebooks, infinite canvas, Mage Chat, flashcards, quizzes, presentations, cowork, and more.',
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: '#0c0a1a',
        color: 'var(--on-surface)',
        minHeight: '100vh',
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      {/* Subtle purple atmosphere — soft accent on top of the black base */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          background: 'rgba(174,137,255,0.05)',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          opacity: 0.35,
          mixBlendMode: 'overlay',
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.68  0 0 0 0 0.54  0 0 0 0 1  0 0 0 0.05 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
        }}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );
}
