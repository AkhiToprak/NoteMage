/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import Link from 'next/link';
import MageNav from '@/components/landing/MageNav';
import MageFooter from '@/components/landing/MageFooter';
import styles from './About.module.css';

export const metadata: Metadata = {
  title: 'About — NoteMage',
  description:
    'NoteMage is built by a single dev fed up with clunky study apps, noisy ads, and paywalls — a no-ads, student-first study app with a UI that actually cares.',
};

const SPARK_GOLD = (
  <svg viewBox="0 0 29 29" fill="none" aria-hidden focusable="false">
    <path d="M10.6066 0L17.1889 9.81239L28.9778 10.6066L19.1654 17.1889L18.3712 28.9778L11.7889 19.1655L0 18.3712L9.81237 11.7889L10.6066 0Z" fill="#FFC83D" />
  </svg>
);
const SPARK_PURPLE = (
  <svg viewBox="0 0 18 18" fill="none" aria-hidden focusable="false">
    <path d="M9 0L11.291 6.70897L18 9L11.291 11.291L9 18L6.70897 11.291L0 9L6.70897 6.70897L9 0Z" fill="#7C5CFF" />
  </svg>
);

export default function AboutPage() {
  return (
    <div
      className="nm-landing"
      data-theme="light"
      style={{
        position: 'relative',
        isolation: 'isolate',
        background: '#faf7f0',
        color: '#18202f',
        colorScheme: 'light',
        fontFamily: 'var(--font-inter), var(--font-sans)',
        minHeight: '100vh',
      }}
    >
      <MageNav />

      <main className={styles.root}>
        {/* ─────────── HERO ─────────── */}
        <header className={styles.hero}>
          <div className={styles.heroInner}>
            <span className={`${styles.star} ${styles.star1}`} aria-hidden>{SPARK_GOLD}</span>
            <span className={`${styles.star} ${styles.star2}`} aria-hidden>{SPARK_PURPLE}</span>
            <span className={styles.pill}>✦ ABOUT NOTEMAGE</span>
            <h1 className={styles.h1}>
              Challenge <span className={styles.accepted}>accepted.</span>
            </h1>
            <p className={styles.sub}>A single dev. Fed up with the bad UI of the competitors.</p>
          </div>
          <img className={styles.heroMage} src="/landing/mage-wand.png" alt="" aria-hidden loading="lazy" decoding="async" />
        </header>

        {/* ─────────── LETTER ─────────── */}
        <article className={styles.letter}>
          <div className={styles.lead}>
            <span className={styles.dropcap} aria-hidden="true">N</span>
            <p className={styles.leadBody}>
              <span className={styles.srOnly}>N</span>otemage was created by me, a single dev studying
              computer science, fed up with the clunky UI of the competitors, the constant tab-switching,
              and the noisy ads you only escape by paying the monthly <span className={styles.strong}>$20</span>{' '}
              for <span className={styles.every}>EVERY. SINGLE. ONE</span> of them.
            </p>
          </div>

          <figure className={styles.pq}>
            <span className={styles.pqMark} aria-hidden>&ldquo;</span>
            <blockquote className={styles.pqText}>
              You&apos;re supposed to be able to build this yourself, no?
            </blockquote>
            <figcaption className={styles.pqCap}>— So I thought to myself</figcaption>
          </figure>

          <p className={styles.para}>
            That&apos;s why I have a <span className={styles.hl}>strict no-ads policy</span> and{' '}
            <span className={styles.hl}>keep the core features of the app free</span>. You only pay for
            AI usage — because, well… I have to pay for it <span className={styles.muted}>:(</span>
          </p>

          <p className={styles.para}>
            So if you hit any bugs, just reach out — I&apos;ll get them fixed as fast as I can.
          </p>

          <Link href="/contact" className={styles.contact}>
            <span className="material-symbols-outlined" aria-hidden>mail</span>
            Contact me
          </Link>

          <div className={styles.divider} aria-hidden />

          <p className={styles.para}>
            Notemage is built for <span className={styles.strong}>students</span> who want everything
            they need to study in one app — a genuinely nice UI, and{' '}
            <span className={styles.hlPurple}>a dev who actually cares</span>{' '}
            about your wants and needs. Not a faceless corporation that can&apos;t be bothered.{' '}
            <span className={styles.muted}>*cough cough* M-slop</span>
          </p>

          <img className={styles.psMage} src="/landing/mage-sparkle.png" alt="" aria-hidden loading="lazy" decoding="async" />

          <aside className={styles.ps}>
            <span className={styles.psTape} aria-hidden />
            <div className={styles.psLabel}>P.S.</div>
            <p className={styles.psText}>If you&apos;re reading this — have fun with Notemage!</p>
          </aside>
        </article>
      </main>

      <MageFooter />
    </div>
  );
}
