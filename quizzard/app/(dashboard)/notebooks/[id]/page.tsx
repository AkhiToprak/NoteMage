'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useNotebookWorkspace } from '@/components/notebook/NotebookWorkspaceContext';
import CreateChatModal from '@/components/notebook/CreateChatModal';
import ExamCountdown from '@/components/features/ExamCountdown';
import ExamForm from '@/components/features/ExamForm';

interface ExamItem {
  id: string;
  title: string;
  examDate: string;
  notebookId: string;
  notebookName: string;
  studyPlan?: { id: string };
}

interface SectionRef {
  id: string;
  title: string;
  pages: { id: string; title: string }[];
  children?: SectionRef[];
  parentId?: string | null;
}

export default function NotebookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { notebook, flatSections, sectionsLoaded, refreshChats } = useNotebookWorkspace();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [notebookExams, setNotebookExams] = useState<ExamItem[]>([]);
  const [showExamForm, setShowExamForm] = useState(false);
  const skipRedirectRef = useRef(false);

  // Fetch exams
  useEffect(() => {
    fetch('/api/user/exams')
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? res;
        if (Array.isArray(d)) {
          setNotebookExams(d.filter((e: ExamItem) => e.notebookId === id));
        }
      })
      .catch(() => {});
  }, [id]);

  // Auto-open modal when ?new=1 is in URL (e.g. from "New chat" sidebar button)
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      skipRedirectRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowCreateModal(true);
      router.replace(`/notebooks/${id}`);
    }
  }, [searchParams, id, router]);

  // Redirect to last-opened page or first page
  useEffect(() => {
    if (!sectionsLoaded) return;
    if (skipRedirectRef.current) return; // don't redirect when create-chat modal is open

    const allPages = flatSections.flatMap(s => s.pages);
    if (allPages.length === 0) return; // render empty state below

    // Try last-opened page from localStorage
    try {
      const lastPageId = localStorage.getItem(`notebook-${id}-lastPage`);
      if (lastPageId && allPages.some(p => p.id === lastPageId)) {
        router.replace(`/notebooks/${id}/pages/${lastPageId}`);
        return;
      }
    } catch {}

    // Fallback: first page by sortOrder
    const sorted = [...flatSections].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const s of sorted) {
      const sp = [...s.pages].sort((a, b) => a.sortOrder - b.sortOrder);
      if (sp.length > 0) {
        router.replace(`/notebooks/${id}/pages/${sp[0].id}`);
        return;
      }
    }
  }, [flatSections, sectionsLoaded, id, router, searchParams]);

  const handleCreateExam = async (data: { title: string; examDate: string; notebookId: string }) => {
    const res = await fetch('/api/user/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setShowExamForm(false);
      fetch('/api/user/exams')
        .then((r) => r.json())
        .then((res) => {
          const d = res?.data ?? res;
          if (Array.isArray(d)) {
            setNotebookExams(d.filter((e: ExamItem) => e.notebookId === id));
          }
        })
        .catch(() => {});
    }
  };

  const handleGeneratePlan = async (examId: string) => {
    try {
      await fetch(`/api/user/exams/${examId}/generate-plan`, { method: 'POST' });
      fetch('/api/user/exams')
        .then((r) => r.json())
        .then((res) => {
          const d = res?.data ?? res;
          if (Array.isArray(d)) {
            setNotebookExams(d.filter((e: ExamItem) => e.notebookId === id));
          }
        })
        .catch(() => {});
    } catch { /* ignore */ }
  };

  const handleChatCreated = (chatId: string) => {
    setShowCreateModal(false);
    refreshChats();
    router.push(`/notebooks/${id}/chats/${chatId}`);
  };

  // Build section tree for modal
  const sectionTree: SectionRef[] = flatSections
    .filter(s => !s.parentId)
    .map(s => ({
      id: s.id,
      title: s.title,
      pages: s.pages,
      children: flatSections
        .filter(c => c.parentId === s.id)
        .map(c => ({ id: c.id, title: c.title, pages: c.pages })),
    }));

  const hasPages = sectionsLoaded && flatSections.some(s => s.pages.length > 0);

  return (
    <div style={{ flex: 1, overflowY: 'auto', height: '100%' }}>
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px' }}>
      {/* Header */}
      <header style={{ marginBottom: '48px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '24px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Breadcrumb chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {notebook?.color && (
                <span style={{
                  padding: '4px 12px',
                  background: 'rgba(174,137,255,0.2)',
                  color: '#cdb5ff',
                  borderRadius: '9999px',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '13px', fontVariationSettings: "'FILL' 1" }}>auto_fix_high</span>
                  Scholar
                </span>
              )}
            </div>

            {/* Notebook name */}
            <h2 style={{
              fontFamily: 'var(--font-brand)',
              fontSize: '52px',
              fontWeight: 400,
              color: '#e5e3ff',
              margin: 0,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
            }}>
              {notebook?.name ?? '…'}
            </h2>

            <p style={{ fontSize: '15px', color: '#8888a8', margin: 0, fontWeight: 500 }}>
              Feed the Scholar, review your vault, and start AI-powered chats.
            </p>
          </div>

          {/* Start Chat CTA */}
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: '#ffde59',
              color: '#5f4f00',
              padding: '16px 32px',
              borderRadius: '16px',
              fontWeight: 900,
              fontSize: '17px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(255,222,89,0.2)',
              transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
              flexShrink: 0,
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
            onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.95)'; }}
            onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)'; }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '22px', fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
            >
              auto_fix_high
            </span>
            Start Chat
          </button>
        </div>
      </header>

      {/* Empty state when no pages exist */}
      {sectionsLoaded && !hasPages && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '80px 24px',
          color: 'rgba(237,233,255,0.4)',
          fontSize: '15px',
          fontWeight: 500,
        }}>
          No files yet
        </div>
      )}

      {/* ── Exams section ── */}
      <div style={{ marginTop: '32px' }}>
        <div style={{
          background: 'linear-gradient(170deg, #1c1c30 0%, #1c1c38 60%)',
          borderRadius: '22px',
          padding: '26px',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), 0 24px 48px rgba(0,0,0,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#e5e3ff', margin: 0, letterSpacing: '-0.02em' }}>
                Exams
              </h3>
              <span style={{
                padding: '3px 8px', background: 'rgba(174,137,255,0.1)', color: '#ae89ff',
                fontSize: '10px', fontWeight: 900, borderRadius: '6px', letterSpacing: '0.06em',
                border: '1px solid rgba(174,137,255,0.15)',
              }}>
                {String(notebookExams.length).padStart(2, '0')} EXAMS
              </span>
            </div>
            <button
              onClick={() => setShowExamForm(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                background: 'rgba(174,137,255,0.12)',
                border: '1px solid rgba(174,137,255,0.2)',
                borderRadius: '10px',
                color: '#ae89ff',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1), transform 0.2s cubic-bezier(0.22,1,0.36,1)',
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
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
              Add Exam Date
            </button>
          </div>

          {notebookExams.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#aaa8c8' }}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '36px', display: 'block', marginBottom: '10px', opacity: 0.35 }}
              >
                event_note
              </span>
              <p style={{ fontSize: '14px', margin: '0 0 4px', color: '#aaa8c8' }}>
                No exams linked to this notebook.
              </p>
              <p style={{ fontSize: '12px', margin: 0, color: '#8888a8' }}>
                Add an exam date to get a personalized study plan.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: notebookExams.length === 1 ? '1fr' : 'repeat(2, 1fr)', gap: '16px' }}>
              {notebookExams.map((exam) => (
                <ExamCountdown
                  key={exam.id}
                  exam={exam}
                  onGeneratePlan={handleGeneratePlan}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Exam Form Modal */}
      {showExamForm && (
        <ExamForm
          notebooks={notebook ? [{ id, name: notebook.name }] : []}
          onSubmit={handleCreateExam}
          onClose={() => setShowExamForm(false)}
        />
      )}

      {/* Create chat modal */}
      {showCreateModal && (
        <CreateChatModal
          notebookId={id}
          notebookName={notebook?.name ?? ''}
          sections={sectionTree}
          documents={[]}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleChatCreated}
        />
      )}
    </div>
    </div>
  );
}
