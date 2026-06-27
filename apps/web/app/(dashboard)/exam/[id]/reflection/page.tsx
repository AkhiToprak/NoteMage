'use client';

/* Exam Mode Phase 5 — Exam Reflection ("What went wrong?").
 * Figma: reflection screen (web + mobile single-column).
 *
 * Requires a recorded result (existing != null). If the result page hasn't been
 * submitted yet, redirect back to /exam/[id]/result.
 * On submit: PATCH /api/user/exams/:id/result { action:'reflection', reasons:[…] }
 * → push to /exam/[id]/report. */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/app/AppShell';
import ui from '@/components/app/ui.module.css';
import styles from './Reflection.module.css';
import { useRegisterMageContext } from '@/components/mage';
import {
  REFLECTION_REASONS,
  buildReflectionTake,
} from '@/lib/exam-result-core';

interface ResultContext {
  exam: {
    id: string;
    title: string;
    subject: string | null;
    examDate: string;
    notebookId: string | null;
  };
  grading: {
    id: string;
    label: string;
    kind: 'numeric' | 'letter';
    passMark: number | string;
    passNeutral: number;
    unit: string;
    decimals: number;
  };
  targetNeutral: number | null;
  targetDisplay: string | null;
  existing: {
    gradeNeutral: number;
    gradeValue: number | string;
    outcome: string;
    difficultyFelt: string | null;
    notes: string | null;
  } | null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function passDisplayFor(grading: ResultContext['grading']): string {
  if (grading.kind === 'numeric') return `${grading.passMark}${grading.unit ?? ''}`;
  return String(grading.passMark);
}

export default function ExamReflectionPage() {
  const params = useParams();
  const examId = Array.isArray(params?.id) ? params.id[0] : (params?.id ?? '');
  const [ctx, setCtx] = useState<ResultContext | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');
  const router = useRouter();

  useRegisterMageContext({ type: 'exam', ids: { examId }, title: ctx?.exam.title ?? 'Exam' });

  useEffect(() => {
    if (!examId) return;
    let cancelled = false;
    fetch(`/api/user/exams/${examId}/result`)
      .then((res) => {
        if (res.status === 404) return { __nf: true };
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((body) => {
        if (cancelled) return;
        if (body?.__nf) { setStatus('notfound'); return; }
        const data = body.data as ResultContext;
        // Reflection requires a recorded result — bounce back if none.
        if (!data.existing) {
          router.replace(`/exam/${examId}/result`);
          return;
        }
        setCtx(data);
        setStatus('ready');
      })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [examId, router]);

  if (status !== 'ready' || !ctx) {
    return (
      <AppShell>
        <div className={styles.center}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 38, color: 'var(--muted)' }}>
            {status === 'notfound' ? 'event_busy' : status === 'error' ? 'error' : 'hourglass_empty'}
          </span>
          <h1 className={styles.centerTitle}>
            {status === 'notfound'
              ? 'Exam not found'
              : status === 'error'
              ? "Couldn't load this exam"
              : 'Loading…'}
          </h1>
          {status !== 'loading' && (
            <Link href="/exams" className={`${ui.btn} ${ui.secondary}`}>Back to exams</Link>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ReflectionView examId={examId} ctx={ctx} />
    </AppShell>
  );
}

function ReflectionView({ examId, ctx }: { examId: string; ctx: ResultContext }) {
  const router = useRouter();
  // existing is guaranteed non-null by the parent guard above.
  const existing = ctx.existing!;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pct = Math.round(existing.gradeNeutral);
  const failed = existing.gradeNeutral < ctx.grading.passNeutral;
  const belowTarget =
    !failed && ctx.targetNeutral != null && existing.gradeNeutral < ctx.targetNeutral;

  const mageTake = buildReflectionTake([...selected]);

  function toggleReason(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });
  }

  async function handleContinue() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/user/exams/${examId}/result`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reflection', reasons: [...selected] }),
      });
      const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!res.ok || !json?.success) {
        setErr(json?.error ?? 'Could not save. Please try again.');
        setBusy(false);
        return;
      }
      router.push(`/exam/${examId}/report`);
    } catch {
      setErr('Network error — please try again.');
      setBusy(false);
    }
  }

  const subject = ctx.exam.subject;
  const backLabel = subject ? `${subject} dashboard` : 'Exam dashboard';
  const formattedDate = formatDate(ctx.exam.examDate);
  const subtitleMeta = subject ? `${subject} · ${formattedDate}` : formattedDate;

  return (
    <div className={styles.page}>
      {/* Back link */}
      <Link href={`/exam/${examId}`} className={styles.back}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>chevron_left</span>
        {backLabel}
      </Link>

      {/* Page header */}
      <div className={styles.head}>
        <h1 className={styles.title}>Exam Reflection</h1>
        <p className={styles.subtitle}>{subtitleMeta}</p>
      </div>

      {/* Centered content column */}
      <div className={styles.col}>

        {/* Mascot hero */}
        <div className={styles.hero}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot/holding-wand-v2.png" alt="" className={styles.mascot} />
          <h2 className={styles.heroHeading}>Let&rsquo;s learn from this.</h2>
          <p className={styles.heroSub}>{ctx.exam.title} didn&rsquo;t go as planned — that&rsquo;s okay.</p>
        </div>

        {/* Status pill */}
        {failed ? (
          <span className={`${styles.statusPill} ${styles.statusPillRed}`}>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16 }}>warning</span>
            {pct}% · Below passing threshold ({passDisplayFor(ctx.grading)})
          </span>
        ) : belowTarget && ctx.targetDisplay ? (
          <span className={`${styles.statusPill} ${styles.statusPillAmber}`}>
            {pct}% · Below your target of {ctx.targetDisplay}
          </span>
        ) : null}

        {/* "What went wrong?" card */}
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3 className={styles.cardTitle}>What went wrong?</h3>
            <span className={styles.cardHint}>Select all that apply</span>
          </div>

          <div className={styles.reasonList} role="group" aria-label="Reflection reasons">
            {REFLECTION_REASONS.map((reason) => {
              const on = selected.has(reason.key);
              return (
                <div
                  key={reason.key}
                  className={styles.reasonRow}
                  role="checkbox"
                  aria-checked={on}
                  tabIndex={0}
                  onClick={() => toggleReason(reason.key)}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      toggleReason(reason.key);
                    }
                  }}
                >
                  {/* Custom checkbox */}
                  <span className={`${styles.checkbox} ${on ? styles.checkboxOn : ''}`} aria-hidden>
                    {on && <span className="material-symbols-outlined" aria-hidden>check</span>}
                  </span>

                  <span className={styles.reasonLabel}>{reason.label}</span>

                  {/* Tag only once a fixable reason is selected — Mage will turn
                      it into targeted practice (matches the Figma's checked rows). */}
                  {reason.fixable && on && (
                    <span className={styles.practiceTag}>
                      Needs practice
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Mage's take card */}
        <div className={styles.mageCard}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot/holding-wand-v2.png" alt="" className={styles.mageMascot} />
          <div className={styles.mageBody}>
            <span className={styles.mageEyebrow}>Mage&rsquo;s Take</span>
            <p className={styles.mageText}>{mageTake}</p>
          </div>
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          {err && <p role="alert" className={styles.err}>{err}</p>}
          <button
            type="button"
            className={`${ui.btn} ${ui.primary} ${styles.continueBtn}`}
            onClick={handleContinue}
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Continue'}
          </button>
          <Link href={`/exam/${examId}/report`} className={styles.skip}>
            Skip reflection
          </Link>
        </div>

      </div>
    </div>
  );
}
