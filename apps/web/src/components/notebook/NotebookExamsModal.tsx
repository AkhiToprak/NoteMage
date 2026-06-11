'use client';

import { useState, useEffect, useCallback } from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useModalDimensions } from '@/hooks/useModalDimensions';
import ExamCountdown from '@/components/features/ExamCountdown';
import ExamForm from '@/components/features/ExamForm';

interface ExamItem {
  id: string;
  title: string;
  examDate: string;
  notebookId: string;
  notebookName: string;
}

interface NotebookExamsModalProps {
  notebookId: string;
  notebookName: string;
  onClose: () => void;
}

/**
 * Per-notebook exams, opened on demand from the sidebar. Previously this lived
 * as an always-rendered panel on the notebook landing page, where it flashed
 * before the redirect-to-page fired. It's a modal now so it never appears
 * unless the user asks for it.
 */
export default function NotebookExamsModal({
  notebookId,
  notebookName,
  onClose,
}: NotebookExamsModalProps) {
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { isPhone } = useBreakpoint();
  const dims = useModalDimensions(560);

  const load = useCallback(() => {
    fetch('/api/user/exams')
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? res;
        if (Array.isArray(d)) {
          setExams(d.filter((e: ExamItem) => e.notebookId === notebookId));
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [notebookId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (data: { title: string; examDate: string; notebookId: string }) => {
    const res = await fetch('/api/user/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setShowForm(false);
      load();
    }
  };

  const handleDelete = async (examId: string) => {
    const res = await fetch(`/api/user/exams/${examId}`, { method: 'DELETE' });
    if (res.ok) setExams((prev) => prev.filter((e) => e.id !== examId));
  };

  return (
    <>
      <style>{`
        @keyframes nm-exams-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes nm-exams-rise {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes nm-exams-skel { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 990,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isPhone ? 0 : '24px',
          animation: 'nm-exams-fade 0.2s ease-out',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="custom-scrollbar"
          style={{
            ...dims,
            overflowY: 'auto',
            background: 'var(--background)',
            border: '1px solid rgba(174,137,255,0.36)',
            boxShadow: 'inset 0 1px 0 rgba(174,137,255,0.06), 0 24px 48px rgba(0,0,0,0.4)',
            animation: 'nm-exams-rise 0.3s cubic-bezier(0.22,1,0.36,1)',
            padding: '26px',
            paddingBottom: 'max(26px, env(safe-area-inset-bottom))',
            boxSizing: 'border-box',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3
                style={{
                  fontSize: '18px',
                  fontWeight: 800,
                  color: 'var(--on-surface)',
                  margin: 0,
                  letterSpacing: '-0.02em',
                }}
              >
                Exams
              </h3>
              <span
                style={{
                  padding: '3px 8px',
                  background: 'rgba(174,137,255,0.1)',
                  color: 'var(--accent-strong)',
                  fontSize: '10px',
                  fontWeight: 900,
                  borderRadius: '6px',
                  letterSpacing: '0.06em',
                  border: '1px solid rgba(174,137,255,0.15)',
                }}
              >
                {String(exams.length).padStart(2, '0')} EXAMS
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setShowForm(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  background: 'rgba(174,137,255,0.12)',
                  border: '1px solid rgba(174,137,255,0.2)',
                  borderRadius: '10px',
                  color: 'var(--accent-strong)',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition:
                    'background 0.2s cubic-bezier(0.22,1,0.36,1), transform 0.2s cubic-bezier(0.22,1,0.36,1)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(174,137,255,0.2)';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(174,137,255,0.12)';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                  add
                </span>
                Add Exam Date
              </button>
              <button
                onClick={onClose}
                aria-label="Close exams"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '34px',
                  height: '34px',
                  background: 'none',
                  border: 'none',
                  borderRadius: '10px',
                  color: 'var(--outline)',
                  cursor: 'pointer',
                  transition: 'color 0.15s ease, background 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = '#e5e3ff';
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--outline)';
                  (e.currentTarget as HTMLButtonElement).style.background = 'none';
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                  close
                </span>
              </button>
            </div>
          </div>

          {/* Body */}
          {!loaded ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[0, 1].map((i) => (
                <div
                  key={i}
                  style={{
                    height: '116px',
                    borderRadius: '16px',
                    background: 'var(--surface-container-high)',
                    animation: 'nm-exams-skel 1.5s ease-in-out infinite',
                    animationDelay: `${i * 0.13}s`,
                  }}
                />
              ))}
            </div>
          ) : exams.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '32px 0',
                color: 'var(--on-surface-variant)',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '36px', display: 'block', marginBottom: '10px', opacity: 0.35 }}
              >
                event_note
              </span>
              <p style={{ fontSize: '14px', margin: '0 0 4px', color: 'var(--on-surface-variant)' }}>
                No exams linked to this notebook.
              </p>
              <p style={{ fontSize: '12px', margin: 0, color: 'var(--outline)' }}>
                Add an exam date to track the countdown.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {exams.map((exam) => (
                <ExamCountdown key={exam.id} exam={exam} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <ExamForm
          notebooks={[{ id: notebookId, name: notebookName }]}
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
        />
      )}
    </>
  );
}
