/* eslint-disable @next/next/no-img-element */
'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ResetPasswordForm from '@/components/auth/ResetPasswordForm';
import TurnstileWidget, { turnstileEnabled } from '@/components/auth/TurnstileWidget';
import styles from './ForgotPassword.module.css';

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

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');

  const handleRequest = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (turnstileEnabled && !turnstileToken) {
      setError('Please complete the verification challenge.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, turnstileToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // Always advance — the endpoint returns the same generic success
        // whether or not the email is registered (anti-enumeration).
        setPhase('reset');
      } else if (res.status === 429) {
        setError(data.error || 'Please wait a moment before requesting another code.');
      } else {
        setError(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    router.push('/auth/login?reset=1');
  };

  // Phase 2 — code entry + new password. The shared ResetPasswordForm is
  // dark-token-styled, so keep it on a dark card (data-theme="dark") centred on
  // the cream background — exactly how the login page treats its VerifyCodeForm.
  if (phase === 'reset') {
    return (
      <div className={styles.resetRoot}>
        <div data-theme="dark" className={styles.resetCard}>
          <div className={styles.resetHead}>
            <img src="/landing/notemage-wordmark.png" alt="Notemage" width={120} height={45} />
          </div>
          <h1 className={styles.resetTitle}>Check your email</h1>
          <ResetPasswordForm email={email} onReset={handleReset} />
          <button type="button" className={styles.resetBack} onClick={() => setPhase('request')}>
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {/* ─────────── LEFT PANEL ─────────── */}
      <div className={styles.panel}>
        <Link href="/" className={styles.panelLogo} aria-label="NoteMage — home">
          <img src="/landing/notemage-wordmark.png" alt="NoteMage" width={80} height={30} />
        </Link>
        <span className={`${styles.star} ${styles.starA}`} aria-hidden>{SparkGold}</span>
        <span className={`${styles.star} ${styles.starB}`} aria-hidden>{SparkPurple}</span>
        <span className={`${styles.star} ${styles.starC}`} aria-hidden>{SparkPurple}</span>
        <span className={`${styles.star} ${styles.starD}`} aria-hidden>{SparkGold}</span>
        <div className={styles.panelInner}>
          <img className={styles.panelMascot} src="/landing/mage-wand.png" alt="" aria-hidden />
          <h2 className={styles.panelTitle}>Happens to the best of us.</h2>
          <p className={styles.panelSub}>
            A quick code and a new password — you&apos;ll be back to your paths in a minute.
          </p>
        </div>
      </div>

      {/* ─────────── RIGHT FORM ─────────── */}
      <div className={styles.formCol}>
        <div className={styles.form}>
          <Link href="/" className={styles.formLogo} aria-label="NoteMage — home">
            <img src="/landing/notemage-wordmark.png" alt="NoteMage" width={80} height={30} />
          </Link>
          <h1 className={styles.formTitle}>Reset your password</h1>
          <p className={styles.formSub}>Enter your email and we&apos;ll send a 6-digit reset code.</p>

          {error && <div className={`${styles.banner} ${styles.bannerError}`}>{error}</div>}

          <form onSubmit={handleRequest}>
            <div className={styles.field}>
              <label htmlFor="email" className={styles.label}>Email</label>
              <div className={styles.inputWrap}>
                <input
                  id="email"
                  type="email"
                  className={styles.input}
                  placeholder="you@school.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className={styles.turnstile}>
              <TurnstileWidget theme="light" onToken={setTurnstileToken} />
            </div>

            <button type="submit" className={styles.submit} disabled={loading}>
              {loading ? 'Sending…' : 'Send reset code'}
            </button>
          </form>

          <p className={styles.backLink}>
            Remembered it?{' '}
            <Link href="/auth/login">Back to log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
