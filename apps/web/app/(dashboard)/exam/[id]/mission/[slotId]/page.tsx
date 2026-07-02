'use client';

/* Exam Mode Phase 1 — Exam Mission. A path node opened in its exam context
 * (Figma "X2 Exam Mission" 89:23523 web / 89:23052 mobile). Reuses the path
 * node-overview model (missions = the node's real activities) with exam framing:
 * exam-weight + gate badges, learning goal, sources, an Ask-Mage + weak-point
 * "Practice gaps" CTA, and a Continue that launches the activity in the real
 * path player. No fabricated metrics — badges/scores are derived from real slot
 * state. Cream AppShell; `.shell` tokens. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/app/AppShell';
import ui from '@/components/app/ui.module.css';
import styles from './ExamMission.module.css';
import { useRegisterMageContext, useOptionalMage } from '@/components/mage';
import { ExamWeightBadge, GateBadge, type ExamWeight, type GateState } from '@/components/exam';
import type { PathPlan, PathSlot, PathActivity } from '@/components/learn/PathView';
import {
  activityMeta,
  missionStateFor,
  nextActivity,
  sourceName,
  type ScreenPlan,
} from '@/components/learn/path-screen/helpers';

interface ExamMeta {
  id: string;
  title: string;
  notebookId: string;
  notebookName: string | null;
}

const PASS_GATE = 70;

function weightFor(slot: PathSlot): ExamWeight {
  if (slot.kind === 'assessment' || slot.kind === 'final_exam') return 'high';
  if (slot.kind === 'review') return 'medium';
  return 'low';
}

function gateStateFor(slot: PathSlot): GateState {
  const best = slot.bestPercentage;
  if (slot.completed && best != null && best >= PASS_GATE) return 'passed';
  if (best != null && best < PASS_GATE) return 'failed';
  if (!slot.unlocked) return 'locked';
  return 'required';
}

const KIND_DESC: Record<string, string> = {
  theory: 'Read the explanation for this node, then you’re set.',
  flashcards: 'Flip through the key cards to lock in the ideas.',
  quiz: 'Answer a few questions to prove you’ve got it.',
};

export default function ExamMissionPage() {
  const params = useParams();
  const router = useRouter();
  const examId = Array.isArray(params?.id) ? params.id[0] : (params?.id ?? '');
  const slotId = Array.isArray(params?.slotId) ? params.slotId[0] : (params?.slotId ?? '');

  const [exam, setExam] = useState<ExamMeta | null>(null);
  const [path, setPath] = useState<PathPlan | null>(null);
  const [slot, setSlot] = useState<PathSlot | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');

  useRegisterMageContext(
    path && slot
      ? {
          type: 'lesson',
          ids: { examId, notebookId: exam?.notebookId, pathId: path.id, slotId: slot.id },
          title: slot.title,
        }
      : { type: 'exam', ids: { examId }, title: 'Exam' },
  );

  const load = useCallback(async () => {
    if (!examId || !slotId) return;
    try {
      const sRes = await fetch(`/api/user/exams/${examId}/scope`);
      if (sRes.status === 404) return setStatus('notfound');
      if (!sRes.ok) return setStatus('error');
      const sBody = await sRes.json();
      const scopeView = sBody.data as { exam: ExamMeta; items: { itemType: string; itemId: string }[] };
      setExam(scopeView.exam);

      const pathIds = scopeView.items.filter((it) => it.itemType === 'path').map((it) => it.itemId);
      if (pathIds.length === 0) return setStatus('notfound');

      const plans = await Promise.all(
        pathIds.map(async (id) => {
          const pRes = await fetch(`/api/learn/paths/${id}`);
          if (!pRes.ok) return null;
          const pBody = await pRes.json();
          return pBody.data as PathPlan;
        }),
      );
      for (const plan of plans) {
        if (!plan) continue;
        const found = plan.phases.flatMap((ph) => ph.slots).find((s) => s.id === slotId);
        if (found) {
          setPath(plan);
          setSlot(found);
          setStatus('ready');
          return;
        }
      }
      setStatus('notfound');
    } catch {
      setStatus('error');
    }
  }, [examId, slotId]);

  useEffect(() => {
    // On-mount fetch; load() only setStates after an await (hydration-safe).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (status !== 'ready' || !path || !slot || !exam) {
    return (
      <AppShell>
        <div style={{ minHeight: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', padding: 'clamp(16px, 4vw, 48px)' }}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 40, color: 'var(--muted)' }}>
            {status === 'loading' ? 'hourglass_empty' : status === 'notfound' ? 'search_off' : 'error'}
          </span>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: 'var(--ink)' }}>
            {status === 'loading' ? 'Loading mission…' : status === 'notfound' ? 'Node not found' : 'Couldn’t load this mission'}
          </h1>
          {status !== 'loading' ? (
            <Link href={`/exam/${examId}`} className={`${ui.btn} ${ui.secondary}`}>Back to exam</Link>
          ) : null}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Mission examId={examId} exam={exam} path={path} slot={slot} router={router} />
    </AppShell>
  );
}

function Mission({
  examId,
  exam,
  path,
  slot,
  router,
}: {
  examId: string;
  exam: ExamMeta;
  path: PathPlan;
  slot: PathSlot;
  router: ReturnType<typeof useRouter>;
}) {
  const mage = useOptionalMage();
  const screenPlan = path as unknown as ScreenPlan;

  const missions = useMemo(() => missionStateFor(slot.activities), [slot.activities]);
  const done = missions.filter((m) => m.state === 'done').length;
  const total = missions.length;
  const next = nextActivity(slot);

  const allSlots = useMemo(() => path.phases.flatMap((ph) => ph.slots), [path]);
  const idx = allSlots.findIndex((s) => s.id === slot.id);
  const prevSlot = idx > 0 ? allSlots[idx - 1] : null;
  const nextSlot = idx >= 0 && idx < allSlots.length - 1 ? allSlots[idx + 1] : null;

  const isGated = slot.kind === 'assessment' || slot.kind === 'final_exam';
  const best = slot.bestPercentage;
  const launchHref = (activityId: string) =>
    `/learn/paths/${path.id}?slot=${encodeURIComponent(slot.id)}&activity=${encodeURIComponent(activityId)}`;

  // Continue: launch the next incomplete activity, else advance to the next node.
  const continueHref = next
    ? launchHref(next.id)
    : nextSlot
      ? `/exam/${examId}/mission/${nextSlot.id}`
      : `/exam/${examId}`;
  const continueLabel = next ? 'Continue' : nextSlot ? 'Next node' : 'Back to exam';

  return (
    <div className={styles.page}>
      {/* header */}
      <Link href={`/exam/${examId}`} className={styles.back}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>chevron_left</span>
        {exam.title}
      </Link>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link href="/exams" className={styles.crumbLink}>Exam paths</Link>
        <span className={styles.crumbSep} aria-hidden>›</span>
        <Link href={`/exam/${examId}`} className={styles.crumbLink}>{path.title}</Link>
        <span className={styles.crumbSep} aria-hidden>›</span>
        <span className={styles.crumbHere}>{slot.title}</span>
      </nav>
      <h1 className={styles.title}>{slot.title}</h1>
      <div className={styles.badges}>
        <ExamWeightBadge level={weightFor(slot)} />
        {isGated ? <GateBadge state={gateStateFor(slot)} threshold={PASS_GATE} /> : null}
        {!isGated && best != null ? (
          <span
            className={`${ui.pill} ${best >= PASS_GATE ? ui.pillGreen : ''}`}
            style={best >= PASS_GATE ? undefined : { background: 'var(--danger-soft)', color: 'var(--danger-ink)' }}
          >
            Quiz score {Math.round(best)}%
          </span>
        ) : null}
      </div>

      <div className={styles.layout}>
        {/* main */}
        <div className={styles.main}>
          {/* learning goal */}
          <section className={styles.goalCard}>
            <span className={styles.kicker}>
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 15 }}>target</span>
              Learning goal
            </span>
            <p className={styles.goalText}>
              {slot.description?.trim() || `Master ${slot.title} so it’s solid for your exam.`}
            </p>
          </section>

          {/* current task hero */}
          {total === 0 ? (
            <section className={styles.card}>
              <span className={styles.kicker}>
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 15 }}>hourglass_top</span>
                Content pending
              </span>
              <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--body)', lineHeight: 1.6 }}>
                This node’s content is still being generated. Head back to your path and regenerate
                it if it doesn’t appear shortly.
              </p>
            </section>
          ) : next ? (
            <section className={styles.hero}>
              <div className={styles.heroLeft}>
                <span className={styles.heroKicker}>Current task</span>
                <div className={styles.heroTitleRow}>
                  <span className={styles.heroIcon}>
                    <span className="material-symbols-outlined" aria-hidden>{activityMeta(next.kind).icon}</span>
                  </span>
                  <h2 className={styles.heroTitle}>{activityMeta(next.kind).label}</h2>
                </div>
                <span className={styles.heroMeta}>
                  Mission {slot.activities.findIndex((a) => a.id === next.id) + 1} of {total}
                </span>
                <span className={styles.heroDesc}>{KIND_DESC[next.kind] ?? 'Open this mission to continue.'}</span>
              </div>
              <Link href={launchHref(next.id)} className={styles.heroGo}>
                Go
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>arrow_forward</span>
              </Link>
            </section>
          ) : (
            <section className={styles.hero}>
              <div className={styles.heroLeft}>
                <span className={styles.heroKicker} style={{ color: 'var(--green-ink)' }}>Node complete</span>
                <div className={styles.heroTitleRow}>
                  <span className={styles.heroIcon} style={{ background: 'var(--green-soft)', color: 'var(--green-ink)' }}>
                    <span className="material-symbols-outlined" aria-hidden>check</span>
                  </span>
                  <h2 className={styles.heroTitle}>Every mission done</h2>
                </div>
                <span className={styles.heroDesc}>You’ve finished this node. Revisit a mission below, or move on.</span>
              </div>
              <Link href={continueHref} className={styles.heroGo}>
                {continueLabel}
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>arrow_forward</span>
              </Link>
            </section>
          )}

          {/* missions */}
          {total > 0 ? (
            <>
              <p className={styles.missionsLabel}>Missions in this node</p>
              <div className={styles.missionGrid}>
                {missions.map(({ activity, state }) => (
                  <MissionCard key={activity.id} activity={activity} state={state} href={launchHref(activity.id)} />
                ))}
              </div>
            </>
          ) : null}

          {/* actions */}
          <div className={styles.actions}>
            <button type="button" className={`${ui.btn} ${ui.ghost}`} onClick={() => mage?.open()}>
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>add</span>
              Ask Mage
            </button>
          </div>
        </div>

        {/* rail */}
        <aside className={styles.rail}>
          <section className={styles.railCard}>
            <div className={styles.railProgRow}>
              <h3 className={styles.railTitle} style={{ marginBottom: 0 }}>This node</h3>
              <span className={styles.railPct}>{total > 0 ? Math.round((done / total) * 100) : 0}%</span>
            </div>
            <p className={styles.railSub} style={{ margin: '4px 0 0' }}>
              {done} of {total} {total === 1 ? 'mission' : 'missions'} done
            </p>
          </section>

          <section className={styles.railCard}>
            <h3 className={styles.railTitle}>Sources</h3>
            <p className={styles.railSub}>What this node is built from</p>
            <div className={styles.sourceRow}>
              <span className={styles.sourceIcon}>
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>description</span>
              </span>
              <div style={{ minWidth: 0 }}>
                <div className={styles.sourceName}>{sourceName(screenPlan)}</div>
                <div className={styles.sourceMeta}>This path’s source material</div>
              </div>
            </div>
          </section>

          <section className={styles.askCard}>
            <div className={styles.askHead}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mascot/holding-wand-v2.png" alt="" className={styles.askMascot} />
              <span className={styles.askTitle}>Ask Mage</span>
            </div>
            <p className={styles.askDesc}>Stuck on this node? Mage explains it with your own sources.</p>
            <button type="button" className={styles.askBtn} onClick={() => mage?.open()}>
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16 }}>add</span>
              Ask Mage
            </button>
          </section>

          <PracticeGapsCard pathId={path.id} router={router} />
        </aside>
      </div>

      {/* bottom continue */}
      <div className={styles.bottomBar}>
        {prevSlot ? (
          <Link href={`/exam/${examId}/mission/${prevSlot.id}`} className={`${ui.btn} ${ui.ghost} ${ui.small}`}>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 17 }}>chevron_left</span>
            Previous
          </Link>
        ) : (
          <span className={styles.bottomReadiness}>{done} of {total} missions done</span>
        )}
        <Link href={continueHref} className={`${ui.btn} ${ui.primary}`}>
          {continueLabel}
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>arrow_forward</span>
        </Link>
      </div>
    </div>
  );
}

function MissionCard({ activity, state, href }: { activity: PathActivity; state: 'done' | 'now' | 'todo'; href: string }) {
  const meta = activityMeta(activity.kind);
  return (
    <Link href={href} className={`${styles.missionCard} ${state === 'now' ? styles.missionCardNow : ''}`} aria-current={state === 'now' ? 'step' : undefined}>
      <span className={`${styles.missionIcon} ${state === 'done' ? styles.miDone : state === 'now' ? styles.miNow : styles.miTodo}`}>
        <span className="material-symbols-outlined" aria-hidden>{state === 'done' ? 'check' : meta.icon}</span>
      </span>
      <span style={{ minWidth: 0 }}>
        <span className={styles.missionName} style={{ display: 'block' }}>{meta.label}</span>
        <span className={`${styles.missionState} ${state === 'done' ? styles.missionStateDone : state === 'now' ? styles.missionStateNow : ''}`}>
          {state === 'done' ? 'Done' : state === 'now' ? 'Now' : 'Up next'}
        </span>
      </span>
    </Link>
  );
}

/** "Practice gaps" — weak-point session over the linked path (Pro-gated). */
function PracticeGapsCard({ pathId, router }: { pathId: string; router: ReturnType<typeof useRouter> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/mage/practice-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'START_WEAK_TOPIC_SESSION', context: { type: 'path', ids: { pathId } } }),
      });
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; data?: { quizUrl?: string }; error?: string }
        | null;
      const quizUrl = json?.data?.quizUrl;
      if (res.ok && json?.success && quizUrl) {
        router.push(quizUrl);
        return;
      }
      setErr(
        res.status === 403
          ? 'Weak-point practice is a Pro feature.'
          : res.status === 429
            ? json?.error ?? 'You’ve used up your practice allowance for now.'
            : res.status === 400
              ? 'Study a bit more first — not enough graded material yet.'
              : json?.error ?? 'Mage couldn’t build a practice set. Try again in a moment.',
      );
      setBusy(false);
    } catch {
      setErr('Network error — please try again.');
      setBusy(false);
    }
  };

  return (
    <section className={styles.practiceCard}>
      <span className={styles.practiceTitle}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16 }}>fitness_center</span>
        Weak point practice
      </span>
      <p className={styles.practiceDesc}>Drill the topics dragging your exam readiness with a short, focused quiz.</p>
      <button type="button" className={styles.practiceBtn} onClick={start} disabled={busy}>
        {busy ? 'Building…' : 'Practice gaps'}
      </button>
      {err ? <p role="alert" className={styles.err}>{err}</p> : null}
    </section>
  );
}
