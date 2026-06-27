'use client';

/* Exam Mode Phase 5 — Good Result Celebration (Figma 89:21993 web / 89:22389
 * mobile). A full-bleed takeover (DashboardChrome marks /celebration immersive →
 * no sidebar, no phone nav), so this page declares the cream palette itself
 * rather than inheriting it from AppShell `.shell`. Reads the report so every
 * stat is real (target / grade / readiness / missions / mocks). Honest-copy:
 * the Figma's day-streak + achievement chip have no backing field → omitted. */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import styles from './Celebration.module.css';
import type { ExamReportView } from '@/lib/exam-result-core';

export default function ExamCelebrationPage() {
  const params = useParams();
  const examId = Array.isArray(params?.id) ? params.id[0] : (params?.id ?? '');
  const [report, setReport] = useState<ExamReportView | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!examId) return;
    let cancelled = false;
    // `ai=0`: the celebration only renders the deterministic stats, so skip the
    // one-time AI prose generation that otherwise blocks this first report load
    // (the prose still generates + caches when the learner opens /report).
    fetch(`/api/user/exams/${examId}/report?ai=0`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body) => {
        if (cancelled) return;
        setReport(body.data as ExamReportView);
        setStatus('ready');
      })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [examId]);

  return (
    <div className={styles.page}>
      <div className={styles.sky} aria-hidden>
        {SPARKS.map((s, i) => (
          <span key={i} className={styles.spark} style={{ left: `${s.x}%`, top: `${s.y}%`, color: s.c, fontSize: s.s }}>
            {s.g}
          </span>
        ))}
      </div>

      {status !== 'ready' || !report ? (
        <div className={styles.center}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 38, color: 'var(--muted)' }}>
            {status === 'error' ? 'error' : 'celebration'}
          </span>
          <p className={styles.loadingText}>{status === 'error' ? "Couldn't load your result." : 'Loading…'}</p>
          {status === 'error' && <Link href={`/exam/${examId}`} className={styles.ghostLink}>Back to exam</Link>}
        </div>
      ) : (
        <Celebration examId={examId} report={report} />
      )}
    </div>
  );
}

function Celebration({ examId, report }: { examId: string; report: ExamReportView }) {
  const s = report.stats;
  const beatTarget = s.targetDisplay != null;

  const cells: { label: string; value: string; tone: 'ink' | 'green' | 'amber' | 'accent' }[] = [];
  if (s.targetDisplay) cells.push({ label: 'Target', value: s.targetDisplay, tone: 'ink' });
  cells.push({ label: 'Actual', value: s.gradeDisplay, tone: 'green' });
  if (s.hasReadiness) cells.push({ label: 'Final readiness', value: `${s.finalReadiness}%`, tone: 'amber' });
  if (s.missionsTotal > 0) cells.push({ label: 'Missions', value: `${s.missionsDone} / ${s.missionsTotal}`, tone: 'accent' });
  if (s.weakTotal > 0) cells.push({ label: 'Topics mastered', value: `${s.weakClosed} / ${s.weakTotal}`, tone: 'green' });
  if (s.mocksTaken > 0) cells.push({ label: 'Mock exams done', value: String(s.mocksTaken), tone: 'ink' });

  return (
    <div className={styles.stage}>
      <div className={styles.badgeRow}>
        <span className={styles.starBadge}>
          <span className="material-symbols-outlined filled" aria-hidden>star</span>
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mascot/holding-wand-v2.png" alt="" className={styles.mascot} />
      </div>

      <h1 className={styles.title}>You did it!</h1>
      <p className={styles.subtitle}>
        {beatTarget
          ? <>You beat your target — you scored {s.gradeDisplay}.</>
          : <>You passed — you scored {s.gradeDisplay}.</>}
      </p>
      <span className={styles.smashed}>
        <span className="material-symbols-outlined filled" aria-hidden style={{ fontSize: 15 }}>star</span>
        {beatTarget ? 'Target smashed' : 'Exam passed'}
      </span>

      <section className={styles.card}>
        <span className={styles.eyebrow}>Exam results</span>
        <div className={styles.statGrid}>
          {cells.map((c) => (
            <div key={c.label} className={styles.statCell}>
              <span className={`${styles.statValue} ${styles[`v_${c.tone}`]}`}>{c.value}</span>
              <span className={styles.statLabel}>{c.label}</span>
            </div>
          ))}
        </div>
      </section>

      <div className={styles.actions}>
        <Link href={`/exam/${examId}/report`} className={styles.primary}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 19 }}>bar_chart</span>
          View report
        </Link>
        <Link href="/exams/new" className={styles.secondary}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 19 }}>chevron_right</span>
          Prepare next exam
        </Link>
      </div>
    </div>
  );
}

/** Static decorative sparks — deterministic positions, no animation. */
const SPARKS: { x: number; y: number; c: string; s: number; g: string }[] = [
  { x: 8, y: 14, c: '#f2b829', s: 18, g: '✦' },
  { x: 22, y: 30, c: '#7c5cff', s: 12, g: '✦' },
  { x: 16, y: 52, c: '#f2b829', s: 14, g: '✦' },
  { x: 30, y: 8, c: '#c9bcff', s: 11, g: '✦' },
  { x: 72, y: 12, c: '#f2b829', s: 13, g: '✦' },
  { x: 88, y: 26, c: '#7c5cff', s: 16, g: '✦' },
  { x: 92, y: 50, c: '#c9bcff', s: 12, g: '✦' },
  { x: 78, y: 44, c: '#f2b829', s: 11, g: '✦' },
  { x: 62, y: 6, c: '#c9bcff', s: 10, g: '✦' },
  { x: 50, y: 60, c: '#f2b829', s: 12, g: '✦' },
];
