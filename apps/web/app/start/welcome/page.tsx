/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isInsideNativeShell } from '@/lib/native-bridge';
import styles from './Welcome.module.css';

/* Figma "W01 Welcome" (node 14:410) — no-source onboarding entry. "Get started" /
   "Create my first path" → the in-app source step (W02). */

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

function Paper({ className }: { className: string }) {
  return (
    <div className={`${styles.paper} ${className}`} aria-hidden>
      <span className={styles.paperHead} />
      <span className={`${styles.paperLine} ${styles.pl1}`} />
      <span className={`${styles.paperLine} ${styles.pl2}`} />
      <span className={`${styles.paperLine} ${styles.pl3}`} />
      <span className={`${styles.paperLine} ${styles.pl4}`} />
    </div>
  );
}

export default function WelcomePage() {
  const router = useRouter();

  useEffect(() => {
    if (isInsideNativeShell()) router.replace('/auth/login');
  }, [router]);

  return (
    <div className={styles.root}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.logo} aria-label="NoteMage — home">
          <img src="/landing/notemage-wordmark.png" alt="NoteMage" width={80} height={30} />
        </Link>
        <div className={styles.topActions}>
          <Link href="/auth/login" className={styles.login}>Log in</Link>
          <Link href="/start/source" className={styles.getStarted}>Get started</Link>
        </div>
      </header>

      <div className={styles.hero}>
        <div className={styles.heroText}>
          <h1 className={styles.h1}>Turn your study material into a learning path.</h1>
          <p className={styles.sub}>
            Upload your PDFs, slides, notes, or images. Mage turns them into short study steps, quizzes you,
            explains mistakes, and shows what to review next.
          </p>
          <div className={styles.ctaRow}>
            <Link href="/start/source" className={styles.cta}>Create my first path</Link>
            <button type="button" className={styles.demo}>
              <span className={styles.demoIcon} aria-hidden>▶</span>
              See a 2-minute demo
            </button>
          </div>
        </div>

        <div className={styles.illustration}>
          <div className={styles.illoInner}>
            <span className={styles.blob1} aria-hidden />
            <span className={styles.blob2} aria-hidden />
            <Paper className={styles.paperA} />
            <Paper className={styles.paperB} />
            <Paper className={styles.paperC} />
            <img className={styles.illoMascot} src="/landing/mage-plain.png" alt="" aria-hidden />
            <span className={`${styles.illoSpk} ${styles.spkA}`} aria-hidden>{SparkGold}</span>
            <span className={`${styles.illoSpk} ${styles.spkB}`} aria-hidden>{SparkPurple}</span>
            <span className={`${styles.illoSpk} ${styles.spkC}`} aria-hidden>{SparkGold}</span>
            <span className={`${styles.illoSpk} ${styles.spkD}`} aria-hidden>{SparkPurple}</span>
            <span className={`${styles.illoSpk} ${styles.spkE}`} aria-hidden>{SparkGold}</span>
          </div>
        </div>
      </div>

      <div className={styles.mobileCta}>
        <Link href="/start/source" className={styles.cta}>Create my first path</Link>
      </div>
    </div>
  );
}
