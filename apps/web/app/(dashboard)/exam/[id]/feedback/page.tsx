'use client';

/* Exam Mode Phase 5 — Submit Feedback ("Tag the topics that surprised you").
 * Figma: feedback.png (web) / m-feedback.png (mobile).
 *
 * A step-2-of-3 flow where the learner tags topics that caught them off guard
 * and optionally notes they have material covering those topics. Cream AppShell;
 * all tokens come from `.shell` in AppShell — no dark tokens, no gradients.
 *
 * Route: /exam/[id]/feedback
 * On success → /exam/[id]/report */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/app/AppShell';
import ui from '@/components/app/ui.module.css';
import styles from './Feedback.module.css';
import { useRegisterMageContext } from '@/components/mage';

const MAX_TOPICS = 24;
const MAX_TOPIC_LEN = 80;

interface ExamInfo {
  id: string;
  title: string;
  subject: string | null;
  examDate: string;
  notebookId: string | null;
}

interface FetchData {
  exam: ExamInfo;
  existing: Record<string, unknown> | null;
}

export default function ExamFeedbackPage() {
  const params = useParams();
  const examId = Array.isArray(params?.id) ? params.id[0] : (params?.id ?? '');
  const router = useRouter();

  const [data, setData] = useState<FetchData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');

  useRegisterMageContext({ type: 'exam', ids: { examId }, title: data?.exam.title ?? 'Exam' });

  useEffect(() => {
    if (!examId) return;
    let cancelled = false;
    fetch(`/api/user/exams/${examId}/result`)
      .then((res) => {
        if (res.status === 404) return { __nf: true };
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((body: { __nf?: boolean; success?: boolean; data?: FetchData }) => {
        if (cancelled) return;
        if (body?.__nf) { setStatus('notfound'); return; }
        const d = body.data;
        if (!d) { setStatus('error'); return; }
        // If no result recorded yet, redirect back to result entry
        if (d.existing == null) {
          router.replace(`/exam/${examId}/result`);
          return;
        }
        setData(d);
        setStatus('ready');
      })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [examId, router]);

  if (status !== 'ready' || !data) {
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
      <FeedbackForm examId={examId} exam={data.exam} />
    </AppShell>
  );
}

function FeedbackForm({ examId, exam }: { examId: string; exam: ExamInfo }) {
  const router = useRouter();

  // ── topics chip state ────────────────────────────────────────────────────
  const [topics, setTopics] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [showTextarea, setShowTextarea] = useState(false);
  const [note, setNote] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // ── upload-skip toggle (ON = skip upload) ────────────────────────────────
  const [skipUpload, setSkipUpload] = useState(true);

  // ── submit state ─────────────────────────────────────────────────────────
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addTopic = (raw: string) => {
    const trimmed = raw.trim().slice(0, MAX_TOPIC_LEN);
    if (!trimmed) return;
    setTopics((prev) => {
      if (prev.length >= MAX_TOPICS) return prev;
      if (prev.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return prev;
      return [...prev, trimmed];
    });
  };

  const removeTopic = (idx: number) => {
    setTopics((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = input.replace(/,/g, '').trim();
      if (val) { addTopic(val); setInput(''); }
    } else if (e.key === 'Backspace' && input === '' && topics.length > 0) {
      setTopics((prev) => prev.slice(0, -1));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.includes(',')) {
      const parts = val.split(',');
      parts.slice(0, -1).forEach((p) => { if (p.trim()) addTopic(p); });
      setInput(parts[parts.length - 1] ?? '');
    } else {
      setInput(val);
    }
  };

  const submit = async () => {
    if (busy || topics.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/user/exams/${examId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics, ...(note ? { note } : {}) }),
      });
      const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!res.ok || !json?.success) {
        setErr(json?.error ?? 'Could not save feedback. Try again.');
        setBusy(false);
        return;
      }
      router.push(`/exam/${examId}/report`);
    } catch {
      setErr('Network error — please try again.');
      setBusy(false);
    }
  };

  const subject = exam.subject ?? 'Exam';
  const studyPackHref = '/paths/new';

  return (
    <div className={styles.page}>
      {/* back link */}
      <Link href={`/exam/${examId}`} className={styles.back}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>chevron_left</span>
        {subject} dashboard
      </Link>

      {/* heading */}
      <div className={styles.head}>
        <h1 className={styles.title}>Submit Feedback</h1>
        <p className={styles.subtitle}>Help us improve — tell Mage which topics surprised you.</p>
      </div>

      {/* step indicator */}
      <div className={styles.stepRow}>
        <span className={styles.stepPill}>Step 2 of 3</span>
        <div className={styles.stepTrack} aria-hidden>
          <div className={styles.stepSeg} data-filled="true" />
          <div className={styles.stepSeg} data-filled="true" />
          <div className={styles.stepSeg} data-filled="false" />
        </div>
        <span className={styles.stepLabel}>Topics &amp; materials</span>
      </div>

      {/* amber warning pill */}
      <div className={styles.pillWrap}>
        <span className={`${ui.pill} ${ui.pillAmber}`}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 14 }}>warning</span>
          NoteMage missed topics
        </span>
      </div>

      {/* Mage chat bubble */}
      <div className={styles.bubble}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mascot/holding-wand-v2.png" alt="" className={styles.bubbleMascot} />
        <p className={styles.bubbleText}>
          Tag the topics that caught you off guard. Upload any notes you have — I&apos;ll fold them into your next session right away.
        </p>
      </div>

      {/* main card */}
      <div className={styles.layout}>
        <section className={styles.card}>
          {/* ── Section 1: Topics ── */}
          <div className={styles.sectionHead}>
            <span className={styles.sectionNum}>1</span>
            <h2 className={styles.sectionTitle}>Which topics appeared?</h2>
          </div>
          <p className={styles.sectionHelper}>
            Tag anything that surprised you — subjects, concepts, or specific questions.
          </p>

          {/* chip input area */}
          <div
            className={styles.chipArea}
            onClick={() => inputRef.current?.focus()}
          >
            {topics.map((topic, i) => (
              <span key={`${topic}-${i}`} className={styles.chip}>
                {topic}
                <button
                  type="button"
                  className={styles.chipX}
                  onClick={(e) => { e.stopPropagation(); removeTopic(i); }}
                  aria-label={`Remove topic ${topic}`}
                >
                  <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 14 }}>close</span>
                </button>
              </span>
            ))}
            {topics.length < MAX_TOPICS && (
              <button
                type="button"
                className={styles.addChip}
                onClick={(e) => { e.stopPropagation(); inputRef.current?.focus(); }}
                tabIndex={-1}
                aria-label="Add topic"
              >
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 15 }}>add</span>
                Add topic
              </button>
            )}
            <input
              ref={inputRef}
              className={styles.chipInput}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              placeholder={topics.length === 0 ? 'Type a topic name and press Enter…' : ''}
              aria-label="Topic name"
              maxLength={MAX_TOPIC_LEN + 10}
            />
          </div>

          {/* plain text toggle */}
          <button
            type="button"
            className={styles.plainTextBtn}
            onClick={() => setShowTextarea((v) => !v)}
          >
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 14 }}>
              {showTextarea ? 'expand_less' : 'expand_more'}
            </span>
            {showTextarea ? 'Hide plain text' : 'Add as plain text instead'}
          </button>

          {showTextarea && (
            <textarea
              className={styles.noteArea}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 2000))}
              placeholder="Describe the topics in your own words…"
              rows={3}
            />
          )}

          <div className={styles.divider} />

          {/* ── Section 2: Notes / material ── */}
          <div className={styles.sectionHead}>
            <span className={styles.sectionNum}>2</span>
            <h2 className={styles.sectionTitle}>Do you have notes covering these?</h2>
          </div>
          <p className={styles.sectionHelper}>
            Upload PDFs, slides, or text. Mage absorbs them to close your gaps before exam day.
          </p>

          {/* dropzone (visual only — real import is in study packs) */}
          <div className={`${styles.dropzone} ${skipUpload ? styles.dropzoneDimmed : ''}`} aria-disabled={skipUpload}>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 32, color: 'var(--muted)' }}>description</span>
            <p className={styles.dropzoneTitle}>Add material in your study pack</p>
            <p className={styles.dropzoneFormats}>PDF, PPTX, DOCX, TXT</p>
            <Link
              href={studyPackHref}
              className={`${ui.btn} ${ui.primary} ${styles.dropzoneBtn} ${skipUpload ? styles.dropzoneBtnDimmed : ''}`}
              tabIndex={skipUpload ? -1 : 0}
              aria-disabled={skipUpload}
            >
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 17 }}>open_in_new</span>
              Open {subject} to add material
            </Link>
          </div>

          {/* skip upload toggle */}
          <div className={styles.toggleRow}>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16, color: 'var(--muted)' }}>description</span>
            <span className={styles.toggleLabel}>Skip upload — just submit topic tags</span>
            <button
              type="button"
              role="switch"
              aria-checked={skipUpload}
              aria-label="Skip upload — just submit topic tags"
              className={`${styles.toggle} ${skipUpload ? styles.toggleOn : ''}`}
              onClick={() => setSkipUpload((v) => !v)}
            >
              <span className={styles.toggleThumb} />
            </button>
          </div>
        </section>
      </div>

      {/* footer */}
      <div className={styles.footer}>
        <Link href={`/exam/${examId}/report`} className={`${ui.btn} ${ui.secondary}`}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>chevron_left</span>
          Back
        </Link>
        <div className={styles.submitWrap}>
          <button
            type="button"
            className={`${ui.btn} ${ui.primary}`}
            onClick={submit}
            disabled={busy || topics.length === 0}
            aria-describedby={topics.length === 0 ? 'feedback-submit-hint' : undefined}
          >
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>check</span>
            {busy ? 'Submitting…' : 'Submit feedback'}
          </button>
          {topics.length === 0 && (
            <span id="feedback-submit-hint" className={styles.submitHint}>Add at least one topic</span>
          )}
        </div>
      </div>
      {err && <p role="alert" className={styles.err}>{err}</p>}
      <p className={styles.privacy}>Your feedback is private and only used to personalise your study plan.</p>
    </div>
  );
}
