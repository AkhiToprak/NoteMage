'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/app/AppShell';
import ui from '@/components/app/ui.module.css';
import s from './NewExam.module.css';
import {
  getGradingSystem,
  toNeutral,
  DEFAULT_GRADING_SYSTEM_ID,
  type GradingSystem,
} from '@/lib/grading-systems';

/* Standalone Create-exam flow (Exam Mode Phase 0). Today an exam is only
   reachable via the study-pack wizard; this is the dedicated entry. Collects
   title + date + target grade + format + study pack, creates the exam, then
   hands off to the existing scope editor (/exam/[id]?edit=scope) so the learner
   picks what it covers. Cream surface — inherits AppShell `.shell` tokens. */

interface Notebook {
  id: string;
  name: string;
  kind?: string;
}

const FORMAT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Not sure yet' },
  { value: 'written', label: 'Written' },
  { value: 'oral', label: 'Oral' },
  { value: 'practical', label: 'Practical' },
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'mixed', label: 'Mixed' },
];

const NEW_PACK = '__new__';

function MsIcon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <span className="material-symbols-outlined" style={{ fontSize: size, color: 'inherit' }} aria-hidden>
      {name}
    </span>
  );
}

/** Display step for a numeric grading system's <input type="number">. */
function numericStep(sys: GradingSystem): number {
  const decimals = sys.decimals ?? 1;
  return decimals <= 0 ? 1 : Number((10 ** -decimals).toFixed(decimals));
}

export default function NewExamPage() {
  const router = useRouter();

  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [gradingSystemId, setGradingSystemId] = useState<string>(DEFAULT_GRADING_SYSTEM_ID);
  const [loaded, setLoaded] = useState(false);

  const [title, setTitle] = useState('');
  const [examDate, setExamDate] = useState('');
  const [notebookId, setNotebookId] = useState<string>(NEW_PACK);
  const [grade, setGrade] = useState(''); // display value in the user's system
  const [format, setFormat] = useState('');

  const [errors, setErrors] = useState<{ title?: string; examDate?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const minDate = useMemo(() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return t.toISOString().split('T')[0];
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/material?folderId=all').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/user/grading-system').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([nbRes, gsRes]) => {
      if (cancelled) return;
      const nbs: Notebook[] = Array.isArray(nbRes?.data)
        ? (nbRes.data as Notebook[]).filter((n) => n.kind !== 'inbox')
        : [];
      setNotebooks(nbs);
      // Default to the most recent existing study pack if there is one.
      if (nbs.length > 0) setNotebookId(nbs[0].id);
      const gsId = gsRes?.data?.gradingSystem;
      if (typeof gsId === 'string' && getGradingSystem(gsId)) setGradingSystemId(gsId);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const sys = getGradingSystem(gradingSystemId) ?? getGradingSystem(DEFAULT_GRADING_SYSTEM_ID)!;

  /** Resolve the typed/selected grade to the 0–100 neutral scale, or null. */
  function resolveTargetNeutral(): number | null {
    if (!grade.trim()) return null;
    if (sys.kind === 'numeric') {
      const v = parseFloat(grade);
      if (Number.isNaN(v)) return null;
      return toNeutral(v, sys);
    }
    return toNeutral(grade, sys);
  }

  function validate(): boolean {
    const next: typeof errors = {};
    if (!title.trim()) next.title = 'Give your exam a title';
    if (!examDate) next.examDate = 'Pick a date';
    else if (examDate < minDate) next.examDate = 'The date must be in the future';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      // Resolve the home study pack (notebook) — create one on the fly if needed.
      let nbId = notebookId;
      if (nbId === NEW_PACK || !nbId) {
        const res = await fetch('/api/material', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: title.trim().slice(0, 100) }),
        });
        const json = await res.json().catch(() => null);
        if (!json?.success || !json.data?.id) {
          setServerError(json?.error || 'Could not create a study pack for this exam.');
          setSubmitting(false);
          return;
        }
        nbId = json.data.id as string;
      }

      const res = await fetch('/api/user/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          examDate: new Date(examDate + 'T00:00:00').toISOString(),
          notebookId: nbId,
          targetGradeNeutral: resolveTargetNeutral(),
          format: format || null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.success || !json.data?.id) {
        setServerError(json?.error || 'Could not create the exam. Please try again.');
        setSubmitting(false);
        return;
      }
      // Hand off to scope selection on the exam hub.
      router.push(`/exam/${json.data.id}?edit=scope`);
    } catch {
      setServerError('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <AppShell width="narrow">
      <header className={ui.header} style={{ marginBottom: 22 }}>
        <div>
          <Link
            href="/exams"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--accent)',
              textDecoration: 'none',
              marginBottom: 10,
            }}
          >
            <MsIcon name="arrow_back" size={17} />
            Exams
          </Link>
          <h1 className={ui.h1}>New exam</h1>
          <p className={ui.sub}>Set the date and target, then choose what it covers.</p>
        </div>
      </header>

      <form className={`${ui.card} ${s.form}`} onSubmit={handleSubmit} noValidate>
        {/* Title */}
        <div className={s.field}>
          <label className={s.label} htmlFor="exam-title">
            Exam title
          </label>
          <input
            id="exam-title"
            className={s.input}
            type="text"
            value={title}
            placeholder="e.g. Biology Final"
            aria-invalid={!!errors.title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (errors.title) setErrors((p) => ({ ...p, title: undefined }));
            }}
          />
          {errors.title && <span className={s.error}>{errors.title}</span>}
        </div>

        {/* Date */}
        <div className={s.field}>
          <label className={s.label} htmlFor="exam-date">
            Exam date
          </label>
          <input
            id="exam-date"
            className={s.input}
            type="date"
            value={examDate}
            min={minDate}
            aria-invalid={!!errors.examDate}
            onChange={(e) => {
              setExamDate(e.target.value);
              if (errors.examDate) setErrors((p) => ({ ...p, examDate: undefined }));
            }}
          />
          {errors.examDate && <span className={s.error}>{errors.examDate}</span>}
        </div>

        {/* Study pack */}
        <div className={s.field}>
          <label className={s.label} htmlFor="exam-pack">
            Study pack
          </label>
          <select
            id="exam-pack"
            className={s.select}
            value={notebookId}
            onChange={(e) => setNotebookId(e.target.value)}
          >
            {notebooks.map((nb) => (
              <option key={nb.id} value={nb.id}>
                {nb.name}
              </option>
            ))}
            <option value={NEW_PACK}>＋ New study pack for this exam</option>
          </select>
          <span className={s.hint}>Where this exam lives. You can scope exact paths &amp; quizzes next.</span>
        </div>

        <div className={s.divider} />

        {/* Target grade */}
        <div className={s.field}>
          <label className={s.label} htmlFor="exam-grade">
            Target grade <span style={{ color: 'var(--muted)', fontWeight: 500 }}>· optional</span>
          </label>
          {sys.kind === 'letter' ? (
            <select
              id="exam-grade"
              className={s.select}
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
            >
              <option value="">No target</option>
              {(sys.bands ?? []).map((b) => (
                <option key={b.label} value={b.label}>
                  {b.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="exam-grade"
              className={s.input}
              type="number"
              inputMode="decimal"
              value={grade}
              min={sys.scaleMin}
              max={sys.scaleMax}
              step={numericStep(sys)}
              placeholder={`${sys.scaleMin}–${sys.scaleMax}${sys.unit ?? ''}`}
              onChange={(e) => setGrade(e.target.value)}
            />
          )}
          <span className={s.hint}>
            {sys.flag} {sys.label} · pass {String(sys.passMark)}
            {sys.kind === 'numeric' ? sys.unit ?? '' : ''}
          </span>
        </div>

        {/* Format */}
        <div className={s.field}>
          <label className={s.label} htmlFor="exam-format">
            Format <span style={{ color: 'var(--muted)', fontWeight: 500 }}>· optional</span>
          </label>
          <select
            id="exam-format"
            className={s.select}
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            {FORMAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {serverError && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 14px',
              borderRadius: 'var(--rm)',
              background: 'var(--danger-soft)',
              color: 'var(--danger-ink)',
              fontSize: 13.5,
            }}
          >
            <MsIcon name="error" size={18} />
            {serverError}
          </div>
        )}

        <div className={s.footer}>
          <span className={s.nextNote}>
            <MsIcon name="arrow_forward" size={16} />
            Next: choose what this exam covers
          </span>
          <button
            type="submit"
            className={`${ui.btn} ${ui.primary} ${s.submit}`}
            disabled={submitting || !loaded}
          >
            {submitting ? (
              <>
                <MsIcon name="progress_activity" size={19} />
                Creating…
              </>
            ) : (
              <>
                <MsIcon name="add" size={19} />
                Create exam
              </>
            )}
          </button>
        </div>
      </form>
    </AppShell>
  );
}
