/* Hallmark · component-scope · utilitarian · theme: project design system
 * Platform stats overview — relocated from the Settings admin section into
 * the /admin console. Read-only metrics from /api/admin/stats.
 */
'use client';

import { AdminHeader, StatGrid, StatTile, EmptyShell, ActionButton, useAdminData } from '../_components/ui';

type Stats = {
  totalUsers: number;
  freeUsers: number;
  proUsers: number;
  avgWeeklyTokensPerUser: number;
  weeklyTokensTotal: number;
  totalRevenue: number;
  waitlistCount: number;
};

const fmt = (n: number | undefined) => (n == null ? '—' : n.toLocaleString());

export default function AdminStatsPage() {
  const { data, loading, error, reload } = useAdminData<Stats>('/api/admin/stats');

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <AdminHeader
        eyebrow="Platform"
        title="Stats"
        description="Headcount, tier split, and the rolling 7-day AI-token spend. Estimates only — billing is the source of truth for revenue."
        actions={
          <ActionButton icon="refresh" onClick={reload} loading={loading}>
            Refresh
          </ActionButton>
        }
      />

      {error ? (
        <EmptyShell icon="error" title="Couldn’t load stats" body={`The /api/admin/stats request failed (${error}). Refresh to retry.`} />
      ) : loading && !data ? (
        <EmptyShell icon="hourglass_empty" title="Loading stats" body="Aggregating platform metrics." />
      ) : data ? (
        <>
          <StatGrid>
            <StatTile label="Total users" value={fmt(data.totalUsers)} />
            <StatTile label="Free users" value={fmt(data.freeUsers)} />
            <StatTile label="Pro users" value={fmt(data.proUsers)} accent />
            <StatTile label="Est. MRR" value={`${fmt(data.totalRevenue)} CHF`} hint="Pro headcount × monthly price" />
            <StatTile label="Waitlist" value={fmt(data.waitlistCount)} />
          </StatGrid>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p
              style={{
                fontSize: 12,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--on-surface-variant)',
                margin: '4px 0 0',
              }}
            >
              AI usage (last 7 days)
            </p>
            <StatGrid>
              <StatTile label="Weekly tokens" value={fmt(data.weeklyTokensTotal)} hint="Chat tokens, last 7 days" />
              <StatTile
                label="Avg tokens / user"
                value={fmt(data.avgWeeklyTokensPerUser)}
                hint="Weekly total ÷ all users"
              />
            </StatGrid>
          </div>
        </>
      ) : null}
    </div>
  );
}
