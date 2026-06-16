'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ReadinessRing } from '@/components/rework/ReadinessRing';
import { ProgressBar } from '@/components/rework/ProgressBar';
import { NMCard } from '@/components/rework/NMCard';
import { SectionHeading } from '@/components/rework/SectionHeading';
import { Mascot } from '@/components/mascot/Mascot';
import { readinessColor } from '@/components/rework/tokens';
import type { PathPlan, PathSlot } from '@/components/learn/PathView';

// ── Types ────────────────────────────────────────────────────────────────────

interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  freezesLeft: number;
  isActiveToday: boolean;
}

interface DayData {
  date: string;
  count: number; // minutes studied that UTC day
}

interface DerivedStats {
  /** Total activity completions across all paths */
  totalActivities: number;
  completedActivities: number;
  /** Lesson-type slot completion pct (0–100). Drives 40% of readiness. */
  lessonCompletionPct: number;
  /** assessment/boss slots with bestPercentage (0–100). Drives quiz 30%. */
  quizAveragePct: number | null;
  /** # lessons completed (slots of kind=learning that are done) */
  lessonsCompleted: number;
  /** # quiz/assessment slots completed */
  quizzesTaken: number;
  /** # assessment slots with bestPercentage >= 0.7 (boss tests passed) */
  bossTestsPassed: number;
  /** Readiness: renormalized over available components (0–100) */
  readiness: number;
  /** Per-phase topic mastery rows */
  topics: { title: string; pct: number; pathTitle: string }[];
  /** Phase with lowest pct — the weak topic name, or null */
  weakTopicName: string | null;
  /** Whether we have any real data at all */
  hasData: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toUtcDateStr(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** UTC date string for `daysAgo` days before today. */
function daysAgoUtc(n: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return toUtcDateStr(d);
}

/** Build the last 7 UTC date strings ending today (Mon–Sun order or whatever the calendar lands on). */
function last7Dates(): string[] {
  const result: string[] = [];
  for (let i = 6; i >= 0; i--) {
    result.push(daysAgoUtc(i));
  }
  return result;
}

/** Get short weekday label from a UTC date string. */
function weekdayShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
}

function deriveStats(plans: PathPlan[]): DerivedStats {
  if (plans.length === 0) {
    return {
      totalActivities: 0,
      completedActivities: 0,
      lessonCompletionPct: 0,
      quizAveragePct: null,
      lessonsCompleted: 0,
      quizzesTaken: 0,
      bossTestsPassed: 0,
      readiness: 0,
      topics: [],
      weakTopicName: null,
      hasData: false,
    };
  }

  let totalActivities = 0;
  let completedActivities = 0;
  let lessonSlotsTotal = 0;
  let lessonSlotsDone = 0;
  let quizScoreSum = 0;
  let quizScoreCount = 0;
  let lessonsCompleted = 0;
  let quizzesTaken = 0;
  let bossTestsPassed = 0;

  const topics: { title: string; pct: number; pathTitle: string }[] = [];

  for (const plan of plans) {
    for (const phase of plan.phases) {
      let phaseTotalSlots = 0;
      let phaseDoneSlots = 0;

      for (const slot of phase.slots as (PathSlot & { bestPercentage?: number | null })[]) {
        phaseTotalSlots += 1;
        if (slot.completed) phaseDoneSlots += 1;

        for (const activity of slot.activities) {
          totalActivities += 1;
          if (activity.completed) completedActivities += 1;
        }

        const isLearning = slot.kind === 'learning' || slot.kind === 'review';
        const isAssessment = slot.kind === 'assessment' || slot.kind === 'final_exam';

        if (isLearning) {
          lessonSlotsTotal += 1;
          if (slot.completed) {
            lessonSlotsDone += 1;
            lessonsCompleted += 1;
          }
        }

        if (isAssessment) {
          if (slot.completed) quizzesTaken += 1;
          if (
            slot.completed &&
            slot.bestPercentage !== null &&
            slot.bestPercentage !== undefined
          ) {
            quizScoreSum += slot.bestPercentage;
            quizScoreCount += 1;
            if (slot.bestPercentage >= 70) bossTestsPassed += 1;
          }
        }
      }

      const phasePct = phaseTotalSlots > 0 ? Math.round((phaseDoneSlots / phaseTotalSlots) * 100) : 0;
      topics.push({ title: phase.title, pct: phasePct, pathTitle: plan.title });
    }
  }

  const lessonCompletionPct = lessonSlotsTotal > 0 ? (lessonSlotsDone / lessonSlotsTotal) * 100 : 0;
  const quizAveragePct = quizScoreCount > 0 ? quizScoreSum / quizScoreCount : null;

  // Readiness formula with renormalized weights for available components.
  // Available: lessonCompletionPct (weight 0.40), quizAveragePct if present (0.30).
  // Unavailable: flashcardConfidencePct (0.20), weakReviewPct (0.10).
  let readiness = 0;
  if (quizAveragePct !== null) {
    // All lesson + quiz components present; renormalize over 0.70 weight.
    const raw = 0.40 * lessonCompletionPct + 0.30 * quizAveragePct;
    readiness = raw / 0.70;
  } else if (lessonSlotsTotal > 0) {
    // Only lesson completion available.
    readiness = lessonCompletionPct;
  }

  readiness = Math.min(100, Math.max(0, Math.round(readiness)));

  // Weak topic: lowest % phase with pct < 100.
  const incomplete = topics.filter((t) => t.pct < 100);
  const weakest = incomplete.length > 0
    ? incomplete.reduce((a, b) => (a.pct <= b.pct ? a : b))
    : null;

  return {
    totalActivities,
    completedActivities,
    lessonCompletionPct,
    quizAveragePct,
    lessonsCompleted,
    quizzesTaken,
    bossTestsPassed,
    readiness,
    topics,
    weakTopicName: weakest?.title ?? null,
    hasData: totalActivities > 0,
  };
}

function readinessMessage(readiness: number, weakTopic: string | null): string {
  if (readiness === 0) return 'Finish a lesson to unlock your score.';
  if (readiness < 30) return weakTopic
    ? `Getting started. Work through ${weakTopic} next.`
    : 'Keep going — you\'re building momentum.';
  if (readiness < 60) return weakTopic
    ? `You\'re improving. Focus on ${weakTopic} next.`
    : 'Solid start — keep completing lessons.';
  if (readiness < 80) return weakTopic
    ? `Looking good. Nail ${weakTopic} to push higher.`
    : 'Good progress — almost exam-ready.';
  return 'You\'re exam-ready. Keep the streak alive.';
}

// ── Weekly bar chart data ────────────────────────────────────────────────────

interface WeekDay {
  label: string;
  dateStr: string;
  minutes: number;
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  value,
  label,
  muted,
}: {
  icon: string;
  value: string | number;
  label: string;
  muted?: boolean;
}) {
  return (
    <NMCard
      style={{
        padding: 'clamp(14px, 2vw, 20px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span
          className="material-symbols-outlined"
          aria-hidden
          style={{ fontSize: 18, color: muted ? 'var(--on-surface-variant)' : 'var(--primary)', opacity: muted ? 0.5 : 1 }}
        >
          {icon}
        </span>
        <span
          style={{
            fontSize: 'var(--fs-xs)',
            color: 'var(--on-surface-variant)',
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            opacity: muted ? 0.6 : 1,
          }}
        >
          {label}
        </span>
      </div>
      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(var(--fs-2xl), 4vw, 36px)',
          fontWeight: 800,
          color: muted ? 'var(--on-surface-variant)' : 'var(--on-surface)',
          margin: 0,
          letterSpacing: '-0.03em',
          opacity: muted ? 0.5 : 1,
        }}
      >
        {value}
      </p>
    </NMCard>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ProgressPage() {
  const [plans, setPlans] = useState<PathPlan[] | null>(null);
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [dayMap, setDayMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Fetch all data in parallel.
  useEffect(() => {
    let cancelled = false;

    const fetchPaths = fetch('/api/learn/paths')
      .then((r) => r.json())
      .then((body: { success?: boolean; data?: PathPlan[] }) => {
        if (cancelled) return;
        if (body.success && Array.isArray(body.data)) {
          setPlans(body.data);
        } else {
          setPlans([]);
        }
      })
      .catch(() => {
        if (!cancelled) setPlans([]);
      });

    const fetchStreak = fetch('/api/user/streak')
      .then((r) => r.json())
      .then((body: { success?: boolean; data?: StreakInfo }) => {
        if (cancelled) return;
        if (body.success && body.data) setStreak(body.data);
      })
      .catch(() => {});

    // 14 days covers this week plus last week. count = minutes.
    const fetchActivity = fetch('/api/user/activity-heatmap?days=14')
      .then((r) => r.json())
      .then((body: { data?: { data?: DayData[] } | DayData[] }) => {
        if (cancelled) return;
        const raw: DayData[] = Array.isArray(body.data)
          ? (body.data as DayData[])
          : ((body.data as { data?: DayData[] })?.data ?? []);
        const map: Record<string, number> = {};
        for (const d of raw) map[d.date] = d.count;
        setDayMap(map);
      })
      .catch(() => {});

    Promise.all([fetchPaths, fetchStreak, fetchActivity]).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => deriveStats(plans ?? []), [plans]);

  const weekDays = useMemo<WeekDay[]>(() => {
    const dates = last7Dates();
    return dates.map((dateStr) => ({
      label: weekdayShort(dateStr),
      dateStr,
      minutes: dayMap[dateStr] ?? 0,
    }));
  }, [dayMap]);

  const maxMinutes = useMemo(
    () => Math.max(1, ...weekDays.map((d) => d.minutes)),
    [weekDays],
  );

  const isLoading = loading;
  const isEmpty = !loading && !stats.hasData;

  return (
    <div
      className="nm-rework"
      style={{
        maxWidth: 1180,
        margin: '0 auto',
        width: '100%',
        padding: 'clamp(16px, 4vw, 32px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-8)',
      }}
    >
      <SectionHeading
        title="Progress"
        subtitle="See yourself getting exam-ready."
        icon="trending_up"
      />

      {/* Loading skeleton */}
      {isLoading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            color: 'var(--on-surface-variant)',
            fontSize: 'var(--fs-sm)',
            fontFamily: 'var(--font-sans)',
            padding: 'var(--space-8) 0',
          }}
        >
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 20 }}>
            hourglass_empty
          </span>
          Loading your progress…
        </div>
      )}

      {/* ── EMPTY STATE ─────────────────────────────────────────────────────── */}
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
          <Mascot pose="graduation" size="lg" idle="float" />
          <div style={{ maxWidth: 460 }}>
            <h2
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
              No progress yet
            </h2>
            <p
              style={{
                fontSize: 'var(--fs-base)',
                color: 'var(--on-surface-variant)',
                lineHeight: 1.7,
                margin: '0 0 var(--space-6)',
              }}
            >
              Start your first lesson to unlock exam readiness, topic mastery,
              and streak tracking.
            </p>
            <Link
              href="/my-path"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 28px',
                minHeight: 48,
                background: 'var(--primary)',
                color: 'var(--on-primary)',
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
                school
              </span>
              Start learning
            </Link>
          </div>
        </section>
      )}

      {/* ── POPULATED STATE ─────────────────────────────────────────────────── */}
      {!isLoading && !isEmpty && (
        <>
          {/* ── 1. EXAM READINESS ─────────────────────────────────────────── */}
          <section>
            <NMCard
              style={{
                padding: 'clamp(20px, 3vw, 32px)',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 'var(--space-8)',
                flexWrap: 'wrap',
              }}
            >
              <ReadinessRing
                value={stats.readiness}
                size={180}
                strokeWidth={16}
                label="Exam Ready"
              />
              <div
                style={{
                  flex: 1,
                  minWidth: 220,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-4)',
                }}
              >
                <div>
                  <p
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 'var(--fs-xs)',
                      fontWeight: 700,
                      color: 'var(--on-surface-variant)',
                      margin: '0 0 var(--space-1)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    Exam Readiness
                  </p>
                  <h2
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'clamp(var(--fs-2xl), 4vw, var(--fs-3xl))',
                      fontWeight: 800,
                      color: readinessColor(stats.readiness),
                      margin: 0,
                      letterSpacing: '-0.03em',
                      lineHeight: 1.1,
                    }}
                  >
                    {stats.readiness}%
                  </h2>
                </div>
                <p
                  style={{
                    fontSize: 'var(--fs-sm)',
                    color: 'var(--on-surface-variant)',
                    margin: 0,
                    lineHeight: 1.6,
                    maxWidth: 380,
                  }}
                >
                  {readinessMessage(stats.readiness, stats.weakTopicName)}
                </p>

                {/* Formula breakdown — honest about what's used */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-1)',
                    padding: 'var(--space-3)',
                    background: 'var(--surface-container)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--fs-xs)',
                    color: 'var(--on-surface-variant)',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  <span style={{ fontWeight: 700, color: 'var(--on-surface)', marginBottom: 2 }}>
                    Score components
                  </span>
                  <span>
                    Lesson completion:{' '}
                    <strong style={{ color: 'var(--on-surface)' }}>
                      {Math.round(stats.lessonCompletionPct)}%
                    </strong>{' '}
                    (real)
                  </span>
                  {stats.quizAveragePct !== null ? (
                    <span>
                      Quiz average:{' '}
                      <strong style={{ color: 'var(--on-surface)' }}>
                        {Math.round(stats.quizAveragePct)}%
                      </strong>{' '}
                      (real)
                    </span>
                  ) : (
                    <span style={{ opacity: 0.6 }}>
                      Quiz average: — (no boss tests completed yet)
                    </span>
                  )}
                  <span style={{ opacity: 0.6 }}>
                    Flashcard confidence: — (not tracked yet)
                  </span>
                  <span style={{ opacity: 0.6 }}>
                    Weak-topic review: — (not tracked yet)
                  </span>
                </div>
              </div>

              {/* Streak bubble — real data from /api/user/streak */}
              {streak !== null && streak.currentStreak > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 'var(--space-1)',
                    padding: 'var(--space-4)',
                    background: 'var(--nm-streak, var(--surface-container))',
                    borderRadius: 'var(--radius-lg)',
                    minWidth: 88,
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 28, lineHeight: 1 }}>🔥</span>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'var(--fs-2xl)',
                      fontWeight: 800,
                      color: 'var(--on-surface)',
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {streak.currentStreak}
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--fs-xs)',
                      fontWeight: 600,
                      color: 'var(--on-surface-variant)',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    day streak
                  </span>
                </div>
              )}
            </NMCard>
          </section>

          {/* ── 2. OVERALL STATS ─────────────────────────────────────────────── */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <SectionHeading title="Overview" icon="bar_chart" />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
                gap: 'var(--space-4)',
              }}
            >
              <StatCard
                icon="menu_book"
                value={stats.lessonsCompleted}
                label="Lessons completed"
              />
              <StatCard
                icon="quiz"
                value={stats.quizzesTaken}
                label="Quizzes taken"
              />
              <StatCard
                icon="style"
                value="—"
                label="Flashcards reviewed"
                muted
              />
              <StatCard
                icon="fort"
                value={stats.bossTestsPassed}
                label="Boss tests passed"
              />
              {streak && (
                <StatCard
                  icon="local_fire_department"
                  value={streak.currentStreak}
                  label="Day streak"
                />
              )}
            </div>
          </section>

          {/* ── 3. TOPIC MASTERY ─────────────────────────────────────────────── */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <SectionHeading title="Topic Mastery" icon="workspace_premium" />
            {stats.topics.length === 0 ? (
              <NMCard style={{ padding: 'clamp(16px, 2.5vw, 24px)' }}>
                <p
                  style={{
                    fontSize: 'var(--fs-sm)',
                    color: 'var(--on-surface-variant)',
                    margin: 0,
                    lineHeight: 1.6,
                  }}
                >
                  Topic mastery unlocks as you complete lessons.
                </p>
              </NMCard>
            ) : (
              <NMCard style={{ padding: 'clamp(16px, 2.5vw, 24px)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                  {(() => {
                    const isMultiPath = new Set(stats.topics.map((t) => t.pathTitle)).size > 1;
                    return stats.topics.map((topic, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          gap: 'var(--space-3)',
                          minHeight: 0,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 'var(--fs-sm)',
                            fontWeight: 600,
                            color: 'var(--on-surface)',
                            fontFamily: 'var(--font-sans)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          {topic.title}
                        </span>
                        {isMultiPath && (
                          <span
                            style={{
                              fontSize: 'var(--fs-xs)',
                              color: 'var(--on-surface-variant)',
                              flexShrink: 0,
                              opacity: 0.7,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 120,
                            }}
                          >
                            {topic.pathTitle}
                          </span>
                        )}
                      </div>
                      <ProgressBar
                        value={topic.pct}
                        color={readinessColor(topic.pct)}
                        height={8}
                        showPercent
                      />
                    </div>
                  ));
                  })()}
                </div>
              </NMCard>
            )}
          </section>

          {/* ── 4. WEAK TOPICS ──────────────────────────────────────────────── */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <SectionHeading title="Weak Topics" icon="priority_high" />
            <NMCard accent="review" style={{ padding: 'clamp(16px, 2.5vw, 24px)' }}>
              {stats.weakTopicName !== null ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center' }}>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      minHeight: 44,
                      padding: '8px 14px',
                      borderRadius: 'var(--radius-full)',
                      background: 'var(--nm-review-soft)',
                      border: '1px solid var(--nm-review)',
                      color: 'var(--nm-review)',
                      fontSize: 'var(--fs-sm)',
                      fontWeight: 600,
                      fontFamily: 'var(--font-sans)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16 }}>
                      priority_high
                    </span>
                    {stats.weakTopicName}
                    <Link
                      href="/learn"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        background: 'transparent',
                        color: 'var(--nm-review)',
                        border: '1px solid var(--nm-review)',
                        fontSize: 'var(--fs-sm)',
                        fontWeight: 700,
                        fontFamily: 'var(--font-sans)',
                        textDecoration: 'none',
                        transition: 'background var(--dur-fast) var(--ease-spring), color var(--dur-fast) var(--ease-spring)',
                      }}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget as HTMLAnchorElement;
                        el.style.background = 'var(--nm-review)';
                        el.style.color = 'var(--nm-review-ink)';
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget as HTMLAnchorElement;
                        el.style.background = 'transparent';
                        el.style.color = 'var(--nm-review)';
                      }}
                    >
                      Review
                    </Link>
                  </div>
                  <p
                    style={{
                      fontSize: 'var(--fs-xs)',
                      color: 'var(--on-surface-variant)',
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    Derived from your lowest-progress section. More weak topics
                    appear after boss tests reveal specific gaps.
                  </p>
                </div>
              ) : (
                <p
                  style={{
                    fontSize: 'var(--fs-sm)',
                    color: 'var(--on-surface-variant)',
                    margin: 0,
                    lineHeight: 1.6,
                  }}
                >
                  No weak topics yet — they appear after quizzes reveal gaps.
                </p>
              )}
            </NMCard>
          </section>

          {/* ── 5. STUDY HISTORY (weekly mini bar chart) ──────────────────── */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <SectionHeading title="This week" icon="calendar_today" />
            <NMCard style={{ padding: 'clamp(16px, 2.5vw, 24px)' }}>
              <p
                style={{
                  fontSize: 'var(--fs-xs)',
                  color: 'var(--on-surface-variant)',
                  margin: '0 0 var(--space-4)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                Minutes studied per day (last 7 days)
              </p>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 'clamp(4px, 1.2vw, 10px)',
                  height: 80,
                }}
                role="img"
                aria-label="Weekly study activity bar chart"
              >
                {weekDays.map((day) => {
                  const heightPct = maxMinutes > 0 ? (day.minutes / maxMinutes) * 100 : 0;
                  const hasActivity = day.minutes > 0;
                  return (
                    <div
                      key={day.dateStr}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 'var(--space-1)',
                        height: '100%',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <span
                        title={`${day.minutes} min on ${day.label}`}
                        style={{
                          width: '100%',
                          maxWidth: 36,
                          height: hasActivity ? `${Math.max(8, heightPct)}%` : 6,
                          background: hasActivity ? 'var(--primary)' : 'var(--ink-12)',
                          borderRadius: 'var(--radius-sm)',
                          transition: 'height var(--dur-normal) var(--ease-spring)',
                          opacity: hasActivity ? 1 : 0.4,
                          flexShrink: 0,
                        }}
                        aria-label={`${day.label}: ${day.minutes} minutes`}
                      />
                      <span
                        style={{
                          fontSize: 'var(--fs-xs)',
                          color: 'var(--on-surface-variant)',
                          fontFamily: 'var(--font-sans)',
                          fontWeight: hasActivity ? 700 : 400,
                          opacity: hasActivity ? 1 : 0.5,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {day.label.slice(0, 2)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              {weekDays.every((d) => d.minutes === 0) && (
                <p
                  style={{
                    fontSize: 'var(--fs-xs)',
                    color: 'var(--on-surface-variant)',
                    margin: 'var(--space-3) 0 0',
                    opacity: 0.6,
                  }}
                >
                  No activity recorded this week yet.
                </p>
              )}
            </NMCard>
          </section>

          {/* ── 6. STREAK SUMMARY ───────────────────────────────────────────── */}
          {streak && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <SectionHeading title="Streak" icon="local_fire_department" />
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
                  gap: 'var(--space-4)',
                }}
              >
                <StatCard
                  icon="local_fire_department"
                  value={streak.currentStreak}
                  label="Current streak"
                />
                <StatCard
                  icon="emoji_events"
                  value={streak.longestStreak}
                  label="Longest streak"
                />
                <StatCard
                  icon="ac_unit"
                  value={streak.freezesLeft}
                  label="Freezes left"
                />
                <NMCard
                  style={{
                    padding: 'clamp(14px, 2vw, 20px)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-2)',
                    minWidth: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span
                      className="material-symbols-outlined"
                      aria-hidden
                      style={{ fontSize: 18, color: streak.isActiveToday ? 'var(--nm-complete)' : 'var(--on-surface-variant)', opacity: streak.isActiveToday ? 1 : 0.5 }}
                    >
                      {streak.isActiveToday ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                    <span
                      style={{
                        fontSize: 'var(--fs-xs)',
                        color: 'var(--on-surface-variant)',
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 600,
                      }}
                    >
                      Today
                    </span>
                  </div>
                  <p
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'var(--fs-xl)',
                      fontWeight: 800,
                      color: streak.isActiveToday ? 'var(--nm-complete)' : 'var(--on-surface-variant)',
                      margin: 0,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {streak.isActiveToday ? 'Done!' : 'Study now'}
                  </p>
                </NMCard>
              </div>
            </section>
          )}
        </>
      )}

      {/* Animations + focus rings */}
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
        }
        a:focus-visible, button:focus-visible {
          outline: 3px solid var(--primary);
          outline-offset: 3px;
          border-radius: var(--radius-sm);
        }
      `}</style>
    </div>
  );
}
