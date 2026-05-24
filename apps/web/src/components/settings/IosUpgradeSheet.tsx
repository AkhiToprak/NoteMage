'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { nativeBridge, type Product } from '@/lib/native-bridge';

interface IosUpgradeSheetProps {
  open: boolean;
  onClose: () => void;
  /** Fires after a successful purchase or restore (e.g. to refetch the panel). */
  onPurchased?: () => void;
}

/**
 * iOS in-app-purchase sheet. StoreKit requires the user to buy a *specific*
 * product, so — unlike the Lemon Squeezy web checkout, where the cadence is
 * chosen on Lemon Squeezy's page — we render the RevenueCat offering's packages
 * and call the native bridge to purchase. The server tier is fulfilled
 * authoritatively by the RevenueCat webhook; after a purchase we poll
 * /api/me/entitlement then refresh the session so the UI flips to PRO.
 *
 * Only mounted inside the iOS shell.
 */
export default function IosUpgradeSheet({ open, onClose, onPurchased }: IosUpgradeSheetProps) {
  const { update } = useSession();
  const router = useRouter();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped by the "Try again" button to re-run the load effect.
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setProducts(null);
    setLoadError(false);
    setError(null);
    nativeBridge
      .getProducts()
      .then((p) => {
        if (!cancelled) setProducts(p);
      })
      .catch((e) => {
        // Surface the real reason in logs — e.g. "IAP_UNAVAILABLE" (RevenueCat
        // not configured / no StoreKit module) vs a genuine network failure.
        console.warn('[IosUpgradeSheet] getProducts failed:', e);
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, reloadTick]);

  // Wait for the RevenueCat webhook to flip the server tier, then refresh the
  // session so `tier` (the gate) updates without a manual reload.
  const refreshToPro = useCallback(async () => {
    for (let i = 0; i < 8; i += 1) {
      try {
        const ent = await fetch('/api/me/entitlement', { cache: 'no-store' }).then((r) => r.json());
        if (ent?.tier === 'PRO') break;
      } catch {
        // keep polling
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    await update();
    router.refresh();
  }, [update, router]);

  const buy = useCallback(
    async (productId: string) => {
      setBusyId(productId);
      setError(null);
      try {
        const result = await nativeBridge.purchase(productId);
        if (result.status === 'success') {
          await refreshToPro();
          onPurchased?.();
          onClose();
        } else if (result.status === 'error') {
          setError(result.message || 'Purchase failed. Please try again.');
        }
        // 'cancelled' → stay open, no error
      } catch {
        setError('Purchase failed. Please try again.');
      } finally {
        setBusyId(null);
      }
    },
    [refreshToPro, onPurchased, onClose]
  );

  const restore = useCallback(async () => {
    setRestoring(true);
    setError(null);
    try {
      const result = await nativeBridge.restorePurchases();
      if (result.status === 'restored') {
        await refreshToPro();
        onPurchased?.();
        onClose();
      } else if (result.status === 'nothing-to-restore') {
        setError('No previous purchase found to restore.');
      } else {
        setError(result.message || 'Restore failed.');
      }
    } catch {
      setError('Restore failed.');
    } finally {
      setRestoring(false);
    }
  }, [refreshToPro, onPurchased, onClose]);

  if (!open) return null;

  const busy = busyId !== null || restoring;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upgrade to Pro"
      onClick={busy ? undefined : onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(8,8,20,0.6)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      <style>{`
        @keyframes ios-sheet-in { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .ios-sheet { animation: ios-sheet-in .35s cubic-bezier(.22,1,.36,1); }
        .ios-plan { transition: transform .2s cubic-bezier(.22,1,.36,1), border-color .2s, background .2s; }
        .ios-plan:hover { border-color: var(--tertiary-container); background: var(--surface-container); }
        .ios-plan:active { transform: scale(0.99); }
        .ios-plan:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
        .ios-plan:disabled { opacity: .55; cursor: not-allowed; }
        .ios-textbtn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: var(--radius-sm); }
        @media (prefers-reduced-motion: reduce) { .ios-sheet { animation: none; } }
      `}</style>

      <div
        className="ios-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 440,
          background: 'var(--surface-container-high)',
          borderTopLeftRadius: 'var(--radius-xl)',
          borderTopRightRadius: 'var(--radius-xl)',
          border: '1px solid var(--outline-variant)',
          borderBottom: 'none',
          padding: '24px 20px calc(24px + env(safe-area-inset-bottom))',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2
              style={{
                margin: '0 0 4px',
                fontSize: 20,
                fontWeight: 800,
                color: 'var(--on-surface)',
                fontFamily: 'var(--font-display)',
                letterSpacing: '-0.01em',
              }}
            >
              Upgrade to Pro
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
              Unlimited AI flashcards, quizzes, study plans, and more.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="ios-textbtn"
            onClick={onClose}
            disabled={busy}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--on-surface-variant)',
              cursor: busy ? 'not-allowed' : 'pointer',
              padding: 4,
              lineHeight: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 24 }}>
              close
            </span>
          </button>
        </div>

        {/* Plans */}
        {loadError ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--error)', margin: 0 }} role="alert">
              Couldn&apos;t load plans. Check your connection and try again.
            </p>
            <button
              type="button"
              className="ios-plan"
              onClick={() => setReloadTick((t) => t + 1)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--outline-variant)',
                background: 'var(--surface-container-low)',
                color: 'var(--on-surface)',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                refresh
              </span>
              Try again
            </button>
          </div>
        ) : products === null ? (
          <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0 }}>Loading plans…</p>
        ) : products.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0 }}>
            No plans are available right now. Please try again later.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {products.map((p) => (
              <button
                key={p.id}
                type="button"
                className="ios-plan"
                onClick={() => buy(p.id)}
                disabled={busy}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  textAlign: 'left',
                  padding: '14px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--outline-variant)',
                  background: 'var(--surface-container-low)',
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--on-surface)' }}>{p.title}</span>
                  {p.description ? (
                    <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{p.description}</span>
                  ) : null}
                </span>
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 800,
                    color: 'var(--tertiary-container)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {busyId === p.id ? '…' : p.priceString}
                </span>
              </button>
            ))}
          </div>
        )}

        {error && (
          <p style={{ fontSize: 13, color: 'var(--error)', margin: 0 }} role="alert">
            {error}
          </p>
        )}

        {/* Restore + auto-renew disclosure (App Review expects both) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            className="ios-textbtn"
            onClick={restore}
            disabled={busy}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--on-surface-variant)',
              fontSize: 13,
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
              padding: '4px 8px',
            }}
          >
            {restoring ? 'Restoring…' : 'Restore purchases'}
          </button>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--outline)', textAlign: 'center', lineHeight: 1.5 }}>
            Billed through your Apple ID. Subscriptions renew automatically until cancelled in your
            App Store settings.
          </p>
        </div>
      </div>
    </div>
  );
}
