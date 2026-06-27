'use client';

/* Exam Mode Phase 4 — Today's Plan (Figma "X2 Today's Study Plan" 89:18190 web /
 * 89:17089 mobile / "No study plan" 89:22985 empty). Mage's ordered task list for
 * today — front-loaded weak points, a timed mock near the end, a final-revision
 * sweep — with the "Why this plan? · Built by Mage" rationale and the Adjust
 * controls (adjust time · regenerate · mark all done).
 *
 * Honest by construction: every task points at REAL scoped material (path
 * missions, the mock setup); the plan + rationale come from the deterministic
 * assembler (free) or the Mage Flash-Lite pass (PRO). Reuses the shipped exam
 * screens' cream language (`.shell` + `ui.module.css` tokens) so hub → plan reads
 * as one surface. */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/app/AppShell';
import ui from '@/components/app/ui.module.css';
import styles from './Plan.module.css';
import { useRegisterMageContext, useOptionalMage } from '@/components/mage';
import { KindChip, UrgencyBadge, StatusPill, MinutesChip, DailyTimeSlider } from '@/components/exam/StudyPlanBits';
import type { ExamPlanView, PlanItemView } from '@/lib/exam-study-plan-core';

interface ExamMeta {
  id: string;
  title: string;
  examDate: string;
  notebookId: string;
  notebookName: string | null;
}

interface PlanResponse {
  exam: ExamMeta;
  daysUntil: number;
  readiness: number;
  hasGradedMaterial: boolean;
  hasScope: boolean;
  primaryPathId: string | null;
  plan: ExamPlanView | null;
}

export default function TodaysPlanPage() {
  const params = useParams();
  const examId = Array.isArray(params?.id) ? params.id[0] : (params?.id ?? '');

  const [data, setData] = useState<PlanResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');

  useRegisterMageContext(
    data?.exam
      ? { type: 'exam', ids: { examId, notebookId: data.exam.notebookId }, title: data.exam.title }
      : { type: 'exam', ids: { examId }, title: 'Exam' },
  );

  const load = useCallback(async () => {
    if (!examId) return;
    try {
      const res = await fetch(`/api/user/exams/${examId}/plan`);
      if (res.status === 404) return setStatus('notfound');
      if (!res.ok) return setStatus('error');
      const body = await res.json();
      setData(body.data as PlanResponse);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [examId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (status === 'loading') {
    return (
      <AppShell>
        <CenteredMessage icon="hourglass_empty" title="Loading your plan…" />
      </AppShell>
    );
  }
  if (status === 'notfound') {
    return (
      <AppShell>
        <CenteredMessage
          icon="event_busy"
          title="Exam not found"
          body="This exam may have been deleted."
          action={<Link href="/exams" className={`${ui.btn} ${ui.secondary}`}>Back to exams</Link>}
        />
      </AppShell>
    );
  }
  if (status === 'error' || !data) {
    return (
      <AppShell>
        <CenteredMessage
          icon="error"
          title="Couldn’t load your plan"
          body="Something went wrong. Please try again."
          action={
            <button type="button" className={`${ui.btn} ${ui.secondary}`} onClick={() => { setStatus('loading'); void load(); }}>
              Retry
            </button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PlanScreen examId={examId} data={data} onPlan={(plan) => setData((d) => (d ? { ...d, plan } : d))} />
    </AppShell>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────

function PlanScreen({ examId, data, onPlan }: { examId: string; data: PlanResponse; onPlan: (plan: ExamPlanView) => void }) {
  const mage = useOptionalMage();
  const router = useRouter();
  const { exam, plan } = data;
  const [busy, setBusy] = useState<null | 'generate' | 'adjust' | 'mark' | string>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showAdjustTime, setShowAdjustTime] = useState(false);

  const patch = useCallback(
    async (body: Record<string, unknown>, tag: string) => {
      setBusy(tag);
      setErr(null);
      try {
        const res = await fetch(`/api/user/exams/${examId}/plan`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.data?.plan) onPlan(json.data.plan as ExamPlanView);
        else setErr(json?.error ?? 'Couldn’t update the plan. Try again.');
      } catch {
        setErr('Network error — please try again.');
      } finally {
        setBusy(null);
      }
    },
    [examId, onPlan],
  );

  const generate = useCallback(
    async (dailyMinutesTarget?: number) => {
      setBusy('generate');
      setErr(null);
      try {
        const res = await fetch(`/api/user/exams/${examId}/plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dailyMinutesTarget ? { dailyMinutesTarget } : {}),
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.data?.plan) onPlan(json.data.plan as ExamPlanView);
        else
          setErr(
            res.status === 400
              ? 'Add some paths or quizzes to this exam’s coverage first.'
              : res.status === 429
                ? json?.error ?? 'You’ve used up your plan-generation allowance for now.'
                : json?.error ?? 'Mage couldn’t build a plan right now. Try again in a moment.',
          );
      } catch {
        setErr('Network error — please try again.');
      } finally {
        setBusy(null);
      }
    },
    [examId, onPlan],
  );

  if (!plan) {
    return (
      <div className={styles.page}>
        <Link href={`/exam/${examId}`} className={styles.back}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>chevron_left</span>
          {exam.title}
        </Link>
        <EmptyState hasScope={data.hasScope} examId={examId} busy={busy === 'generate'} err={err} onGenerate={() => generate()} />
      </div>
    );
  }

  // Today's tasks, or the soonest upcoming day if today is clear (stale plan).
  const todayDay = plan.days.find((d) => d.dayOffset === 0) ?? null;
  const upcoming = plan.days.find((d) => d.dayOffset > 0) ?? null;
  const focus = todayDay ?? upcoming;
  const focusItems = focus?.items ?? [];
  const focusIsToday = focus?.dayOffset === 0;
  const totalMinutes = focusItems.reduce((s, i) => s + i.estMinutes, 0);
  const doneCount = focusItems.filter((i) => i.status === 'done').length;

  const resumeTarget = focusItems.find((i) => i.status !== 'done') ?? focusItems[0] ?? null;

  const resume = () => {
    if (!resumeTarget) return;
    if (resumeTarget.status === 'not_started') {
      void patch({ action: 'set_item_status', itemId: resumeTarget.id, status: 'in_progress' }, `resume`);
    }
    router.push(resumeTarget.href);
  };

  const hasWeak = focusItems.some((i) => i.weakPoint);

  return (
    <div className={styles.page}>
      <Link href={`/exam/${examId}`} className={styles.back}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>chevron_left</span>
        {exam.title} dashboard
      </Link>

      {/* header */}
      <div className={styles.headRow}>
        <div className={styles.titleWrap}>
          <h1 className={styles.title}>Today’s plan</h1>
          <p className={styles.subtitle}>
            {exam.title} · {Math.max(0, plan.daysUntil)} {plan.daysUntil === 1 ? 'day' : 'days'} left · ~{totalMinutes} min today
          </p>
        </div>
        {resumeTarget ? (
          <button type="button" className={`${ui.btn} ${ui.primary} ${styles.topResume}`} onClick={resume}>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 19 }}>play_arrow</span>
            Resume today’s plan
          </button>
        ) : null}
      </div>

      {/* mobile summary card (Figma mobile) */}
      <section className={styles.mobileSummary}>
        <div className={styles.msTop}>
          <div style={{ minWidth: 0 }}>
            <h2 className={styles.msTitle}>{exam.title}</h2>
            {data.primaryPathId && plan.primaryPathTitle ? <p className={styles.msSub}>{plan.primaryPathTitle}</p> : null}
          </div>
          <span className={`${ui.pill} ${ui.pillLilac}`} style={{ flexShrink: 0 }}>
            {Math.max(0, plan.daysUntil)} {plan.daysUntil === 1 ? 'day' : 'days'} left
          </span>
        </div>
        <div className={styles.msMeta}>
          <span>Today · ~{totalMinutes} min</span>
          <span>{doneCount} of {focusItems.length} done</span>
        </div>
        <div className={ui.track}>
          <div className={ui.fill} style={{ width: `${focusItems.length ? Math.round((doneCount / focusItems.length) * 100) : 0}%` }} />
        </div>
      </section>

      {err ? <p role="alert" className={styles.bannerErr}>{err}</p> : null}

      <div className={styles.grid}>
        {/* main: task order */}
        <div className={styles.main}>
          <div className={styles.orderHead}>
            <h2 className={styles.orderTitle}>{focusIsToday ? 'Your task order' : 'Up next'}</h2>
            <span className={styles.doneChip}>
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 15 }}>check</span>
              {doneCount} of {focusItems.length} done
            </span>
          </div>

          {focusItems.length === 0 ? (
            <div className={styles.allClear}>
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 30, color: 'var(--green-ink)' }}>task_alt</span>
              <p>Today’s tasks are done. Regenerate for a fresh order from your latest scores.</p>
              <button type="button" className={`${ui.btn} ${ui.secondary} ${ui.small}`} onClick={() => generate()} disabled={busy === 'generate'}>
                {busy === 'generate' ? 'Building…' : 'Regenerate plan'}
              </button>
            </div>
          ) : (
            <ol className={styles.taskList}>
              {focusItems.map((item, i) => (
                <TaskCard
                  key={item.id}
                  item={item}
                  index={i}
                  busy={busy === item.id}
                  onToggleDone={() =>
                    patch(
                      { action: 'set_item_status', itemId: item.id, status: item.status === 'done' ? 'not_started' : 'done' },
                      item.id,
                    )
                  }
                  onStart={() => {
                    if (item.status === 'not_started') void patch({ action: 'set_item_status', itemId: item.id, status: 'in_progress' }, item.id);
                    router.push(item.href);
                  }}
                />
              ))}
            </ol>
          )}
        </div>

        {/* rail: why + adjust */}
        <aside className={styles.rail}>
          <section className={`${styles.railCard} ${styles.whyCard}`}>
            <div className={styles.whyHead}>
              <span className={styles.whyIcon}>
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>auto_awesome</span>
              </span>
              <div style={{ minWidth: 0 }}>
                <h3 className={styles.railTitle}>Why this plan?</h3>
                <span className={styles.byMage}>Built by Mage</span>
              </div>
            </div>
            <p className={styles.whyText}>{plan.rationale}</p>
            <div className={styles.whyChips}>
              {hasWeak ? <span className={`${ui.pill} ${ui.pillAmber}`}>Weak points</span> : null}
              {exam ? <span className={`${ui.pill} ${ui.pillLilac}`}>Exam format</span> : null}
            </div>
            <button type="button" className={styles.askMage} onClick={() => mage?.open()}>
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 17 }}>auto_awesome</span>
              Ask Mage about this plan
            </button>
          </section>

          <section className={styles.railCard}>
            <h3 className={styles.railTitle}>Adjust</h3>
            <p className={styles.railSub}>Tune today’s session.</p>

            <div className={styles.adjustRows}>
              <button
                type="button"
                className={styles.adjustRow}
                onClick={() => setShowAdjustTime((v) => !v)}
                aria-expanded={showAdjustTime}
              >
                <span className={styles.adjustIcon}><span className="material-symbols-outlined" aria-hidden style={{ fontSize: 19 }}>schedule</span></span>
                <span className={styles.adjustBody}>
                  <span className={styles.adjustLabel}>Adjust time</span>
                  <span className={styles.adjustHint}>~{plan.dailyMinutesTarget} min today</span>
                </span>
                <span className={styles.adjustValue}>{plan.dailyMinutesTarget}m</span>
              </button>
              {showAdjustTime ? (
                <div className={styles.sliderWrap}>
                  <DailyTimeSlider
                    value={plan.dailyMinutesTarget}
                    busy={busy === 'adjust'}
                    onCommit={(v) => patch({ action: 'set_daily_minutes', dailyMinutesTarget: v }, 'adjust')}
                  />
                </div>
              ) : null}

              <button type="button" className={styles.adjustRow} onClick={() => generate()} disabled={busy === 'generate'}>
                <span className={styles.adjustIcon}><span className="material-symbols-outlined" aria-hidden style={{ fontSize: 19 }}>autorenew</span></span>
                <span className={styles.adjustBody}>
                  <span className={styles.adjustLabel}>{busy === 'generate' ? 'Regenerating…' : 'Regenerate plan'}</span>
                  <span className={styles.adjustHint}>New order from latest scores</span>
                </span>
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18, color: 'var(--muted)' }}>chevron_right</span>
              </button>

              <button type="button" className={styles.adjustRow} onClick={() => patch({ action: 'mark_today_done' }, 'mark')} disabled={busy === 'mark' || focusItems.length === 0}>
                <span className={`${styles.adjustIcon} ${styles.adjustIconGood}`}><span className="material-symbols-outlined" aria-hidden style={{ fontSize: 19 }}>task_alt</span></span>
                <span className={styles.adjustBody}>
                  <span className={styles.adjustLabel}>{busy === 'mark' ? 'Saving…' : 'Mark all done'}</span>
                  <span className={styles.adjustHint}>Log today as complete</span>
                </span>
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18, color: 'var(--muted)' }}>chevron_right</span>
              </button>
            </div>

            <Link href={`/exam/${examId}/calendar`} className={styles.calLink}>
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 17 }}>calendar_month</span>
              See the full study calendar
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

// ─── Task card ─────────────────────────────────────────────────────────────────

function TaskCard({
  item,
  index,
  busy,
  onToggleDone,
  onStart,
}: {
  item: PlanItemView;
  index: number;
  busy: boolean;
  onToggleDone: () => void;
  onStart: () => void;
}) {
  const done = item.status === 'done';
  const active = item.status === 'in_progress';

  return (
    <li className={`${styles.task} ${active ? styles.taskActive : ''} ${done ? styles.taskDone : ''}`}>
      <button
        type="button"
        className={`${styles.statusDot} ${done ? styles.statusDone : active ? styles.statusActive : ''}`}
        onClick={onToggleDone}
        disabled={busy}
        aria-label={done ? 'Mark task not done' : 'Mark task done'}
        title={done ? 'Mark not done' : 'Mark done'}
      >
        {done ? (
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>check</span>
        ) : active ? (
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16 }}>play_arrow</span>
        ) : (
          <span className={styles.statusNum}>{index + 1}</span>
        )}
      </button>

      <div className={styles.taskBody}>
        <div className={styles.taskTop}>
          <h3 className={styles.taskTitle}>{item.title}</h3>
          <UrgencyBadge urgency={item.weakPoint ? item.urgency : null} />
        </div>
        <p className={styles.taskReason}>{item.reason}</p>
        <div className={styles.taskChips}>
          <KindChip kind={item.kind} />
          {item.readinessDelta && item.readinessDelta >= 1 ? (
            <span className={styles.deltaChip}>
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 14 }}>trending_up</span>
              +{item.readinessDelta}% readiness
            </span>
          ) : null}
        </div>
      </div>

      <div className={styles.taskSide}>
        <MinutesChip minutes={item.estMinutes} />
        <StatusPill status={item.status} />
        <button type="button" className={done ? styles.taskReview : active ? styles.taskResume : styles.taskStart} onClick={onStart} disabled={busy}>
          {done ? (
            <>
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16 }}>replay</span>
              Review again
            </>
          ) : active ? (
            'Resume'
          ) : (
            <>
              Start
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 17 }}>chevron_right</span>
            </>
          )}
        </button>
      </div>
    </li>
  );
}

// ─── Empty state (Figma "No study plan") ──────────────────────────────────────

function EmptyState({
  hasScope,
  examId,
  busy,
  err,
  onGenerate,
}: {
  hasScope: boolean;
  examId: string;
  busy: boolean;
  err: string | null;
  onGenerate: () => void;
}) {
  if (!hasScope) {
    return (
      <section className={styles.empty}>
        <span className={styles.emptyTile}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot/holding-wand-v2.png" alt="" className={styles.emptyMascot} />
        </span>
        <h2 className={styles.emptyTitle}>Nothing to plan yet</h2>
        <p className={styles.emptyText}>Add a quiz or learning path to this exam’s coverage so Mage can build a study plan around what you actually need.</p>
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
      <h2 className={styles.emptyTitle}>No plan for today</h2>
      <p className={styles.emptyText}>Generate today’s plan and Mage picks what matters most.</p>
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
