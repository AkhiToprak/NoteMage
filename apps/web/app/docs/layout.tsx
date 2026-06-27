import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Docs · Notemage',
  description:
    'How to use Notemage — study packs, Mage Chat, flashcards, quizzes, learning paths, presentations, and more.',
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    // Light cream island — matches the redesigned landing/pricing/about surface.
    <div
      className="nm-landing"
      data-theme="light"
      style={{
        position: 'relative',
        isolation: 'isolate',
        background: '#faf7f0',
        color: '#18202f',
        colorScheme: 'light',
        fontFamily: 'var(--font-inter), var(--font-sans)',
        minHeight: '100vh',
      }}
    >
      {children}
    </div>
  );
}
