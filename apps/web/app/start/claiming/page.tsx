/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { clearPendingFile } from '@/lib/onboarding-file-store';
import { clearPreview } from '@/lib/onboarding-preview-store';
import styles from '../building/Building.module.css';

/* Onboarding-real-generation P4 — the post-sign-up claim interstitial. Reached
   after the account/DOB wizard completes (or directly for an already-onboarded
   user) when the visitor generated a real preview in the /start funnel. It
   materializes the anonymous preview into an OWNED, generating StudyPlan via
   POST /api/start/claim (keyed by the httpOnly nm_anon cookie) and routes to
   the real path with its live generation-progress UI. Nothing to claim (or any
   failure) → fall through to `next` (the wizard's normal landing). */

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

/** Only same-origin relative paths — never an absolute / protocol-relative URL. */
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/dashboard';
}

export default function ClaimingPage() {
  const router = useRouter();
  const startedRef = useRef(false);

  // Read `next` from the URL inside the effect (not useSearchParams) so this
  // screen stays statically prerenderable like the rest of /start/*.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const next = safeNext(new URLSearchParams(window.location.search).get('next'));
    let cancelled = false;
    void (async () => {
      let dest = next;
      try {
        const res = await fetch('/api/start/claim', { method: 'POST' });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.data?.planId) {
          dest = `/learn/paths/${data.data.planId}`;
          // The client-side onboarding stash has done its job.
          await clearPendingFile().catch(() => {});
          clearPreview();
        }
      } catch {
        // Network hiccup → land on the default destination; the unclaimed row
        // is swept by its TTL (P5).
      }
      if (!cancelled) router.replace(dest);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className={styles.root}>
      <span className={styles.logo} aria-hidden>
        <img src="/landing/notemage-wordmark.png" alt="NoteMage" width={80} height={30} />
      </span>

      <div className={styles.stage}>
        <div className={styles.illo}>
          <span className={styles.blob1} aria-hidden />
          <span className={styles.blob2} aria-hidden />
          <img className={styles.illoMascot} src="/landing/mage-wand.png" alt="" aria-hidden />
          <span className={`${styles.illoSpk} ${styles.spkA}`} aria-hidden>{SparkGold}</span>
          <span className={`${styles.illoSpk} ${styles.spkB}`} aria-hidden>{SparkPurple}</span>
        </div>

        <h1 className={styles.title}>Saving your path…</h1>
        <p className={styles.subtitle}>Moving everything into your account — this only takes a moment.</p>

        <div className={styles.progress}>
          <span className={styles.progressFill} style={{ width: '70%' }} />
        </div>
      </div>
    </div>
  );
}
