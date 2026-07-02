'use client';

/* Exam Mode Phase 4 — Study Calendar (Figma "X2 Study Calendar" 89:20014 web /
 * 89:18448 mobile / "No study plan" empty). The plan laid out across the days to
 * the exam: a "path to exam day" milestone stepper, the day-by-day session cards,
 * and the daily-study-time slider that rebalances the plan.
 *
 * Same active ExamStudyPlan as Today's Plan — this is the calendar view of it.
 * Honest: every day card maps to real scheduled tasks; the slider re-buckets
 * deterministically (free, instant). Cream `.shell` + `ui.module.css` tokens. */

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/app/AppShell';
import ui from '@/components/app/ui.module.css';
import styles from './Calendar.module.css';
import { useRegisterMageContext } from '@/components/mage';
import { KindChip, DailyTimeSlider } from '@/components/exam/StudyPlanBits';
import { KIND_META, type ExamPlanView, type PlanDayView } from '@/lib/exam-study-plan-core';

interface ExamMeta {
  id: string;
  title: string;
  examDate: string;
  notebookId: string;
  notebookName: string | null;
}
export interface PlanResponse {
  exam: ExamMeta;
  daysUntil: number;
  readiness: number;
  hasGradedMaterial: boolean;
  hasScope: boolean;
  primaryPathId: string | null;
  plan: ExamPlanView | null;
}

interface CalendarViewProps {
  examId: string;
  /** Plan resolved on the server (the same shape the /plan GET returned). Null
   *  only when the plan load failed (errored); a genuine not-found is a 404
   *  upstream in the server page. */
  initialData: PlanResponse | null;
  errored: boolean;
}

export default function CalendarView({ examId, initialData, errored }: CalendarViewProps) {
  const [data, setData] = useState<PlanResponse | null>(initialData);

  useRegisterMageContext(
    data?.exam
      ? { type: 'exam', ids: { examId, notebookId: data.exam.notebookId }, title: data.exam.title }
      : { type: 'exam', ids: { examId }, title: 'Exam' },
  );

  if (errored || !data) {
    return (
      <AppShell>
        <CenteredMessage
          icon="error"
          title="Couldn’t load your calendar"
          body="Something went wrong. Please try again."
          action={<Link href={`/exam/${examId}/calendar`} className={`${ui.btn} ${ui.secondary}`}>Retry</Link>}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <CalendarScreen examId={examId} data={data} onPlan={(plan) => setData((d) => (d ? { ...d, plan } : d))} />
    </AppShell>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────────

function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, opts);
}

function dayHeadline(day: PlanDayView): string {
  const k = day.headlineKind;
  if (!k) return 'Study session';
  const m = KIND_META[k];
  if (k === 'mock') return 'Mock · timed run';
  if (k === 'final_revision') return 'Final revision';
  if (m.tone === 'review') return `Review · ${m.label}`;
  return `Study · ${m.label}`;
}

function dayDescription(day: PlanDayView): string {
  if (day.items.length === 1) return day.items[0].reason;
  const weak = day.items.filter((i) => i.weakPoint).length;
  const kinds = new Set(day.items.map((i) => i.kind)).size;
  if (weak > 0) return `${day.items.length} tasks · ${weak} weak ${weak === 1 ? 'point' : 'points'} to clear.`;
  return `${day.items.length} tasks across ${kinds} ${kinds === 1 ? 'kind' : 'kinds'} of practice.`;
}

// ─── Screen ─────────────────────────────────────────────────────────────────

function CalendarScreen({
  examId,
  data,
  onPlan,
}: {
  examId: string;
  data: PlanResponse;
  onPlan: (plan: ExamPlanView) => void;
}) {
  const { exam, plan } = data;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const adjustRef = useRef<HTMLElement | null>(null);

  const setDailyMinutes = useCallback(
    async (v: number) => {
      setBusy(true);
      setErr(null);
      try {
        const res = await fetch(`/api/user/exams/${examId}/plan`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'set_daily_minutes', dailyMinutesTarget: v }),
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.data?.plan) onPlan(json.data.plan as ExamPlanView);
        else setErr(json?.error ?? 'Couldn’t reschedule. Try again.');
      } catch {
        setErr('Network error — please try again.');
      } finally {
        setBusy(false);
      }
    },
    [examId, onPlan],
  );

  const regenerate = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/user/exams/${examId}/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.data?.plan) onPlan(json.data.plan as ExamPlanView);
      else setErr(json?.error ?? 'Couldn’t rebuild the plan. Try again.');
    } catch {
      setErr('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }, [examId, onPlan]);

  if (!plan) {
    return (
      <div className={styles.page}>
        <Link href={`/exam/${examId}`} className={styles.back}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>chevron_left</span>
          {exam.title}
        </Link>
        <EmptyState hasScope={data.hasScope} examId={examId} busy={busy} err={err} onGenerate={regenerate} />
      </div>
    );
  }

  const totalDays = plan.days.length;
  const doneDays = plan.days.filter((d) => d.taskCount > 0 && d.doneCount >= d.taskCount).length;
  const behind = plan.days.some((d) => d.dayOffset < 0 && d.doneCount < d.taskCount);

  return (
    <div className={styles.page}>
      <Link href={`/exam/${examId}`} className={styles.back}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>chevron_left</span>
        {exam.title} dashboard
      </Link>

      <div className={styles.headRow}>
        <div className={styles.titleWrap}>
          <h1 className={styles.title}>Study plan</h1>
          <p className={styles.subtitle}>
            {Math.max(0, plan.daysUntil)} {plan.daysUntil === 1 ? 'day' : 'days'} to exam · {exam.title}
          </p>
        </div>
        <button
          type="button"
          className={`${ui.btn} ${ui.ghost} ${styles.adjustBtn}`}
          onClick={() => adjustRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        >
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 17 }}>tune</span>
          Adjust schedule
        </button>
      </div>

      {/* mobile summary (hidden on web) */}
      <section className={styles.mobileSummary}>
        <div className={styles.msTop}>
          <h2 className={styles.msTitle}>{Math.max(0, plan.daysUntil)} {plan.daysUntil === 1 ? 'day' : 'days'} to exam</h2>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 22, color: 'var(--gold)' }}>military_tech</span>
        </div>
        <p className={styles.msSub}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 14, verticalAlign: '-2px' }}>event</span>
          {' '}{exam.title} · {fmtDate(exam.examDate, { day: 'numeric', month: 'short' })}
        </p>
        <div className={styles.msProgRow}>
          <span>Plan progress</span>
          <span className={styles.msProg}>{doneDays} of {totalDays} days</span>
        </div>
        <div className={ui.track}><div className={ui.fill} style={{ width: `${totalDays ? Math.round((doneDays / totalDays) * 100) : 0}%` }} /></div>
      </section>

      {err ? <p role="alert" className={styles.bannerErr}>{err}</p> : null}

      {/* path to exam day (web stepper) */}
      <section className={styles.stepperCard}>
        <div className={styles.stepperHead}>
          <span className={styles.stepperTitle}>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18, color: 'var(--accent)' }}>route</span>
            Your path to exam day
          </span>
          <span className={`${ui.pill} ${behind ? ui.pillAmber : ui.pillGreen}`}>{behind ? 'Catch up' : 'On track'}</span>
        </div>
        <ol className={styles.stepper}>
          <span className={styles.stepperLine} aria-hidden />
          {plan.milestones.map((m) => (
            <li key={m.key} className={styles.step}>
              <span
                className={`${styles.stepNode} ${m.status === 'today' ? styles.stepToday : m.status === 'exam' ? styles.stepExam : m.status === 'done' ? styles.stepDone : ''}`}
              >
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 19 }}>{m.icon}</span>
              </span>
              <span className={styles.stepLabel}>{m.label}</span>
              <span className={styles.stepSub}>{m.sublabel}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* day cards */}
      <div className={styles.daysHead}>
        <h2 className={styles.daysTitle}>Your study days</h2>
        <span className={styles.daysHint}>Tap a day to start its session</span>
      </div>
      <div className={styles.dayGrid}>
        {plan.days.map((day) => (
          <DayCard key={day.date} day={day} />
        ))}
        <ExamDayCard examDate={exam.examDate} daysUntil={plan.daysUntil} />
      </div>

      {/* legend + daily time */}
      <div className={styles.bottomGrid}>
        <section className={styles.legendCard}>
          <h3 className={styles.legendTitle}>Legend</h3>
          <div className={styles.legendItems}>
            <Legend color="var(--accent)" label="Study" />
            <Legend color="var(--amber)" label="Review" />
            <Legend color="var(--gold)" label="Mock" />
            <Legend color="var(--green)" label="Final revision" />
            <Legend color="var(--muted)" label="Done" />
          </div>
        </section>

        <section className={styles.timeCard} ref={adjustRef}>
          <div className={styles.timeHead}>
            <span className={styles.timeIcon}><span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>schedule</span></span>
            <div style={{ minWidth: 0 }}>
              <h3 className={styles.legendTitle}>Daily study time</h3>
              <p className={styles.timeSub}>Plan rebalances across the {totalDays} {totalDays === 1 ? 'day' : 'days'}</p>
            </div>
          </div>
          <DailyTimeSlider value={plan.dailyMinutesTarget} busy={busy} onCommit={setDailyMinutes} />
          <button type="button" className={styles.regenBtn} onClick={regenerate} disabled={busy}>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 17 }}>autorenew</span>
            {busy ? 'Rebuilding…' : 'Regenerate plan'}
          </button>
        </section>
      </div>
    </div>
  );
}

// ─── day card ─────────────────────────────────────────────────────────────────

function DayCard({ day }: { day: PlanDayView }) {
  const allDone = day.taskCount > 0 && day.doneCount >= day.taskCount;
  const isToday = day.status === 'today';
  const badge = allDone ? { label: 'Done', cls: styles.bDone } : isToday ? { label: 'Today', cls: styles.bToday } : day.status === 'past' ? { label: 'Missed', cls: styles.bMissed } : { label: 'Upcoming', cls: styles.bUpcoming };
  const target = day.items.find((i) => i.status !== 'done') ?? day.items[0];
  const action = allDone ? 'Review' : isToday ? 'Start' : 'Open';

  return (
    <article className={`${styles.dayCard} ${isToday ? styles.dayToday : ''}`}>
      <div className={styles.dayTile} aria-hidden>
        <span className={styles.dayWk}>{fmtDate(day.date, { weekday: 'short' }).toUpperCase()}</span>
        <span className={styles.dayNum}>{fmtDate(day.date, { day: 'numeric' })}</span>
      </div>
      <div className={styles.dayBody}>
        <div className={styles.dayTitleRow}>
          <h3 className={styles.dayTitle}>{dayHeadline(day)}</h3>
          <span className={`${styles.dayBadge} ${badge.cls}`}>{badge.label}</span>
        </div>
        <p className={styles.dayDesc}>{dayDescription(day)}</p>
        <div className={styles.dayFoot}>
          <div className={styles.dayChips}>
            <KindChip kind={day.headlineKind ?? 'theory'} label={`${day.taskCount} ${day.taskCount === 1 ? 'task' : 'tasks'}`} />
            <span className={styles.minChip}>{day.totalMinutes} min</span>
          </div>
          {target ? (
            <Link href={target.href} className={isToday ? styles.dayStart : styles.dayOpen}>
              {action}
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16 }}>{isToday ? 'play_arrow' : 'chevron_right'}</span>
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ExamDayCard({ examDate, daysUntil }: { examDate: string; daysUntil: number }) {
  return (
    <article className={`${styles.dayCard} ${styles.examCard}`}>
      <div className={`${styles.dayTile} ${styles.examTile}`} aria-hidden>
        <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#fff' }}>flag</span>
      </div>
      <div className={styles.dayBody}>
        <div className={styles.dayTitleRow}>
          <h3 className={styles.dayTitle}>Exam day</h3>
          <span className={`${styles.dayBadge} ${styles.bExam}`}>{fmtDate(examDate, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        </div>
        <p className={styles.dayDesc}>
          {daysUntil <= 0 ? 'It’s here — bring it home.' : `${daysUntil} ${daysUntil === 1 ? 'day' : 'days'} away. Everything builds to this.`}
        </p>
      </div>
    </article>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className={styles.legendItem}>
      <span className={ui.dot} style={{ background: color }} />
      {label}
    </span>
  );
}

// ─── empty + centered ─────────────────────────────────────────────────────────

function EmptyState({ hasScope, examId, busy, err, onGenerate }: { hasScope: boolean; examId: string; busy: boolean; err: string | null; onGenerate: () => void }) {
  if (!hasScope) {
    return (
      <section className={styles.empty}>
        <span className={styles.emptyTile}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot/holding-wand-v2.png" alt="" className={styles.emptyMascot} />
        </span>
        <h2 className={styles.emptyTitle}>No schedule yet</h2>
        <p className={styles.emptyText}>Add a quiz or learning path to this exam’s coverage so Mage can lay out a study plan across the days to your exam.</p>
        <Link href={`/exam/${examId}?edit=scope`} className={`${ui.btn} ${ui.primary}`}>Set coverage</Link>
      </section>
    );
  }
  return (
    <section className={styles.empty}>
      <span className={styles.emptyTile}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mascot/holding-wand-v2.png" alt="" className={styles.emptyMascot} />
      </span>
      <h2 className={styles.emptyTitle}>No study plan yet</h2>
      <p className={styles.emptyText}>Generate a plan and Mage lays it out day by day, all the way to exam day.</p>
      <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={onGenerate} disabled={busy}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 19 }}>auto_awesome</span>
        {busy ? 'Building your plan…' : 'Generate plan'}
      </button>
      {err ? <p role="alert" className={styles.cardErr}>{err}</p> : null}
    </section>
  );
}

function CenteredMessage({ icon, title, body, action }: { icon: string; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div style={{ minHeight: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 'clamp(16px, 4vw, 48px)', textAlign: 'center' }}>
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 40, color: 'var(--muted)' }}>{icon}</span>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>{title}</h1>
      {body ? <p style={{ margin: 0, fontSize: 14, color: 'var(--body)', maxWidth: 360 }}>{body}</p> : null}
      {action}
    </div>
  );
}
