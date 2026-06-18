'use client';

// /practice — quick-access review hub.
// Data:
//   • /api/flashcard-sets + /api/quiz-sets (same endpoints as the flashcards /
//     quizzes sub-pages) — drive the flashcard / quiz availability signals.
//   • /api/learn/paths (list) + /api/learn/paths/[id] (detail) → derivePathStats,
//     mirroring /my-path — drive the weak-topic signal and the "continue path"
//     fallback. The single recommended next step at the top is computed from
//     these real signals (weak topic → flashcards → quiz → continue path).
// Mistakes / exam unlocks remain representational — no backing store yet.

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { NMCard } from '@/components/rework/NMCard';
import { SectionHeading } from '@/components/rework/SectionHeading';
import { Mascot } from '@/components/mascot/Mascot';
import { Button } from '@/components/ui/Button';
import { formatRelativeTime } from '@/lib/relative-time';
import { derivePathStats, findContinueSlot } from '@/lib/path-stats';
import type { PathPlan } from '@/components/learn/PathView';

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

type PathListItem = PathPlan & {
  generationStatus?: string;
  updatedAt?: string;
};

type LoadState<T> = { status: 'loading' } | { status: 'ready'; data: T[] } | { status: 'error' };

// The recommended next step, computed from real signals only.
interface NextStep {
  /** Eyebrow shown above the title. */
  kind: 'weak' | 'flashcards' | 'quiz' | 'path' | 'create';
  pose: React.ComponentProps<typeof Mascot>['pose'];
  title: string;
  desc: string;
  href: string;
  cta: string;
  icon: string;
}

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
  // Path list (drives the weak-topic signal + the "continue path" fallback).
  const [pathList, setPathList] = useState<LoadState<PathListItem>>({ status: 'loading' });
  // Full detail (with slot activities) for the most-recently-active ready path.
  const [pathPlan, setPathPlan] = useState<PathPlan | null>(null);
  // The path id whose detail fetch has settled (resolved or failed). Gates the
  // loading state without hanging it when the detail call errors out.
  const [settledDetailId, setSettledDetailId] = useState<string | null>(null);

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

    fetch('/api/learn/paths')
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j?.success) {
          setPathList({ status: 'ready', data: (j.data ?? []) as PathListItem[] });
        } else {
          setPathList({ status: 'error' });
        }
      })
      .catch(() => {
        if (live) setPathList({ status: 'error' });
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
  const paths = pathList.status === 'ready' ? pathList.data : [];

  // Pick the path to base signals on: the most-recently-updated ready path
  // (mirrors /my-path's `readyItems`; the list arrives newest-first, so the
  // first ready entry is the most-recently-active one).
  const activePath =
    paths.find((p) => p.generationStatus === 'ready' || !p.generationStatus) ?? null;

  // Fetch the active path's full plan so derivePathStats has slot activities.
  useEffect(() => {
    if (!activePath) {
      setPathPlan(null);
      return;
    }
    let cancelled = false;
    const id = activePath.id;
    fetch(`/api/learn/paths/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.success && j.data) setPathPlan(j.data as PathPlan);
        setSettledDetailId(id);
      })
      .catch(() => {
        // Detail failed — release the gate; the next-step logic falls through
        // to a non-path signal (flashcards / quiz / create).
        if (!cancelled) setSettledDetailId(id);
      });
    return () => {
      cancelled = true;
    };
  }, [activePath]);

  const detailPlan = pathPlan && activePath && pathPlan.id === activePath.id ? pathPlan : null;

  const isLoading =
    flashcardSets.status === 'loading' ||
    quizSets.status === 'loading' ||
    pathList.status === 'loading' ||
    // Detail still in flight for the active path — wait so we don't flash a
    // lower-priority CTA before the weak-topic signal resolves. Released once
    // the detail fetch settles for this path (even on failure).
    (activePath !== null && settledDetailId !== activePath.id);
  const hasAnything = fcSets.length > 0 || qSets.length > 0 || paths.length > 0;

  // Empty state — nothing at all
  if (!isLoading && !hasAnything) {
    return <EmptyState />;
  }

  // ── The single recommended next step (real signals only) ──
  const nextStep = computeNextStep({ fcSets, qSets, activePath, detailPlan });

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

      {/* ── Primary recommended next step — the one thing to do now ── */}
      {!isLoading && nextStep && <PrimaryNextStep step={nextStep} />}

      {/* ── All practice (demoted tool grid) ── */}
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
          All practice
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

// ─── Next-step computation (real signals only) ────────────────────────────────
//
// Priority, in order — the first signal that holds wins:
//   1. A weak topic in the active path  → "Review {weakTopicName}"
//   2. Flashcards available             → "Review flashcards"
//   3. A quiz available                 → "Take a quiz"
//   4. An active path to continue       → "Continue your path"
//   5. Nothing actionable but some paths exist → nudge to create a Study Pack
//
// Nothing here is fabricated: weak topics come from derivePathStats, set counts
// from the real fetches, and the path href from the real continue-slot.

function computeNextStep({
  fcSets,
  qSets,
  activePath,
  detailPlan,
}: {
  fcSets: FlashcardSetRow[];
  qSets: QuizSetRow[];
  activePath: PathListItem | null;
  detailPlan: PathPlan | null;
}): NextStep | null {
  const stats = detailPlan ? derivePathStats(detailPlan) : null;

  // 1 — Weak topic. Prefer a graded checkpoint scoring below the pass gate
  //     (the most specific signal); fall back to the lowest-progress section.
  if (stats && detailPlan && activePath) {
    const weakName = stats.weakCheckpoints[0]?.title ?? stats.weakTopicName;
    if (weakName) {
      // Deep-link to the weak slot when we can resolve it from the path tree.
      let href = `/learn/paths/${encodeURIComponent(detailPlan.id)}`;
      const weakSlot = detailPlan.phases
        .flatMap((p) => p.slots)
        .find((s) => s.title === weakName);
      if (weakSlot) href += `?slot=${encodeURIComponent(weakSlot.id)}`;
      return {
        kind: 'weak',
        pose: 'thinking',
        title: `Review ${weakName}`,
        desc:
          stats.weakCheckpoints.length > 0
            ? 'Your lowest score so far — a quick review raises your readiness.'
            : 'Your lowest-progress topic — close the gap before moving on.',
        href,
        cta: 'Review now',
        icon: 'priority_high',
      };
    }
  }

  // 2 — Flashcards available.
  if (fcSets.length > 0) {
    return {
      kind: 'flashcards',
      pose: 'holding-flashcards',
      title: 'Review flashcards',
      desc: `You have ${fcSets.length} flashcard ${fcSets.length === 1 ? 'set' : 'sets'} ready.`,
      href: '/practice/flashcards',
      cta: 'Start now',
      icon: 'style',
    };
  }

  // 3 — Quiz available.
  if (qSets.length > 0) {
    return {
      kind: 'quiz',
      pose: 'quizzing',
      title: 'Take a quiz',
      desc: `You have ${qSets.length} quiz ${qSets.length === 1 ? 'set' : 'sets'} ready.`,
      href: '/practice/quizzes',
      cta: 'Start now',
      icon: 'quiz',
    };
  }

  // 4 — Continue the active path (deep-link to the next unlocked slot).
  if (activePath) {
    let href = `/learn/paths/${encodeURIComponent(activePath.id)}`;
    const nextSlot = detailPlan ? findContinueSlot(detailPlan) : null;
    if (nextSlot) {
      const params = new URLSearchParams({ slot: nextSlot.id });
      const nextActivity =
        nextSlot.activities.find((a) => !a.completed) ?? nextSlot.activities[0];
      if (nextActivity) params.set('activity', nextActivity.id);
      href += `?${params.toString()}`;
    }
    return {
      kind: 'path',
      pose: 'default',
      title: 'Continue your path',
      desc: nextSlot
        ? `Pick up at ${nextSlot.title}.`
        : 'Jump back into your learning path.',
      href,
      cta: 'Continue',
      icon: 'play_arrow',
    };
  }

  // 5 — Sets exist but nothing matched (e.g. detail failed to load and no path):
  //     steer toward building a Study Pack rather than inventing a tool.
  return {
    kind: 'create',
    pose: 'holding-pen',
    title: 'Build your first Study Pack',
    desc: 'Turn your notes into lessons, flashcards, and quizzes.',
    href: '/study-packs/new',
    cta: 'Get started',
    icon: 'stacks',
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// The single prominent recommended next step. One card, one accent, one CTA —
// visually dominant so it reads as "do this", not "pick from a menu".
function PrimaryNextStep({ step }: { step: NextStep }) {
  // Map the signal to a semantic accent: weak → review, flashcards → lesson,
  // quiz → quiz, path/create → lesson (the "learning" hue).
  const accent =
    step.kind === 'weak'
      ? 'review'
      : step.kind === 'quiz'
        ? 'quiz'
        : 'lesson';
  const accentVar =
    accent === 'review'
      ? 'var(--nm-review)'
      : accent === 'quiz'
        ? 'var(--nm-quiz)'
        : 'var(--nm-lesson)';

  return (
    <NMCard
      accent={accent}
      style={{
        marginBottom: '32px',
        display: 'flex',
        alignItems: 'center',
        gap: 'clamp(16px, 3vw, 28px)',
        flexWrap: 'wrap',
        padding: 'clamp(22px, 3.5vw, 32px)',
      }}
    >
      <Mascot pose={step.pose} size="lg" idle="bounce" aria-hidden />
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <p
          style={{
            margin: '0 0 6px',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: accentVar,
          }}
        >
          Recommended next
        </p>
        <h2
          style={{
            margin: '0 0 8px',
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(20px, 3.4vw, 26px)',
            fontWeight: 800,
            color: 'var(--on-surface)',
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
            overflowWrap: 'anywhere',
          }}
        >
          {step.title}
        </h2>
        <p
          style={{
            margin: '0 0 18px',
            fontSize: '14px',
            color: 'var(--on-surface-variant)',
            lineHeight: 1.55,
            maxWidth: 460,
          }}
        >
          {step.desc}
        </p>
        <Button href={step.href} variant="primary" size="lg" shape="pill" leadingIcon={step.icon}>
          {step.cta}
        </Button>
      </div>
    </NMCard>
  );
}

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
