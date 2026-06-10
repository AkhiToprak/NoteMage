'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useBreakpoint } from '@/hooks/useBreakpoint';

/**
 * Admin tickets queue (P6).
 *
 * Read-only by design — approve / reject buttons land in P7. The job here
 * is: surface the open queue, sorted oldest-open-first (AC-Admin-2), with
 * enough SharedPath context to triage at-a-glance before drilling into the
 * detail page.
 */

type TicketSharedPathSummary = {
  id: string;
  title: string;
  language: string;
  phaseCount: number;
  slotCount: number;
  moderationStatus: string;
  seeded: boolean;
  sharedBy: { id: string; username: string | null; avatarUrl: string | null } | null;
} | null;

type TicketListItem = {
  id: string;
  type: string;
  refType: string;
  refId: string;
  status: string;
  assigneeId: string | null;
  createdAt: string;
  updatedAt: string;
  sharedPath: TicketSharedPathSummary;
};

type ListResponse = {
  tickets: TicketListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
];

export default function AdminTicketsPage() {
  const { isPhone } = useBreakpoint();
  const [status, setStatus] = useState<string>('open');
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    // IIFE keeps the dep-change "reset" setStates out of the synchronous
    // effect body (React Compiler `set-state-in-effect` rule). Same
    // visible behaviour as the .then-chain.
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/tickets?status=${encodeURIComponent(status)}&limit=50`
        );
        if (!res.ok) throw new Error(`tickets ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setData(json?.data as ListResponse);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'failed');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p
          style={{
            fontSize: 12,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--on-surface-variant)',
            margin: 0,
          }}
        >
          Moderation
        </p>
        <h1
          className="font-display"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: isPhone ? 26 : 32,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            margin: 0,
            color: 'var(--on-surface)',
          }}
        >
          Tickets
        </h1>
        <p
          style={{
            fontSize: 14,
            color: 'var(--on-surface-variant)',
            margin: 0,
            maxWidth: 580,
            lineHeight: 1.55,
          }}
        >
          Layer-3 escalations from the auto-moderation pipeline. Oldest first. Drill into a row to see the full audit chain.
        </p>
      </header>

      <nav
        aria-label="Filter by status"
        className="custom-scrollbar"
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 2,
        }}
      >
        {STATUS_FILTERS.map((f) => {
          const active = f.value === status;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatus(f.value)}
              aria-pressed={active}
              style={{
                padding: '7px 14px',
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                background: active ? 'var(--surface-container-high)' : 'var(--surface-container)',
                color: active ? 'var(--on-surface)' : 'var(--on-surface-variant)',
                border: '1px solid var(--outline-variant)',
                borderRadius: 'var(--radius-full)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'background-color 0.2s, color 0.2s',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </nav>

      <TicketList loading={loading} error={error} data={data} isPhone={isPhone} />
    </div>
  );
}

function TicketList({
  loading,
  error,
  data,
  isPhone,
}: {
  loading: boolean;
  error: string | null;
  data: ListResponse | null;
  isPhone: boolean;
}) {
  if (error) {
    return (
      <EmptyShell
        icon="error"
        title="Couldn’t load tickets"
        body={`The /api/admin/tickets request failed (${error}). Refresh to retry.`}
      />
    );
  }
  if (loading) {
    return (
      <EmptyShell
        icon="hourglass_empty"
        title="Loading tickets"
        body="Pulling the latest queue from the moderation pipeline."
      />
    );
  }
  if (!data || data.tickets.length === 0) {
    return (
      <EmptyShell
        icon="check_circle"
        title="No tickets in this state"
        body="Layer-3 escalations land here. An empty queue is the happy path."
      />
    );
  }

  return (
    <>
      <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0 }}>
        Showing {data.tickets.length} of {data.total}
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.tickets.map((t) => (
          <li key={t.id}>
            <TicketRow ticket={t} isPhone={isPhone} />
          </li>
        ))}
      </ul>
    </>
  );
}

function TicketRow({ ticket, isPhone }: { ticket: TicketListItem; isPhone: boolean }) {
  const path = ticket.sharedPath;
  const daysOpen = computeDaysSince(ticket.createdAt);
  const authorLabel = path?.sharedBy?.username || 'unknown';

  return (
    <Link
      href={`/admin/tickets/${ticket.id}`}
      style={{
        display: 'flex',
        flexDirection: isPhone ? 'column' : 'row',
        alignItems: isPhone ? 'stretch' : 'center',
        gap: isPhone ? 8 : 16,
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        padding: isPhone ? '14px 16px' : '14px 18px',
        textDecoration: 'none',
        color: 'var(--on-surface)',
        transition: 'background-color 0.2s, transform 0.2s cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: 22, color: 'var(--primary)', flexShrink: 0 }}
        aria-hidden
      >
        flag
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
        <span
          className="font-display"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: 'var(--on-surface)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {path?.title ?? '(path missing)'}
        </span>
        <span
          style={{
            fontSize: 13,
            color: 'var(--on-surface-variant)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <span>by @{authorLabel}</span>
          <span aria-hidden style={{ color: 'var(--outline)' }}>·</span>
          <span>{path?.language?.toUpperCase() ?? '—'}</span>
          {path ? (
            <>
              <span aria-hidden style={{ color: 'var(--outline)' }}>·</span>
              <span>{path.phaseCount} phases · {path.slotCount} slots</span>
            </>
          ) : null}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <StatusChip status={ticket.status} />
        <AgeChip days={daysOpen} />
      </div>
    </Link>
  );
}

function StatusChip({ status }: { status: string }) {
  // Status-driven chip palette — every color references a token so light
  // mode auto-flips (no hardcoded light text on a light surface).
  const palette: Record<string, { bg: string; fg: string }> = {
    open: { bg: 'var(--tertiary-container)', fg: 'var(--on-tertiary)' },
    assigned: { bg: 'var(--secondary-container)', fg: 'var(--secondary)' },
    resolved: { bg: 'var(--surface-container-high)', fg: 'var(--on-surface-variant)' },
    dismissed: { bg: 'var(--surface-container-high)', fg: 'var(--on-surface-variant)' },
  };
  const colors = palette[status] ?? palette.open;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        borderRadius: 'var(--radius-full)',
        background: colors.bg,
        color: colors.fg,
      }}
    >
      {status}
    </span>
  );
}

function AgeChip({ days }: { days: number }) {
  const label = days === 0 ? 'today' : days === 1 ? '1 day' : `${days} days`;
  return (
    <span
      style={{
        fontSize: 12,
        color: 'var(--on-surface-variant)',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function EmptyShell({ icon, title, body }: { icon: string; title: string; body: string }) {
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
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 17,
          fontWeight: 600,
          color: 'var(--on-surface)',
        }}
      >
        {title}
      </span>
      <span
        style={{
          fontSize: 13,
          color: 'var(--on-surface-variant)',
          maxWidth: 420,
          lineHeight: 1.5,
        }}
      >
        {body}
      </span>
    </div>
  );
}

function computeDaysSince(iso: string): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  const elapsed = Date.now() - t;
  return Math.max(0, Math.floor(elapsed / (24 * 60 * 60 * 1000)));
}
