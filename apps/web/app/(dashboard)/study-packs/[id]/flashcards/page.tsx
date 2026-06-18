'use client';

import { use, useEffect, useState } from 'react';
import {
  SetListShell,
  SetRow,
  SetListEmpty,
  setListLoadingStyle,
} from '@/components/study-packs/SetList';

interface FlashcardSetRow {
  id: string;
  title: string;
  _count: { flashcards: number };
}

export default function StudyPackFlashcardsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [sets, setSets] = useState<FlashcardSetRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/notebooks/${encodeURIComponent(id)}/flashcard-sets`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setSets(json?.success ? (json.data as FlashcardSetRow[]) : []);
      })
      .catch(() => {
        if (!cancelled) setSets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <SetListShell
      packId={id}
      accent="var(--nm-review)"
      icon="style"
      title="Flashcards"
      subtitle="Spaced repetition for this pack"
    >
      {sets === null ? (
        <p style={setListLoadingStyle}>Loading flashcards…</p>
      ) : sets.length === 0 ? (
        <SetListEmpty
          message="No flashcards yet. Generate some from your material to start studying."
          packId={id}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3, 12px)' }}>
          {sets.map((s) => (
            <SetRow
              key={s.id}
              href={`/study-packs/${id}/flashcards/${s.id}`}
              icon="style"
              accent="var(--nm-review)"
              title={s.title}
              meta={`${s._count.flashcards} card${s._count.flashcards === 1 ? '' : 's'}`}
              cta="Study"
            />
          ))}
        </div>
      )}
    </SetListShell>
  );
}
