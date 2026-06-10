'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUpgrade } from '@/hooks/useUpgrade';
import { getNativePlatform } from '@/lib/native-bridge';
import IosUpgradeSheet from '@/components/settings/IosUpgradeSheet';

interface SubInfo {
  tier: string;
  pendingTier: string | null;
  subscriptionPeriodEnd: string | null;
  entitlementSource: string | null;
  inGracePeriod: boolean;
}

const TIER_NAMES: Record<string, string> = { FREE: 'Free', PRO: 'Pro' };
const TIER_COLORS: Record<string, string> = { FREE: 'var(--on-surface-variant)', PRO: '#fbbf24' };

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

/**
 * Subscription management for the settings page. FREE users get an "Upgrade to
 * Pro" button — Lemon Squeezy overlay on web/desktop, the native StoreKit sheet
 * (IosUpgradeSheet) inside the iOS shell; PRO users see their status
 * plus Manage (Lemon Squeezy portal) and Cancel (schedule downgrade) actions. App Store
 * subscriptions are read-only here and point the user back to iOS Settings.
 */
export default function SubscriptionPanel() {
  const { startUpgrade, upgrading } = useUpgrade();
  const [sub, setSub] = useState<SubInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [iosSheetOpen, setIosSheetOpen] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  // Surface a checkout-open failure (missing checkout URL / Lemon.js load
  // error). The button passed `startUpgrade` directly before, so a rejection
  // became an unhandled promise and the CTA just flickered with no feedback.
  const handleUpgrade = useCallback(async () => {
    setError(null);
    try {
      await startUpgrade();
    } catch {
      setError("Couldn't open checkout. Please try again, or contact support if it persists.");
    }
  }, [startUpgrade]);

  const refresh = useCallback(() => {
    fetch('/api/user/subscription')
      .then((r) => r.json())
      .then((res) => {
        if (res?.data) setSub(res.data as SubInfo);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // The iOS shell can't use the Lemon Squeezy overlay — StoreKit requires IAP,
  // so the Upgrade button opens the native purchase sheet instead.
  useEffect(() => {
    setIsIos(getNativePlatform() === 'ios');
  }, []);

  const tier = sub?.tier ?? 'FREE';
  const isPro = tier === 'PRO';
  const isApple = sub?.entitlementSource === 'APPLE_IAP';
  const cancelScheduled = sub?.pendingTier === 'FREE';
  const periodEnd = formatDate(sub?.subscriptionPeriodEnd ?? null);

  const openPortal = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/lemonsqueezy/portal').then((r) => r.json());
      if (res?.data?.url) {
        window.open(res.data.url, '_blank', 'noopener,noreferrer');
      } else {
        setError(res?.error ?? 'Could not open the billing portal.');
      }
    } catch {
      setError('Could not open the billing portal.');
    } finally {
      setBusy(false);
    }
  }, []);

  const cancelSubscription = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/user/tier', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: 'FREE' }),
      }).then((r) => r.json());
      if (res?.success || res?.data) {
        refresh();
      } else {
        setError(res?.error ?? 'Could not cancel. Please try again.');
      }
    } catch {
      setError('Could not cancel. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  // Status line shown for active Pro users.
  let status: { label: string; color: string; bg: string } | null = null;
  if (isPro) {
    if (sub?.inGracePeriod) {
      status = { label: 'Payment issue', color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' };
    } else if (cancelScheduled) {
      status = { label: 'Cancels soon', color: '#fb7185', bg: 'rgba(251,113,133,0.15)' };
    } else {
      status = { label: 'Active', color: '#4ade80', bg: 'rgba(74,222,128,0.15)' };
    }
  }

  const primaryBtnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 22px',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    background: 'var(--tertiary-container)',
    color: '#22223a',
  };

  const secondaryBtnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 22px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--outline-variant)',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    background: 'transparent',
    color: 'var(--on-surface-variant)',
  };

  return (
    <div
      style={{
        background: 'var(--surface-container-low)',
        borderRadius: '20px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      <style>{`
        .sub-btn { transition: transform .2s cubic-bezier(.22,1,.36,1), box-shadow .2s cubic-bezier(.22,1,.36,1), background .2s; }
        .sub-btn:hover { transform: translateY(-2px); }
        .sub-btn:active { transform: translateY(0); }
        .sub-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
        .sub-btn:disabled { opacity: .55; cursor: not-allowed; transform: none; }
        .sub-btn-primary:hover { box-shadow: 0 8px 24px rgba(255,222,89,0.22), 0 2px 8px rgba(0,0,0,0.2); }
        .sub-btn-secondary:hover { background: var(--surface-container-high); }
      `}</style>

      {/* Current plan */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--on-surface-variant)',
              margin: '0 0 4px',
              fontWeight: 600,
            }}
          >
            Current Plan
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '28px', fontWeight: 800, color: TIER_COLORS[tier] || 'var(--on-surface)' }}>
              {TIER_NAMES[tier] || tier}
            </span>
          </div>
        </div>
        {status && (
          <div
            style={{
              padding: '6px 14px',
              borderRadius: '9999px',
              background: status.bg,
              color: status.color,
              fontSize: '12px',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            {status.label}
          </div>
        )}
      </div>

      {/* Period / cancellation note */}
      {isPro && periodEnd && (
        <p style={{ fontSize: '13px', color: 'var(--on-surface-variant)', margin: 0 }}>
          {cancelScheduled
            ? `Your plan ends on ${periodEnd}. You'll keep Pro until then.`
            : sub?.inGracePeriod
              ? `We couldn't process your last payment. Update your billing to keep Pro — access continues until ${periodEnd}.`
              : `Renews on ${periodEnd}.`}
        </p>
      )}

      {/* FREE → upgrade pitch */}
      {!isPro && (
        <p style={{ fontSize: '13px', color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.6 }}>
          Unlock unlimited AI flashcards, quizzes, study plans, and more with Pro.
        </p>
      )}

      {error && (
        <p style={{ fontSize: '13px', color: 'var(--error)', margin: 0 }} role="alert">
          {error}
        </p>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {!isPro && (
          <button
            type="button"
            className="sub-btn sub-btn-primary"
            style={primaryBtnStyle}
            onClick={isIos ? () => setIosSheetOpen(true) : handleUpgrade}
            disabled={upgrading}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>
              bolt
            </span>
            {upgrading ? 'Opening checkout…' : 'Upgrade to Pro'}
          </button>
        )}

        {isPro && isApple && (
          <p style={{ fontSize: '13px', color: 'var(--on-surface-variant)', margin: 0 }}>
            Your subscription is managed through the App Store. Open the App Store app → your account →
            Subscriptions to make changes.
          </p>
        )}

        {isPro && !isApple && (
          <>
            {/* External billing portal (Lemon Squeezy) is hidden inside the iOS
                shell — App Store 3.1.1 disallows steering to external payment
                management. Cross-platform subscribers can still cancel in-app
                here and update card details on the web. */}
            {!isIos && (
              <button
                type="button"
                className="sub-btn sub-btn-secondary"
                style={secondaryBtnStyle}
                onClick={openPortal}
                disabled={busy}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  receipt_long
                </span>
                Manage billing
              </button>
            )}
            {!cancelScheduled && !confirmingCancel && (
              <button
                type="button"
                className="sub-btn sub-btn-secondary"
                style={secondaryBtnStyle}
                onClick={() => setConfirmingCancel(true)}
                disabled={busy}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  cancel
                </span>
                Cancel subscription
              </button>
            )}
          </>
        )}
      </div>

      {/* Two-step cancel confirmation — a paid downgrade shouldn't fire on a single misclick. */}
      {isPro && !isApple && !cancelScheduled && confirmingCancel && (
        <div
          role="group"
          aria-label="Confirm cancellation"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: 16,
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--outline-variant)',
            background: 'var(--surface-container-high)',
          }}
        >
          <p style={{ fontSize: 14, color: 'var(--on-surface)', margin: 0, fontWeight: 600 }}>
            Cancel Pro?
          </p>
          <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.6 }}>
            {periodEnd
              ? `You'll keep Pro until ${periodEnd}, then drop to Free. You can resubscribe anytime.`
              : `You'll keep Pro until your current period ends, then drop to Free. You can resubscribe anytime.`}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <button
              type="button"
              className="sub-btn sub-btn-secondary"
              style={secondaryBtnStyle}
              onClick={() => setConfirmingCancel(false)}
              disabled={busy}
            >
              Keep Pro
            </button>
            <button
              type="button"
              className="sub-btn sub-btn-secondary"
              style={{ ...secondaryBtnStyle, color: 'var(--error)', borderColor: 'var(--error)' }}
              onClick={async () => {
                await cancelSubscription();
                setConfirmingCancel(false);
              }}
              disabled={busy}
            >
              {busy ? 'Cancelling…' : 'Confirm cancel'}
            </button>
          </div>
        </div>
      )}

      {isIos && (
        <IosUpgradeSheet
          open={iosSheetOpen}
          onClose={() => setIosSheetOpen(false)}
          onPurchased={refresh}
        />
      )}
    </div>
  );
}
