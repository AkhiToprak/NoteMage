'use client';

/* Exam Mode Phase 5 — Exam Result Entry ("How did it go?").
 * Figma X2 Exam Result Entry (89:21582 web / 89:21775 mobile).
 *
 * A grade stepper rendered in the learner's OWN grading system (Swiss 1–6 0.1
 * steps in the Figma; any of the 53-system catalog at runtime), outcome +
 * difficulty pills, an optional note → POST /api/user/exams/:id/result. On submit
 * we branch via routeAfterResult: beat the target → celebration, below target /
 * failed → reflection, pending → straight to the report. Cream AppShell; the
 * grading math reuses the client-safe grading-systems lib directly. */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/app/AppShell';
import ui from '@/components/app/ui.module.css';
import styles from './ResultEntry.module.css';
import { useRegisterMageContext } from '@/components/mage';
import {
  getGradingSystem,
  toNeutral,
  type GradingSystem,
} from '@/lib/grading-systems';
import {
  DIFFICULTY_OPTIONS,
  suggestOutcome,
  routeAfterResult,
  type ExamOutcome,
  type DifficultyFelt,
} from '@/lib/exam-result-core';

interface ResultContext {
  exam: { id: string; title: string; subject: string | null; examDate: string };
  grading: { id: string; label: string; kind: 'numeric' | 'letter'; passNeutral: number; passMark: number | string; unit: string; decimals: number };
  targetNeutral: number | null;
  targetDisplay: string | null;
  existing: {
    gradeNeutral: number;
    gradeValue: number | string;
    outcome: ExamOutcome;
    difficultyFelt: DifficultyFelt | null;
    notes: string | null;
  } | null;
}

const OUTCOMES: { key: ExamOutcome; label: string; icon: string }[] = [
  { key: 'passed', label: 'Passed', icon: 'check' },
  { key: 'failed', label: 'Failed', icon: 'close' },
  { key: 'pending', label: 'Pending', icon: 'schedule' },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

function stepFor(sys: GradingSystem): number {
  const dec = sys.decimals ?? 0;
  if (dec === 0) return 1;
  if (dec >= 2) return 0.25;
  return 0.1;
}

function passDisplayFor(sys: GradingSystem): string {
  if (sys.kind === 'numeric') return `${sys.passMark}${sys.unit ?? ''}`;
  return String(sys.passMark);
}

export default function ExamResultEntryPage() {
  const params = useParams();
  const examId = Array.isArray(params?.id) ? params.id[0] : (params?.id ?? '');
  const [ctx, setCtx] = useState<ResultContext | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');

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
        setCtx(body.data as ResultContext);
        setStatus('ready');
      })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [examId]);

  if (status !== 'ready' || !ctx) {
    return (
      <AppShell>
        <div className={styles.center}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 38, color: 'var(--muted)' }}>
            {status === 'notfound' ? 'event_busy' : status === 'error' ? 'error' : 'hourglass_empty'}
          </span>
          <h1 className={styles.centerTitle}>
            {status === 'notfound' ? 'Exam not found' : status === 'error' ? "Couldn't load this exam" : 'Loading…'}
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
      <ResultEntry examId={examId} ctx={ctx} />
    </AppShell>
  );
}

function ResultEntry({ examId, ctx }: { examId: string; ctx: ResultContext }) {
  const router = useRouter();
  const sys = useMemo(() => getGradingSystem(ctx.grading.id) ?? null, [ctx.grading.id]);

  const step = sys && sys.kind === 'numeric' ? stepFor(sys) : 1;
  const decimals = sys?.decimals ?? (sys?.kind === 'numeric' ? 1 : 0);
  const min = sys?.scaleMin ?? 0;
  const max = sys?.scaleMax ?? 100;

  // Initial numeric value: existing → target → pass mark → midpoint.
  const initialNumeric =
    typeof ctx.existing?.gradeValue === 'number'
      ? ctx.existing.gradeValue
      : ctx.targetNeutral != null && sys
        ? Number(fromNeutralNumeric(ctx.targetNeutral, sys))
        : typeof sys?.passMark === 'number'
          ? sys.passMark
          : (min + max) / 2;

  const initialLetter =
    typeof ctx.existing?.gradeValue === 'string' ? ctx.existing.gradeValue : sys?.bands?.[Math.floor((sys.bands.length - 1) / 2)]?.label ?? '';

  const [numeric, setNumeric] = useState<number>(round(initialNumeric, decimals));
  const [letter, setLetter] = useState<string>(initialLetter);
  const [outcome, setOutcome] = useState<ExamOutcome>(ctx.existing?.outcome ?? 'pending');
  const [outcomeTouched, setOutcomeTouched] = useState<boolean>(!!ctx.existing);
  const [difficulty, setDifficulty] = useState<DifficultyFelt | null>(ctx.existing?.difficultyFelt ?? null);
  const [notes, setNotes] = useState<string>(ctx.existing?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const gradeValue: number | string = sys?.kind === 'letter' ? letter : numeric;
  const neutral = sys ? toNeutral(gradeValue, sys) : 0;

  // Auto-suggest the outcome from the grade until the learner overrides it.
  useEffect(() => {
    if (outcomeTouched) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOutcome(suggestOutcome(neutral, ctx.grading.passNeutral));
  }, [neutral, ctx.grading.passNeutral, outcomeTouched]);

  const banner = useMemo(() => {
    if (ctx.targetNeutral != null && neutral >= ctx.targetNeutral) {
      return { tone: 'good' as const, icon: 'check_circle', text: `Above your target of ${ctx.targetDisplay} — great work!` };
    }
    if (neutral >= ctx.grading.passNeutral) {
      return ctx.targetDisplay
        ? { tone: 'ok' as const, icon: 'thumb_up', text: `A pass — just under your ${ctx.targetDisplay} target.` }
        : { tone: 'good' as const, icon: 'check_circle', text: 'A pass — solid work.' };
    }
    return { tone: 'bad' as const, icon: 'warning', text: `Below the passing mark (${sys ? passDisplayFor(sys) : ''}).` };
  }, [neutral, ctx.targetNeutral, ctx.targetDisplay, ctx.grading.passNeutral, sys]);

  const dec = (d: number) => setNumeric((v) => round(Math.max(min, v - d), decimals));
  const inc = (d: number) => setNumeric((v) => round(Math.min(max, v + d), decimals));

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/user/exams/${examId}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gradeValue, outcome, difficultyFelt: difficulty, notes }),
      });
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; data?: { gradeNeutral: number; outcome: ExamOutcome; targetNeutral: number | null }; error?: string }
        | null;
      if (!res.ok || !json?.success || !json.data) {
        setErr(json?.error ?? 'Could not save your result. Try again.');
        setBusy(false);
        return;
      }
      const route = routeAfterResult({
        outcome: json.data.outcome,
        gradeNeutral: json.data.gradeNeutral,
        targetNeutral: json.data.targetNeutral,
      });
      router.push(`/exam/${examId}/${route}`);
    } catch {
      setErr('Network error — please try again.');
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <Link href={`/exam/${examId}`} className={styles.back}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>chevron_left</span>
        {ctx.exam.subject ? `${ctx.exam.subject} dashboard` : 'Exam dashboard'}
      </Link>
      <div className={styles.head}>
        <h1 className={styles.title}>How did it go?</h1>
        <p className={styles.subtitle}>Enter your {ctx.exam.title} result. We’ll update your readiness and study plan.</p>
      </div>

      <div className={styles.layout}>
        <section className={styles.card}>
          {/* exam identity */}
          <div className={styles.identity}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mascot/holding-wand-v2.png" alt="" className={styles.identityArt} />
            <div style={{ minWidth: 0 }}>
              <span className={styles.eyebrow}>Your result</span>
              <h2 className={styles.examTitle}>{ctx.exam.title}</h2>
              <p className={styles.examMeta}>{formatDate(ctx.exam.examDate)}</p>
            </div>
          </div>

          <div className={styles.divider} />

          {/* grade */}
          <div className={styles.fieldHead}>
            <span className={styles.eyebrow}>Grade</span>
            {ctx.targetDisplay && (
              <span className={`${ui.pill} ${ui.pillAmber}`}>
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 14 }}>target</span>
                Target {ctx.targetDisplay}
              </span>
            )}
          </div>

          {sys?.kind === 'letter' ? (
            <div className={styles.bandRow} role="radiogroup" aria-label="Grade">
              {(sys.bands ?? []).map((b) => (
                <button
                  key={b.label}
                  type="button"
                  role="radio"
                  aria-checked={letter === b.label}
                  className={`${styles.bandPill} ${letter === b.label ? styles.bandPillOn : ''}`}
                  onClick={() => setLetter(b.label)}
                >
                  {b.label}
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.stepperWrap}>
              <button type="button" className={styles.stepBtn} onClick={() => dec(step)} aria-label="Lower grade" disabled={numeric <= min}>
                <span className="material-symbols-outlined" aria-hidden>remove</span>
              </button>
              <div className={styles.gradeBox}>
                <span className={styles.gradeValue}>{numeric.toFixed(decimals)}</span>
                <span className={styles.gradeOutOf}>out of {max}{sys?.unit ?? ''}</span>
              </div>
              <button type="button" className={styles.stepBtn} onClick={() => inc(step)} aria-label="Raise grade" disabled={numeric >= max}>
                <span className="material-symbols-outlined" aria-hidden>add</span>
              </button>
            </div>
          )}
          <p className={styles.gradeHint}>
            {sys?.kind === 'numeric' ? `${step} steps · ` : ''}{ctx.grading.label}
          </p>

          <div className={`${styles.banner} ${banner.tone === 'good' ? styles.bannerGood : banner.tone === 'ok' ? styles.bannerOk : styles.bannerBad}`}>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>{banner.icon}</span>
            <span>{banner.text}</span>
            {banner.tone === 'good' && <span className={styles.bannerStar}><span className="material-symbols-outlined filled" aria-hidden style={{ fontSize: 15 }}>star</span></span>}
          </div>

          <div className={styles.divider} />

          {/* outcome */}
          <span className={styles.eyebrow}>Outcome</span>
          <div className={styles.pillRow}>
            {OUTCOMES.map((o) => (
              <button
                key={o.key}
                type="button"
                className={`${styles.choice} ${outcome === o.key ? styles.choiceOn : ''}`}
                onClick={() => { setOutcome(o.key); setOutcomeTouched(true); }}
              >
                <span className={`${styles.choiceIcon} ${outcome === o.key ? styles.choiceIconOn : ''}`} aria-hidden>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{o.icon}</span>
                </span>
                {o.label}
              </button>
            ))}
          </div>

          <div className={styles.divider} />

          {/* difficulty */}
          <span className={styles.eyebrow}>How hard was it?</span>
          <div className={styles.pillRow}>
            {DIFFICULTY_OPTIONS.map((d) => (
              <button
                key={d.key}
                type="button"
                className={`${styles.choice} ${difficulty === d.key ? styles.choiceOn : ''}`}
                onClick={() => setDifficulty((cur) => (cur === d.key ? null : d.key))}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className={styles.divider} />

          {/* notes */}
          <div className={styles.fieldHead}>
            <span className={styles.eyebrow}>Notes</span>
            <span className={styles.optional}>optional</span>
          </div>
          <textarea
            className={styles.notes}
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
            placeholder="What would you do differently next time?"
            rows={3}
          />

          {err && <p role="alert" className={styles.err}>{err}</p>}

          <button type="button" className={`${ui.btn} ${ui.primary} ${styles.submit}`} onClick={submit} disabled={busy}>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 19 }}>check</span>
            {busy ? 'Saving…' : 'Submit result'}
          </button>
          <Link href={`/exam/${examId}`} className={styles.skip}>Skip for now</Link>
        </section>
      </div>
    </div>
  );
}

function round(v: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

/** Raw numeric display value for a neutral score (numeric systems only). */
function fromNeutralNumeric(neutral: number, sys: GradingSystem): number {
  const min = sys.scaleMin ?? 0;
  const max = sys.scaleMax ?? 100;
  const range = max - min;
  const raw = sys.bestIsHigh ? min + (neutral / 100) * range : max - (neutral / 100) * range;
  return round(raw, sys.decimals ?? 1);
}
