'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import ExamForm from '@/components/features/ExamForm';
import DashboardGreeting from '@/components/features/DashboardGreeting';
import { NMCard } from '@/components/rework/NMCard';
import { ProgressBar } from '@/components/rework/ProgressBar';
import { SectionHeading } from '@/components/rework/SectionHeading';
import { StudyStats } from '@/components/rework/StudyStats';
import { Mascot } from '@/components/mascot/Mascot';
import { Button } from '@/components/ui/Button';
import { useRegisterMageContext } from '@/components/mage';
import type { PathPhase, PathPlan } from '@/components/learn/PathView';

// ─── Types ───────────────────────────────────────────────────────────────────

interface NotebookOption {
  id: string;
  name: string;
}

interface ExamItem {
  id: string;
  title: string;
  examDate: string;
  notebookId: string;
  notebookName: string;
}

type PathFetchState =
  | { kind: 'loading' }
  | { kind: 'ready'; plans: PathPlan[] }
  | { kind: 'error' };

// ─── Path hero derivation (mirrors PathHeroCard logic) ────────────────────────

interface DerivedPath {
  plan: PathPlan;
  activePhase: PathPhase;
  activePhaseIndex: number;
  nextSlotIsAssessment: boolean;
  nextSlotId: string | null;
  percent: number;
  pathDone: boolean;
  ultra: boolean;
}

function deriveHero(plans: PathPlan[]): DerivedPath | null {
  if (plans.length === 0) return null;
  const plan = plans[0];
  if (!plan.phases.length) return null;

  let total = 0;
  let completed = 0;
  for (const phase of plan.phases) {
    for (const slot of phase.slots) {
      for (const a of slot.activities) {
        total += 1;
        if (a.completed) completed += 1;
      }
    }
  }
  if (total === 0) return null;
  const percent = Math.round((completed / total) * 100);
  const pathDone = completed === total;

  let activePhaseIndex = plan.phases.findIndex(
    (p) => p.unlocked && p.slots.some((s) => !s.completed),
  );
  if (activePhaseIndex === -1) activePhaseIndex = plan.phases.length - 1;
  const activePhase = plan.phases[activePhaseIndex];
  const nextSlot = activePhase.slots.find((s) => s.unlocked && !s.completed) ?? null;

  return {
    plan,
    activePhase,
    activePhaseIndex,
    nextSlotIsAssessment:
      nextSlot?.kind === 'assessment' || nextSlot?.kind === 'final_exam',
    nextSlotId: nextSlot?.id ?? null,
    percent,
    pathDone,
    ultra: plan.ultra === true,
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();

  // Home surface — no single id to ground on, so Mage opens to broad "what
  // should I study?" prompts rather than a specific lesson/pack.
  useRegisterMageContext({ type: 'home' });

  const [notebookCount, setNotebookCount] = useState<number | null>(null);
  const [notebooks, setNotebooks] = useState<NotebookOption[]>([]);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [showExamForm, setShowExamForm] = useState(false);
  const [pathState, setPathState] = useState<PathFetchState>({ kind: 'loading' });
  // One-shot "you finished the guided tour" nudge. Read client-side (avoids the
  // useSearchParams prerender bailout) and stripped from the URL so a refresh
  // doesn't re-show it.
  const [showPostTutorial, setShowPostTutorial] = useState(false);

  const ctaHref = '/study-packs/new';

  // ── Data fetching ──────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/notebooks?folderId=all')
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? res;
        if (Array.isArray(d)) {
          setNotebookCount(d.length);
          setNotebooks(d.map((nb: { id: string; name: string }) => ({ id: nb.id, name: nb.name })));
        }
      })
      .catch(() => {});

    fetchExams();

    let cancelled = false;
    fetch('/api/learn/paths')
      .then((r) => r.json())
      .then((body: { success?: boolean; data?: PathPlan[] }) => {
        if (cancelled) return;
        if (!body.success || !Array.isArray(body.data)) {
          setPathState({ kind: 'error' });
          return;
        }
        setPathState({ kind: 'ready', plans: body.data });
      })
      .catch(() => {
        if (!cancelled) setPathState({ kind: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('postTutorial') === '1') {
      setShowPostTutorial(true);
      // Strip the query through the Next router. Using window.history.replaceState
      // here desyncs the App Router after the tutorial's router.push, leaving the
      // dashboard unpainted until a manual reload.
      router.replace('/dashboard', { scroll: false });
    }
  }, [router]);

  const fetchExams = () => {
    fetch('/api/user/exams')
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? res;
        if (Array.isArray(d)) setExams(d);
      })
      .catch(() => {});
  };

  const handleCreateExam = async (data: {
    title: string;
    examDate: string;
    notebookId: string;
  }) => {
    const res = await fetch('/api/user/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setShowExamForm(false);
      fetchExams();
    }
  };

  const handleDeleteExam = async (examId: string) => {
    try {
      const res = await fetch(`/api/user/exams/${examId}`, { method: 'DELETE' });
      if (res.ok) fetchExams();
    } catch {
      /* silent */
    }
  };

  // ── Derived state ──────────────────────────────────────────────────────────

  const derived = useMemo(() => {
    if (pathState.kind !== 'ready') return null;
    return deriveHero(pathState.plans);
  }, [pathState]);

  const hasPaths = pathState.kind === 'ready' && pathState.plans.length > 0;
  const isEmpty = notebookCount !== null && notebookCount === 0 && !hasPaths;
  const isLoading = notebookCount === null || pathState.kind === 'loading';

  const firstName =
    session?.user?.name?.split(' ')[0] ||
    (session?.user as { username?: string })?.username ||
    'Mage';

  // Next exam (soonest future one)
  const sortedExams = [...exams].sort(
    (a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime(),
  );
  const nextExam = sortedExams[0] ?? null;
  const nextExamDays = nextExam
    ? Math.ceil((new Date(nextExam.examDate).getTime() - Date.now()) / 86400000)
    : null;

  // CTA hrefs for the Continue Learning card
  const pathCtaHref = derived?.nextSlotId
    ? `/learn/paths/${encodeURIComponent(derived.plan.id)}?slot=${encodeURIComponent(derived.nextSlotId)}`
    : derived
      ? `/learn/paths/${encodeURIComponent(derived.plan.id)}`
      : '/my-path';

  const pathCtaLabel = derived?.pathDone
    ? 'Review Path'
    : derived?.nextSlotIsAssessment
      ? 'Take Checkpoint'
      : 'Continue Lesson';

  // ── Urgency color for exam countdown (no gradients, solid bg via rgba) ─────
  function examUrgency(days: number) {
    if (days < 7) return { bg: 'color-mix(in srgb, var(--error) 16%, transparent)', fg: 'var(--error)' };
    if (days < 14) return { bg: 'color-mix(in srgb, var(--warning) 16%, transparent)', fg: 'var(--warning)' };
    return { bg: 'var(--nm-lesson-soft)', fg: 'var(--nm-lesson)' };
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="nm-rework"
      style={{
        maxWidth: 'var(--nm-page-max)',
        margin: '0 auto',
        width: '100%',
        padding: 'clamp(16px, 4vw, 32px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-8)',
      }}
    >
      {/* A) Greeting */}
      <DashboardGreeting userName={firstName} />

      {/* Post-tutorial nudge — steer the user from the sample to their own material */}
      {showPostTutorial && (
        <NMCard
          accent="lesson"
          style={{
            padding: 'clamp(16px, 2.5vw, 24px)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-4)',
            flexWrap: 'wrap',
          }}
        >
          <div aria-hidden style={{ flexShrink: 0 }}>
            <Mascot pose="graduation" size="md" idle="float" />
          </div>
          <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--fs-lg)',
                fontWeight: 800,
                color: 'var(--on-surface)',
                margin: 0,
                letterSpacing: '-0.02em',
              }}
            >
              You finished the tour!
            </h3>
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.6 }}>
              That&apos;s the whole flow. Now turn your own notes into a path just like that.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0, flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              shape="pill"
              leadingIcon="upload_file"
              onClick={() => router.push('/study-packs/new')}
            >
              Upload my notes
            </Button>
            <Button variant="ghost" shape="pill" onClick={() => setShowPostTutorial(false)}>
              Maybe later
            </Button>
          </div>
        </NMCard>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* EMPTY STATE */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {!isLoading && isEmpty && (
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 'var(--space-6)',
            padding: 'clamp(32px, 6vw, 64px) 0',
          }}
        >
          <Mascot pose="holding-pen" size="lg" idle="float" priority />

          <div style={{ maxWidth: 520 }}>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(var(--fs-xl), 4vw, var(--fs-2xl))',
                fontWeight: 800,
                color: 'var(--on-surface)',
                margin: '0 0 var(--space-3)',
                letterSpacing: '-0.03em',
                lineHeight: 1.15,
              }}
            >
              Turn your study material into a learning path
            </h1>
            <p
              style={{
                fontSize: 'var(--fs-base)',
                color: 'var(--on-surface-variant)',
                lineHeight: 1.7,
                margin: '0 0 var(--space-6)',
              }}
            >
              Upload your notes, slides, PDFs, or textbook pages. NoteMage will create lessons,
              flashcards, quizzes, and a final exam simulation.
            </p>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-3)',
                justifyContent: 'center',
                marginBottom: 'var(--space-4)',
              }}
            >
              <Link
                href={ctaHref}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '12px 28px',
                  minHeight: 48,
                  background: 'var(--accent-strong)',
                  color: 'var(--on-primary-container)',
                  borderRadius: 'var(--radius-full)',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 700,
                  fontSize: 'var(--fs-base)',
                  textDecoration: 'none',
                  transition: 'transform var(--dur-fast) var(--ease-spring)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
                }}
                onMouseDown={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
                }}
              >
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 20 }}>
                  upload_file
                </span>
                Upload Material
              </Link>

              <Link
                href="/tutorial"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '12px 24px',
                  minHeight: 48,
                  background: 'var(--surface-container)',
                  color: 'var(--on-surface)',
                  border: '1px solid var(--ink-08)',
                  borderRadius: 'var(--radius-full)',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 700,
                  fontSize: 'var(--fs-base)',
                  textDecoration: 'none',
                  transition: 'background var(--dur-fast) var(--ease-spring)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background =
                    'var(--surface-container-high)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background = 'var(--surface-container)';
                }}
              >
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 20 }}>
                  auto_awesome
                </span>
                Take a 2-min tour
              </Link>
            </div>

            <p
              style={{
                fontSize: 'var(--fs-sm)',
                color: 'var(--on-surface-variant)',
                margin: '0 0 var(--space-3)',
              }}
            >
              New here? Explore a ready-made sample:
            </p>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
                justifyContent: 'center',
              }}
            >
              {[
                { label: 'Biology', sample: 'biology' },
                { label: 'History', sample: 'history' },
                { label: 'Computer Science', sample: 'computer-science' },
              ].map(({ label, sample }) => (
                <Link
                  key={sample}
                  href={`/tutorial?sample=${sample}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 16px',
                    minHeight: 44,
                    background: 'var(--surface-container)',
                    color: 'var(--on-surface)',
                    border: '1px solid var(--ink-08)',
                    borderRadius: 'var(--radius-full)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--fs-sm)',
                    fontWeight: 600,
                    textDecoration: 'none',
                    transition: 'background var(--dur-fast) var(--ease-spring)',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.background =
                      'var(--surface-container-high)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.background =
                      'var(--surface-container)';
                  }}
                >
                  <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16 }}>
                    auto_fix_high
                  </span>
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* POPULATED STATE */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {!isLoading && !isEmpty && (
        <>
          {/* B) Continue Learning hero card */}
          <section>
            <NMCard
              accent="lesson"
              style={{
                padding: 'clamp(20px, 3vw, 32px)',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 'var(--space-6)',
                minHeight: 160,
              }}
            >
              {/* Left content */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div>
                  <p
                    style={{
                      fontSize: 'var(--fs-sm)',
                      fontWeight: 700,
                      color: 'var(--nm-lesson)',
                      margin: '0 0 6px',
                      letterSpacing: '0',
                      textTransform: 'none',
                    }}
                  >
                    Continue learning
                  </p>

                  {derived && (
                    <h2
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 'var(--fs-xl)',
                        fontWeight: 700,
                        color: 'var(--on-surface)',
                        margin: '0 0 4px',
                        letterSpacing: '-0.02em',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {derived.plan.title}
                    </h2>
                  )}

                  {!derived && hasPaths && (
                    <h2
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 'var(--fs-xl)',
                        fontWeight: 700,
                        color: 'var(--on-surface)',
                        margin: '0 0 4px',
                      }}
                    >
                      Your learning path
                    </h2>
                  )}

                  {!hasPaths && (
                    <h2
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 'var(--fs-xl)',
                        fontWeight: 700,
                        color: 'var(--on-surface)',
                        margin: '0 0 4px',
                      }}
                    >
                      {notebooks[0]?.name ?? 'Get started'}
                    </h2>
                  )}

                  {derived && (
                    <p
                      style={{
                        fontSize: 'var(--fs-sm)',
                        color: 'var(--on-surface-variant)',
                        margin: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Section {derived.activePhaseIndex + 1} · {derived.activePhase.title}
                    </p>
                  )}
                </div>

                {derived && (
                  <ProgressBar
                    value={derived.percent}
                    color="var(--nm-lesson)"
                    height={8}
                    label="Progress"
                    showPercent
                  />
                )}

                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {derived ? (
                    <Link
                      href={pathCtaHref}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 20px',
                        minHeight: 44,
                        background: 'var(--nm-lesson)',
                        color: 'var(--nm-lesson-ink)',
                        borderRadius: 'var(--radius-full)',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 'var(--fs-sm)',
                        fontWeight: 700,
                        textDecoration: 'none',
                        transition: 'transform var(--dur-fast) var(--ease-spring)',
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
                      }}
                    >
                      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>
                        {derived.pathDone ? 'replay' : derived.nextSlotIsAssessment ? 'school' : 'arrow_forward'}
                      </span>
                      {pathCtaLabel}
                    </Link>
                  ) : (
                    <Link
                      href="/study-packs/new"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 20px',
                        minHeight: 44,
                        background: 'var(--nm-lesson)',
                        color: 'var(--nm-lesson-ink)',
                        borderRadius: 'var(--radius-full)',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 'var(--fs-sm)',
                        fontWeight: 700,
                        textDecoration: 'none',
                        transition: 'transform var(--dur-fast) var(--ease-spring)',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
                      }}
                    >
                      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>
                        auto_fix_high
                      </span>
                      Generate Learning Path
                    </Link>
                  )}

                  {derived && (
                    <Link
                      href={`/learn/paths/${encodeURIComponent(derived.plan.id)}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '10px 16px',
                        minHeight: 44,
                        background: 'var(--surface-container)',
                        color: 'var(--on-surface-variant)',
                        border: '1px solid var(--ink-08)',
                        borderRadius: 'var(--radius-full)',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 'var(--fs-sm)',
                        fontWeight: 600,
                        textDecoration: 'none',
                        transition: 'background var(--dur-fast) var(--ease-spring)',
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLAnchorElement).style.background =
                          'var(--surface-container-high)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLAnchorElement).style.background =
                          'var(--surface-container)';
                      }}
                    >
                      View path
                    </Link>
                  )}
                </div>
              </div>

              {/* Right: mascot — hidden on narrow */}
              <div
                aria-hidden
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  // Hide when viewport is narrow (no JS breakpoint hook needed,
                  // use CSS via inline media — we embed a <style> tag below)
                }}
                className="hero-mascot"
              >
                <Mascot pose="default" size="md" idle="float" />
              </div>
            </NMCard>
          </section>

          {/* Hide mascot on narrow viewports */}
          <style>{`
            @media (max-width: 600px) { .hero-mascot { display: none !important; } }
            @keyframes nmPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
            @media (prefers-reduced-motion: reduce) {
              .hero-mascot * { animation: none !important; }
              * { transition-duration: 0.01ms !important; }
            }
          `}</style>

          {/* C) Three supporting cards */}
          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
              // --space-5 is undefined in the scale (jumps 4→6), so the prior
              // `var(--space-5)` silently collapsed to a 0 gap. Use a defined
              // token; 32px matches the vertical rhythm between sections.
              gap: 'var(--space-8)',
              alignItems: 'start',
            }}
          >
            {/* 1. Today's Goal */}
            <NMCard style={{ padding: 'clamp(16px, 2.5vw, 24px)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <SectionHeading title="Today's Goal" icon="flag" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {[
                  { label: 'Complete 2 lessons', icon: 'menu_book' },
                  { label: 'Do 20 flashcards', icon: 'style' },
                  { label: 'Score 80%+ on a quiz', icon: 'quiz' },
                ].map(({ label, icon }) => (
                  <div
                    key={label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                      minHeight: 44,
                    }}
                  >
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 6,
                        border: '2px solid var(--ink-12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        background: 'transparent',
                      }}
                      aria-hidden
                    />
                    <span
                      className="material-symbols-outlined"
                      aria-hidden
                      style={{ fontSize: 18, color: 'var(--on-surface-variant)', flexShrink: 0 }}
                    >
                      {icon}
                    </span>
                    <span
                      style={{
                        fontSize: 'var(--fs-sm)',
                        color: 'var(--on-surface)',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      {label}
                    </span>
                  </div>
                ))}
              </div>
              {derived && (
                <Link
                  href={pathCtaHref}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    minHeight: 44,
                    marginTop: 'var(--space-2)',
                    background: 'var(--surface-container)',
                    color: 'var(--on-surface-variant)',
                    border: '1px solid var(--ink-08)',
                    borderRadius: 'var(--radius-full)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--fs-xs)',
                    fontWeight: 600,
                    textDecoration: 'none',
                    alignSelf: 'flex-start',
                    transition: 'background var(--dur-fast) var(--ease-spring)',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.background = 'var(--surface-container-high)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.background = 'var(--surface-container)';
                  }}
                >
                  <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 14 }}>
                    arrow_forward
                  </span>
                  Start studying
                </Link>
              )}
            </NMCard>

            {/* 2. Exam Countdown */}
            <NMCard
              accent="boss"
              style={{ padding: 'clamp(16px, 2.5vw, 24px)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
            >
              <SectionHeading
                title="Exam Countdown"
                icon="event"
                action={
                  <button
                    type="button"
                    onClick={() => setShowExamForm(true)}
                    aria-label="Add exam"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 10px',
                      minHeight: 32,
                      background: 'var(--surface-container)',
                      border: '1px solid var(--ink-08)',
                      borderRadius: 'var(--radius-full)',
                      color: 'var(--on-surface-variant)',
                      fontFamily: 'var(--font-sans)',
                      fontSize: 'var(--fs-xs)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'background var(--dur-fast) var(--ease-spring)',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        'var(--surface-container-high)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        'var(--surface-container)';
                    }}
                  >
                    <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 14 }}>
                      add
                    </span>
                    Add
                  </button>
                }
              />

              {nextExam && nextExamDays !== null ? (
                <>
                  <Link
                    href={`/exam/${nextExam.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                      textDecoration: 'none',
                      color: 'inherit',
                      margin: '-6px -8px',
                      padding: '6px 8px',
                      borderRadius: 'var(--radius-md)',
                      transition: 'background var(--dur-fast) var(--ease-spring)',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.background =
                        'var(--surface-container)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
                    }}
                  >
                    <span
                      style={{
                        padding: '6px 14px',
                        borderRadius: 'var(--radius-full)',
                        background: examUrgency(nextExamDays).bg,
                        color: examUrgency(nextExamDays).fg,
                        fontFamily: 'var(--font-display)',
                        fontSize: 'var(--fs-xl)',
                        fontWeight: 700,
                        letterSpacing: '-0.02em',
                        flexShrink: 0,
                      }}
                    >
                      {nextExamDays <= 0 ? 'Today!' : `${nextExamDays}d`}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: 'var(--fs-sm)',
                          fontWeight: 700,
                          color: 'var(--on-surface)',
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {nextExam.title}
                      </p>
                      <p
                        style={{
                          fontSize: 'var(--fs-xs)',
                          color: 'var(--on-surface-variant)',
                          margin: '2px 0 0',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {nextExam.notebookName}
                      </p>
                    </div>
                    <span
                      className="material-symbols-outlined"
                      aria-hidden
                      style={{
                        fontSize: 18,
                        color: 'var(--on-surface-variant)',
                        flexShrink: 0,
                        marginLeft: 'auto',
                      }}
                    >
                      chevron_right
                    </span>
                  </Link>

                  {sortedExams.length > 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {sortedExams.slice(1, 3).map((exam) => {
                        const days = Math.ceil(
                          (new Date(exam.examDate).getTime() - Date.now()) / 86400000,
                        );
                        return (
                          <div
                            key={exam.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 'var(--space-2)',
                              padding: '6px 8px',
                              borderRadius: 'var(--radius-sm)',
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: examUrgency(days).fg,
                                flexShrink: 0,
                              }}
                              aria-hidden
                            />
                            <Link
                              href={`/exam/${exam.id}`}
                              style={{
                                fontSize: 'var(--fs-xs)',
                                color: 'var(--on-surface)',
                                flex: 1,
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                textDecoration: 'none',
                              }}
                            >
                              {exam.title}
                            </Link>
                            <span
                              style={{
                                fontSize: 'var(--fs-xs)',
                                fontWeight: 700,
                                color: 'var(--on-surface-variant)',
                                flexShrink: 0,
                              }}
                            >
                              {days <= 0 ? 'today' : `${days}d`}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteExam(exam.id)}
                              aria-label={`Delete ${exam.title}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 24,
                                height: 24,
                                background: 'transparent',
                                border: 'none',
                                borderRadius: 6,
                                cursor: 'pointer',
                                color: 'var(--outline)',
                                opacity: 0.5,
                                transition: 'opacity var(--dur-fast) var(--ease-spring)',
                                flexShrink: 0,
                                padding: 0,
                              }}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.opacity = '1';
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.opacity = '0.5';
                              }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                                close
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDeleteExam(nextExam.id)}
                    aria-label={`Delete ${nextExam.title}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: 0,
                      minHeight: 'auto',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--on-surface-variant)',
                      fontFamily: 'var(--font-sans)',
                      fontSize: 'var(--fs-xs)',
                      opacity: 0.6,
                      transition: 'opacity var(--dur-fast) var(--ease-spring)',
                      alignSelf: 'flex-start',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.opacity = '1';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.opacity = '0.6';
                    }}
                  >
                    <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 14 }}>
                      close
                    </span>
                    Remove next exam
                  </button>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <p
                    style={{
                      fontSize: 'var(--fs-sm)',
                      color: 'var(--on-surface-variant)',
                      margin: 0,
                    }}
                  >
                    No exam scheduled.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowExamForm(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 14px',
                      minHeight: 44,
                      background: 'var(--surface-container)',
                      border: '1px solid var(--ink-08)',
                      borderRadius: 'var(--radius-full)',
                      fontFamily: 'var(--font-sans)',
                      fontSize: 'var(--fs-xs)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      color: 'var(--on-surface)',
                      alignSelf: 'flex-start',
                      transition: 'background var(--dur-fast) var(--ease-spring)',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        'var(--surface-container-high)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        'var(--surface-container)';
                    }}
                  >
                    <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 14 }}>
                      add
                    </span>
                    Add exam
                  </button>
                </div>
              )}
            </NMCard>

            {/* 3. Weak Topics */}
            <NMCard
              accent="review"
              style={{ padding: 'clamp(16px, 2.5vw, 24px)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
            >
              <SectionHeading title="Weak Topics" icon="priority_high" />
              {/* Weak topics surface only after real quiz/mistake data exists —
                  there is no weak-topic API on the dashboard yet, so we show the
                  honest empty state rather than placeholder chips. When the data
                  is wired up, render WeakTopicChip rows from it here. The
                  Progress page already derives real weak topics from path data. */}
              <p
                style={{
                  fontSize: 'var(--fs-sm)',
                  color: 'var(--on-surface-variant)',
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                Weak topics appear here after your first quiz. Until then, follow
                your path and Notemage will flag what needs review.
              </p>
            </NMCard>
          </section>

          {/* C2) Streak · This week · Overview — moved from the old Progress page */}
          <StudyStats plans={pathState.kind === 'ready' ? pathState.plans : []} />

          {/* D) Upload card — always visible */}
          <section>
            <NMCard
              style={{
                padding: 'clamp(16px, 2.5vw, 24px)',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 'var(--space-5)',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span
                    className="material-symbols-outlined"
                    aria-hidden
                    style={{ fontSize: 22, color: 'var(--on-surface-variant)' }}
                  >
                    upload_file
                  </span>
                  <h3
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 'var(--fs-base)',
                      fontWeight: 700,
                      color: 'var(--on-surface)',
                      margin: 0,
                    }}
                  >
                    Upload new material
                  </h3>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  flexWrap: 'wrap',
                }}
              >
                <Button
                  variant="primary"
                  size="md"
                  shape="pill"
                  leadingIcon="upload_file"
                  onClick={() => router.push('/study-packs/new')}
                >
                  Upload
                </Button>
              </div>
            </NMCard>
          </section>
        </>
      )}

      {/* Exam Form Modal */}
      {showExamForm && (
        <ExamForm
          notebooks={notebooks}
          onSubmit={handleCreateExam}
          onClose={() => setShowExamForm(false)}
        />
      )}
    </div>
  );
}
