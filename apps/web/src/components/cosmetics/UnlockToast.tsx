'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  COSMETICS,
  type Cosmetic,
  type CosmeticType,
  type NameColorCosmetic,
  type NameFontCosmetic,
  type TitleCosmetic,
  type FrameCosmetic,
  type BackgroundCosmetic,
} from '@/lib/cosmetics/catalog';
import { UserAvatar } from '@/components/user/UserAvatar';
import { ProfileBackground } from './ProfileBackground';

/**
 * `<UnlockProvider>` + `<UnlockToast>` — the cosmetic-unlock notification
 * surface.
 *
 * Design:
 * - The provider polls `/api/user/cosmetics/pending-unlocks` every 12s and
 *   maintains a FIFO queue of pending unlocks. It dedupes by notification id
 *   so repeated polls don't stack duplicates.
 * - Exactly ONE toast is visible at a time. When it auto-dismisses (or the
 *   user clicks through), the next queued unlock slides in. This keeps the
 *   celebratory moment intentional instead of drowning the user in a wall
 *   of toasts after a big quiz result.
 * - Clicking the toast marks the underlying notification row read (so the
 *   bell count decrements) and navigates to `/profile` where the customization
 *   studio lives. Auto-dismiss does the same without navigation.
 * - We intentionally do NOT refetch or update any context after showing a
 *   toast — by the next page transition the user will already have seen it.
 *
 * The toast itself reuses the same swatch bodies as CosmeticsShowcase so the
 * preview is pixel-identical to what the user will see when they open the
 * customization studio.
 */

interface PendingUnlock {
  id: string; // notification id
  cosmeticId: string;
  cosmeticType: CosmeticType;
  label: string;
  requiredLevel: number;
  createdAt: string;
}

interface UnlockContextValue {
  /** Imperatively enqueue an unlock by cosmetic slug. Rarely needed — the
   *  provider polls automatically — but exposed for XP-mutating components
   *  that want to trigger the toast without waiting for the poll. */
  enqueueBySlug: (slug: string) => void;
}

const UnlockContext = React.createContext<UnlockContextValue | null>(null);

export function useUnlocks(): UnlockContextValue {
  const ctx = React.useContext(UnlockContext);
  if (!ctx) {
    // No-op stub so non-dashboard surfaces can import the hook safely.
    return { enqueueBySlug: () => {} };
  }
  return ctx;
}

const POLL_INTERVAL_MS = 12_000;
const AUTO_DISMISS_MS = 7_000;
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function UnlockProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = React.useState<PendingUnlock[]>([]);
  const [current, setCurrent] = React.useState<PendingUnlock | null>(null);
  const seenIdsRef = React.useRef<Set<string>>(new Set());
  const dismissTimerRef = React.useRef<number | null>(null);
  // Mirror of `current` so `dismiss()` can read the live value without going
  // through a setState updater (setState updaters must be pure; calling
  // fetch() inside one risks duplicate requests under strict/concurrent mode).
  const currentRef = React.useRef<PendingUnlock | null>(null);
  React.useEffect(() => {
    currentRef.current = current;
  }, [current]);

  // Poll the server for pending unlocks. Dedup by notification id so nothing
  // double-toasts if the poll fires before the previous dismiss hits the DB.
  // All ref mutation happens OUTSIDE the setQueue updater for strict-mode
  // safety — the updater itself stays pure.
  const poll = React.useCallback(async () => {
    try {
      const res = await fetch('/api/user/cosmetics/pending-unlocks', {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const json = await res.json();
      const data = json?.data ?? json;
      const unlocks: PendingUnlock[] = Array.isArray(data?.unlocks) ? data.unlocks : [];
      if (unlocks.length === 0) return;
      const fresh = unlocks.filter((u) => !seenIdsRef.current.has(u.id));
      if (fresh.length === 0) return;
      for (const u of fresh) seenIdsRef.current.add(u.id);
      setQueue((prev) => [...prev, ...fresh]);
    } catch {
      // silent
    }
  }, []);

  // Kick off an initial poll, then continue every POLL_INTERVAL_MS. We use a
  // setTimeout chain instead of setInterval so a slow response doesn't stack
  // overlapping polls.
  React.useEffect(() => {
    let cancelled = false;
    let handle: number | null = null;
    const run = async () => {
      if (cancelled) return;
      await poll();
      if (cancelled) return;
      handle = window.setTimeout(run, POLL_INTERVAL_MS);
    };
    run();
    return () => {
      cancelled = true;
      if (handle !== null) window.clearTimeout(handle);
    };
  }, [poll]);

  // Promote the head of the queue into `current` whenever the slot is empty.
  React.useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setCurrent(next);
  }, [current, queue]);

  // Mark-read + dismiss. Guarded against double-invocation (user clicks X
  // just as auto-dismiss fires) via currentRef so we fire the PUT exactly
  // once per unlock. Synthetic ids from enqueueBySlug start with "local:"
  // and skip the network round-trip — they have no server row to mark read.
  const dismiss = React.useCallback((opts?: { markRead?: boolean }) => {
    const markRead = opts?.markRead ?? true;
    const curr = currentRef.current;
    if (!curr) return; // already dismissed
    currentRef.current = null;
    if (markRead && !curr.id.startsWith('local:')) {
      // Fire-and-forget — the toast disappears whether or not this succeeds.
      fetch(`/api/notifications/${curr.id}`, { method: 'PUT' }).catch(() => {});
    }
    setCurrent(null);
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  // Auto-dismiss the current toast after AUTO_DISMISS_MS.
  React.useEffect(() => {
    if (!current) return;
    dismissTimerRef.current = window.setTimeout(() => {
      dismiss();
    }, AUTO_DISMISS_MS);
    return () => {
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    };
  }, [current, dismiss]);

  // Imperative enqueue — used by XP-mutating components that know a slug has
  // just been unlocked and don't want to wait for the poll.
  const enqueueBySlug = React.useCallback((slug: string) => {
    const entry = COSMETICS[slug];
    if (!entry) return;
    // Synthetic id — prefixed so it can't collide with real notification ids.
    // The subsequent poll will pick up the real row and dedupe via seenIds.
    const syntheticId = `local:${slug}:${Date.now()}`;
    if (seenIdsRef.current.has(syntheticId)) return;
    seenIdsRef.current.add(syntheticId);
    setQueue((prev) => [
      ...prev,
      {
        id: syntheticId,
        cosmeticId: slug,
        cosmeticType: entry.type,
        label: entry.label,
        requiredLevel: entry.requiredLevel,
        createdAt: new Date().toISOString(),
      },
    ]);
  }, []);

  const ctxValue = React.useMemo<UnlockContextValue>(() => ({ enqueueBySlug }), [enqueueBySlug]);

  return (
    <UnlockContext.Provider value={ctxValue}>
      {children}
      <UnlockToast unlock={current} onDismiss={dismiss} />
    </UnlockContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
interface UnlockToastProps {
  unlock: PendingUnlock | null;
  onDismiss: (opts?: { markRead?: boolean }) => void;
}

const TYPE_LABELS: Record<CosmeticType, { label: string; icon: string }> = {
  title: { label: 'New Title', icon: 'emoji_events' },
  nameFont: { label: 'New Name Font', icon: 'text_fields' },
  nameColor: { label: 'New Name Color', icon: 'palette' },
  frame: { label: 'New Avatar Frame', icon: 'crop_square' },
  background: { label: 'New Background', icon: 'wallpaper' },
};

function UnlockToast({ unlock, onDismiss }: UnlockToastProps) {
  // We animate mount/unmount via a derived `visible` bit so the exit
  // transition fires before the node actually unmounts.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    if (!unlock) {
      setMounted(false);
      return;
    }
    // Trigger enter on next frame so the initial translate has time to apply.
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, [unlock]);

  if (!unlock) return null;
  const entry = COSMETICS[unlock.cosmeticId];
  if (!entry) return null;
  const typeInfo = TYPE_LABELS[unlock.cosmeticType];

  return (
    <>
      <style jsx global>{`
        @keyframes unlock-toast-shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
        @keyframes unlock-toast-glow {
          0%,
          100% {
            box-shadow:
              0 20px 60px rgba(174, 137, 255, 0.35),
              0 0 0 1px rgba(174, 137, 255, 0.55),
              0 0 40px rgba(255, 149, 102, 0.2);
          }
          50% {
            box-shadow:
              0 24px 72px rgba(174, 137, 255, 0.45),
              0 0 0 1px rgba(174, 137, 255, 0.7),
              0 0 56px rgba(255, 149, 102, 0.3);
          }
        }
      `}</style>

      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 9999,
          display: 'flex',
          justifyContent: 'flex-end',
          pointerEvents: 'none',
        }}
      >
        <div
          role="status"
          aria-live="polite"
          style={{
            pointerEvents: 'auto',
            width: 340,
            maxWidth: 'calc(100vw - 48px)',
            borderRadius: 20,
            overflow: 'hidden',
            background: 'linear-gradient(180deg, #2d2d52 0%, #21213e 100%)',
            border: '1px solid rgba(174,137,255,0.4)',
            transform: mounted
              ? 'translateX(0) translateY(0) scale(1)'
              : 'translateX(40px) translateY(10px) scale(0.96)',
            opacity: mounted ? 1 : 0,
            transition: `transform 0.45s ${EASING}, opacity 0.4s ${EASING}`,
            animation: mounted ? 'unlock-toast-glow 2.8s ease-in-out infinite' : undefined,
          }}
        >
          {/* Shimmer stripe across the top */}
          <div
            style={{
              height: 3,
              background:
                'linear-gradient(90deg, transparent 0%, #ffde59 25%, #ff9566 50%, #ff5fa2 75%, transparent 100%)',
              backgroundSize: '200% 100%',
              animation: 'unlock-toast-shimmer 3s linear infinite',
            }}
          />

          <div
            style={{
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {/* Header row — type label + dismiss */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: 'rgba(174,137,255,0.18)',
                  border: '1px solid rgba(174,137,255,0.35)',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 14, color: '#ae89ff' }}
                >
                  {typeInfo.icon}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: '#e5e3ff',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    fontFamily: 'var(--font-brand)',
                  }}
                >
                  {typeInfo.label}
                </span>
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => onDismiss()}
                style={{
                  width: 26,
                  height: 26,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  borderRadius: '50%',
                  border: 'none',
                  background: 'rgba(136,136,168,0.14)',
                  color: '#aaa8c8',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: `background 0.25s ${EASING}, transform 0.25s ${EASING}`,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'rgba(136,136,168,0.28)';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'rgba(136,136,168,0.14)';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  close
                </span>
              </button>
            </div>

            {/* Preview tile */}
            <div
              style={{
                position: 'relative',
                height: 92,
                borderRadius: 14,
                overflow: 'hidden',
                background: '#1a1a36',
                border: '1px solid rgba(136,136,168,0.25)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
            >
              <PreviewBody entry={entry} />
            </div>

            {/* Label + level */}
            <div>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 800,
                  color: '#e5e3ff',
                  fontFamily: 'var(--font-display)',
                  letterSpacing: '-0.01em',
                  lineHeight: 1.2,
                }}
              >
                {entry.label}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  color: '#8888a8',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}
              >
                Unlocked at level {unlock.requiredLevel}
              </div>
            </div>

            {/* CTA */}
            <Link
              href="/profile"
              onClick={() => onDismiss()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: 12,
                background: 'linear-gradient(90deg, #ae89ff 0%, #ff6fa2 100%)',
                color: '#2a0066',
                fontSize: 13,
                fontWeight: 800,
                fontFamily: 'var(--font-brand)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                textDecoration: 'none',
                border: 'none',
                cursor: 'pointer',
                transition: `transform 0.3s ${EASING}, box-shadow 0.3s ${EASING}`,
                boxShadow: '0 6px 20px rgba(255,111,162,0.35)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.transform =
                  'translateY(-1px) scale(1.02)';
                (e.currentTarget as HTMLAnchorElement).style.boxShadow =
                  '0 10px 28px rgba(255,111,162,0.45)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0) scale(1)';
                (e.currentTarget as HTMLAnchorElement).style.boxShadow =
                  '0 6px 20px rgba(255,111,162,0.35)';
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                palette
              </span>
              Equip in profile
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Preview body — minimal inline renderers (the toast imports should stay small).
// ---------------------------------------------------------------------------
function PreviewBody({ entry }: { entry: Cosmetic }) {
  switch (entry.type) {
    case 'title':
      return <TitlePreview entry={entry} />;
    case 'nameFont':
      return <FontPreview entry={entry} />;
    case 'nameColor':
      return <ColorPreview entry={entry} />;
    case 'frame':
      return <FramePreview entry={entry} />;
    case 'background':
      return <BackgroundPreview entry={entry} />;
  }
}

function TitlePreview({ entry }: { entry: TitleCosmetic }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(60% 80% at 50% 50%, rgba(255,222,89,0.15) 0%, transparent 70%)',
      }}
    >
      <span
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: '#ffde59',
          fontFamily: 'var(--font-brand)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          textShadow: '0 2px 12px rgba(255,222,89,0.4)',
        }}
      >
        {entry.label}
      </span>
    </div>
  );
}

function FontPreview({ entry }: { entry: NameFontCosmetic }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          fontSize: 44,
          fontWeight: 700,
          color: '#e5e3ff',
          fontFamily: entry.css,
          lineHeight: 1,
        }}
      >
        Aa
      </span>
    </div>
  );
}

function ColorPreview({ entry }: { entry: NameColorCosmetic }) {
  const sample: React.CSSProperties = entry.gradient
    ? {
        backgroundImage: entry.css,
        backgroundClip: 'text',
        WebkitBackgroundClip: 'text',
        color: 'transparent',
        WebkitTextFillColor: 'transparent',
      }
    : { color: entry.css };
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          fontSize: 44,
          fontWeight: 900,
          fontFamily: 'var(--font-display)',
          lineHeight: 1,
          ...sample,
        }}
      >
        Aa
      </span>
    </div>
  );
}

function FramePreview({ entry }: { entry: FrameCosmetic }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <UserAvatar
        user={{ equippedFrameId: entry.id, name: 'A', username: 'a' }}
        size={64}
        radius="50%"
      />
    </div>
  );
}

function BackgroundPreview({ entry }: { entry: BackgroundCosmetic }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ProfileBackground backgroundId={entry.id} radius={14} />
    </div>
  );
}
