/* eslint-disable @next/next/no-img-element */
'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  subscribePreview,
  getPreviewSnapshot,
  getPreviewServerSnapshot,
} from '@/lib/onboarding-preview-store';
import styles from '@/components/onboarding/SampleStep.module.css';

/* Figma "W12 Signup" (node 14:1038) — the onboarding's final step: save the path
   by creating an account. The account/OAuth choice now lives in the redesigned
   /auth/register flow, so this screen's single action hands off to it. */

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

const CHIPS = [
  { label: '6 topics', bg: '#ede9ff', color: '#4326b8' },
  { label: '3 done', bg: '#e2f5eb', color: '#0f6b3d' },
  { label: '1 weak point', bg: '#fcefd9', color: '#8a5a12' },
];

export default function SignupPage() {
  const preview = useSyncExternalStore(subscribePreview, getPreviewSnapshot, getPreviewServerSnapshot);

  // Show the real generated path (title + honest counts) when onboarding produced
  // one; fall back to the static sample for the no-material branch. The numbers are
  // derived from the preview structure — there's no fabricated "done"/weak-point
  // progress to invent (none is persisted pre-signup).
  const slots = preview ? preview.structure.phases.flatMap((p) => p.slots) : [];
  const topics = slots.filter((s) => s.kind === 'learning').length;
  const steps = slots.length;
  const questions = preview?.questions.length ?? 0;
  const cardTitle = preview?.title ?? 'SQL Databases';
  const chips = preview
    ? [
        { label: `${topics} ${topics === 1 ? 'topic' : 'topics'}`, bg: '#ede9ff', color: '#4326b8' },
        { label: `${questions} ${questions === 1 ? 'question' : 'questions'}`, bg: '#e2f5eb', color: '#0f6b3d' },
        { label: `${steps} ${steps === 1 ? 'step' : 'steps'}`, bg: '#fcefd9', color: '#8a5a12' },
      ]
    : CHIPS;

  return (
    <div className={styles.root}>
      <span className={styles.logo} aria-hidden>
        <img src="/landing/notemage-wordmark.png" alt="NoteMage" width={80} height={30} />
      </span>

      <div className={styles.suWrap}>
        <div className={styles.suIllo}>
          <span className={styles.suBlob} aria-hidden />
          <img className={styles.suMascot} src="/landing/mage-grad.png" alt="" aria-hidden />
          <span className={`${styles.suSpk} ${styles.suSpkA}`} aria-hidden>{SparkGold}</span>
          <span className={`${styles.suSpk} ${styles.suSpkB}`} aria-hidden>{SparkPurple}</span>
        </div>

        <h1 className={styles.suTitle}>Save your path and keep studying.</h1>
        <p className={styles.suSub}>Save your generated path, answers, weak points, and progress.</p>

        <div className={styles.previewCard}>
          <div className={styles.pvHead}>
            <span className={styles.pvTile}><span className="material-symbols-outlined" aria-hidden>database</span></span>
            <div>
              <div className={styles.pvTitle}>{cardTitle}</div>
              <div className={styles.pvSub}>Your progress so far</div>
            </div>
          </div>
          <div className={styles.pvDivider} />
          <div className={styles.pvChips}>
            {chips.map((c) => (
              <span key={c.label} className={styles.pvChip} style={{ background: c.bg, color: c.color }}>{c.label}</span>
            ))}
          </div>
        </div>

        <div className={styles.authList}>
          <Link
            href="/auth/register"
            className={styles.authBtn}
            style={{
              background: '#7c5cff',
              color: '#fff',
              border: 0,
              boxShadow: '0 12px 28px rgba(124, 92, 255, 0.3)',
            }}
          >
            Continue to sign up
            <span className="material-symbols-outlined" aria-hidden style={{ color: '#fff' }}>arrow_forward</span>
          </Link>
        </div>

        <p className={styles.legal} style={{ marginTop: 16 }}>
          Already have an account? <Link href="/auth/login">Log in</Link>
        </p>
        <p className={styles.legal}>
          By continuing, you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
