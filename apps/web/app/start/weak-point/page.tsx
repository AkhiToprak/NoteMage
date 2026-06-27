/* eslint-disable @next/next/no-img-element */
'use client';

import { useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import styles from '@/components/onboarding/SampleStep.module.css';
import {
  SAMPLE_QUESTIONS,
  subscribeSampleRun,
  getSampleRunSnapshot,
  getSampleRunServerSnapshot,
} from '@/lib/sample-run';
import { subscribePreview, getPreviewSnapshot, getPreviewServerSnapshot } from '@/lib/onboarding-preview-store';

/* Figma "W11 Weak point" (node 14:1000) — end-of-run summary. Stats + the
   detected weak point reflect the actual run (see sample-run.ts): a weak point
   only surfaces when the user genuinely missed the diagnostic question (the LAST
   one), ace it and they get the clean "no weak points yet" variant. The question
   set is the preview's generated questions when one exists, else the sample. Both
   CTAs lead to sign-up; a direct visit with no run falls back to the scripted demo. */

const SparkGold = (
  <svg viewBox="0 0 29 29" fill="none" aria-hidden focusable="false">
    <path d="M10.6066 0L17.1889 9.81239L28.9778 10.6066L19.1654 17.1889L18.3712 28.9778L11.7889 19.1655L0 18.3712L9.81237 11.7889L10.6066 0Z" fill="#FFC83D" />
  </svg>
);
const SparkPurple = (
  <svg viewBox="0 0 18 18" fill="none" aria-hidden focusable="false">
    <path d="M9 0L11.291 6.70897L18 9L11.291 11.291L9 18L6.70897 11.291L0 9L6.70897 6.70897L9 0Z" fill="#7C5CFF" />
  </svg>
);

export default function WeakPointPage() {
  const router = useRouter();
  const run = useSyncExternalStore(subscribeSampleRun, getSampleRunSnapshot, getSampleRunServerSnapshot);
  const preview = useSyncExternalStore(subscribePreview, getPreviewSnapshot, getPreviewServerSnapshot);

  const questions = preview?.questions ?? SAMPLE_QUESTIONS;
  const weakQuestion = questions.find((q) => q.weakPoint);
  const answers = run.answers;
  const hasRun = answers.length > 0;
  const answered = hasRun ? answers.length : questions.length;
  const correct = hasRun ? answers.filter((a) => a.correct).length : Math.max(0, questions.length - 1);
  const missedWeak = answers.some((a) => a.id === weakQuestion?.id && !a.correct);
  // No run (direct visit) → fall back to the scripted weak-point demo.
  const showWeak = hasRun ? missedWeak : true;
  const weakCount = showWeak ? 1 : 0;
  const weak = weakQuestion?.weakPoint;

  const stats = [
    { n: String(answered), l: 'Answered', color: '#18202f' },
    { n: String(correct), l: 'Correct', color: '#2fa968' },
    { n: String(weakCount), l: weakCount === 1 ? 'Weak point' : 'Weak points', color: weakCount > 0 ? '#f2a33c' : '#2fa968' },
    { n: '1', l: 'Source', color: '#4326b8' },
  ];

  return (
    <div className={styles.root}>
      <span className={styles.logo} aria-hidden>
        <img src="/landing/notemage-wordmark.png" alt="NoteMage" width={80} height={30} />
      </span>

      <div className={styles.wpWrap}>
        <div className={styles.wpIllo}>
          <span className={styles.wpBlob} aria-hidden />
          <img className={styles.wpMascot} src="/landing/mage-plain.png" alt="" aria-hidden />
          <span className={`${styles.wpSpk} ${styles.wpSpkA}`} aria-hidden>{SparkGold}</span>
          <span className={`${styles.wpSpk} ${styles.wpSpkB}`} aria-hidden>{SparkPurple}</span>
          <span className={`${styles.wpSpk} ${styles.wpSpkC}`} aria-hidden>{SparkGold}</span>
          <span className={`${styles.wpSpk} ${styles.wpSpkD}`} aria-hidden>{SparkPurple}</span>
        </div>

        <h1 className={styles.wpTitle}>{showWeak ? 'First weak point found.' : 'Strong start.'}</h1>
        <p className={styles.wpSub}>
          {showWeak
            ? `You're doing well. ${weak?.title ?? 'One topic'} could use a little more practice, so I added it to your review queue.`
            : "You handled every question. No weak points yet — keep going and I'll flag the first one the moment it shows up."}
        </p>

        <div className={styles.resultCard}>
          <p className={styles.resultTitle}>Session complete</p>
          <div className={styles.resultStats}>
            {stats.map((s) => (
              <div key={s.l} className={styles.rStat}>
                <div className={styles.rStatNum} style={{ color: s.color }}>{s.n}</div>
                <div className={styles.rStatLabel}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {showWeak ? (
          <div className={styles.weakCard}>
            <span className={styles.needsPill}>Needs practice</span>
            <p className={styles.weakTitle}>{weak?.title ?? 'Table relationships'}</p>
            <p className={styles.weakDesc}>{weak?.desc ?? 'You understood tables, but struggled with how records connect across tables.'}</p>
            <div className={styles.weakDivider} />
            <div className={styles.weakReview}>
              <span className={styles.weakReviewIcon} aria-hidden>↺</span>
              <span className={styles.weakReviewText}>Added to your review queue</span>
              <span className={styles.weakReviewSub}>· You&apos;ll see this again after 2 sections.</span>
            </div>
          </div>
        ) : (
          <div className={styles.okCard}>
            <span className={styles.okPill}>On track</span>
            <p className={styles.weakTitle}>No weak points yet</p>
            <p className={styles.weakDesc}>You answered every question correctly, so there&apos;s nothing to review right now.</p>
            <div className={styles.okDivider} />
            <div className={styles.weakReview}>
              <span className={styles.okReviewIcon} aria-hidden>✓</span>
              <span className={styles.okReviewText}>Review queue is empty</span>
              <span className={styles.weakReviewSub}>· I&apos;ll add topics here the moment you slip.</span>
            </div>
          </div>
        )}

        <div className={styles.fbActions}>
          <button type="button" className={styles.primaryBtn} onClick={() => router.push('/start/signup')}>
            Continue path
          </button>
          <button type="button" className={styles.ghostBtn} onClick={() => router.push('/start/signup')}>
            Save my progress
          </button>
        </div>
      </div>
    </div>
  );
}
