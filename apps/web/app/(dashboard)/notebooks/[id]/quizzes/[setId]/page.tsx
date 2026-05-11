'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import QuizViewer from '@/components/notebook/QuizViewer';
import type { QuestionKind } from '@notemage/shared';

interface QuizSetData {
  id: string;
  notebookId: string;
  chatId: string;
  title: string;
  sectionId: string | null;
  // Phase 5: present when the page was opened via `?material=<id>` (a Learn
  // Path lesson node). isCheckpoint=true makes QuizViewer fire the graduation
  // overlay on a pass.
  isCheckpoint?: boolean;
  materialId?: string | null;
  questions: {
    id: string;
    kind: QuestionKind;
    payload: unknown;
    question: string;
    options: string[];
    correctIndex: number;
    hint: string | null;
    correctExplanation: string | null;
    wrongExplanation: string | null;
    sortOrder: number;
  }[];
}

export default function QuizViewerPage({
  params,
}: {
  params: Promise<{ id: string; setId: string }>;
}) {
  const { id: notebookId, setId } = use(params);
  const router = useRouter();
  const [data, setData] = useState<QuizSetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSet() {
      try {
        // Phase 5: ?material= is read off window.location.search rather than
        // useSearchParams() to keep the page out of the static-bailout
        // window during build (see memory: useSearchParams breaks prerender).
        const materialId =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('material')
            : null;
        const url = materialId
          ? `/api/notebooks/${notebookId}/quiz-sets/${setId}?material=${encodeURIComponent(materialId)}`
          : `/api/notebooks/${notebookId}/quiz-sets/${setId}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.success && json.data) {
          setData(json.data);
        } else {
          setError(json.error === 'locked' ? 'This lesson is locked.' : json.error || 'Quiz set not found');
        }
      } catch {
        setError('Failed to load quiz set');
      } finally {
        setLoading(false);
      }
    }
    fetchSet();
  }, [notebookId, setId]);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--ink-30)',
          fontFamily: 'inherit',
        }}
      >
        Loading quiz...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '12px',
          fontFamily: 'inherit',
        }}
      >
        <p style={{ color: 'rgba(252,165,165,0.8)', fontSize: '14px' }}>{error}</p>
        <button
          onClick={() => router.back()}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: '1px solid rgba(140,82,255,0.3)',
            background: 'transparent',
            color: '#c4a9ff',
            fontSize: '13px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <QuizViewer
      notebookId={notebookId}
      setId={setId}
      title={data.title}
      initialQuestions={data.questions}
      assignedSectionId={data.sectionId}
      isCheckpoint={data.isCheckpoint ?? false}
      materialId={data.materialId ?? null}
    />
  );
}
