import type { Metadata } from 'next';
import PathLanding from '@/components/landing/PathLanding';

export const metadata: Metadata = {
  title: 'NoteMage: Your Path to academic success',
  description:
    'Turn your notes and study material into a guided learning path, with a personal AI tutor, flashcards, quizzes, and graded checkpoints. Free for 7 days — no card.',
  openGraph: {
    title: 'NoteMage: Your Path to academic success',
    description:
      'Turn your notes and study material into a guided learning path, with a personal AI tutor, flashcards, quizzes, and graded checkpoints.',
    type: 'website',
    siteName: 'NoteMage',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NoteMage: Your Path to academic success',
    description:
      'Turn your notes and study material into a guided learning path, with a personal AI tutor, flashcards, quizzes, and graded checkpoints.',
  },
};

export default function LandingPage() {
  return (
    // The redesigned marketing landing renders LIGHT (warm cream) in both themes. The
    // light-island pattern pins local light tokens + colorScheme so a dark-theme visitor's
    // [data-theme='dark'] tokens never bleed onto the cream surface (and so native form
    // controls / scrollbars render light). PathLanding's scoped CSS carries its own palette.
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
      <PathLanding />
    </div>
  );
}
