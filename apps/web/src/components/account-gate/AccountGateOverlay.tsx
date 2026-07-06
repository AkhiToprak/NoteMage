'use client';

/**
 * Full-screen account-state takeover, rendered by AccountGateServerGate during
 * dashboard SSR. Three variants:
 *   • expired — 7-day trial is up (Figma 504:141). Subscribe or pause. NON-dismissible.
 *   • paused  — account paused, data kept 3 months (Figma 504:103). Escapable only
 *               by subscribing. NON-dismissible.
 *   • welcome — payment settled (Figma 504:51). "You're in!" — dismissible once.
 *
 * Always cream, like the auth/onboarding surfaces, regardless of app theme.
 */

import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useUpgrade } from '@/hooks/useUpgrade';
import { getNativePlatform } from '@/lib/native-bridge';
import IosUpgradeSheet from '@/components/settings/IosUpgradeSheet';
import { useCurrency } from '@/hooks/useCurrency';
import { PPP_CHECKOUT_CONFIGURED } from '@/lib/lemonsqueezy-client';
import {
  proPriceCHF,
  monthlyEquivalent,
  yearlySavingsPct,
  INTERVAL_LABEL,
  type BillingInterval,
} from '@/lib/tiers';
import styles from './account-gate.module.css';

const INTERVALS: BillingInterval[] = ['weekly', 'monthly', 'yearly'];

/**
 * Inside the iOS shell the gate must sell through StoreKit (App Review 3.1.1
 * forbids the Lemon Squeezy checkout there), so the subscribe CTA opens the
 * native IosUpgradeSheet instead. The sheet polls /api/me/entitlement until the
 * RevenueCat webhook lands, then refreshes — re-running the server gate.
 */
function useIosSheet() {
  const [isIos, setIsIos] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    setIsIos(getNativePlatform() === 'ios');
  }, []);
  return { isIos, sheetOpen, setSheetOpen };
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

type Props =
  | { variant: 'expired' }
  | { variant: 'paused'; deletionAt: string | null }
  | { variant: 'welcome'; interval: BillingInterval | null; periodEnd: string | null };

export function AccountGateOverlay(props: Props) {
  const [open, setOpen] = useState(true);

  // Lock background scroll while the takeover is up.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className={styles.scrim} role="dialog" aria-modal="true" aria-label="Account">
      <div className={styles.card}>
        {props.variant === 'expired' && <ExpiredBody />}
        {props.variant === 'paused' && <PausedBody deletionAt={props.deletionAt} />}
        {props.variant === 'welcome' && (
          <WelcomeBody
            interval={props.interval}
            periodEnd={props.periodEnd}
            onDismiss={() => setOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

/* ── P2 · trial ended — subscribe or pause ───────────────────────────────── */
function ExpiredBody() {
  const router = useRouter();
  const { formatPrice, currency } = useCurrency();
  const priceCurrency = PPP_CHECKOUT_CONFIGURED ? currency : undefined;
  const { startUpgrade, upgrading } = useUpgrade();
  const [selected, setSelected] = useState<BillingInterval>('yearly');
  const [pausing, setPausing] = useState(false);
  const [error, setError] = useState('');
  const savePct = yearlySavingsPct('PRO', priceCurrency);
  const busy = upgrading || pausing;

  const { isIos, sheetOpen, setSheetOpen } = useIosSheet();

  const subscribe = async () => {
    setError('');
    if (isIos) {
      setSheetOpen(true);
      return;
    }
    try {
      await startUpgrade(selected);
    } catch {
      setError('Checkout isn’t available right now. Please try again.');
    }
  };

  const pause = async () => {
    setError('');
    setPausing(true);
    try {
      const res = await fetch('/api/account/pause', { method: 'POST' });
      if (!res.ok) throw new Error('pause failed');
      router.refresh(); // re-run the server gate → paused screen
    } catch {
      setError('Couldn’t pause your account. Please try again.');
      setPausing(false);
    }
  };

  return (
    <>
      <p className={styles.bubble}>
        Your 7 days are up — nice work! Choose how you’d like to keep learning.
      </p>
      <h1 className={styles.title}>Your free trial has ended</h1>
      <p className={styles.sub}>Your learning paths, progress, and weak points are all safe.</p>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.plans} role="radiogroup" aria-label="Choose a plan">
        {INTERVALS.map((iv) => {
          const active = selected === iv;
          const suffix = iv === 'weekly' ? '/wk' : iv === 'monthly' ? '/mo' : '/yr';
          const line =
            iv === 'yearly'
              ? `${formatPrice(monthlyEquivalent('PRO', priceCurrency))}/mo${savePct > 0 ? ` · Save ${savePct}%` : ''}`
              : `Billed ${INTERVAL_LABEL[iv].toLowerCase()}`;
          return (
            <button
              key={iv}
              type="button"
              role="radio"
              aria-checked={active}
              className={`${styles.plan} ${active ? styles.planActive : ''}`}
              onClick={() => setSelected(iv)}
              disabled={busy}
            >
              <span className={styles.radio} aria-hidden />
              <span className={styles.planText}>
                <span className={styles.planName}>
                  {INTERVAL_LABEL[iv]}
                  {iv === 'yearly' && savePct > 0 && <span className={styles.best}>BEST VALUE</span>}
                </span>
                <span className={styles.planLine}>{line}</span>
              </span>
              <span className={styles.planPrice}>
                {formatPrice(proPriceCHF(iv, priceCurrency))}
                <span className={styles.planSuffix}>{suffix}</span>
              </span>
            </button>
          );
        })}
      </div>

      <button type="button" className={styles.primary} onClick={() => void subscribe()} disabled={busy}>
        {upgrading ? 'Opening checkout…' : 'Continue with NoteMage'}
      </button>
      <button type="button" className={styles.secondary} onClick={() => void pause()} disabled={busy}>
        {pausing ? 'Pausing…' : 'Pause my account'}
      </button>

      <p className={styles.pauseNote}>
        If you pause, we’ll keep your learning paths and progress safe for 3 months. Come back
        anytime and continue by subscribing.
      </p>
      <p className={styles.fine}>Cancel anytime · Secure checkout</p>

      {isIos && <IosUpgradeSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />}
    </>
  );
}

/* ── P3 · paused — locked, escapable only by subscribing ──────────────────── */
function PausedBody({ deletionAt }: { deletionAt: string | null }) {
  const { startUpgrade, upgrading } = useUpgrade();
  const [error, setError] = useState('');
  const { isIos, sheetOpen, setSheetOpen } = useIosSheet();

  const subscribe = async () => {
    setError('');
    if (isIos) {
      setSheetOpen(true);
      return;
    }
    try {
      await startUpgrade('yearly');
    } catch {
      setError('Checkout isn’t available right now. Please try again.');
    }
  };

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.mascot} src="/landing/mage-plain.png" alt="" aria-hidden />
      <h1 className={styles.title}>Your account is paused</h1>
      <p className={styles.sub}>We’ve safely saved your paths, progress, and weak points.</p>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.infoCard}>
        <span className={styles.infoIcon} aria-hidden>
          <span className="material-symbols-outlined">lock</span>
        </span>
        <div>
          <p className={styles.infoTitle}>Saved for 3 months</p>
          {deletionAt && <p className={styles.infoSub}>Available until {fmtDate(deletionAt)}</p>}
        </div>
      </div>

      <p className={styles.sub} style={{ marginTop: 18 }}>
        Come back anytime and pick up right where you left off.
      </p>

      <button
        type="button"
        className={styles.primary}
        onClick={() => void signOut({ callbackUrl: '/auth/login' })}
      >
        Back to login
      </button>
      <button
        type="button"
        className={styles.linkBtn}
        onClick={() => void subscribe()}
        disabled={upgrading}
      >
        {upgrading ? 'Opening checkout…' : 'Changed your mind? Subscribe now'}
      </button>

      {isIos && <IosUpgradeSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />}
    </>
  );
}

/* ── P4 · subscribed — success, dismissible once ──────────────────────────── */
function WelcomeBody({
  interval,
  periodEnd,
  onDismiss,
}: {
  interval: BillingInterval | null;
  periodEnd: string | null;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const renewLabel = interval === 'weekly' ? 'weekly' : interval === 'monthly' ? 'monthly' : 'yearly';

  const dismiss = () => {
    onDismiss();
    router.refresh();
  };

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.mascot} src="/landing/mage-plain.png" alt="" aria-hidden />
      <span className={styles.proBadge}>NOTEMAGE PRO</span>
      <h1 className={styles.title}>You’re in!</h1>

      <div className={styles.chips}>
        <span className={styles.chip}>Unlimited paths</span>
        <span className={styles.chip}>AI quizzes</span>
        <span className={styles.chip}>Priority Mage</span>
      </div>

      <div className={styles.infoCard}>
        <span className={`${styles.infoIcon} ${styles.infoIconOk}`} aria-hidden>
          <span className="material-symbols-outlined">check_circle</span>
        </span>
        <div>
          <p className={styles.infoTitle}>Pro plan active</p>
          {periodEnd && <p className={styles.infoSub}>Renews {renewLabel} on {fmtDate(periodEnd)}</p>}
        </div>
      </div>

      <button type="button" className={styles.primary} onClick={dismiss}>
        Continue learning
      </button>
      <p className={styles.fine}>You can manage your plan anytime in Settings.</p>
    </>
  );
}

export default AccountGateOverlay;
