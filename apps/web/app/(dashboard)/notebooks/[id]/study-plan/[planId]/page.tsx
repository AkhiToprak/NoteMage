'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import StudyPlanView from '@/components/notebook/StudyPlanView';

interface StudyPlanPageData {
  id: string;
  notebookId: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  source: string;
  phases: {
    id: string;
    planId: string;
    title: string;
    description: string | null;
    sortOrder: number;
    startDate: string;
    endDate: string;
    status: string;
    materials: {
      id: string;
      type: string;
      referenceId: string;
      title: string;
      completed: boolean;
      sortOrder: number;
    }[];
  }[];
}

export default function StudyPlanPage({
  params,
}: {
  params: Promise<{ id: string; planId: string }>;
}) {
  const { id: notebookId, planId } = use(params);
  const router = useRouter();
  const [data, setData] = useState<StudyPlanPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPlan() {
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/study-plans/${planId}`);
        const json = await res.json();
        if (json.success && json.data) {
          setData(json.data);
        } else {
          setError(json.error || 'Study plan not found');
        }
      } catch {
        setError('Failed to load study plan');
      } finally {
        setLoading(false);
      }
    }
    fetchPlan();
  }, [notebookId, planId]);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'rgba(237,233,255,0.3)',
          fontFamily: 'inherit',
        }}
      >
        Loading study plan...
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

  return <StudyPlanView notebookId={notebookId} planId={planId} initialData={data} />;
}
