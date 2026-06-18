'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { NMCard } from '@/components/rework/NMCard';
import { SectionHeading } from '@/components/rework/SectionHeading';
import { ProgressBar } from '@/components/rework/ProgressBar';
import { RTabs } from '@/components/rework/RTabs';
import { Button } from '@/components/ui/Button';
import { Mascot } from '@/components/mascot/Mascot';

interface NotebookData {
  id: string;
  name: string;
  subject: string | null;
  color: string | null;
  updatedAt: string;
  documents?: Array<{ id: string; filename?: string; name?: string }>;
  _count: { documents: number; pages?: number };
}

type Tab = 'path' | 'practice' | 'material' | 'mage' | 'progress';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'path', label: 'Path', icon: 'route' },
  { id: 'practice', label: 'Practice', icon: 'style' },
  { id: 'material', label: 'Material', icon: 'folder_open' },
  { id: 'mage', label: 'Mage', icon: 'auto_awesome' },
  { id: 'progress', label: 'Progress', icon: 'bar_chart' },
];

function TabPanel({ tab, notebook }: { tab: Tab; notebook: NotebookData }) {
  const id = notebook.id;

  switch (tab) {
    case 'path':
      return (
        <NMCard style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4, 16px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--nm-lesson)' }}>
              route
            </span>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>
              Your Learning Path
            </h3>
          </div>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.65 }}>
            Your personalized path for this pack — checkpoints, lessons, and boss tests tailored to your material.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-3, 12px)', flexWrap: 'wrap' }}>
            <Button href={`/study-packs/new?packId=${id}`} variant="primary" shape="pill" leadingIcon="add">
              Create path
            </Button>
            <Button href="/my-path" variant="secondary" shape="pill" trailingIcon="arrow_forward">
              Open path
            </Button>
          </div>
        </NMCard>
      );

    case 'practice':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4, 16px)' }}>
          <NMCard
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4, 16px)' }}
          >
            <span
              aria-hidden
              style={{
                width: 48,
                height: 48,
                borderRadius: 'var(--radius-md)',
                background: 'var(--nm-review-soft, rgba(174,137,255,0.12))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--nm-review)' }}>
                style
              </span>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h4 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--on-surface)', margin: '0 0 4px' }}>
                Flashcards
              </h4>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)', margin: 0 }}>
                Spaced repetition for this pack
              </p>
            </div>
            <Button href={`/notebooks/${id}/flashcards`} variant="secondary" shape="pill" size="sm" trailingIcon="arrow_forward" style={{ flexShrink: 0 }}>
              Study
            </Button>
          </NMCard>

          <NMCard
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4, 16px)' }}
          >
            <span
              aria-hidden
              style={{
                width: 48,
                height: 48,
                borderRadius: 'var(--radius-md)',
                background: 'var(--nm-quiz-soft, rgba(255,183,77,0.12))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--nm-quiz)' }}>
                quiz
              </span>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h4 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--on-surface)', margin: '0 0 4px' }}>
                Quizzes
              </h4>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)', margin: 0 }}>
                Test your knowledge with AI-generated questions
              </p>
            </div>
            <Button href={`/notebooks/${id}/quizzes`} variant="secondary" shape="pill" size="sm" trailingIcon="arrow_forward" style={{ flexShrink: 0 }}>
              Practice
            </Button>
          </NMCard>
        </div>
      );

    case 'material':
      return (
        <NMCard style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4, 16px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--on-surface-variant)' }}>
              folder_open
            </span>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>
              Source Material
            </h3>
          </div>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.65 }}>
            Open the notebook workspace to view pages, documents, and annotations.
          </p>
          <Button href={`/notebooks/${id}`} variant="primary" shape="pill" leadingIcon="folder_open" style={{ alignSelf: 'flex-start' }}>
            Open material
          </Button>
        </NMCard>
      );

    case 'mage':
      return (
        <NMCard style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4, 16px)', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--accent-strong)' }}>
              auto_awesome
            </span>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>
              Ask Mage
            </h3>
          </div>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.65 }}>
            Chat with Mage about anything in this pack — get explanations, summaries, and deeper dives into difficult topics.
          </p>
          <Button href="/learn/chats" variant="primary" shape="pill" leadingIcon="auto_awesome">
            Ask Mage about this pack
          </Button>
        </NMCard>
      );

    case 'progress':
      return (
        <NMCard style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5, 20px)', alignItems: 'center', padding: 'var(--space-8, 32px)', textAlign: 'center' }}>
          <Mascot pose="holding-scroll" size="md" idle="float" />
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>
            No progress data yet
          </h3>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.65, maxWidth: 320 }}>
            Start a lesson to unlock progress for this pack.
          </p>
          <Button href="/my-path" variant="primary" shape="pill" trailingIcon="arrow_forward">
            Start learning
          </Button>
        </NMCard>
      );

    default:
      return null;
  }
}

export default function StudyPackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [notebook, setNotebook] = useState<NotebookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('path');

  useEffect(() => {
    fetch('/api/notebooks?folderId=all')
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const found = (json.data as NotebookData[]).find((nb) => nb.id === id);
          if (found) {
            setNotebook(found);
          } else {
            setNotFound(true);
          }
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  const accentColor = notebook?.color ?? 'var(--accent-strong)';

  return (
    <>
      <style>{`
        @keyframes sp-fadein {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        className="nm-rework"
        style={{
          maxWidth: 'var(--nm-page-max)',
          margin: '0 auto',
          padding: 'clamp(16px,4vw,32px)',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4, 16px)' }}>
            <div style={{ height: 32, width: '40%', background: 'var(--surface-container)', borderRadius: 8, animation: 'sp-fadein 0.8s ease infinite alternate' }} />
            <div style={{ height: 20, width: '60%', background: 'var(--surface-container)', borderRadius: 6, opacity: 0.6 }} />
          </div>
        )}

        {/* Not found */}
        {!loading && notFound && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 64 }}>
            <NMCard style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4, 16px)', padding: 'var(--space-8, 32px)', maxWidth: 400, textAlign: 'center' }}>
              <Mascot pose="shrug" size="md" />
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>
                Study Pack not found
              </h2>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)', margin: 0 }}>
                This pack may have been deleted or you don&apos;t have access.
              </p>
              <Button href="/study-packs" variant="secondary" shape="pill" leadingIcon="arrow_back">
                Back to Study Packs
              </Button>
            </NMCard>
          </div>
        )}

        {/* Main content */}
        {!loading && notebook && (
          <div style={{ animation: 'sp-fadein 0.25s cubic-bezier(0.22,1,0.36,1)' }}>
            {/* Back link */}
            <Link
              href="/study-packs"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--fs-sm)',
                color: 'var(--on-surface-variant)',
                textDecoration: 'none',
                marginBottom: 'var(--space-5, 20px)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 0',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--on-surface)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--on-surface-variant)'; }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
              Study Packs
            </Link>

            {/* Header */}
            <div
              style={{
                marginBottom: 'var(--space-8, 32px)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--space-4, 16px)',
                flexWrap: 'wrap',
              }}
            >
              {/* Accent dot */}
              <span
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: accentColor,
                  flexShrink: 0,
                  marginTop: 8,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'clamp(22px, 3vw, 32px)',
                    fontWeight: 700,
                    color: 'var(--on-surface)',
                    margin: '0 0 6px',
                    letterSpacing: '-0.02em',
                    lineHeight: 1.2,
                  }}
                >
                  {notebook.name}
                </h1>
                {notebook.subject && (
                  <p
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 'var(--fs-sm)',
                      color: 'var(--on-surface-variant)',
                      margin: 0,
                    }}
                  >
                    {notebook.subject}
                  </p>
                )}
              </div>
            </div>

            {/* Tab strip */}
            <div style={{ marginBottom: 'var(--space-6, 24px)', overflowX: 'auto', scrollbarWidth: 'none' }}>
              <RTabs
                tabs={[
                  { key: 'path', label: 'Path' },
                  { key: 'practice', label: 'Practice' },
                  { key: 'material', label: 'Material' },
                  { key: 'mage', label: 'Mage' },
                  { key: 'progress', label: 'Progress' },
                ]}
                activeKey={activeTab}
                onChange={(k) => setActiveTab(k as Tab)}
                ariaLabel="Study pack sections"
              />
            </div>

            {/* Tab panel */}
            <div
              role="tabpanel"
              key={activeTab}
              style={{ animation: 'sp-fadein 0.2s cubic-bezier(0.22,1,0.36,1)' }}
            >
              <TabPanel tab={activeTab} notebook={notebook} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
