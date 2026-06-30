/* Hallmark · component-scope · utilitarian · theme: project design system
 * Platform stats overview — relocated from the Settings admin section into
 * the /admin console. Read-only metrics from /api/admin/stats.
 */
'use client';

import {
  AdminHeader,
  StatGrid,
  StatTile,
  EmptyShell,
  ActionButton,
  DataTable,
  useAdminData,
  type Column,
} from '../_components/ui';

type FeatureUsage = {
  feature: string;
  tokens: number;
  costUsd: number;
  calls: number;
};

type Stats = {
  totalUsers: number;
  freeUsers: number;
  proUsers: number;
  avgWeeklyTokensPerUser: number;
  weeklyTokensTotal: number;
  weeklyCostUsd: number;
  usageByFeature: FeatureUsage[];
  totalRevenue: number;
  waitlistCount: number;
};

const fmt = (n: number | undefined) => (n == null ? '—' : n.toLocaleString());

// USD with cents — token costs are small, so show 4 decimals under $1.
const fmtUsd = (n: number | undefined) =>
  n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 })}`;

// Human labels for the stable feature keys logAiUsage() writes.
const FEATURE_LABELS: Record<string, string> = {
  'chat-plain': 'Chat',
  'chat-generate': 'Chat — generation',
  'path-structure': 'Path — structure',
  'path-generate': 'Path — content',
  'page-generate': 'Page generate',
  'pdf-import': 'PDF import',
  'path-classify': 'Path classifier',
  'chat-title': 'Chat titles',
  essay: 'Essay check',
  'doc-summarize': 'Doc summarize',
};
const featureLabel = (key: string) => FEATURE_LABELS[key] ?? key;

const FEATURE_COLUMNS: Column<FeatureUsage>[] = [
  { key: 'feature', header: 'Feature', render: (r) => featureLabel(r.feature) },
  { key: 'tokens', header: 'Tokens', align: 'right', render: (r) => r.tokens.toLocaleString() },
  { key: 'calls', header: 'Calls', align: 'right', render: (r) => r.calls.toLocaleString() },
  { key: 'costUsd', header: 'Cost (USD)', align: 'right', render: (r) => fmtUsd(r.costUsd) },
];

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
              <StatTile
                label="Weekly tokens"
                value={fmt(data.weeklyTokensTotal)}
                hint="All AI features, last 7 days"
              />
              <StatTile
                label="Weekly cost"
                value={fmtUsd(data.weeklyCostUsd)}
                hint="Computed from per-model rates"
                accent
              />
              <StatTile
                label="Avg tokens / user"
                value={fmt(data.avgWeeklyTokensPerUser)}
                hint="Weekly total ÷ all users"
              />
            </StatGrid>

            {data.usageByFeature.length > 0 ? (
              <DataTable<FeatureUsage>
                columns={FEATURE_COLUMNS}
                rows={data.usageByFeature}
                getRowKey={(r) => r.feature}
              />
            ) : (
              <EmptyShell
                icon="bar_chart"
                title="No AI usage yet"
                body="Token usage appears here as AI features are used. The ledger fills from the moment it's deployed — expect the rolling 7-day window to populate within a week."
              />
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
