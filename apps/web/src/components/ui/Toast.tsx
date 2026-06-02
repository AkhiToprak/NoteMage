'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';

/**
 * Generic toast system (audit item 14). Before this the app had only the
 * cosmetic UnlockToast and bare `alert()` calls. `ToastProvider` mounts once in
 * the dashboard shell; any client surface calls `useToast().toast({...})` to
 * raise a transient notification with an optional deep-link action.
 *
 * Used to replace the "teleport to the Learn hub" navigation after generation
 * (item 14): generate in place, then toast a link to the new set.
 */

export interface ToastAction {
  label: string;
  /** Navigates (Next <Link>) when set; otherwise `onClick` fires. */
  href?: string;
  onClick?: () => void;
}

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: 'default' | 'success' | 'error';
  /** Auto-dismiss after N ms. 0 keeps it until dismissed. Default 5000. */
  duration?: number;
  action?: ToastAction;
  /** Material Symbol override for the leading glyph. */
  icon?: string;
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  toast: (opts: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

/**
 * Returns `{ toast, dismiss }`. Outside a provider it returns no-ops (a missing
 * toast must never crash the calling flow — e.g. generation).
 */
export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  return ctx ?? { toast: () => -1, dismiss: () => {} };
}

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const dismiss = React.useCallback((id: number) => {
    setItems((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback((opts: ToastOptions) => {
    const id = ++counter;
    setItems((cur) => [...cur, { ...opts, id }]);
    return id;
  }, []);

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              bottom: 'max(16px, env(safe-area-inset-bottom))',
              right: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              zIndex: 'var(--z-toast)' as unknown as number,
              maxWidth: 'min(380px, calc(100vw - 32px))',
              pointerEvents: 'none',
            }}
          >
            {items.map((t) => (
              <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [enter, setEnter] = React.useState(false);

  React.useEffect(() => {
    const r = requestAnimationFrame(() => setEnter(true));
    return () => cancelAnimationFrame(r);
  }, []);

  React.useEffect(() => {
    const d = item.duration ?? 5000;
    if (d <= 0) return;
    const t = setTimeout(onDismiss, d);
    return () => clearTimeout(t);
  }, [item.duration, onDismiss]);

  const accent =
    item.variant === 'success'
      ? 'var(--success)'
      : item.variant === 'error'
        ? 'var(--error)'
        : 'var(--accent-strong)';
  const icon =
    item.icon ??
    (item.variant === 'success' ? 'check_circle' : item.variant === 'error' ? 'error' : 'info');

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        background: 'var(--surface-container-highest)',
        border: '1px solid var(--ink-12)',
        borderRadius: 'var(--radius-lg)',
        padding: 14,
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 var(--ink-06)',
        opacity: enter ? 1 : 0,
        transform: enter ? 'translateY(0)' : 'translateY(12px)',
        transition: 'transform 0.35s var(--ease-spring), opacity 0.35s var(--ease-spring)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <span
        className="material-symbols-outlined"
        aria-hidden
        style={{ fontSize: 20, color: accent, flexShrink: 0 }}
      >
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--on-surface)' }}>
          {item.title}
        </div>
        {item.description ? (
          <div
            style={{
              marginTop: 2,
              fontSize: 'var(--fs-xs)',
              color: 'var(--text-secondary)',
              lineHeight: 'var(--lh-snug)',
            }}
          >
            {item.description}
          </div>
        ) : null}
        {item.action ? (
          item.action.href ? (
            <Link
              href={item.action.href}
              onClick={onDismiss}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                marginTop: 8,
                fontSize: 'var(--fs-xs)',
                fontWeight: 700,
                color: accent,
                textDecoration: 'none',
              }}
            >
              {item.action.label}
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 14 }}>
                arrow_forward
              </span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                item.action?.onClick?.();
                onDismiss();
              }}
              style={{
                marginTop: 8,
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontSize: 'var(--fs-xs)',
                fontWeight: 700,
                color: accent,
                fontFamily: 'inherit',
              }}
            >
              {item.action.label}
            </button>
          )
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        style={{
          flexShrink: 0,
          width: 24,
          height: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          borderRadius: 6,
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16 }}>
          close
        </span>
      </button>
    </div>
  );
}
