'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import FlashcardViewer from '@/components/notebook/FlashcardViewer';

interface FlashcardSetData {
  id: string;
  notebookId: string;
  chatId: string;
  title: string;
  sectionId: string | null;
  flashcards: {
    id: string;
    question: string;
    answer: string;
    sortOrder: number;
  }[];
}

export default function FlashcardViewerPage({ params }: { params: Promise<{ id: string; setId: string }> }) {
  const { id: notebookId, setId } = use(params);
  const router = useRouter();
  const [data, setData] = useState<FlashcardSetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSet() {
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/flashcard-sets/${setId}`);
        const json = await res.json();
        if (json.success && json.data) {
          setData(json.data);
        } else {
          setError(json.error || 'Flashcard set not found');
        }
      } catch {
        setError('Failed to load flashcard set');
      } finally {
        setLoading(false);
      }
    }
    fetchSet();
  }, [notebookId, setId]);

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: 'rgba(237,233,255,0.3)',
        fontFamily: 'inherit',
      }}>
        Loading flashcards...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', gap: '12px',
        fontFamily: 'inherit',
      }}>
        <p style={{ color: 'rgba(252,165,165,0.8)', fontSize: '14px' }}>{error}</p>
        <button
          onClick={() => router.back()}
          style={{
            padding: '8px 16px', borderRadius: '8px',
            border: '1px solid rgba(140,82,255,0.3)',
            background: 'transparent', color: '#c4a9ff',
            fontSize: '13px', cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <FlashcardViewer
      notebookId={notebookId}
      setId={setId}
      title={data.title}
      initialCards={data.flashcards}
      assignedSectionId={data.sectionId}
    />
  );
}
