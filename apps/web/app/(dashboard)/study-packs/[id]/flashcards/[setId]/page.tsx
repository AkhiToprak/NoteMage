'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CheckpointFlashcardViewer from '@/components/learn/CheckpointFlashcardViewer';
import { Button } from '@/components/ui/Button';
import { Mascot } from '@/components/mascot/Mascot';
import { useRegisterMageContext } from '@/components/mage';

// Standalone flashcard player for a Study Pack set. Reuses the path checkpoint
// flashcard deck (CheckpointFlashcardViewer) in `standalone` mode — no path
// slot/activity, no completion tracking. Fed by the set-by-id endpoint.

interface FlashcardImage {
  id: string;
  side: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  caption?: string | null;
  sortOrder: number;
}

interface Flashcard {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  images?: FlashcardImage[];
}

interface FlashcardSet {
  id: string;
  title: string;
  flashcards: Flashcard[];
}

export default function StudyPackFlashcardSetPage({
  params,
}: {
  params: Promise<{ id: string; setId: string }>;
}) {
  const { id, setId } = use(params);
  const router = useRouter();
  const [set, setSet] = useState<FlashcardSet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/notebooks/${encodeURIComponent(id)}/flashcard-sets/${encodeURIComponent(setId)}`,
    )
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.success && json.data) setSet(json.data as FlashcardSet);
        else setError(json?.error ?? 'Could not load this set.');
      })
      .catch(() => {
        if (!cancelled) setError('Network error. Try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [id, setId]);

  const close = () => router.push(`/study-packs/${id}/flashcards`);

  // Studying this pack's cards → "material" context (pack outline grounding +
  // material-flavoured chips). Registered before the early returns so the hook
  // order stays stable.
  useRegisterMageContext({ type: 'material', ids: { notebookId: id }, title: set?.title });

  if (error) {
    return (
      <FullScreenMessage>
        <Mascot pose="shrug" size="md" />
        <h2 style={msgTitle}>Couldn&apos;t load flashcards</h2>
        <p style={msgBody}>{error}</p>
        <Button onClick={close} variant="secondary" shape="pill" leadingIcon="arrow_back">
          Back
        </Button>
      </FullScreenMessage>
    );
  }

  if (!set) {
    return (
      <FullScreenMessage>
        <Mascot pose="holding-scroll" size="md" idle="float" />
        <p style={msgBody}>Loading flashcards…</p>
      </FullScreenMessage>
    );
  }

  return (
    <CheckpointFlashcardViewer
      standalone={{ title: set.title, cards: set.flashcards }}
      onClose={close}
    />
  );
}

function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-4, 16px)',
        padding: 24,
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  );
}

const msgTitle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--fs-xl)',
  fontWeight: 700,
  color: 'var(--on-surface)',
  margin: 0,
};

const msgBody: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--fs-sm)',
  color: 'var(--on-surface-variant)',
  margin: 0,
};
