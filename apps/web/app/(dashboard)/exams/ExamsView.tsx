'use client';

import Link from 'next/link';
import AppShell from '@/components/app/AppShell';
import ui from '@/components/app/ui.module.css';
import styles from './Exams.module.css';

/* WEX01 — Exams (Web) view. Receives the already-resolved overview from the
   server page (loadExamsOverview, the same data /api/user/exams/overview
   served) — no client fetch, no loading spinner. Pure presentation. */

interface ActiveExam {
  id: string;
  title: string;
  examDate: string;
  notebookName: string | null;
  daysUntil: number;
  readiness: number;
  hasGradedMaterial: boolean;
  isEmpty: boolean;
  weakAreas: number;
  linkedPaths: number;
}

interface ArchivedExam {
  id: string;
  title: string;
  examDate: string;
  notebookName: string | null;
  gradeDisplay: string | null;
  outcome: 'passed' | 'failed' | 'pending' | null;
}

export interface Overview {
  active: ActiveExam[];
  archived: ArchivedExam[];
}

function MsIcon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <span className="material-symbols-outlined" style={{ fontSize: size, color: 'inherit' }} aria-hidden>
      {name}
    </span>
  );
}

/** Countdown label from whole days until the exam. */
function daysLeftLabel(days: number): string {
  if (days <= 0) return 'Due today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

/** Readiness → status pill + accent, mirroring the exam overview thresholds. */
function readinessStatus(pct: number): { label: string; pill: string; icon: string; color: string } {
  if (pct >= 70) return { label: 'On track', pill: ui.pillGreen, icon: 'check_circle', color: 'var(--green)' };
  if (pct >= 40) return { label: 'Keep going', pill: ui.pillAmber, icon: 'local_fire_department', color: 'var(--amber-ink)' };
  return { label: 'Needs focus', pill: ui.pillPurple, icon: 'priority_high', color: 'var(--accent)' };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ExamsView({ data, errored }: { data: Overview; errored: boolean }) {
  return (
    <AppShell>
      <header className={ui.header}>
        <div>
          <h1 className={ui.h1}>Exams</h1>
          <p className={ui.sub}>Prepare with paths, weak-point practice, and readiness tracking.</p>
        </div>
        <Link href="/exams/new" className={`${ui.btn} ${ui.primary}`}>
          <MsIcon name="add" size={19} />
          Create exam
        </Link>
      </header>

      {errored ? (
        <StatusNote icon="error" text="Couldn't load your exams. Please try again." />
      ) : (
        <Content data={data} />
      )}
    </AppShell>
  );
}

function Content({ data }: { data: Overview }) {
  const { active, archived } = data;

  if (active.length === 0 && archived.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyArt}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot/holding-wand-v2.png" alt="" />
        </span>
        <h2 className={styles.emptyTitle}>No exams yet</h2>
        <p className={styles.emptyText}>
          Create your first exam and NoteMage builds a study plan around your deadline.
        </p>
        <Link href="/exams/new" className={`${ui.btn} ${ui.primary}`}>
          <MsIcon name="add" size={19} />
          Create exam
        </Link>
      </div>
    );
  }

  return (
    <>
      {active.length > 0 && (
        <section className={styles.section}>
          <div className={ui.sectionLabel}>
            Active <span className={ui.count}>{active.length}</span>
          </div>
          <div className={styles.grid}>
            {active.map((e, i) => (
              <ActiveCard key={e.id} e={e} raised={i === 0} />
            ))}
          </div>
        </section>
      )}

      {archived.length > 0 && (
        <section className={styles.section}>
          <div className={ui.sectionLabel}>
            Archived <span className={ui.count}>{archived.length}</span>
          </div>
          <div className={styles.grid}>
            {archived.map((a) => (
              <ArchivedCard key={a.id} a={a} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function ActiveCard({ e, raised }: { e: ActiveExam; raised: boolean }) {
  const graded = e.hasGradedMaterial && !e.isEmpty;
  const status = readinessStatus(e.readiness);
  const detailHref = `/exam/${e.id}`;

  return (
    <article className={`${ui.card} ${raised ? ui.cardAccent : ''} ${styles.examCard}`}>
      <div className={styles.cardTop}>
        <div>
          <h2 className={styles.cardTitle}>{e.title}</h2>
          {e.notebookName && (
            <div className={styles.cardSubject}>
              <span className={ui.dot} style={{ background: 'var(--primary)' }} />
              {e.notebookName}
            </div>
          )}
        </div>
        <span className={`${ui.pill} ${ui.pillLilac}`}>
          <MsIcon name="calendar_today" size={15} />
          {daysLeftLabel(e.daysUntil)}
        </span>
      </div>

      {e.isEmpty ? (
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--body)', lineHeight: 1.6 }}>
          Nothing scoped yet. Pick the paths and quizzes this exam covers to start tracking
          readiness.
        </p>
      ) : (
        <>
          <div className={styles.readyRow}>
            <span className={styles.readyPct} style={{ color: graded ? status.color : 'var(--body)' }}>
              {graded ? `${e.readiness}% ready` : 'No graded material yet'}
            </span>
            {graded && (
              <span className={`${ui.pill} ${status.pill}`}>
                <MsIcon name={status.icon} size={15} />
                {status.label}
              </span>
            )}
          </div>

          <div className={ui.track}>
            <div
              className={`${ui.fill} ${graded && e.readiness < 70 ? ui.fillAmber : ''}`}
              style={{ width: `${graded ? e.readiness : 0}%` }}
            />
          </div>

          <div className={styles.metaRow}>
            {graded && (
              <span className={styles.metaItem}>
                <span className={ui.dot} style={{ background: 'var(--amber)' }} />
                {e.weakAreas} weak {e.weakAreas === 1 ? 'area' : 'areas'}
              </span>
            )}
            <span className={styles.metaItem}>
              <span className={ui.dot} style={{ background: 'var(--primary)' }} />
              {e.linkedPaths} linked {e.linkedPaths === 1 ? 'path' : 'paths'}
            </span>
          </div>
        </>
      )}

      <div className={styles.actions}>
        {e.isEmpty ? (
          <>
            <span />
            <Link href={`/exam/${e.id}?edit=scope`} className={`${ui.btn} ${ui.primary}`}>
              Set up exam
            </Link>
          </>
        ) : (
          <>
            {graded && e.weakAreas > 0 ? (
              <Link href={detailHref} className={`${ui.btn} ${ui.ghost}`}>
                View weak areas
              </Link>
            ) : (
              <span />
            )}
            <Link href={detailHref} className={`${ui.btn} ${ui.primary}`}>
              Open exam
            </Link>
          </>
        )}
      </div>
    </article>
  );
}

function ArchivedCard({ a }: { a: ArchivedExam }) {
  const meta = [a.notebookName, formatDate(a.examDate)].filter(Boolean).join(' · ');
  const passed = a.outcome === 'passed';
  const failed = a.outcome === 'failed';
  return (
    <Link href={`/exam/${a.id}`} className={`${ui.card} ${styles.archCard}`} style={{ textDecoration: 'none' }}>
      <div className={styles.archLeft}>
        <span
          className={styles.archCheck}
          style={{
            background: passed ? 'var(--green-soft)' : failed ? 'var(--lilac-soft)' : 'var(--lilac-soft)',
            color: passed ? 'var(--green-ink)' : 'var(--accent)',
          }}
        >
          <MsIcon name={a.gradeDisplay ? (passed ? 'verified' : 'history_edu') : 'history'} size={22} />
        </span>
        <div>
          <div className={styles.archTitle}>{a.title}</div>
          {meta && <div className={styles.archMeta}>{meta}</div>}
        </div>
      </div>
      {a.gradeDisplay ? (
        <span
          className={`${ui.pill} ${passed ? ui.pillGreen : ui.pillLilac}`}
          title={a.outcome ? `Result: ${a.outcome}` : undefined}
        >
          <MsIcon name="grade" size={15} />
          {a.gradeDisplay}
        </span>
      ) : (
        <span className={`${ui.pill} ${ui.pillLilac}`}>
          <MsIcon name="edit_note" size={15} />
          Add result
        </span>
      )}
    </Link>
  );
}

function StatusNote({ icon, text }: { icon: string; text: string }) {
  return (
    <div
      className={styles.section}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: '48px 16px',
        textAlign: 'center',
      }}
    >
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 36, color: 'var(--body)' }}>
        {icon}
      </span>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--body)' }}>{text}</p>
    </div>
  );
}
