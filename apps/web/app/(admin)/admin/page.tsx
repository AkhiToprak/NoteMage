'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useBreakpoint } from '@/hooks/useBreakpoint';

/**
 * Admin dashboard home (P6). Consolidates /api/admin/stats and the new
 * /api/admin/tickets count into a single landing surface; nav into deeper
 * admin work happens via the layout strip and the CTA cards below.
 *
 * P6 scope: read-only at-a-glance overview + a CTA to the tickets queue.
 * No decision-making UI here (P7).
 */

type Stats = {
  totalUsers: number;
  freeUsers: number;
  proUsers: number;
  avgWeeklyTokensPerUser: number;
  weeklyTokensTotal: number;
  totalRevenue: number;
  waitlistCount: number;
};

export default function AdminDashboardPage() {
  const { isPhone } = useBreakpoint();
  const [stats, setStats] = useState<Stats | null>(null);
  const [openTicketCount, setOpenTicketCount] = useState<number | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [ticketsError, setTicketsError] = useState<string | null>(null);

  // Independent fetches so a 5xx on one surface doesn't blank both.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/stats')
      .then(async (res) => {
        if (!res.ok) throw new Error(`stats ${res.status}`);
        const json = await res.json();
        return json?.data as Stats;
      })
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'failed';
          setStatsError(msg);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Pass limit=1 — we only want the `total` envelope value, not the rows.
    fetch('/api/admin/tickets?status=open&limit=1')
      .then(async (res) => {
        if (!res.ok) throw new Error(`tickets ${res.status}`);
        const json = await res.json();
        return json?.data?.total as number;
      })
      .then((count) => {
        if (!cancelled) setOpenTicketCount(typeof count === 'number' ? count : 0);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'failed';
          setTicketsError(msg);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>
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
          Admin
        </p>
        <h1
          className="font-display"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: isPhone ? 28 : 36,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            margin: 0,
            color: 'var(--on-surface)',
          }}
        >
          Dashboard
        </h1>
        <p
          style={{
            fontSize: 14,
            color: 'var(--on-surface-variant)',
            margin: 0,
            maxWidth: 560,
            lineHeight: 1.55,
          }}
        >
          At-a-glance state of the platform plus the queue of community-path tickets waiting on a human decision.
        </p>
      </header>

      <section
        aria-label="Platform stats"
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: isPhone
            ? 'repeat(2, minmax(0, 1fr))'
            : 'repeat(auto-fit, minmax(180px, 1fr))',
        }}
      >
        <StatTile
          label="Total users"
          value={fmtNum(stats?.totalUsers)}
          loading={!stats && !statsError}
          error={statsError}
        />
        <StatTile
          label="Free users"
          value={fmtNum(stats?.freeUsers)}
          loading={!stats && !statsError}
          error={statsError}
        />
        <StatTile
          label="Pro users"
          value={fmtNum(stats?.proUsers)}
          loading={!stats && !statsError}
          error={statsError}
        />
        <StatTile
          label="Waitlist"
          value={fmtNum(stats?.waitlistCount)}
          loading={!stats && !statsError}
          error={statsError}
        />
        <StatTile
          label="Open tickets"
          value={fmtNum(openTicketCount)}
          loading={openTicketCount === null && !ticketsError}
          error={ticketsError}
          accent={openTicketCount && openTicketCount > 0 ? 'warning' : 'neutral'}
        />
        <StatTile
          label="Weekly AI tokens"
          value={fmtNum(stats?.weeklyTokensTotal)}
          loading={!stats && !statsError}
          error={statsError}
        />
      </section>

      <section
        aria-label="Admin sections"
        style={{
          display: 'grid',
          gap: 14,
          gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fit, minmax(260px, 1fr))',
        }}
      >
        <NavCard
          href="/admin/tickets"
          icon="inbox"
          title="Moderation tickets"
          description="Open and historical moderation tickets. Layer 3 escalations land here."
          badgeCount={openTicketCount ?? undefined}
          badgeKind={openTicketCount && openTicketCount > 0 ? 'warning' : 'neutral'}
        />
        <NavCard
          href="/api/admin/stats"
          icon="monitoring"
          title="Stats (JSON)"
          description="Raw platform metrics — the underlying endpoint, surfaced for spot checks."
        />
        <NavCard
          href="/api/admin/waitlist"
          icon="mark_email_unread"
          title="Waitlist (JSON)"
          description="Subscribers awaiting launch. UI table lands in a later phase."
        />
        <NavCard
          href="/api/admin/users"
          icon="group"
          title="Users (JSON)"
          description="User directory. Ban / role-change actions stay on the existing API for now."
        />
      </section>
    </div>
  );
}

// ── small components ──────────────────────────────────────────────────────

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString();
}

function StatTile({
  label,
  value,
  loading,
  error,
  accent = 'neutral',
}: {
  label: string;
  value: string;
  loading: boolean;
  error: string | null;
  accent?: 'neutral' | 'warning';
}) {
  return (
    <div
      style={{
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minHeight: 96,
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: 'var(--on-surface-variant)',
          letterSpacing: '0.02em',
        }}
      >
        {label}
      </span>
      {error ? (
        <span
          style={{
            fontSize: 13,
            color: 'var(--error)',
          }}
        >
          Failed to load
        </span>
      ) : loading ? (
        <span
          style={{
            fontSize: 13,
            color: 'var(--on-surface-variant)',
          }}
        >
          Loading…
        </span>
      ) : (
        <span
          className="font-display"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            fontWeight: 700,
            color: accent === 'warning' ? 'var(--warning)' : 'var(--on-surface)',
            letterSpacing: '-0.01em',
            lineHeight: 1.1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </span>
      )}
    </div>
  );
}

function NavCard({
  href,
  icon,
  title,
  description,
  badgeCount,
  badgeKind = 'neutral',
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
  badgeCount?: number;
  badgeKind?: 'neutral' | 'warning';
}) {
  // Card body kept identical across the Link/<a> branch below so styling is
  // a single source of truth. Internal admin routes use next/link; raw API
  // endpoints (the JSON spot-checks) fall through to a plain anchor.
  const cardStyle: React.CSSProperties = {
    background: 'var(--surface-container)',
    border: '1px solid var(--outline-variant)',
    borderRadius: 'var(--radius-lg)',
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    textDecoration: 'none',
    color: 'var(--on-surface)',
    transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1), background-color 0.2s',
  };

  const body = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 24, color: 'var(--primary)' }}
          aria-hidden
        >
          {icon}
        </span>
        {badgeCount !== undefined && badgeCount > 0 ? (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 'var(--radius-full)',
              background:
                badgeKind === 'warning'
                  ? 'var(--tertiary-container)'
                  : 'var(--surface-container-high)',
              color: badgeKind === 'warning' ? 'var(--on-tertiary)' : 'var(--on-surface-variant)',
            }}
          >
            {badgeCount.toLocaleString()}
          </span>
        ) : null}
      </div>
      <span
        className="font-display"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          color: 'var(--on-surface)',
        }}
      >
        {title}
      </span>
      <span
        style={{
          fontSize: 13,
          color: 'var(--on-surface-variant)',
          lineHeight: 1.5,
        }}
      >
        {description}
      </span>
    </>
  );

  if (href.startsWith('/admin')) {
    return (
      <Link href={href} style={cardStyle}>
        {body}
      </Link>
    );
  }
  return (
    <a href={href} style={cardStyle}>
      {body}
    </a>
  );
}
