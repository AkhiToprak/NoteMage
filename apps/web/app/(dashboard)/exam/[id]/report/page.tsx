'use client';

/* Exam Mode Phase 5 — Post-Exam Learning Report.
 * Figma X2 Exam Report (web two-column / mobile single-column).
 *
 * Fetch GET /api/user/exams/:id/report → { success, data: ExamReportView }.
 * On 404 shows empty state with a link to the result-entry screen.
 * Cream AppShell; ExamHub `.grid` two-column layout; cream tokens only. */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppShell from '@/components/app/AppShell';
import ui from '@/components/app/ui.module.css';
import styles from './Report.module.css';
import { useRegisterMageContext } from '@/components/mage';
import { type ExamReportView, bandLabel } from '@/lib/exam-result-core';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

function clamp(v: number): number {
  return Math.min(100, Math.max(0, v));
}

/* ---- small ring SVG (gold stroke, value in centre) ---- */
function Ring({ value, label, size = 72 }: { value: string; label?: string; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  // if value is a numeric %, use it for the stroke dash; otherwise full stroke
  const numericVal = parseFloat(value);
  const dash = !isNaN(numericVal) ? (clamp(numericVal) / 100) * circ : circ;

  // Fit the centered value inside the ring: scale by ring size AND value length
  // so a small rail ring or a long grade ("110/110") never overflows the gold
  // stroke. ~0.78em advance per glyph (the "%" and bold numerals are wide); the
  // (size - 24) target keeps the text clear of the 8px stroke + a margin.
  const valueFs = Math.min(size * 0.28, (size - 24) / (Math.max(value.length, 2) * 0.78));

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      className={styles.ringsvg}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#eee7da"
        strokeWidth={8}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--gold)"
        strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x={size / 2}
        y={label ? size / 2 - 5 : size / 2}
        textAnchor="middle"
        dominantBaseline={label ? 'auto' : 'central'}
        fontSize={label ? Math.min(14, valueFs) : valueFs}
        fontWeight={800}
        fill="var(--ink)"
        fontFamily="inherit"
      >
        {value}
      </text>
      {label && (
        <text
          x={size / 2}
          y={size / 2 + 12}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={Math.max(9, size * 0.13)}
          fill="var(--body)"
          fontFamily="inherit"
        >
          {label}
        </text>
      )}
    </svg>
  );
}

/* ---- verdict pill ---- */
function VerdictPill({ verdict }: { verdict: ExamReportView['prediction']['verdict'] }) {
  if (verdict === 'on_track') {
    return (
      <span className={`${ui.pill} ${ui.pillGreen}`}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 14 }}>check_circle</span>
        On track
      </span>
    );
  }
  if (verdict === 'over') {
    return (
      <span className={`${ui.pill} ${ui.pillAmber}`}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 14 }}>trending_up</span>
        Over-predicted
      </span>
    );
  }
  return (
    <span className={`${ui.pill} ${ui.pillLilac}`}>
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 14 }}>trending_down</span>
      Under-predicted
    </span>
  );
}

/* ---- outcome pill ---- */
function OutcomePill({ outcome }: { outcome: ExamReportView['result']['outcome'] }) {
  if (outcome === 'passed') {
    return (
      <span className={`${ui.pill} ${ui.pillGreen}`}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 14 }}>check</span>
        Passed
      </span>
    );
  }
  if (outcome === 'failed') {
    return <span className={`${styles.outcomePillRed}`}>Failed</span>;
  }
  return (
    <span className={`${ui.pill} ${ui.pillLilac}`}>
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 14 }}>schedule</span>
      Pending
    </span>
  );
}

/* ---- bar row (track + fill) ---- */
function BarRow({
  label,
  pct,
  amber = false,
}: {
  label: string;
  pct: number;
  amber?: boolean;
}) {
  return (
    <div className={styles.barRow}>
      <div className={styles.barHead}>
        <span className={styles.barLabel}>{label}</span>
        <span className={styles.barPct}>{Math.round(pct)}%</span>
      </div>
      <div className={ui.track}>
        <div
          className={amber ? `${ui.fill} ${ui.fillAmber}` : ui.fill}
          style={{ width: `${clamp(pct)}%` }}
        />
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────── */

function ReportView({ examId, data }: { examId: string; data: ExamReportView }) {
  const { exam, result, targetDisplay, scorePct, prediction, whatWorked, whatNeedsWork, scoreBreakdown, recommendedNext, feedbackTopics, stats, narrative } = data;

  return (
    <div className={styles.page}>
      {/* back link */}
      <Link href={`/exam/${examId}`} className={styles.back}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>chevron_left</span>
        {exam.subject ? `${exam.subject} dashboard` : 'Exam dashboard'}
      </Link>

      {/* page head */}
      <div className={styles.head}>
        <h1 className={styles.title}>Exam report</h1>
        <p className={styles.subtitle}>
          {exam.subject && <>{exam.subject}<span className={styles.subDot} aria-hidden /></>}
          Examined {formatDate(exam.examDate)}
        </p>
      </div>

      {/* TOP STRIP — full-width hero card */}
      <section className={styles.strip}>
        {/* grade ring */}
        <div className={styles.stripRing}>
          <Ring value={result.gradeDisplay} size={80} />
        </div>

        {/* outcome + stats */}
        <div className={styles.stripBody}>
          <div className={styles.stripOutcomeRow}>
            <OutcomePill outcome={result.outcome} />
          </div>
          <div className={styles.stripStats}>
            {targetDisplay && (
              <div className={styles.statCell}>
                <span className={styles.statValue}>{targetDisplay}</span>
                <span className={styles.statLabel}>Target</span>
              </div>
            )}
            <div className={styles.statCell}>
              <span className={styles.statValue}>{Math.round(scorePct)}%</span>
              <span className={styles.statLabel}>Score</span>
            </div>
            {stats.hasReadiness && (
              <div className={styles.statCell}>
                <span className={styles.statValue}>{Math.round(stats.finalReadiness)}%</span>
                <span className={styles.statLabel}>Readiness</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* two-column grid */}
      <div className={styles.grid}>
        {/* LEFT — main */}
        <div className={styles.main}>

          {/* Prediction vs result */}
          <section className={styles.card}>
            <div className={styles.cardHeadRow}>
              <h2 className={styles.cardTitle}>Prediction vs result</h2>
              <VerdictPill verdict={prediction.verdict} />
            </div>
            <div className={styles.barsGroup}>
              <BarRow label={`Predicted readiness — ${Math.round(prediction.predictedReadiness)}%`} pct={prediction.predictedReadiness} />
              <BarRow label={`Actual score — ${Math.round(prediction.actualScore)}%`} pct={prediction.actualScore} amber />
            </div>
            <div className={styles.predictionNote}>
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16, color: 'var(--accent)', flexShrink: 0 }}>insights</span>
              <span>{prediction.note}</span>
            </div>
          </section>

          {/* What worked */}
          {whatWorked.length > 0 && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>What worked</h2>
              <div className={styles.workedList}>
                {whatWorked.map((row) => (
                  <div key={row.title} className={styles.workedRow}>
                    <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16, color: 'var(--green-ink)', flexShrink: 0 }}>check_circle</span>
                    <span className={styles.workedTitle}>{row.title}</span>
                    <span className={styles.workedPct}>{Math.round(row.pct)}%</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* What needs work */}
          {whatNeedsWork.length > 0 && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>What needs work</h2>
              <div className={styles.weakList}>
                {whatNeedsWork.map((row) => (
                  <div key={row.key} className={styles.weakRow}>
                    <span className={styles.weakTitle}>{row.title}</span>
                    <span className={styles.weakMastery}>{Math.round(row.mastery)}%</span>
                    <span
                      className={`${styles.bandTag} ${
                        row.band === 'urgent'
                          ? styles.bandUrgent
                          : row.band === 'needs_practice'
                            ? styles.bandPractice
                            : styles.bandAlmost
                      }`}
                    >
                      {bandLabel(row.band)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Action buttons */}
          <div className={styles.actions}>
            <Link href="/exams/new" className={`${ui.btn} ${ui.primary}`}>
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 19 }}>add</span>
              Prepare next exam
            </Link>
            <Link href="/exams" className={`${ui.btn} ${ui.secondary}`}>
              Archive exam
            </Link>
          </div>
        </div>

        {/* RIGHT — rail */}
        <div className={styles.rail}>

          {/* Score breakdown */}
          {scoreBreakdown.length > 0 && (
            <section className={styles.card}>
              <div className={styles.cardHeadRow}>
                <h2 className={styles.cardTitle}>Score breakdown</h2>
                <Ring value={`${Math.round(scorePct)}%`} size={64} />
              </div>
              <div className={styles.barsGroup}>
                {scoreBreakdown.map((row) => (
                  <BarRow key={row.title} label={row.title} pct={row.pct} />
                ))}
              </div>
            </section>
          )}

          {/* Key feedback topics */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Key feedback topics</h2>
            {feedbackTopics.length > 0 && (
              <div className={styles.topicChips}>
                {feedbackTopics.map((t) => (
                  <span key={t} className={`${ui.pill} ${ui.pillPurple}`}>{t}</span>
                ))}
              </div>
            )}
            <p className={styles.topicsNote}>{narrative.keyTopicsNote}</p>
            {narrative.focusInsight && (
              <div className={styles.focusCallout}>
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16, flexShrink: 0 }}>lightbulb</span>
                <span>{narrative.focusInsight}</span>
              </div>
            )}
            <Link href={`/exam/${examId}/feedback`} className={styles.tagLink}>
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 14 }}>edit</span>
              Tag surprise topics
            </Link>
          </section>

          {/* Recommended next steps */}
          {recommendedNext.length > 0 && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Recommended next steps</h2>
              <ol className={styles.nextList}>
                {recommendedNext.map((step, i) => (
                  <li key={step.key} className={styles.nextItem}>
                    <Link href={`/exam/${examId}/weak-areas`} className={styles.nextLink}>
                      <span className={styles.nextNum}>{i + 1}</span>
                      <div className={styles.nextBody}>
                        <span className={styles.nextTitle}>{step.title}</span>
                        <span className={styles.nextDetail}>{step.detail} · {step.estMinutes} min</span>
                      </div>
                      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18, color: 'var(--muted)', flexShrink: 0 }}>chevron_right</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────── page shell ── */

export default function ExamReportPage() {
  const params = useParams();
  const examId = Array.isArray(params?.id) ? params.id[0] : (params?.id ?? '');

  const [data, setData] = useState<ExamReportView | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'noresult' | 'error'>('loading');

  useRegisterMageContext({ type: 'exam', ids: { examId }, title: data?.exam.title ?? 'Exam report' });

  useEffect(() => {
    if (!examId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/user/exams/${examId}/report`);
        if (cancelled) return;
        if (res.status === 404) { setStatus('noresult'); return; }
        if (!res.ok) { setStatus('error'); return; }
        const json = (await res.json()) as { success: boolean; data: ExamReportView };
        if (cancelled) return;
        if (!json.success) { setStatus('error'); return; }
        setData(json.data);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [examId]);

  if (status !== 'ready' || !data) {
    return (
      <AppShell>
        <div className={styles.center}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 40, color: 'var(--muted)' }}>
            {status === 'noresult' ? 'assignment_late' : status === 'error' ? 'error' : 'hourglass_empty'}
          </span>
          <h1 className={styles.centerTitle}>
            {status === 'noresult'
              ? 'No result recorded yet'
              : status === 'error'
                ? "Couldn't load the report"
                : 'Loading…'}
          </h1>
          {status === 'noresult' && (
            <Link href={`/exam/${examId}/result`} className={`${ui.btn} ${ui.primary}`}>
              Enter your result
            </Link>
          )}
          {status === 'error' && (
            <Link href={`/exam/${examId}`} className={`${ui.btn} ${ui.secondary}`}>
              Back to exam
            </Link>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ReportView examId={examId} data={data} />
    </AppShell>
  );
}
