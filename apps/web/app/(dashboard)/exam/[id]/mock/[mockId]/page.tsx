'use client';

/* Exam Mode Phase 3 — the timed mock-exam run route (immersive sealed player).
 * Loads the mock detail, then hands the sealed set + duration to MockExamRunner.
 * Already-completed mocks bounce straight to their results. No AppShell wrapper —
 * MockExamRunner is itself a fixed-inset overlay (QuizPlayerShell). */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import MockExamRunner from '@/components/quiz/player/MockExamRunner';
import ui from '@/components/app/ui.module.css';

interface MockDetail {
  mock: { id: string; status: string; config: { durationSec: number } };
  exam: { id: string; title: string };
  run: { notebookId: string; setId: string; title: string; questionCount: number };
}

export default function MockRunPage() {
  const params = useParams();
  const router = useRouter();
  const examId = Array.isArray(params?.id) ? params.id[0] : (params?.id ?? '');
  const mockId = Array.isArray(params?.mockId) ? params.mockId[0] : (params?.mockId ?? '');

  const [detail, setDetail] = useState<MockDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');

  useEffect(() => {
    if (!examId || !mockId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/user/exams/${examId}/mock/${mockId}`);
        if (res.status === 404) {
          if (!cancelled) setStatus('notfound');
          return;
        }
        if (!res.ok) {
          if (!cancelled) setStatus('error');
          return;
        }
        const body = await res.json();
        const d = body.data as MockDetail;
        if (cancelled) return;
        // Already graded → straight to the results screen.
        if (d.mock.status === 'completed') {
          router.replace(`/exam/${examId}/mock/${mockId}/results`);
          return;
        }
        if (!d.run.notebookId || !d.run.setId) {
          setStatus('error');
          return;
        }
        setDetail(d);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId, mockId, router]);

  if (status === 'ready' && detail) {
    return (
      <MockExamRunner
        examId={examId}
        mockId={mockId}
        notebookId={detail.run.notebookId}
        setId={detail.run.setId}
        durationSec={detail.mock.config.durationSec}
        title={detail.exam.title}
      />
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: 'clamp(16px, 4vw, 48px)',
        textAlign: 'center',
        background: 'var(--quiz-bg, #faf7f0)',
      }}
    >
      {status === 'loading' ? (
        <>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 38, color: 'var(--muted, #8a7f6f)' }}>
            hourglass_empty
          </span>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--body, #6b6256)' }}>Loading your mock exam…</p>
        </>
      ) : (
        <>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 40, color: 'var(--muted, #8a7f6f)' }}>
            {status === 'notfound' ? 'event_busy' : 'error'}
          </span>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--ink, #2a2018)' }}>
            {status === 'notfound' ? 'Mock exam not found' : 'Couldn’t load this mock exam'}
          </h1>
          <Link href={`/exam/${examId}`} className={`${ui.btn} ${ui.secondary}`}>
            Back to exam
          </Link>
        </>
      )}
    </div>
  );
}
