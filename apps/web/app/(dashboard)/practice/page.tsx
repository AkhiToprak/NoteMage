'use client';

// /practice — quick-access review hub.
// Data: fetches /api/flashcard-sets and /api/quiz-sets (same endpoints used by
// /practice/flashcards and /practice/quizzes). Everything else (weak topics, mistakes,
// exam unlocks) is representative — no backing data yet.

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { NMCard } from '@/components/rework/NMCard';
import { SectionHeading } from '@/components/rework/SectionHeading';
import { Mascot } from '@/components/mascot/Mascot';
import { Button } from '@/components/ui/Button';
import { formatRelativeTime } from '@/lib/relative-time';

// ─── Types ───────────────────────────────────────────────────────────────────

interface FlashcardSetRow {
  id: string;
  title: string;
  notebookId: string | null;
  updatedAt: string;
  _count: { flashcards: number };
  notebook: { id: string; name: string } | null;
}

interface QuizSetRow {
  id: string;
  title: string;
  notebookId: string | null;
  updatedAt: string;
  _count: { questions: number };
  notebook: { id: string; name: string } | null;
}

type LoadState<T> = { status: 'loading' } | { status: 'ready'; data: T[] } | { status: 'error' };

// ─── Page shell (Suspense boundary for useSearchParams-free descendants) ─────

export default function PracticePage() {
  return (
    <Suspense
      fallback={
        <div style={pageWrap}>
          <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px', margin: 0 }}>
            Loading…
          </p>
        </div>
      }
    >
      <PracticeContent />
    </Suspense>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function PracticeContent() {
  const [flashcardSets, setFlashcardSets] = useState<LoadState<FlashcardSetRow>>({
    status: 'loading',
  });
  const [quizSets, setQuizSets] = useState<LoadState<QuizSetRow>>({ status: 'loading' });

  const load = useCallback(() => {
    let live = true;

    fetch('/api/flashcard-sets')
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j?.success) {
          setFlashcardSets({ status: 'ready', data: (j.data ?? []) as FlashcardSetRow[] });
        } else {
          setFlashcardSets({ status: 'error' });
        }
      })
      .catch(() => {
        if (live) setFlashcardSets({ status: 'error' });
      });

    fetch('/api/quiz-sets')
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j?.success) {
          setQuizSets({ status: 'ready', data: (j.data ?? []) as QuizSetRow[] });
        } else {
          setQuizSets({ status: 'error' });
        }
      })
      .catch(() => {
        if (live) setQuizSets({ status: 'error' });
      });

    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    return load();
  }, [load]);

  const fcSets = flashcardSets.status === 'ready' ? flashcardSets.data : [];
  const qSets = quizSets.status === 'ready' ? quizSets.data : [];
  const isLoading = flashcardSets.status === 'loading' || quizSets.status === 'loading';
  const hasAnything = fcSets.length > 0 || qSets.length > 0;

  // Empty state — nothing at all
  if (!isLoading && !hasAnything) {
    return <EmptyState />;
  }

  // Determine next-up recommendation based on what user has
  const hasFc = fcSets.length > 0;
  const hasQuiz = qSets.length > 0;
  const nextUpPose = hasFc ? 'holding-flashcards' : 'quizzing';
  const nextUpTitle = hasFc ? 'Review your flashcards' : 'Take a quick quiz';
  const nextUpDesc = hasFc
    ? `You have ${fcSets.length} flashcard ${fcSets.length === 1 ? 'set' : 'sets'} ready.`
    : `You have ${qSets.length} quiz ${qSets.length === 1 ? 'set' : 'sets'} ready.`;
  const nextUpHref = hasFc ? '/practice/flashcards' : '/practice/quizzes';

  // Preview sets (up to 4, most recently updated)
  const previewFc = fcSets
    .filter((s) => Boolean(s.notebookId))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 4);
  const previewQuiz = qSets
    .filter((s) => Boolean(s.notebookId))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 4);

  return (
    <div className="nm-rework" style={pageWrap}>
      {/* Page heading */}
      <SectionHeading
        title="Practice"
        subtitle="Sharpen weak spots and lock in what you've learned."
        style={{ marginBottom: '28px' }}
      />

      {/* ── Next-up banner ── */}
      {!isLoading && hasAnything && (
        <NMCard
          accent="review"
          style={{
            marginBottom: '32px',
            display: 'flex',
            alignItems: 'center',
            gap: 'clamp(16px, 3vw, 28px)',
            flexWrap: 'wrap',
            padding: 'clamp(20px, 3vw, 28px)',
          }}
        >
          <Mascot pose={nextUpPose} size="md" idle="bounce" aria-hidden />
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <p
              style={{
                margin: '0 0 4px',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--nm-review)',
              }}
            >
              Next up
            </p>
            <h2
              style={{
                margin: '0 0 6px',
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(18px, 3vw, 22px)',
                fontWeight: 800,
                color: 'var(--on-surface)',
                letterSpacing: '-0.02em',
              }}
            >
              {nextUpTitle}
            </h2>
            <p
              style={{
                margin: '0 0 16px',
                fontSize: '14px',
                color: 'var(--on-surface-variant)',
                lineHeight: 1.5,
              }}
            >
              {nextUpDesc}
            </p>
            <Button href={nextUpHref} variant="primary" size="md" leadingIcon="play_arrow">
              Start now
            </Button>
          </div>
        </NMCard>
      )}

      {/* ── Activity tile grid ── */}
      <section style={{ marginBottom: '40px' }}>
        <h3
          style={{
            margin: '0 0 14px',
            fontFamily: 'var(--font-display)',
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--on-surface)',
            letterSpacing: '-0.01em',
          }}
        >
          Activities
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '14px',
          }}
        >
          {/* 1 — Weak-topic review (representative; no weak-topic data yet) */}
          <ActivityTile
            icon="priority_high"
            accent="review"
            title="Weak-topic review"
            desc="Unlocks after your first quiz."
            href="/practice/quizzes"
            muted
          />

          {/* 2 — Flashcards (real count) */}
          <ActivityTile
            icon="style"
            accent="lesson"
            title="Flashcards"
            desc="Flip through your cards."
            href="/practice/flashcards"
            badge={
              flashcardSets.status === 'ready'
                ? `${fcSets.length} ${fcSets.length === 1 ? 'set' : 'sets'}`
                : undefined
            }
          />

          {/* 3 — Quizzes (real count) */}
          <ActivityTile
            icon="quiz"
            accent="quiz"
            title="Quizzes"
            desc="Test yourself and track your score."
            href="/practice/quizzes"
            badge={
              quizSets.status === 'ready'
                ? `${qSets.length} ${qSets.length === 1 ? 'set' : 'sets'}`
                : undefined
            }
          />

          {/* 4 — Mistake practice (representative; no mistake-tracking yet) */}
          <ActivityTile
            icon="history_edu"
            accent="boss"
            title="Mistake practice"
            desc="No mistakes yet — they'll collect here automatically."
            href="/practice/quizzes"
            muted
          />

          {/* 5 — Final exam simulation (representative; needs a completed path) */}
          <ActivityTile
            icon="fort"
            accent="boss"
            title="Exam simulation"
            desc="Unlocks when you finish your path."
            href="/my-path"
            muted
          />
        </div>
      </section>

      {/* ── Your sets preview ── */}
      {(previewFc.length > 0 || previewQuiz.length > 0) && (
        <section>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '14px',
              gap: '12px',
            }}
          >
            <h3
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: '16px',
                fontWeight: 700,
                color: 'var(--on-surface)',
                letterSpacing: '-0.01em',
              }}
            >
              Your sets
            </h3>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              {fcSets.length > 0 && (
                <Link
                  href="/practice/flashcards"
                  style={seeAllLink}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--on-surface)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--on-surface-variant)';
                  }}
                >
                  All flashcards
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: '16px' }}
                    aria-hidden
                  >
                    arrow_forward
                  </span>
                </Link>
              )}
              {qSets.length > 0 && (
                <Link
                  href="/practice/quizzes"
                  style={seeAllLink}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--on-surface)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--on-surface-variant)';
                  }}
                >
                  All quizzes
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: '16px' }}
                    aria-hidden
                  >
                    arrow_forward
                  </span>
                </Link>
              )}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '10px',
            }}
          >
            {previewFc.map((set) => (
              <SetPreviewCard
                key={`fc-${set.id}`}
                href={`/notebooks/${set.notebookId}/flashcards/${set.id}`}
                title={set.title || 'Untitled set'}
                icon="style"
                meta={`${set._count.flashcards} ${set._count.flashcards === 1 ? 'card' : 'cards'} · ${formatRelativeTime(set.updatedAt)}`}
                accentColor="var(--nm-lesson)"
              />
            ))}
            {previewQuiz.map((set) => (
              <SetPreviewCard
                key={`q-${set.id}`}
                href={`/notebooks/${set.notebookId}/quizzes/${set.id}`}
                title={set.title || 'Untitled quiz'}
                icon="quiz"
                meta={`${set._count.questions} ${set._count.questions === 1 ? 'question' : 'questions'} · ${formatRelativeTime(set.updatedAt)}`}
                accentColor="var(--nm-quiz)"
              />
            ))}
          </div>
        </section>
      )}

      {/* Skeleton placeholders while loading */}
      {isLoading && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '10px',
            marginTop: '8px',
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                height: '72px',
                background: 'var(--surface-container)',
                border: '1px solid var(--outline-variant)',
                borderRadius: 'var(--radius-md)',
                opacity: 0.5,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ActivityTile({
  icon,
  accent,
  title,
  desc,
  href,
  badge,
  muted,
}: {
  icon: string;
  accent: 'review' | 'lesson' | 'quiz' | 'boss';
  title: string;
  desc: string;
  href: string;
  badge?: string;
  muted?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  const accentVar =
    accent === 'review'
      ? 'var(--nm-review)'
      : accent === 'lesson'
        ? 'var(--nm-lesson)'
        : accent === 'quiz'
          ? 'var(--nm-quiz)'
          : 'var(--nm-boss)';

  const accentSoftVar =
    accent === 'review'
      ? 'var(--nm-review-soft)'
      : accent === 'lesson'
        ? 'var(--nm-lesson-soft)'
        : accent === 'quiz'
          ? 'var(--nm-quiz-soft)'
          : 'var(--nm-boss-soft)';

  const tileContent = (
    <>
      {/* left accent strip */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '4px',
          background: accentVar,
        }}
      />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', paddingLeft: '4px' }}>
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            minWidth: '36px',
            borderRadius: 'var(--radius-md)',
            background: accentSoftVar,
            color: accentVar,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
            {icon}
          </span>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '4px',
            }}
          >
            <span
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: 'var(--on-surface)',
                letterSpacing: '-0.01em',
              }}
            >
              {title}
            </span>
            {badge && (
              <span
                style={{
                  padding: '1px 7px',
                  borderRadius: 'var(--radius-full)',
                  background: accentSoftVar,
                  color: accentVar,
                  fontSize: '11px',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                {badge}
              </span>
            )}
          </div>
          <p
            style={{
              margin: 0,
              fontSize: '12px',
              color: 'var(--on-surface-variant)',
              lineHeight: 1.5,
            }}
          >
            {desc}
          </p>
        </div>
      </div>
    </>
  );

  const sharedStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '18px',
    background: 'var(--surface)',
    border: `1px solid ${hovered && !muted ? accentVar : 'var(--rule-hairline)'}`,
    borderRadius: 'var(--radius-xl)',
    textDecoration: 'none',
    color: 'var(--on-surface)',
    opacity: muted ? 0.65 : 1,
    transform: hovered && !muted ? 'translateY(-2px)' : 'translateY(0)',
    boxShadow:
      hovered && !muted
        ? '0 8px 24px color-mix(in srgb, var(--on-surface) 10%, transparent)'
        : 'var(--bento-rest-shadow)',
    transition:
      'transform var(--dur-fast) var(--ease-spring), box-shadow var(--dur-fast) var(--ease-spring), border-color var(--dur-fast) var(--ease-spring)',
    minHeight: '44px',
    position: 'relative',
    overflow: 'hidden',
  };

  // Locked/muted tiles are not navigable — render as a div to avoid dead-end links.
  if (muted) {
    return (
      <div aria-disabled="true" style={{ ...sharedStyle, cursor: 'default' }}>
        {tileContent}
      </div>
    );
  }

  return (
    <Link
      href={href}
      style={sharedStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      {tileContent}
    </Link>
  );
}

function SetPreviewCard({
  href,
  title,
  icon,
  meta,
  accentColor,
}: {
  href: string;
  title: string;
  icon: string;
  meta: string;
  accentColor: string;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 14px',
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-md)',
        textDecoration: 'none',
        color: 'var(--on-surface)',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: hovered
          ? '0 4px 12px color-mix(in srgb, var(--on-surface) 8%, transparent)'
          : 'none',
        transition:
          'transform var(--dur-fast) var(--ease-spring), box-shadow var(--dur-fast) var(--ease-spring)',
        minHeight: '44px',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <span
        aria-hidden
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          minWidth: '32px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--surface-container-high)',
          color: accentColor,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
          {icon}
        </span>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: '0 0 2px',
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--on-surface)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </p>
        <p
          style={{
            margin: 0,
            fontSize: '11px',
            color: 'var(--on-surface-variant)',
          }}
        >
          {meta}
        </p>
      </div>
      <span
        className="material-symbols-outlined"
        aria-hidden
        style={{
          fontSize: '18px',
          color: 'var(--on-surface-variant)',
          opacity: hovered ? 1 : 0.5,
          transition: 'opacity var(--dur-fast) var(--ease-spring)',
          flexShrink: 0,
        }}
      >
        chevron_right
      </span>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="nm-rework" style={pageWrap}>
      <SectionHeading
        title="Practice"
        subtitle="Sharpen weak spots and lock in what you've learned."
        style={{ marginBottom: '28px' }}
      />
      <NMCard
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'clamp(32px, 6vw, 56px)',
          textAlign: 'center',
          gap: '16px',
        }}
      >
        <Mascot pose="thinking" size="md" idle="sway" aria-hidden />
        <div>
          <h2
            style={{
              margin: '0 0 8px',
              fontFamily: 'var(--font-display)',
              fontSize: '20px',
              fontWeight: 800,
              color: 'var(--on-surface)',
              letterSpacing: '-0.02em',
            }}
          >
            Nothing to practice yet
          </h2>
          <p
            style={{
              margin: '0 0 20px',
              fontSize: '14px',
              color: 'var(--on-surface-variant)',
              lineHeight: 1.6,
              maxWidth: '400px',
            }}
          >
            Complete your first lesson and Notemage will create flashcards, quizzes, and mistake
            reviews.
          </p>
          <Button href="/my-path" variant="primary" size="md" leadingIcon="stacks">
            Start a lesson
          </Button>
        </div>
      </NMCard>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const pageWrap: React.CSSProperties = {
  maxWidth: 'var(--nm-page-max)',
  margin: '0 auto',
  padding: 'clamp(16px, 4vw, 32px)',
  width: '100%',
};

const seeAllLink: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--on-surface-variant)',
  textDecoration: 'none',
  transition: 'color var(--dur-fast) var(--ease-spring)',
};
