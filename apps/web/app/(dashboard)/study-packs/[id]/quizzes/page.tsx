'use client';

import { use, useEffect, useState } from 'react';
import {
  SetListShell,
  SetRow,
  SetListEmpty,
  setListLoadingStyle,
} from '@/components/study-packs/SetList';

interface QuizSetRow {
  id: string;
  title: string;
  _count: { questions: number };
}

export default function StudyPackQuizzesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [sets, setSets] = useState<QuizSetRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/notebooks/${encodeURIComponent(id)}/quiz-sets`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setSets(json?.success ? (json.data as QuizSetRow[]) : []);
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
      accent="var(--nm-quiz)"
      icon="quiz"
      title="Quizzes"
      subtitle="Test your knowledge with AI-generated questions"
    >
      {sets === null ? (
        <p style={setListLoadingStyle}>Loading quizzes…</p>
      ) : sets.length === 0 ? (
        <SetListEmpty
          message="No quizzes yet. Generate some from your material to test yourself."
          packId={id}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3, 12px)' }}>
          {sets.map((s) => (
            <SetRow
              key={s.id}
              href={`/study-packs/${id}/quizzes/${s.id}`}
              icon="quiz"
              accent="var(--nm-quiz)"
              title={s.title}
              meta={`${s._count.questions} question${s._count.questions === 1 ? '' : 's'}`}
              cta="Practice"
            />
          ))}
        </div>
      )}
    </SetListShell>
  );
}
