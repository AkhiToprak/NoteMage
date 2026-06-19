'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import QuizViewer from '@/components/notebook/QuizViewer';
import { Button } from '@/components/ui/Button';
import { Mascot } from '@/components/mascot/Mascot';
import { useRegisterMageContext } from '@/components/mage';

// Standalone quiz player for a Study Pack set. Reuses the shared QuizViewer
// engine (the same one the path checkpoint quiz wraps) inside a clean
// full-screen shell — no notebook workspace chrome. `hideManagementActions`
// strips the edit/export/delete UI (and its dead /notebooks redirect).

interface QuizSet {
  id: string;
  title: string;
  questions: unknown[];
}

export default function StudyPackQuizSetPage({
  params,
}: {
  params: Promise<{ id: string; setId: string }>;
}) {
  const { id, setId } = use(params);
  const router = useRouter();
  const [set, setSet] = useState<QuizSet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/notebooks/${encodeURIComponent(id)}/quiz-sets/${encodeURIComponent(setId)}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.success && json.data) setSet(json.data as QuizSet);
        else setError(json?.error ?? 'Could not load this quiz.');
      })
      .catch(() => {
        if (!cancelled) setError('Network error. Try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [id, setId]);

  const close = () => router.push(`/study-packs/${id}/quizzes`);

  // Mid-quiz: hints-first policy + a quiz-aware chip set. The server grounds on
  // the quiz title/count only (never the answers) so Mage can coach without
  // spoiling it. The reveal gate hardens this server-side in Phase 8.
  useRegisterMageContext(
    set ? { type: 'quiz-question', ids: { notebookId: id, quizSetId: setId }, title: set.title } : null
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${set?.title ?? 'Quiz'} quiz`}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--surface)',
        color: 'var(--on-surface)',
        zIndex: 1300,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderBottom: '1px solid var(--outline-variant)',
          background: 'var(--surface-container-low)',
        }}
      >
        <h2
          style={{
            flex: 1,
            minWidth: 0,
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: '18px',
            fontWeight: 800,
            color: 'var(--on-surface)',
            letterSpacing: '-0.01em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {set?.title ?? 'Quiz'}
        </h2>
        <button
          type="button"
          onClick={close}
          aria-label="Close quiz"
          style={{
            width: 44,
            height: 44,
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--outline-variant)',
            background: 'transparent',
            color: 'var(--on-surface)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
            close
          </span>
        </button>
      </header>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            maxWidth: 720,
            width: '100%',
            margin: '0 auto',
            flex: 1,
            minHeight: 0,
            padding: 'clamp(16px, 3vh, 24px) 20px 0',
          }}
        >
          {error ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 16,
                padding: '48px 8px',
                textAlign: 'center',
              }}
            >
              <Mascot pose="shrug" size="md" />
              <p style={{ color: 'var(--error)', fontSize: 14, margin: 0 }}>{error}</p>
              <Button onClick={close} variant="secondary" shape="pill" leadingIcon="arrow_back">
                Back
              </Button>
            </div>
          ) : !set ? (
            <p style={{ color: 'var(--on-surface-variant)', fontSize: 14 }}>Loading quiz…</p>
          ) : (
            <QuizViewer
              notebookId={id}
              setId={setId}
              title={set.title}
              initialQuestions={set.questions as never}
              hideManagementActions
            />
          )}
        </div>
      </div>
    </div>
  );
}
