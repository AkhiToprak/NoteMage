'use client';

/* Hallmark · page: mock exam results · genre: editorial · theme: project (cream AppShell)
 * states: action buttons carry hover · focus-visible · active (ui.module.css)
 * contrast: pass (cream `.shell` tokens only)
 * Hallmark · pre-emit critique: P5 H4 E4 S4 R5 V4
 *
 * Exam Mode Phase 3 — "Mock exam results". Real recorded data only: the score +
 * letter grade, the readiness delta (before → after snapshot), and the per-topic /
 * per-question-type breakdown computed from THIS attempt. No fabricated metrics —
 * every number traces to the graded QuizAttempt. Recommended next step points at
 * the weak-areas dashboard. */

import Link from 'next/link';
import AppShell from '@/components/app/AppShell';
import ui from '@/components/app/ui.module.css';
import s from './MockResults.module.css';
import { gradeForPercentage } from '@/lib/path-gating';
import { MOCK_TYPE_PRESETS, durationLabel, type MockType } from '@/lib/mock-exam-config';
import type { MockExamDetail } from '@/lib/mock-exam-loader';

export interface MockResultsViewProps {
  detail: MockExamDetail | null;
  examId: string;
  mockId: string;
  errored: boolean;
}

function starsFor(pct: number): number {
  if (pct >= 90) return 3;
  if (pct >= 80) return 2;
  if (pct >= 70) return 1;
  return 0;
}
function barColor(pct: number): string {
  if (pct >= 70) return 'var(--green, #2f8f4e)';
  if (pct >= 40) return 'var(--gold, #d9a521)';
  return 'var(--st-red-strong, #d4592f)';
}
function timeLabel(sec: number | null): string {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  if (m === 0) return `${r}s`;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

interface BreakdownGroup {
  key: string;
  label: string;
  total: number;
  correct: number;
  pct: number;
}

function Bar({ group }: { group: BreakdownGroup }) {
  return (
    <div className={s.barRow}>
      <div className={s.barHead}>
        <span className={s.barLabel}>{group.label}</span>
        <span className={s.barMeta}>{group.correct}/{group.total} · {group.pct}%</span>
      </div>
      <div className={s.barTrack}>
        <div className={s.barFill} style={{ width: `${group.pct}%`, background: barColor(group.pct) }} />
      </div>
    </div>
  );
}

export default function MockResultsView({ detail, examId, mockId, errored }: MockResultsViewProps) {
  if (!detail || !detail.result || errored) {
    return (
      <AppShell>
        <div className={s.center}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 38, color: 'var(--muted)' }}>
            {errored ? 'error' : 'event_busy'}
          </span>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--body)' }}>
            {errored ? 'Couldn’t load these results.' : 'Mock exam not found.'}
          </p>
          <Link href={`/exam/${examId}`} className={`${ui.btn} ${ui.secondary}`}>Back to exam</Link>
        </div>
      </AppShell>
    );
  }

  const { mock, exam, result } = detail;
  const preset = MOCK_TYPE_PRESETS[mock.config.type as MockType] ?? MOCK_TYPE_PRESETS.quick;
  const pct = Math.round(result.percentage);
  const grade = gradeForPercentage(result.percentage);
  const stars = starsFor(result.percentage);
  const passed = pct >= 70;

  const hasReadiness = mock.readinessBefore != null && mock.readinessAfter != null;
  const delta = hasReadiness ? Math.round(mock.readinessAfter! - mock.readinessBefore!) : null;

  const { byTopic, byType, strongest, weakest } = result.breakdown;

  return (
    <AppShell>
      <div className={s.page}>
        <Link href={`/exam/${examId}`} className={s.back}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>chevron_left</span>
          Back to exam
        </Link>

        <h1 className={s.title}>Mock exam results</h1>
        <p className={s.subtitle}>
          {exam.title} · {preset.label} · {durationLabel(mock.config.durationSec)}
        </p>

        {/* Hero */}
        <section className={s.hero}>
          <div className={s.heroScore}>
            <span className={s.heroGrade}>{grade}</span>
            <span className={s.heroPct}>{pct}% · {result.score}/{result.total} correct</span>
            <span className={s.stars} aria-label={`${stars} of 3 stars`}>
              {[0, 1, 2].map((i) => (
                <span key={i} className={`material-symbols-outlined ${i < stars ? s.star : s.starOff}`} aria-hidden style={{ fontSize: 22, fontVariationSettings: i < stars ? "'FILL' 1" : undefined }}>
                  star
                </span>
              ))}
            </span>
          </div>
          <p className={s.heroMsg}>
            {passed ? (
              <><strong>Solid run.</strong> Keep drilling the topics you slipped on below to lift your exam readiness.</>
            ) : (
              <><strong>A rehearsal, not a verdict.</strong> Review your weak topics below and run it again before the real thing.</>
            )}
          </p>
        </section>

        {/* Stat strip */}
        <div className={s.strip}>
          <div className={s.stat}>
            <span className={s.statValue}>{result.score}/{result.total}</span>
            <span className={s.statLabel}>Questions correct</span>
          </div>
          <div className={s.stat}>
            <span className={s.statValue}>{timeLabel(result.timeSpent)}</span>
            <span className={s.statLabel}>Time taken</span>
          </div>
          <div className={s.stat}>
            {delta != null ? (
              <span className={`${s.statValue} ${delta > 0 ? s.statValueUp : delta < 0 ? s.statValueDown : ''}`}>
                {delta > 0 ? `+${delta}` : `${delta}`}
              </span>
            ) : (
              <span className={s.statValue}>—</span>
            )}
            <span className={s.statLabel}>
              {delta != null ? `Readiness (now ${Math.round(mock.readinessAfter!)}%)` : 'Readiness change'}
            </span>
          </div>
        </div>

        {/* By topic */}
        {byTopic.length > 0 ? (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>By topic</h2>
            </div>
            <div className={s.card}>
              {byTopic.map((g) => (
                <Bar key={g.key} group={g} />
              ))}
            </div>
          </section>
        ) : null}

        {/* Strongest / weakest */}
        {strongest || weakest ? (
          <section className={s.section}>
            <div className={s.callouts}>
              {strongest ? (
                <div className={s.callout}>
                  <span className={`${s.calloutLabel} ${s.calloutStrong}`}>
                    <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16 }}>trending_up</span>
                    Strongest
                  </span>
                  <div className={s.calloutTopic}>{strongest.label}</div>
                  <div className={s.calloutMeta}>{strongest.correct}/{strongest.total} correct · {strongest.pct}%</div>
                </div>
              ) : null}
              {weakest ? (
                <div className={s.callout}>
                  <span className={`${s.calloutLabel} ${s.calloutWeak}`}>
                    <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16 }}>trending_down</span>
                    Needs work
                  </span>
                  <div className={s.calloutTopic}>{weakest.label}</div>
                  <div className={s.calloutMeta}>{weakest.correct}/{weakest.total} correct · {weakest.pct}%</div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* By question type */}
        {byType.length > 0 ? (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionTitle}>By question type</h2>
            </div>
            <div className={s.card}>
              {byType.map((g) => (
                <Bar key={g.key} group={g} />
              ))}
            </div>
          </section>
        ) : null}

        {/* Next steps */}
        <div className={s.actions}>
          <Link href={`/exam/${examId}/weak-areas`} className={`${ui.btn} ${ui.primary} ${s.nextBtn}`}>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 19 }}>target</span>
            Review weak areas
          </Link>
          <Link href={`/exam/${examId}/mock`} className={`${ui.btn} ${ui.secondary} ${s.nextBtn}`}>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 19 }}>fort</span>
            New mock exam
          </Link>
          <Link href={`/exam/${examId}`} className={`${ui.btn} ${ui.ghost} ${s.nextBtn}`}>
            Back to exam
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
