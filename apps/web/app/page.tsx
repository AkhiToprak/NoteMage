import type { Metadata } from 'next';
import PathLanding from '@/components/landing/PathLanding';

export const metadata: Metadata = {
  title: 'NoteMage: Your Path to academic success',
  description:
    'Turn your notes and study material into a guided learning path, with a personal AI tutor, flashcards, quizzes, and graded checkpoints. Free to start.',
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
    // The marketing page renders dark in both themes. Without this the landing inherits a
    // light-mode visitor's [data-theme='light'] tokens (near-black text) onto its dark
    // backdrop. The dark-island pattern re-establishes dark token values locally.
    <div
      className="nm-landing"
      data-theme="dark"
      style={{
        position: 'relative',
        isolation: 'isolate',
        background: '#0c0a1a',
        color: 'var(--on-surface)',
        colorScheme: 'dark',
        fontFamily: 'var(--font-sans)',
        minHeight: '100vh',
      }}
    >
      <PathLanding />
    </div>
  );
}
