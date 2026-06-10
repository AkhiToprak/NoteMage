/* Hallmark · component-scope · genre: utilitarian (internal admin) · theme: project design system (figma-design-system.md tokens)
 * states: default · hover · focus-visible · active · disabled · loading · error · success
 * Shared primitives for the /admin console — keeps the data-table pages
 * (stats / waitlist / users / paths) visually consistent without copy-paste.
 * All colour comes from CSS custom-property tokens so light + dark both work;
 * interactive pseudo-states live in <AdminConsoleStyles/> (mounted once by the
 * admin layout) because inline styles can't express :hover / :focus-visible.
 */
'use client';

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';

export const EASE = 'cubic-bezier(0.22,1,0.36,1)';

/* ------------------------------------------------------------------ *
 * Data fetching — mirrors the tickets-page IIFE pattern so the
 * dep-change resets stay out of the synchronous effect body
 * (React Compiler `set-state-in-effect`). Unwraps the {success,data}
 * envelope from api-response.ts.
 * ------------------------------------------------------------------ */
export function useAdminData<T>(url: string | null): {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(url);
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || `Request failed (${res.status})`);
        }
        if (!cancelled) {
          setData(json.data as T);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Request failed');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, nonce]);

  return { data, loading, error, reload };
}

/* ------------------------------------------------------------------ *
 * Page header — matches the tickets page (eyebrow + display title +
 * one-line description), with an optional right-aligned actions slot.
 * ------------------------------------------------------------------ */
export function AdminHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <p
          style={{
            fontSize: 12,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--on-surface-variant)',
            margin: 0,
          }}
        >
          {eyebrow}
        </p>
        <h1
          className="font-display"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(24px, 5vw, 32px)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            margin: 0,
            color: 'var(--on-surface)',
          }}
        >
          {title}
        </h1>
        <p
          style={{
            fontSize: 14,
            color: 'var(--on-surface-variant)',
            margin: 0,
            maxWidth: 620,
            lineHeight: 1.55,
          }}
        >
          {description}
        </p>
      </div>
      {actions ? <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div> : null}
    </header>
  );
}

/* ------------------------------------------------------------------ *
 * Empty / loading / error shell — identical shape to the tickets page.
 * ------------------------------------------------------------------ */
export function EmptyShell({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div
      style={{
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        padding: '32px 24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}
      role={icon === 'error' ? 'alert' : undefined}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: 32, color: 'var(--on-surface-variant)' }}
        aria-hidden
      >
        {icon}
      </span>
      <span
        className="font-display"
        style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: 'var(--on-surface)' }}
      >
        {title}
      </span>
      <span style={{ fontSize: 13, color: 'var(--on-surface-variant)', maxWidth: 420, lineHeight: 1.5 }}>
        {body}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Chip — status / tag pill. Every tone resolves to tokens so light
 * mode never lands light text on a light surface.
 * ------------------------------------------------------------------ */
export type ChipTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger' | 'primary';

const CHIP_PALETTE: Record<ChipTone, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--surface-container-high)', fg: 'var(--on-surface-variant)' },
  info: { bg: 'var(--secondary-container)', fg: 'var(--secondary)' },
  success: { bg: 'var(--tertiary-container)', fg: 'var(--on-tertiary)' },
  warn: { bg: 'rgba(255,222,89,0.14)', fg: 'var(--tertiary-container)' },
  danger: { bg: 'rgba(253,111,133,0.14)', fg: 'var(--error)' },
  primary: { bg: 'rgba(174,137,255,0.14)', fg: 'var(--primary)' },
};

export function Chip({ label, tone = 'neutral', title }: { label: string; tone?: ChipTone; title?: string }) {
  const c = CHIP_PALETTE[tone];
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 9px',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        borderRadius: 'var(--radius-full)',
        background: c.bg,
        color: c.fg,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Stat tile — labelled metric. Used by the stats overview + page
 * headers across the console.
 * ------------------------------------------------------------------ */
export function StatTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: 'var(--surface-container)',
        border: `1px solid ${accent ? 'var(--primary)' : 'var(--outline-variant)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', letterSpacing: '0.02em' }}>{label}</span>
      <span
        className="font-display"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: accent ? 'var(--primary)' : 'var(--on-surface)',
          lineHeight: 1.1,
        }}
      >
        {value}
      </span>
      {hint ? <span style={{ fontSize: 11.5, color: 'var(--on-surface-variant)' }}>{hint}</span> : null}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(180px, 100%), 1fr))',
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * DataTable — semantic <table> in a horizontally-scrollable shell so
 * dense columns never force the page to scroll on mobile.
 * ------------------------------------------------------------------ */
export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: string | number;
};

const TH_STYLE: CSSProperties = {
  textAlign: 'left',
  padding: '10px 14px',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--on-surface-variant)',
  borderBottom: '1px solid var(--outline-variant)',
  whiteSpace: 'nowrap',
  position: 'sticky',
  top: 0,
  background: 'var(--surface-container-low)',
  zIndex: 1,
};

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
}) {
  return (
    <div
      className="custom-scrollbar"
      style={{
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        overflowX: 'auto',
        background: 'var(--surface-container)',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ ...TH_STYLE, textAlign: c.align ?? 'left', width: c.width }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)} className="adm-row">
              {columns.map((c) => (
                <td
                  key={c.key}
                  style={{
                    padding: '11px 14px',
                    borderBottom: '1px solid var(--outline-variant)',
                    color: 'var(--on-surface)',
                    textAlign: c.align ?? 'left',
                    verticalAlign: 'middle',
                  }}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Search input — reuses the project's global `ns-input` focus styling.
 * ------------------------------------------------------------------ */
export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 180, maxWidth: 360 }}>
      <span
        className="material-symbols-outlined"
        aria-hidden
        style={{
          position: 'absolute',
          left: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 18,
          color: 'var(--on-surface-variant)',
          pointerEvents: 'none',
        }}
      >
        search
      </span>
      <input
        className="ns-input"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        style={{ width: '100%', padding: '9px 12px 9px 34px', fontSize: 14 }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Action button — full 8-state contract. Pseudo-states live in
 * <AdminConsoleStyles/>; this sets the base token colours + loading.
 * ------------------------------------------------------------------ */
export function ActionButton({
  children,
  onClick,
  icon,
  tone = 'neutral',
  loading = false,
  disabled = false,
  size = 'md',
  title,
}: {
  children?: ReactNode;
  onClick?: () => void;
  icon?: string;
  tone?: 'neutral' | 'danger' | 'primary';
  loading?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
  title?: string;
}) {
  const cls =
    tone === 'danger' ? 'adm-btn adm-btn-danger' : tone === 'primary' ? 'adm-btn adm-btn-primary' : 'adm-btn';
  const pad = size === 'sm' ? '5px 10px' : '8px 14px';
  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: pad,
        fontSize: size === 'sm' ? 12.5 : 13.5,
        fontWeight: 600,
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--outline-variant)',
        background: 'var(--surface-container-high)',
        color: 'var(--on-surface)',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        className="material-symbols-outlined"
        aria-hidden
        style={{
          fontSize: size === 'sm' ? 16 : 18,
          ...(loading ? { animation: 'adm-spin 0.8s linear infinite' } : null),
        }}
      >
        {loading ? 'progress_activity' : icon}
      </span>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Paginator — prev / next with a "showing N of M" readout.
 * ------------------------------------------------------------------ */
export function Paginator({
  page,
  totalPages,
  total,
  shown,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  shown: number;
  onPage: (p: number) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0 }} aria-live="polite">
        Showing {shown} of {total}
      </p>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button
          type="button"
          className="adm-btn"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          style={pageBtnStyle}
        >
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>
            chevron_left
          </span>
        </button>
        <span style={{ fontSize: 12.5, color: 'var(--on-surface-variant)', minWidth: 72, textAlign: 'center' }}>
          Page {page} / {Math.max(1, totalPages)}
        </span>
        <button
          type="button"
          className="adm-btn"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          style={pageBtnStyle}
        >
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>
            chevron_right
          </span>
        </button>
      </div>
    </div>
  );
}

const pageBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 34,
  height: 34,
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--outline-variant)',
  background: 'var(--surface-container-high)',
  color: 'var(--on-surface)',
  cursor: 'pointer',
};

/* ------------------------------------------------------------------ *
 * Modal — backdrop + centered dialog. Escape closes; backdrop click
 * closes; content click is stopped. Used for confirms + editors across
 * the console. The adm-fade keyframe lives in <AdminConsoleStyles/>.
 * ------------------------------------------------------------------ */
export function Modal({
  title,
  onClose,
  children,
  maxWidth = 440,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        animation: `adm-fade 0.18s ${EASE}`,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth,
          background: 'var(--surface-container-high)',
          border: '1px solid var(--outline-variant)',
          borderRadius: 'var(--radius-xl)',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        <h2
          className="font-display"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            margin: 0,
            color: 'var(--on-surface)',
          }}
        >
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>{children}</div>;
}

/* ------------------------------------------------------------------ *
 * Console-wide interactive states — mounted once by the admin layout.
 * Inline styles can't express :hover / :focus-visible / :active, so the
 * pseudo-state layer lives here. Reduced-motion strips the transforms.
 * ------------------------------------------------------------------ */
export function AdminConsoleStyles() {
  return (
    <style>{`
      @keyframes adm-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes adm-fade { from { opacity: 0; } to { opacity: 1; } }
      .adm-btn { transition: background-color 0.15s, color 0.15s, border-color 0.15s, transform 0.15s ${EASE}; }
      .adm-btn:hover:not(:disabled) { background: var(--surface-bright); }
      .adm-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
      .adm-btn:active:not(:disabled) { transform: translateY(1px); }
      .adm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .adm-btn-danger:hover:not(:disabled) { background: var(--error); color: var(--on-error); border-color: var(--error); }
      .adm-btn-danger:focus-visible { outline-color: var(--error); }
      .adm-btn-primary { background: var(--primary); color: var(--on-primary); border-color: var(--primary); }
      .adm-btn-primary:hover:not(:disabled) { background: var(--primary-dim); border-color: var(--primary-dim); }
      .adm-row { transition: background-color 0.15s; }
      .adm-row:hover { background: var(--surface-container-high); }
      .adm-cardlink { transition: background-color 0.15s, border-color 0.15s, transform 0.2s ${EASE}; }
      .adm-cardlink:hover { background: var(--surface-container-high); border-color: var(--primary); }
      .adm-cardlink:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
      .adm-cardlink:active { transform: translateY(1px); }
      @media (prefers-reduced-motion: reduce) {
        .adm-btn, .adm-cardlink, .adm-row { transition: none; }
        .adm-btn:active, .adm-cardlink:active { transform: none; }
        .material-symbols-outlined { animation: none !important; }
      }
    `}</style>
  );
}
