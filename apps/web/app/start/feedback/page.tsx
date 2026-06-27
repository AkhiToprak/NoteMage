/* eslint-disable @next/next/no-img-element */
'use client';

import { useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import styles from '@/components/onboarding/SampleStep.module.css';
import { SAMPLE_QUESTIONS } from '@/lib/sample-run';
import { subscribePreview, getPreviewSnapshot, getPreviewServerSnapshot } from '@/lib/onboarding-preview-store';

/* Figma "W10 Feedback" (14:946, correct) + "W10b Feedback" (14:971, incorrect).
   One centred route; ?q= picks the question, ?r= the variant. Correct advances to
   the next question (or the weak-point summary after the last one); incorrect can
   try again (back to the same question) or reveal & move on. Reads the same
   question set as the quiz — the preview's generated questions, else the sample. */

const noopSubscribe = () => () => {};

export default function FeedbackPage() {
  const router = useRouter();
  const preview = useSyncExternalStore(subscribePreview, getPreviewSnapshot, getPreviewServerSnapshot);
  const questions = preview?.questions ?? SAMPLE_QUESTIONS;
  const count = questions.length;
  const search = useSyncExternalStore(noopSubscribe, () => window.location.search, () => '');
  const params = new URLSearchParams(search);
  const rawIdx = Number(params.get('q'));
  const idx = Number.isInteger(rawIdx) && rawIdx >= 0 && rawIdx < count ? rawIdx : 0;
  const isCorrect = params.get('r') !== 'wrong';
  const q = questions[idx];

  const hasNext = idx + 1 < count;
  const advance = () => router.push(hasNext ? `/start/quiz?q=${idx + 1}` : '/start/weak-point');

  return (
    <div className={styles.root}>
      <span className={styles.logo} aria-hidden>
        <img src="/landing/notemage-wordmark.png" alt="NoteMage" width={80} height={30} />
      </span>

      <div className={styles.fbWrap}>
        <span className={`${styles.fbIcon} ${isCorrect ? styles.fbIconOk : styles.fbIconNo}`} aria-hidden>
          <span className="material-symbols-outlined">{isCorrect ? 'check' : 'close'}</span>
        </span>
        <h1 className={`${styles.fbTitle} ${isCorrect ? styles.fbTitleOk : styles.fbTitleNo}`}>
          {isCorrect ? 'Correct.' : 'Not quite yet.'}
        </h1>
        {isCorrect && <span className={styles.fbPill}>{q.topic} +1</span>}

        <div className={styles.fbBubbleRow}>
          <span className={styles.avatar}><img src="/landing/mage-plain.png" alt="" aria-hidden /></span>
          <span className={styles.bubble}>{isCorrect ? q.okBubble : q.noBubble}</span>
        </div>

        <div className={styles.why}>
          {!isCorrect && <span className={styles.whyBar} aria-hidden />}
          <p className={`${styles.whyLabel} ${isCorrect ? styles.whyLabelOk : styles.whyLabelNo}`}>
            {isCorrect ? "Here's why" : "Here's the difference"}
          </p>
          <p className={styles.whyText}>{isCorrect ? q.okWhy : q.noWhy}</p>
          <span className={styles.cite}>
            <span className="material-symbols-outlined" aria-hidden>description</span>
            Source: {q.source}
          </span>
        </div>

        {!isCorrect && (
          <div className={styles.hintBar}>💡&nbsp;&nbsp;Hint: {q.hint}</div>
        )}

        {isCorrect ? (
          <div className={styles.footer} style={{ width: '100%', maxWidth: 420 }}>
            <button type="button" className={styles.primaryBtn} onClick={advance}>
              {hasNext ? 'Next question' : 'See results'}
            </button>
          </div>
        ) : (
          <div className={styles.fbActions}>
            <button type="button" className={styles.primaryBtn} onClick={() => router.push(`/start/quiz?q=${idx}`)}>
              Try again
            </button>
            <button type="button" className={styles.ghostBtn} onClick={advance}>
              {hasNext ? 'Reveal & continue' : 'Reveal answer'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
