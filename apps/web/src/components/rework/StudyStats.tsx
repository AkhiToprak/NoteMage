'use client';

import { useEffect, useMemo, useState } from 'react';
import { NMCard } from '@/components/rework/NMCard';
import { SectionHeading } from '@/components/rework/SectionHeading';
import { derivePathStats } from '@/lib/path-stats';
import type { PathPlan } from '@/components/learn/PathView';

// Streak / This week / Overview — lifted from the old dedicated Progress page
// (`app/(dashboard)/progress/page.tsx`, since removed) onto the dashboard. The
// Overview counts aggregate `derivePathStats` across every path so the
// slot-counting stays single-sourced with /my-path.

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

interface WeekDay {
  label: string;
  dateStr: string;
  minutes: number;
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function toUtcDateStr(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** UTC date string for `n` days before today. */
function daysAgoUtc(n: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return toUtcDateStr(d);
}

/** The last 7 UTC date strings ending today. */
function last7Dates(): string[] {
  const result: string[] = [];
  for (let i = 6; i >= 0; i--) result.push(daysAgoUtc(i));
  return result;
}

/** Short weekday label from a UTC date string. */
function weekdayShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
}

/** Compact minute count: "0 min" · "45 min" · "2h 5m" · "3h". */
function fmtMinutes(m: number): string {
  if (m <= 0) return '0 min';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}

/** Tallest bar, in px, leaving headroom for the value label above it. */
const MAX_BAR_PX = 92;

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

// ── Main ─────────────────────────────────────────────────────────────────────

/**
 * The Streak / This week / Overview cluster. Reads the paths it's handed for
 * lesson/quiz/boss counts and fetches streak + weekly activity on its own.
 */
export function StudyStats({ plans }: { plans: PathPlan[] }) {
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [dayMap, setDayMap] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;

    fetch('/api/user/streak')
      .then((r) => r.json())
      .then((body: { success?: boolean; data?: StreakInfo }) => {
        if (cancelled) return;
        if (body.success && body.data) setStreak(body.data);
      })
      .catch(() => {});

    // 14 days covers this week plus last week. count = minutes.
    fetch('/api/user/activity-heatmap?days=14')
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

    return () => {
      cancelled = true;
    };
  }, []);

  // Overview counts — aggregate the per-path stats so the slot accounting
  // stays single-sourced with derivePathStats (used on /my-path).
  const overview = useMemo(() => {
    return plans.reduce(
      (acc, plan) => {
        const s = derivePathStats(plan);
        acc.lessonsCompleted += s.lessonsCompleted;
        acc.quizzesTaken += s.quizzesTaken;
        acc.bossTestsPassed += s.bossTestsPassed;
        return acc;
      },
      { lessonsCompleted: 0, quizzesTaken: 0, bossTestsPassed: 0 },
    );
  }, [plans]);

  const weekDays = useMemo<WeekDay[]>(() => {
    return last7Dates().map((dateStr) => ({
      label: weekdayShort(dateStr),
      dateStr,
      minutes: dayMap[dateStr] ?? 0,
    }));
  }, [dayMap]);

  const maxMinutes = useMemo(
    () => Math.max(1, ...weekDays.map((d) => d.minutes)),
    [weekDays],
  );

  const totalMinutes = useMemo(
    () => weekDays.reduce((sum, d) => sum + d.minutes, 0),
    [weekDays],
  );

  // The last entry in last7Dates() is always today.
  const todayStr = weekDays[weekDays.length - 1]?.dateStr ?? '';

  // role="img" collapses the chart's subtree for assistive tech, so carry the
  // full per-day readout in one summary label.
  const weekAriaLabel = useMemo(
    () =>
      `Minutes studied per day, last 7 days. ${weekDays
        .map((d) => `${d.label} ${d.minutes}`)
        .join(', ')}.`,
    [weekDays],
  );

  return (
    <>
      {/* ── OVERVIEW ─────────────────────────────────────────────────────────── */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <SectionHeading title="Overview" icon="bar_chart" />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          <StatCard icon="menu_book" value={overview.lessonsCompleted} label="Lessons completed" />
          <StatCard icon="quiz" value={overview.quizzesTaken} label="Quizzes taken" />
          <StatCard icon="style" value="—" label="Flashcards reviewed" muted />
          <StatCard icon="fort" value={overview.bossTestsPassed} label="Boss tests passed" />
          {streak && (
            <StatCard icon="local_fire_department" value={streak.currentStreak} label="Day streak" />
          )}
        </div>
      </section>

      {/* ── THIS WEEK (weekly mini bar chart) ───────────────────────────────── */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <SectionHeading title="This week" icon="calendar_today" />
        <NMCard style={{ padding: 'clamp(16px, 2.5vw, 24px)' }}>
          {/* Header — caption left, weekly total right */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
              flexWrap: 'wrap',
              marginBottom: 'var(--space-5)',
            }}
          >
            <span
              style={{
                fontSize: 'var(--fs-xs)',
                color: 'var(--on-surface-variant)',
                fontFamily: 'var(--font-sans)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Minutes studied · last 7 days
            </span>
            <span
              style={{
                fontSize: 'var(--fs-xs)',
                color: 'var(--on-surface-variant)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <strong
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--fs-base)',
                  color: 'var(--on-surface)',
                  letterSpacing: '-0.02em',
                }}
              >
                {fmtMinutes(totalMinutes)}
              </strong>{' '}
              total
            </span>
          </div>

          {/* Bars — value above each, resting on a shared baseline */}
          <div
            role="img"
            aria-label={weekAriaLabel}
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 'clamp(6px, 1.5vw, 18px)',
              minHeight: MAX_BAR_PX + 22,
            }}
          >
            {weekDays.map((day) => {
              const hasActivity = day.minutes > 0;
              const isToday = day.dateStr === todayStr;
              const barPx = hasActivity
                ? Math.max(8, Math.round((day.minutes / maxMinutes) * MAX_BAR_PX))
                : 3;
              return (
                <div
                  key={day.dateStr}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 6,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'var(--fs-xs)',
                      fontWeight: 700,
                      lineHeight: 1,
                      letterSpacing: '-0.01em',
                      color: hasActivity
                        ? isToday
                          ? 'var(--primary)'
                          : 'var(--on-surface)'
                        : 'transparent',
                    }}
                  >
                    {day.minutes}
                  </span>
                  <span
                    title={`${day.minutes} min on ${day.label}`}
                    style={{
                      width: '100%',
                      maxWidth: 46,
                      height: barPx,
                      background: hasActivity ? 'var(--primary)' : 'var(--ink-12)',
                      borderRadius: 'var(--radius-sm)',
                      opacity: hasActivity ? (isToday ? 1 : 0.8) : 0.5,
                      transition: 'height var(--dur-normal) var(--ease-spring)',
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* Baseline axis */}
          <div
            aria-hidden
            style={{ height: 1, background: 'var(--ink-12)', margin: 'var(--space-2) 0' }}
          />

          {/* Weekday labels — under the axis, today emphasised */}
          <div style={{ display: 'flex', gap: 'clamp(6px, 1.5vw, 18px)' }}>
            {weekDays.map((day) => {
              const isToday = day.dateStr === todayStr;
              return (
                <span
                  key={day.dateStr}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: 'center',
                    fontSize: 'var(--fs-xs)',
                    fontFamily: 'var(--font-sans)',
                    fontWeight: isToday ? 700 : 500,
                    color: isToday ? 'var(--primary)' : 'var(--on-surface-variant)',
                    opacity: isToday ? 1 : 0.7,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {day.label.slice(0, 2)}
                </span>
              );
            })}
          </div>

          {totalMinutes === 0 && (
            <p
              style={{
                fontSize: 'var(--fs-xs)',
                color: 'var(--on-surface-variant)',
                margin: 'var(--space-4) 0 0',
                opacity: 0.6,
              }}
            >
              No activity recorded this week yet.
            </p>
          )}
        </NMCard>
      </section>

      {/* ── STREAK ───────────────────────────────────────────────────────────── */}
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
            <StatCard icon="local_fire_department" value={streak.currentStreak} label="Current streak" />
            <StatCard icon="emoji_events" value={streak.longestStreak} label="Longest streak" />
            <StatCard icon="ac_unit" value={streak.freezesLeft} label="Freezes left" />
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
  );
}

export default StudyStats;
