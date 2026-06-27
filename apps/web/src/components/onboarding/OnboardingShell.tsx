/* eslint-disable @next/next/no-img-element */
'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import styles from './OnboardingShell.module.css';

/* Shared chrome for the four onboarding setup steps (Figma W02/W03/W04/W05).
   Desktop renders the lavender rail (logo + mascot + speech bubble + 4-step
   stepper); mobile renders a top progress bar + back arrow + compact mascot
   bubble. The step content is passed as children; Back/Continue live here so the
   nav is identical across steps. */

const STEPS = ['Add material', 'Set your goal', 'Pick your rhythm', 'Build your path'];

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

interface OnboardingShellProps {
  /** 1-based active step in the 4-step setup stepper. */
  step: number;
  /** Mage speech-bubble copy for this step. */
  bubble: string;
  /** Mascot pose key under /public/landing (default 'plain'). */
  mascot?: string;
  /** Eyebrow above the heading (desktop only); defaults to "STEP n OF 4".
   *  Pass null to suppress it (e.g. W03 shows a green pill in the content instead). */
  eyebrow?: string | null;
  children: ReactNode;
  onBack?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
}

export default function OnboardingShell({
  step,
  bubble,
  mascot = 'plain',
  eyebrow,
  children,
  onBack,
  onContinue,
  continueLabel = 'Continue',
  continueDisabled = false,
}: OnboardingShellProps) {
  const eyebrowText = eyebrow ?? `STEP ${step} OF ${STEPS.length}`;
  const progressPct = Math.round((step / STEPS.length) * 100);
  const mascotSrc = `/landing/mage-${mascot}.png`;

  const continueBtn = (
    <button type="button" className={styles.continue} onClick={onContinue} disabled={continueDisabled}>
      {continueLabel}
    </button>
  );

  return (
    <div className={styles.root}>
      {/* ─── desktop rail ─── */}
      <aside className={styles.rail}>
        <Link href="/" className={styles.railLogo} aria-label="NoteMage — home">
          <img src="/landing/notemage-wordmark.png" alt="NoteMage" width={80} height={30} />
        </Link>
        <span className={`${styles.railSpk} ${styles.railSpkA}`} aria-hidden>{SparkGold}</span>
        <span className={`${styles.railSpk} ${styles.railSpkB}`} aria-hidden>{SparkPurple}</span>
        <span className={`${styles.railSpk} ${styles.railSpkC}`} aria-hidden>{SparkGold}</span>

        <div className={styles.railMascotWrap}>
          <img className={styles.railMascot} src={mascotSrc} alt="" aria-hidden />
          <div className={styles.railBubble}>{bubble}</div>
        </div>

        <ol className={styles.stepper}>
          {STEPS.map((label, i) => {
            const n = i + 1;
            const state = n < step ? 'Done' : n === step ? 'Active' : 'Upcoming';
            return (
              <li key={label} className={styles.step}>
                {i < STEPS.length - 1 && <span className={styles.stepLine} aria-hidden />}
                <span className={`${styles.stepDot} ${styles[`stepDot${state}`]}`} aria-hidden>
                  {n < step ? '✓' : n}
                </span>
                <span className={`${styles.stepLabel} ${styles[`stepLabel${state}`]}`}>{label}</span>
              </li>
            );
          })}
        </ol>
      </aside>

      {/* ─── main column ─── */}
      <div className={styles.main}>
        {/* mobile top bar */}
        <div className={styles.mtop}>
          {onBack && (
            <button type="button" className={styles.mtopBack} onClick={onBack} aria-label="Back">
              <span className="material-symbols-outlined" aria-hidden>arrow_back</span>
            </button>
          )}
          <div className={styles.progress} role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={STEPS.length}>
            <span className={styles.progressFill} style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {/* mobile mascot + bubble */}
        <div className={styles.mbubble}>
          <span className={styles.mAvatar}>
            <img src={mascotSrc} alt="" aria-hidden />
          </span>
          <span className={styles.mBubbleText}>{bubble}</span>
        </div>

        <div className={styles.content}>
          <div className={styles.contentInner}>
            {eyebrow !== null && <p className={styles.eyebrow}>{eyebrowText}</p>}
            {children}
          </div>
        </div>

        {/* desktop nav */}
        <div className={styles.navDesktop}>
          {onBack ? (
            <button type="button" className={styles.back} onClick={onBack}>Back</button>
          ) : (
            <span />
          )}
          {continueBtn}
        </div>

        {/* mobile pinned nav */}
        <div className={styles.navMobile}>{continueBtn}</div>
      </div>
    </div>
  );
}
