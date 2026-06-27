'use client';

/* Exam Mode Phase 1 — Exam Path hub (rebuild of the old exam-overview surface).
 *
 * Figma "X2 Exam Path" (89:23897 web / 89:23136 mobile). An exam is a deadline +
 * readiness LAYER over an existing learning path — never its own path. The hub:
 *  - hero: countdown + cream readiness ring + real stats (nodes done / weak /
 *    days-left) + Continue studying / Open exam dashboard,
 *  - legend + the linked path summarized as a priority node list (each node →
 *    its Exam Mission), classified from REAL slot state (no fabricated metrics),
 *  - rail: exam-readiness ring + strong/weak/review counts, weak nodes with
 *    one-tap practice, a Mage tip.
 *
 * Preserved capabilities (the recurring redesign failure mode is silently
 * dropping these): the Mage exam context, the `?edit=scope` ScopeEditor target
 * (Mage EDIT_EXAM_SCOPE), the `?edit=date` DateEditor target (CHANGE_EXAM_DATE),
 * and the START_EXAM_SIMULATION mock launcher — folded into a "Manage exam"
 * section opened by "Open exam dashboard". Cream AppShell; `.shell` tokens. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/app/AppShell';
import ui from '@/components/app/ui.module.css';
import styles from './ExamHub.module.css';
import { useRegisterMageContext, useOptionalMage } from '@/components/mage';
import ExamScopeEditor, {
  type ScopeCandidates,
  type ScopeItemRef,
} from '@/components/features/ExamScopeEditor';
import type { PathPlan, PathSlot } from '@/components/learn/PathView';

// ─── Response shapes (mirror src/lib/exam-scope.ts) ──────────────────────────

interface ExamMeta {
  id: string;
  title: string;
  examDate: string;
  notebookId: string;
  notebookName: string | null;
}

interface ResolvedScopeItem extends ScopeItemRef {
  title: string;
  subtitle?: string;
}

export interface ScopeView {
  exam: ExamMeta;
  items: ResolvedScopeItem[];
  candidates: ScopeCandidates;
}

interface ReadinessItem {
  type: ScopeItemRef['itemType'];
  id: string;
  title: string;
  score: number;
  weight: number;
  attempted: boolean;
  passive: boolean;
}

interface Readiness {
  readiness: number;
  hasGradedMaterial: boolean;
  isEmpty: boolean;
  items: ReadinessItem[];
  weakTopics: { title: string; pct: number; source: { type: 'path' | 'quiz_set'; id: string } }[];
  counts: { paths: number; quizSets: number; passive: number };
}

export interface ReadinessResult {
  exam: ExamMeta;
  daysUntil: number;
  readiness: Readiness;
}

// ─── Node classification (REAL slot state → exam-framed status) ───────────────

type NodeKey = 'done' | 'weak' | 'urgent' | 'review' | 'gate' | 'idle' | 'active';

interface NodeClass {
  key: NodeKey;
  badge: string;
  reason: string;
  icon: string;
}

const PASS_GATE = 70;

function classifyWeak(best: number): NodeClass {
  const reason = `Quiz score ${Math.round(best)}%`;
  if (best < 50) return { key: 'urgent', badge: 'Exam-critical', reason, icon: 'priority_high' };
  return { key: 'weak', badge: 'Weak', reason, icon: 'warning' };
}

/** Map a path slot to its exam-framed status using only real progress data. */
function classifyNode(slot: PathSlot): NodeClass {
  const graded = slot.kind === 'assessment' || slot.kind === 'final_exam' || slot.kind === 'review';
  const best = slot.bestPercentage;
  const passing = best != null && best >= PASS_GATE;

  if (slot.kind === 'assessment' || slot.kind === 'final_exam') {
    if (slot.completed && passing) return { key: 'done', badge: 'Completed', reason: 'Passed', icon: 'check' };
    if (best != null && best < PASS_GATE) return classifyWeak(best);
    const isFinal = slot.kind === 'final_exam';
    return {
      key: 'gate',
      badge: 'Gate',
      reason: isFinal ? 'Final' : `${PASS_GATE}% required`,
      icon: isFinal ? 'workspace_premium' : 'shield',
    };
  }
  if (!slot.unlocked) return { key: 'idle', badge: 'Not started', reason: 'Upcoming', icon: 'lock' };
  if (slot.completed) {
    if (graded && !passing && best != null) return classifyWeak(best);
    return { key: 'done', badge: 'Completed', reason: 'Mastered', icon: 'check' };
  }
  if (graded && best != null) return classifyWeak(best);
  if (slot.kind === 'review') return { key: 'review', badge: 'Review', reason: 'Review checkpoint', icon: 'schedule' };
  if (slot.isActive) return { key: 'active', badge: 'In progress', reason: 'Continue here', icon: 'play_arrow' };
  return { key: 'idle', badge: 'Up next', reason: 'Not started yet', icon: 'radio_button_unchecked' };
}

const ICON_CLASS: Record<NodeKey, string> = {
  done: styles.icDone,
  weak: styles.icWeak,
  urgent: styles.icUrgent,
  review: styles.icReview,
  gate: styles.icGate,
  idle: styles.icIdle,
  active: styles.icActive,
};
const BADGE_CLASS: Record<NodeKey, string> = {
  done: styles.bDone,
  weak: styles.bWeak,
  urgent: styles.bUrgent,
  review: styles.bReview,
  gate: styles.bGate,
  idle: styles.bIdle,
  active: styles.bIdle,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function countdownLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/** Ring stroke by readiness band — gold mid-range, matching the Figma. */
function ringColor(v: number): string {
  if (v >= 85) return 'var(--green)';
  if (v >= 40) return 'var(--gold)';
  return '#d4592f';
}

function readEditParam(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('edit');
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface ExamHubViewProps {
  examId: string;
  readiness: ReadinessResult;
  scope: ScopeView;
  linkedPath: PathPlan | null;
  hasResult: boolean;
}

export default function ExamHubView({
  examId,
  readiness: initialReadiness,
  scope: initialScope,
  linkedPath: initialLinkedPath,
  hasResult: initialHasResult,
}: ExamHubViewProps) {
  // Seeded from the server (SSR) so the first paint is real content (status
  // starts 'ready', no client spinner). load() below re-fetches via the API
  // routes only after a mutation (scope/date save) or a manual retry.
  const [readiness, setReadiness] = useState<ReadinessResult | null>(initialReadiness);
  const [scope, setScope] = useState<ScopeView | null>(initialScope);
  const [linkedPath, setLinkedPath] = useState<PathPlan | null>(initialLinkedPath);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound' | 'error'>('ready');

  // Mage high-risk prefill cards deep-link here with ?edit=scope|date — read from
  // window.location (not useSearchParams, which forces a prerender bailout).
  const [editing, setEditing] = useState(() => readEditParam() === 'scope');
  const [editingDate, setEditingDate] = useState(() => readEditParam() === 'date');
  const [showManage, setShowManage] = useState(
    () => readEditParam() === 'scope' || readEditParam() === 'date',
  );
  // Post-exam (Phase 5): once the date has passed the hub flips to the archive
  // view ("Your exam is finished"); `recap` re-opens the full studying hub.
  const [hasResult, setHasResult] = useState(initialHasResult);
  const [recap, setRecap] = useState(false);

  const exam = readiness?.exam ?? scope?.exam ?? null;

  useRegisterMageContext(
    exam
      ? { type: 'exam', ids: { examId, notebookId: exam.notebookId }, title: exam.title }
      : { type: 'exam', ids: { examId }, title: 'Exam' },
  );

  const load = useCallback(async () => {
    if (!examId) return;
    try {
      const [rRes, sRes] = await Promise.all([
        fetch(`/api/user/exams/${examId}/readiness`),
        fetch(`/api/user/exams/${examId}/scope`),
      ]);
      if (rRes.status === 404 || sRes.status === 404) {
        setStatus('notfound');
        return;
      }
      if (!rRes.ok || !sRes.ok) {
        setStatus('error');
        return;
      }
      const [rBody, sBody] = await Promise.all([rRes.json(), sRes.json()]);
      const scopeView = sBody.data as ScopeView;
      setReadiness(rBody.data as ReadinessResult);
      setScope(scopeView);
      setStatus('ready');

      // Resolve the primary linked path's full node tree for the priority list.
      const primaryPathId = scopeView.items.find((it) => it.itemType === 'path')?.itemId;
      if (primaryPathId) {
        const pRes = await fetch(`/api/learn/paths/${primaryPathId}`);
        if (pRes.ok) {
          const pBody = await pRes.json();
          setLinkedPath(pBody.data as PathPlan);
        }
      } else {
        setLinkedPath(null);
      }

      // Once the exam is past, find out whether a result was recorded — drives
      // "Enter result" vs "View report" on the archive view.
      if ((rBody.data as ReadinessResult).daysUntil < 0) {
        const resRes = await fetch(`/api/user/exams/${examId}/result`);
        if (resRes.ok) {
          const resBody = await resRes.json().catch(() => null);
          setHasResult(!!resBody?.data?.existing);
        }
      }
    } catch {
      setStatus('error');
    }
  }, [examId]);

  if (status === 'loading') {
    return (
      <AppShell>
        <CenteredMessage icon="hourglass_empty" title="Loading exam…" />
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
          action={
            <Link href="/exams" className={`${ui.btn} ${ui.secondary}`}>
              Back to exams
            </Link>
          }
        />
      </AppShell>
    );
  }
  if (status === 'error' || !exam || !readiness || !scope) {
    return (
      <AppShell>
        <CenteredMessage
          icon="error"
          title="Couldn't load this exam"
          body="Something went wrong. Please try again."
          action={
            <button
              type="button"
              className={`${ui.btn} ${ui.secondary}`}
              onClick={() => { setStatus('loading'); void load(); }}
            >
              Retry
            </button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ExamHub
        examId={examId}
        exam={exam}
        daysUntil={readiness.daysUntil}
        r={readiness.readiness}
        scope={scope}
        linkedPath={linkedPath}
        finished={readiness.daysUntil < 0}
        hasResult={hasResult}
        recap={recap}
        onShowRecap={() => setRecap(true)}
        editing={editing}
        editingDate={editingDate}
        showManage={showManage}
        onToggleManage={() => setShowManage((v) => !v)}
        onEditScope={() => { setShowManage(true); setEditing(true); }}
        onCancelScope={() => setEditing(false)}
        onSavedScope={(view) => { setScope(view as ScopeView); setEditing(false); void load(); }}
        onEditDate={() => setEditingDate(true)}
        onCancelDate={() => setEditingDate(false)}
        onSavedDate={() => { setEditingDate(false); void load(); }}
      />
    </AppShell>
  );
}

// ─── Hub body ─────────────────────────────────────────────────────────────────

interface HubProps {
  examId: string;
  exam: ExamMeta;
  daysUntil: number;
  r: Readiness;
  scope: ScopeView;
  linkedPath: PathPlan | null;
  finished: boolean;
  hasResult: boolean;
  recap: boolean;
  onShowRecap: () => void;
  editing: boolean;
  editingDate: boolean;
  showManage: boolean;
  onToggleManage: () => void;
  onEditScope: () => void;
  onCancelScope: () => void;
  onSavedScope: (view: ScopeView) => void;
  onEditDate: () => void;
  onCancelDate: () => void;
  onSavedDate: () => void;
}

function ExamHub(props: HubProps) {
  const { examId, exam, daysUntil, r, scope, linkedPath } = props;
  const mage = useOptionalMage();

  const slots = useMemo<PathSlot[]>(
    () => (linkedPath ? linkedPath.phases.flatMap((ph) => ph.slots) : []),
    [linkedPath],
  );
  const classed = useMemo(() => slots.map((s) => ({ slot: s, cls: classifyNode(s) })), [slots]);

  const total = slots.length;
  const done = slots.filter((s) => s.completed).length;
  const weakList = classed.filter(({ cls }) => cls.key === 'weak' || cls.key === 'urgent');
  const reviewCount = classed.filter(({ cls }) => cls.key === 'review').length;
  const strongCount = classed.filter(({ cls }) => cls.key === 'done').length;
  const weakCount = weakList.length;

  const primaryPathId = scope.items.find((it) => it.itemType === 'path')?.itemId ?? linkedPath?.id ?? null;

  // Resume target: the first unlocked-incomplete node's mission, else the path.
  const nextNode =
    slots.find((s) => s.unlocked && !s.completed) ?? slots.find((s) => !s.completed) ?? null;
  const continueHref = nextNode
    ? `/exam/${examId}/mission/${nextNode.id}`
    : primaryPathId
      ? `/learn/paths/${primaryPathId}`
      : `/exam/${examId}?edit=scope`;

  const hasGraded = r.hasGradedMaterial && !r.isEmpty;

  // Honest Mage tip — the genuinely weakest node, never a fabricated frequency.
  const weakestName = weakList.length
    ? [...weakList].sort((a, b) => (a.slot.bestPercentage ?? 0) - (b.slot.bestPercentage ?? 0))[0].slot.title
    : null;

  // Post-exam archive view — the date has passed; show the wrap-up + the
  // post-exam loop entry points instead of the studying hub. "View preparation
  // recap" drops back into the normal hub below.
  if (props.finished && !props.recap) {
    return (
      <PostExamArchive
        examId={examId}
        exam={exam}
        r={r}
        hasGraded={hasGraded}
        done={done}
        total={total}
        strongCount={strongCount}
        weakCount={weakCount}
        hasResult={props.hasResult}
        continueHref={continueHref}
        onShowRecap={props.onShowRecap}
      />
    );
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <Link href="/exams" className={styles.back}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>chevron_left</span>
        Exam paths
      </Link>
      <div className={styles.headRow}>
        <div className={styles.titleWrap}>
          <h1 className={styles.title}>{exam.title}</h1>
          <p className={styles.subtitle}>
            {linkedPath ? <>Connected to: {linkedPath.title}<span className={styles.subDot} /></> : null}
            <span>Exam {countdownLabel(daysUntil)}</span>
            {props.editingDate ? null : (
              <button type="button" className={styles.back} style={{ padding: '0 2px' }} onClick={props.onEditDate}>
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 15 }}>edit_calendar</span>
                Edit date
              </button>
            )}
          </p>
          {props.editingDate ? (
            <DateEditor examId={examId} currentIso={exam.examDate} onCancel={props.onCancelDate} onSaved={props.onSavedDate} />
          ) : null}
        </div>
        <Link href={continueHref} className={`${ui.btn} ${ui.primary} ${styles.topContinue}`}>
          Continue studying
        </Link>
      </div>

      {r.isEmpty ? (
        <SetupState examId={examId} onEdit={props.onEditScope} />
      ) : (
        <div className={styles.grid}>
          {/* ── main column ── */}
          <div className={styles.main}>
            {/* hero */}
            <section className={styles.hero}>
              <div className={styles.heroPills}>
                {exam.notebookName ? <span className={`${ui.pill} ${ui.pillLilac}`}>{exam.notebookName}</span> : null}
                {linkedPath ? <span className={`${ui.pill} ${ui.pillAmber}`}>{linkedPath.title}</span> : null}
              </div>
              <h2 className={styles.heroTitle}>
                Your exam {countdownLabel(daysUntil)}
              </h2>
              <div className={styles.heroStatsRow}>
                <Ring value={hasGraded ? r.readiness : 0} size={108} muted={!hasGraded} />
                {total > 0 ? (
                  <div className={styles.statBlock}>
                    <span className={styles.statValue}>{done}/{total}</span>
                    <span className={styles.statLabel}>Nodes done</span>
                  </div>
                ) : null}
                <div className={styles.statBlock}>
                  <span className={`${styles.statValue} ${weakCount > 0 ? styles.statValueWarn : ''}`}>{weakCount}</span>
                  <span className={styles.statLabel}>Weak {weakCount === 1 ? 'node' : 'nodes'}</span>
                </div>
                <div className={styles.statBlock}>
                  <span className={styles.statValue}>{Math.max(0, daysUntil)}</span>
                  <span className={styles.statLabel}>{daysUntil === 1 ? 'day' : 'days'} until exam</span>
                </div>
              </div>
              {linkedPath ? (
                <span className={styles.connected}>
                  <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16 }}>route</span>
                  Connected to: {linkedPath.title}
                </span>
              ) : null}
              <div className={styles.heroActions}>
                <Link href={continueHref} className={`${ui.btn} ${ui.primary}`}>Continue studying</Link>
                <Link href={`/exam/${examId}/plan`} className={`${ui.btn} ${ui.secondary}`}>
                  <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>checklist</span>
                  Today’s plan
                </Link>
                <button type="button" className={`${ui.btn} ${ui.ghost}`} onClick={props.onToggleManage}>
                  Open exam dashboard
                </button>
              </div>
            </section>

            {/* legend */}
            <div className={styles.legend}>
              <LegendItem color="var(--green)" label="Completed" />
              <LegendItem color="var(--st-red-ink)" label="Weak" />
              <LegendItem color="var(--amber)" label="Review" />
              <LegendItem color="var(--st-red-strong)" label="Exam-critical" />
              <LegendItem color="#caa53a" label="Gate" />
            </div>

            {/* linked learning path node list */}
            <section className={styles.card}>
              <div className={styles.cardHeadRow}>
                <div style={{ minWidth: 0 }}>
                  <h3 className={styles.cardTitle}>Linked learning path</h3>
                  <p className={styles.cardSub}>
                    {linkedPath ? `Based on your ${linkedPath.title} learning path` : 'No learning path is linked yet'}
                  </p>
                </div>
                {total > 0 ? <span className={styles.nodesBadge}>{total} nodes</span> : null}
              </div>

              {linkedPath && total > 0 ? (
                <>
                  <span className={styles.usesLine}>
                    <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 15 }}>link</span>
                    This exam uses {r.counts.paths === 1 ? '1 linked study path' : `${r.counts.paths} linked study paths`}
                  </span>
                  <div className={styles.nodeList}>
                    {classed.map(({ slot, cls }) => (
                      <Link key={slot.id} href={`/exam/${examId}/mission/${slot.id}`} className={styles.nodeRow}>
                        <span className={`${styles.nodeIcon} ${ICON_CLASS[cls.key]}`}>
                          <span className="material-symbols-outlined" aria-hidden>{cls.icon}</span>
                        </span>
                        <span className={styles.nodeMain}>
                          <span className={styles.nodeTitleRow}>
                            <span className={styles.nodeTitle}>{slot.title}</span>
                            <span className={`${styles.stateBadge} ${BADGE_CLASS[cls.key]}`}>{cls.badge}</span>
                          </span>
                          <span className={styles.nodeReason}>{cls.reason}</span>
                        </span>
                        <span className={styles.openInPath}>
                          <span className="material-symbols-outlined" aria-hidden>open_in_new</span>
                          <span>Open in path</span>
                        </span>
                        <span className={styles.chev}>
                          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 20 }}>chevron_right</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                  <div className={styles.pathFoot}>
                    <span className={styles.pathFootHint}>Open a node to study it in your exam context</span>
                    {primaryPathId ? (
                      <Link href={`/learn/paths/${primaryPathId}`} className={`${ui.btn} ${ui.secondary} ${ui.small}`}>
                        Open full path
                      </Link>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className={styles.setup} style={{ marginTop: 14 }}>
                  <p className={styles.setupText}>
                    This exam has graded material but no learning path linked yet. Add a path to its
                    coverage to see your nodes here.
                  </p>
                  <button type="button" className={`${ui.btn} ${ui.secondary} ${ui.small}`} onClick={props.onEditScope}>
                    Edit coverage
                  </button>
                </div>
              )}
            </section>

            {/* manage section (preserved capabilities) */}
            {props.showManage ? (
              <ManageSection
                examId={examId}
                scope={scope}
                editing={props.editing}
                onEdit={props.onEditScope}
                onCancel={props.onCancelScope}
                onSaved={props.onSavedScope}
              />
            ) : null}
          </div>

          {/* ── rail ── */}
          <aside className={styles.rail}>
            {/* exam readiness */}
            <section className={styles.railCard}>
              <h3 className={styles.railTitle}>Exam readiness</h3>
              <div className={styles.ringRow}>
                <Ring value={hasGraded ? r.readiness : 0} size={104} muted={!hasGraded} />
                <div className={styles.ringLegend}>
                  <span className={styles.ringLegendItem}>
                    <span className={ui.dot} style={{ background: 'var(--green)' }} />
                    Strong <b>{strongCount}</b>
                  </span>
                  <span className={styles.ringLegendItem}>
                    <span className={ui.dot} style={{ background: 'var(--st-red-ink)' }} />
                    Weak <b>{weakCount}</b>
                  </span>
                  <span className={styles.ringLegendItem}>
                    <span className={ui.dot} style={{ background: 'var(--amber)' }} />
                    Review <b>{reviewCount}</b>
                  </span>
                </div>
              </div>
              {!hasGraded ? (
                <p className={styles.railErr} style={{ color: 'var(--body)' }}>
                  Add a quiz or learning path to start tracking a readiness score.
                </p>
              ) : null}
            </section>

            {/* study plan */}
            <section className={styles.railCard}>
              <h3 className={styles.railTitle}>Study plan</h3>
              <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--body)', lineHeight: 1.55 }}>
                Mage orders today’s tasks and lays out the days to your exam.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Link href={`/exam/${examId}/plan`} className={`${ui.btn} ${ui.primary}`} style={{ width: '100%' }}>
                  <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>checklist</span>
                  Today’s plan
                </Link>
                <Link href={`/exam/${examId}/calendar`} className={`${ui.btn} ${ui.ghost}`} style={{ width: '100%' }}>
                  <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>calendar_month</span>
                  Study calendar
                </Link>
              </div>
            </section>

            {/* weak nodes */}
            <section className={styles.railCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14 }}>
                <h3 className={styles.railTitle} style={{ marginBottom: 0 }}>Weak nodes</h3>
                {hasGraded ? (
                  <Link href={`/exam/${examId}/weak-areas`} className={styles.back} style={{ padding: '2px 0', fontSize: 12.5 }}>
                    View all
                    <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16 }}>chevron_right</span>
                  </Link>
                ) : null}
              </div>
              {weakList.length > 0 ? (
                <>
                  {weakList.slice(0, 5).map(({ slot, cls }) => (
                    <div key={slot.id} className={styles.weakRow}>
                      <span className={ui.dot} style={{ background: cls.key === 'urgent' ? 'var(--st-red-strong)' : 'var(--st-red-ink)' }} />
                      <span className={styles.weakName}>{slot.title}</span>
                      <span className={`${styles.sevPill} ${cls.key === 'urgent' ? styles.bUrgent : styles.bWeak}`}>
                        {cls.badge}
                      </span>
                      <WeakPracticeButton pathId={primaryPathId} label="Practice" compact />
                    </div>
                  ))}
                  <WeakPracticeButton pathId={primaryPathId} label="Start weak-point session" />
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 13.5, color: 'var(--body)', lineHeight: 1.6 }}>
                  No weak nodes right now — your scored topics are all above the pass mark. Nice work.
                </p>
              )}
            </section>

            {/* Mage tip */}
            <section className={styles.tip}>
              <div className={styles.tipHead}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/mascot/holding-wand-v2.png" alt="" className={styles.tipMascot} />
                <span className={styles.tipLabel}>Mage tip</span>
              </div>
              <p className={styles.tipText}>
                {weakestName
                  ? `${weakestName} is your lowest-scoring node — clear it first to lift your readiness fastest.`
                  : hasGraded
                    ? 'You’re on track. Keep your streak going and rehearse with a mock exam closer to the day.'
                    : 'Scope a quiz or path so Mage can track your readiness and point you at weak spots.'}
              </p>
              <button type="button" className={styles.tipBtn} onClick={() => mage?.open()}>
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16 }}>add</span>
                Ask Mage
              </button>
            </section>
          </aside>
        </div>
      )}

      {/* mobile sticky continue */}
      <div className={styles.stickyBar}>
        <Link href={continueHref} className={`${ui.btn} ${ui.primary}`} style={{ width: '100%' }}>
          Continue studying
        </Link>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Ring({ value, size = 108, muted = false }: { value: number; size?: number; muted?: boolean }) {
  const v = Math.min(100, Math.max(0, value));
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (v / 100) * c;
  const center = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={muted ? 'Readiness not measured yet' : `${Math.round(v)}% ready`}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <circle cx={center} cy={center} r={r} fill="none" stroke="#eee7da" strokeWidth={stroke} />
      {!muted ? (
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={ringColor(v)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transformOrigin: 'center', transform: 'rotate(-90deg)', transition: 'stroke-dashoffset 0.6s var(--ease)' }}
        />
      ) : null}
      <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle" style={{ fontWeight: 800, fontSize: size * 0.235, fill: 'var(--ink)', letterSpacing: '-0.02em' }}>
        {muted ? '—' : `${Math.round(v)}%`}
      </text>
      <text x="50%" y="63%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: size * 0.105, fill: 'var(--body)', fontWeight: 600 }}>
        ready
      </text>
    </svg>
  );
}

/**
 * Post-exam archive view (Figma 89:22097 web / 89:22185 mobile). Shown by the
 * hub once the exam date has passed: a wrap-up summary (final readiness + real
 * node counts) and the post-exam loop entry points. "Enter result" flips to
 * "View report" once a result is recorded; "View preparation recap" reopens the
 * full studying hub. All stats are the hub's already-computed real values.
 */
function PostExamArchive({
  examId,
  exam,
  r,
  hasGraded,
  done,
  total,
  strongCount,
  weakCount,
  hasResult,
  continueHref,
  onShowRecap,
}: {
  examId: string;
  exam: ExamMeta;
  r: Readiness;
  hasGraded: boolean;
  done: number;
  total: number;
  strongCount: number;
  weakCount: number;
  hasResult: boolean;
  continueHref: string;
  onShowRecap: () => void;
}) {
  const examDate = new Date(exam.examDate);
  const dateLabel = Number.isNaN(examDate.getTime())
    ? ''
    : examDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className={styles.page}>
      <Link href="/exams" className={styles.back}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>chevron_left</span>
        Exam paths
      </Link>

      <div className={styles.archiveWrap}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mascot/holding-wand-v2.png" alt="" className={styles.archiveArt} />
        <h1 className={styles.archiveTitle}>Your exam is finished</h1>
        <p className={styles.archiveMeta}>
          {exam.title}{dateLabel ? <> · {dateLabel}</> : null}
        </p>

        <section className={styles.card} style={{ width: '100%', maxWidth: 520 }}>
          <span className={styles.summaryEyebrow}>Preparation summary</span>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryCell}>
              <Ring value={hasGraded ? r.readiness : 0} size={90} muted={!hasGraded} />
              <span className={styles.summaryLabel}>Final readiness</span>
            </div>
            <div className={styles.summaryCell}>
              <span className={styles.summaryValue}>{total > 0 ? `${done}/${total}` : '—'}</span>
              <span className={styles.summaryLabel}>Missions done</span>
            </div>
            <div className={styles.summaryCell}>
              <span className={styles.summaryValue} style={{ color: 'var(--green-ink)' }}>{strongCount}</span>
              <span className={styles.summaryLabel}>Strong {strongCount === 1 ? 'node' : 'nodes'}</span>
            </div>
            <div className={styles.summaryCell}>
              <span className={styles.summaryValue} style={{ color: weakCount > 0 ? 'var(--st-red-ink)' : 'var(--ink)' }}>{weakCount}</span>
              <span className={styles.summaryLabel}>Weak {weakCount === 1 ? 'node' : 'nodes'}</span>
            </div>
          </div>
        </section>

        <div className={styles.archiveActions}>
          {hasResult ? (
            <Link href={`/exam/${examId}/report`} className={`${ui.btn} ${ui.primary}`} style={{ width: '100%' }}>
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>bar_chart</span>
              View report
            </Link>
          ) : (
            <Link href={`/exam/${examId}/result`} className={`${ui.btn} ${ui.primary}`} style={{ width: '100%' }}>
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>edit_note</span>
              Enter result
            </Link>
          )}
          <button type="button" className={`${ui.btn} ${ui.secondary}`} style={{ width: '100%' }} onClick={onShowRecap}>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>summarize</span>
            View preparation recap
          </button>
          <Link href={continueHref} className={`${ui.btn} ${ui.ghost}`} style={{ width: '100%' }}>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>bolt</span>
            Keep studying
          </Link>
          <Link href="/exams" className={styles.archiveDone}>Archive exam</Link>
        </div>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className={styles.legendItem}>
      <span className={ui.dot} style={{ background: color }} />
      {label}
    </span>
  );
}

/**
 * One-tap weak-point practice. POSTs START_WEAK_TOPIC_SESSION against the linked
 * PATH context (the action is path-scoped + Pro-gated; see deriveAllowedActions),
 * then navigates to the cream run surface the API returns. Pro / quota / empty
 * failures surface inline rather than hiding the control.
 */
function WeakPracticeButton({ pathId, label, compact }: { pathId: string | null; label: string; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const start = async () => {
    if (busy || !pathId) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/mage/practice-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'START_WEAK_TOPIC_SESSION',
          context: { type: 'path', ids: { pathId } },
        }),
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
            ? json?.error ?? 'You’ve used up your practice-generation allowance for now.'
            : res.status === 400
              ? 'Study a bit more first — there isn’t enough graded material to build a set yet.'
              : json?.error ?? 'Mage couldn’t build a practice set right now. Try again in a moment.',
      );
      setBusy(false);
    } catch {
      setErr('Network error — please try again.');
      setBusy(false);
    }
  };

  if (compact) {
    return (
      <button type="button" className={styles.practiceBtn} onClick={start} disabled={busy || !pathId} title={err ?? undefined}>
        {busy ? '…' : label}
      </button>
    );
  }
  return (
    <>
      <button type="button" className={styles.weakSessionBtn} onClick={start} disabled={busy || !pathId}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>fitness_center</span>
        {busy ? 'Building…' : label}
      </button>
      {err ? <p role="alert" className={styles.railErr}>{err}</p> : null}
    </>
  );
}

/** Manage section — coverage editor + mock launcher, the preserved capabilities
 *  the old surface owned. Opened by "Open exam dashboard" / the Mage ?edit cards. */
function ManageSection({
  examId,
  scope,
  editing,
  onEdit,
  onCancel,
  onSaved,
}: {
  examId: string;
  scope: ScopeView;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: (view: ScopeView) => void;
}) {
  return (
    <div className={styles.manage}>
      <MockExamLauncher examId={examId} />
      <section className={styles.card}>
        <div className={styles.cardHeadRow}>
          <div>
            <h3 className={styles.cardTitle}>What this exam covers</h3>
            <p className={styles.cardSub}>The paths, quizzes and notes Mage tracks your readiness on</p>
          </div>
          {!editing ? (
            <button type="button" className={`${ui.btn} ${ui.secondary} ${ui.small}`} onClick={onEdit}>
              Edit coverage
            </button>
          ) : null}
        </div>
        {/* nm-rework-cream remaps the editor's dark Neon-Scholar tokens
            (--surface-container/-high, --outline, --on-surface) to the cream
            palette so the reused dark component doesn't render navy-on-cream
            inside the cream exam hub. Same guard the study-pack wizard uses. */}
        {editing ? (
          <div className="nm-rework-cream" style={{ marginTop: 14 }}>
            <ExamScopeEditor
              examId={examId}
              candidates={scope.candidates}
              current={scope.items.map((it) => ({ itemType: it.itemType, itemId: it.itemId }))}
              onCancel={onCancel}
              onSaved={(view) => onSaved(view as ScopeView)}
            />
          </div>
        ) : (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scope.items.length === 0 ? (
              <p className={styles.setupText}>Nothing scoped yet.</p>
            ) : (
              scope.items.map((it) => (
                <div
                  key={`${it.itemType}:${it.itemId}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 12, background: '#faf7ef' }}
                >
                  <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 19, color: 'var(--muted)' }}>
                    {SCOPE_ICON[it.itemType]}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.title}
                    </span>
                    {it.subtitle ? <span style={{ fontSize: 12, color: 'var(--body)' }}>{it.subtitle}</span> : null}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}

const SCOPE_ICON: Record<ScopeItemRef['itemType'], string> = {
  path: 'route',
  quiz_set: 'quiz',
  flashcard_set: 'style',
  page: 'description',
  document: 'picture_as_pdf',
  section: 'folder',
};

function SetupState({ examId, onEdit }: { examId: string; onEdit: () => void }) {
  return (
    <section className={styles.card}>
      <div className={styles.setup}>
        <span className={ui.tile} style={{ width: 52, height: 52 }}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 26 }}>checklist</span>
        </span>
        <h2 className={styles.cardTitle} style={{ fontSize: 20 }}>Set up this exam</h2>
        <p className={styles.setupText}>
          Pick the paths, quizzes and notes this exam covers. Mage then tracks how ready you are,
          flags your weak nodes, and can build mock exams and weak-point practice from them.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={onEdit}>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 19 }}>add</span>
            Set coverage
          </button>
          <Link href={`/exam/${examId}?edit=date`} className={`${ui.btn} ${ui.ghost}`}>
            Edit exam date
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Mock exam launcher. Phase 3 — links to the dedicated setup screen
 * (`/exam/:id/mock`) where the learner picks a type + fine-tunes a timed,
 * sealed rehearsal (the one-tap START_EXAM_SIMULATION launcher is superseded).
 */
function MockExamLauncher({ examId }: { examId: string }) {
  return (
    <section className={styles.card} style={{ borderColor: '#d9ccff', boxShadow: 'var(--shadow-raise)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0, flex: '1 1 280px' }}>
          <h3 className={styles.cardTitle}>Rehearse with a mock exam</h3>
          <p className={styles.cardSub} style={{ marginTop: 6, lineHeight: 1.6, maxWidth: '52ch' }}>
            Mage builds a timed, sealed quiz from this exam’s material — pick a type and fine-tune the
            length, question mix and difficulty, then sit it under the clock.
          </p>
        </div>
        <Link href={`/exam/${examId}/mock`} className={`${ui.btn} ${ui.primary}`} style={{ flexShrink: 0 }}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 19 }}>fort</span>
          Set up mock exam
        </Link>
      </div>
    </section>
  );
}

/**
 * Inline exam-date editor — the prefill target for Mage's CHANGE_EXAM_DATE card
 * (?edit=date). Mage never commits the change; the learner saves it here.
 */
function DateEditor({
  examId,
  currentIso,
  onSaved,
  onCancel,
}: {
  examId: string;
  currentIso: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().slice(0, 10);
  const [value, setValue] = useState(currentIso.slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!value || value < minDate) {
      setErr('Pick a date in the future.');
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/user/exams/${examId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examDate: value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setErr(body?.error || 'Could not save. Try again.');
        setSaving(false);
        return;
      }
      onSaved();
    } catch {
      setErr('Network error. Try again.');
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="date"
          value={value}
          min={minDate}
          disabled={saving}
          onChange={(e) => setValue(e.target.value)}
          style={{
            padding: '9px 12px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            color: 'var(--ink)',
            fontSize: 14,
            fontFamily: 'inherit',
          }}
        />
        <button type="button" className={`${ui.btn} ${ui.primary} ${ui.small}`} onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className={`${ui.btn} ${ui.ghost} ${ui.small}`} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
      {err ? <span style={{ fontSize: 12, color: 'var(--st-red-ink, #b4341f)' }}>{err}</span> : null}
    </div>
  );
}

function CenteredMessage({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 'clamp(16px, 4vw, 48px)', textAlign: 'center' }}>
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 40, color: 'var(--muted)' }}>{icon}</span>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>{title}</h1>
      {body ? <p style={{ margin: 0, fontSize: 14, color: 'var(--body)', maxWidth: 360 }}>{body}</p> : null}
      {action}
    </div>
  );
}
