'use client';

import { useState, useEffect } from 'react';
import { SectionHeading } from '@/components/rework/SectionHeading';
import { StudyPackCard } from '@/components/rework/StudyPackCard';
import { NMCard } from '@/components/rework/NMCard';
import { Mascot } from '@/components/mascot/Mascot';
import { Button } from '@/components/ui/Button';

interface NotebookData {
  id: string;
  name: string;
  subject: string | null;
  color: string | null;
  updatedAt: string;
  _count: { documents: number; pages?: number };
}

function SkeletonCard() {
  return (
    <div
      style={{
        background: 'var(--surface-container)',
        borderRadius: 'var(--radius-lg, 16px)',
        minHeight: 180,
        animation: 'sp-pulse 1.6s ease-in-out infinite',
      }}
    />
  );
}

export default function StudyPacksPage() {
  const [notebooks, setNotebooks] = useState<NotebookData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/notebooks?folderId=all')
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setNotebooks(json.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <style>{`
        @keyframes sp-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>

      <div
        className="nm-rework"
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: 'clamp(16px,4vw,32px)',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <SectionHeading
          title="Study Packs"
          subtitle="Everything generated from your material."
          action={
            <Button href="/study-packs/new" variant="primary" shape="pill" leadingIcon="add">
              Create Study Pack
            </Button>
          }
          style={{ marginBottom: 'var(--space-8, 32px)' }}
        />

        {/* Loading */}
        {loading && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))',
              gap: 'var(--space-6, 24px)',
            }}
          >
            {[0, 1, 2].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && notebooks.length === 0 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: 360,
            }}
          >
            <NMCard
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 'var(--space-4, 16px)',
                padding: 'var(--space-10, 40px) var(--space-8, 32px)',
                maxWidth: 440,
                textAlign: 'center',
              }}
            >
              <Mascot pose="holding-pen" size="lg" idle="float" />
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--fs-xl)',
                  fontWeight: 700,
                  color: 'var(--on-surface)',
                  margin: 0,
                }}
              >
                No Study Packs yet
              </h2>
              <p
                style={{
                  fontSize: 'var(--fs-sm)',
                  color: 'var(--on-surface-variant)',
                  fontFamily: 'var(--font-sans)',
                  margin: 0,
                  lineHeight: 1.65,
                }}
              >
                A Study Pack contains everything generated from your material: lessons, flashcards,
                quizzes, and a personalized path.
              </p>
              <Button href="/study-packs/new" variant="primary" shape="pill" leadingIcon="add">
                Create Study Pack
              </Button>
            </NMCard>
          </div>
        )}

        {/* Grid */}
        {!loading && notebooks.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))',
              gap: 'var(--space-6, 24px)',
            }}
          >
            {notebooks.map((nb) => (
              <StudyPackCard
                key={nb.id}
                title={nb.name}
                subject={nb.subject ?? undefined}
                accentColor={nb.color ?? undefined}
                lessons={nb._count.pages && nb._count.pages > 0 ? nb._count.pages : undefined}
                flashcards={nb._count.documents && nb._count.documents > 0 ? nb._count.documents : undefined}
                href={`/study-packs/${nb.id}`}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
