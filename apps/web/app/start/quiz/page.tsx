/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import styles from '@/components/onboarding/SampleStep.module.css';
import { SAMPLE_QUESTIONS, recordSampleAnswer } from '@/lib/sample-run';
import { subscribePreview, getPreviewSnapshot, getPreviewServerSnapshot } from '@/lib/onboarding-preview-store';

/* Figma "W09 Quiz" (node 14:903) — the warm-up question. Real-generation P3: the
   question set is the preview's 2 generated questions when one exists, else the
   static sample. The ?q= index picks which one. Pick an option, "Check answer"
   records it (by question id) and routes to the feedback screen (W10/W10b). */

const noopSubscribe = () => () => {};

export default function QuizPage() {
  const router = useRouter();
  const preview = useSyncExternalStore(subscribePreview, getPreviewSnapshot, getPreviewServerSnapshot);
  const questions = preview?.questions ?? SAMPLE_QUESTIONS;
  const count = questions.length;
  const search = useSyncExternalStore(noopSubscribe, () => window.location.search, () => '');
  const raw = Number(new URLSearchParams(search).get('q'));
  const idx = Number.isInteger(raw) && raw >= 0 && raw < count ? raw : 0;
  const q = questions[idx];

  const [sel, setSel] = useState<string | null>(null);

  const onCheck = () => {
    if (!sel) return;
    const correct = sel === q.correct;
    recordSampleAnswer(q.id, correct);
    router.push(`/start/feedback?q=${idx}&r=${correct ? 'correct' : 'wrong'}`);
  };

  return (
    <div className={styles.root}>
      <span className={styles.logo} aria-hidden>
        <img src="/landing/notemage-wordmark.png" alt="NoteMage" width={80} height={30} />
      </span>
      <button type="button" className={styles.back} onClick={() => router.back()} aria-label="Back">
        <span className="material-symbols-outlined" aria-hidden>arrow_back</span>
      </button>

      <div className={styles.wrap}>
        <div className={styles.quizTop}>
          <p className={styles.quizMeta}>Question {idx + 1} of {count}</p>
          <div className={styles.segs}>
            {questions.map((s, i) => (
              <span key={s.id} className={`${styles.seg} ${i <= idx ? styles.segOn : ''}`} />
            ))}
          </div>
          <img className={styles.quizMascot} src="/landing/mage-plain.png" alt="" aria-hidden />
        </div>

        <h1 className={styles.question}>{q.prompt}</h1>
        <span className={styles.cite}>
          <span className="material-symbols-outlined" aria-hidden>description</span>
          Based on: {q.source}
        </span>

        <div className={styles.answers}>
          {q.options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`${styles.answer} ${sel === o.id ? styles.answerActive : ''}`}
              aria-pressed={sel === o.id}
              onClick={() => setSel(o.id)}
            >
              <span className={styles.ansLetter}>{o.id}</span>
              <span className={styles.ansText}>{o.text}</span>
              <span className={styles.ansRadio} aria-hidden />
            </button>
          ))}
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.primaryBtn} onClick={onCheck} disabled={!sel}>
            Check answer
          </button>
        </div>
      </div>
    </div>
  );
}
