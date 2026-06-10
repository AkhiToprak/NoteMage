/* Hallmark · component-scope · utilitarian · theme: project design system
 * Community-paths oversight — every published path across all moderation
 * states, with the author's publish-trust score, open-report count, and a
 * guarded force-unpublish. Approve/reject for flagged paths still runs
 * through the tickets queue; this is the at-a-glance pipeline view.
 */
'use client';

import { useEffect, useState } from 'react';
import {
  AdminHeader,
  DataTable,
  EmptyShell,
  Paginator,
  SearchInput,
  ActionButton,
  Chip,
  Modal,
  ModalActions,
  useAdminData,
  type Column,
  type ChipTone,
} from '../_components/ui';

type PathRow = {
  shareId: string;
  title: string;
  language: string;
  subjects: string[];
  moderationStatus: string;
  seeded: boolean;
  downloadCount: number;
  viewCount: number;
  ratingAverage: number | null;
  ratingCount: number;
  phaseCount: number;
  slotCount: number;
  createdAt: string;
  approvedAt: string | null;
  author: { id: string; username: string | null; name: string | null; publishTrustScore: number };
  openReportCount: number;
};

type PathsData = {
  paths: PathRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const LIMIT = 25;

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'approved', label: 'Approved' },
  { value: 'flagged_pending_human', label: 'Needs review' },
  { value: 'pending', label: 'Pending' },
  { value: 'auditing_l2', label: 'Auditing (L2)' },
  { value: 'auditing_l3', label: 'Auditing (L3)' },
  { value: 'rejected', label: 'Rejected' },
];

const STATUS_META: Record<string, { label: string; tone: ChipTone }> = {
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  flagged_pending_human: { label: 'Needs review', tone: 'warn' },
  pending: { label: 'Pending', tone: 'neutral' },
  auditing_l2: { label: 'Auditing L2', tone: 'info' },
  auditing_l3: { label: 'Auditing L3', tone: 'info' },
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AdminPathsPage() {
  const [status, setStatus] = useState('all');
  const [reportedOnly, setReportedOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const url = `/api/admin/paths?status=${status}&page=${page}&limit=${LIMIT}${
    query ? `&search=${encodeURIComponent(query)}` : ''
  }${reportedOnly ? '&reported=true' : ''}`;
  const { data, loading, error, reload } = useAdminData<PathsData>(url);

  const [unpublishTarget, setUnpublishTarget] = useState<PathRow | null>(null);
  const [unpublishing, setUnpublishing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function confirmUnpublish() {
    if (!unpublishTarget) return;
    setUnpublishing(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/community/paths/${unpublishTarget.shareId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || `Failed (${res.status})`);
      }
      setUnpublishTarget(null);
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to unpublish');
    } finally {
      setUnpublishing(false);
    }
  }

  const columns: Column<PathRow>[] = [
    {
      key: 'path',
      header: 'Path',
      render: (p) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, maxWidth: 360 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span
              style={{
                fontWeight: 600,
                color: 'var(--on-surface)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 280,
              }}
              title={p.title}
            >
              {p.title}
            </span>
            {p.seeded ? <Chip label="Seeded" tone="primary" /> : null}
          </span>
          <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
            {p.language.toUpperCase()} · {p.phaseCount} phases · {p.slotCount} slots
          </span>
        </div>
      ),
    },
    {
      key: 'author',
      header: 'Author',
      render: (p) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--on-surface)' }}>
            @{p.author.username || 'unknown'}
          </span>
          <Chip
            label={`trust ${p.author.publishTrustScore}`}
            tone={p.author.publishTrustScore >= 2 ? 'success' : 'neutral'}
            title="Publish-trust score (≥2 = trusted, fast-pathed through L2)"
          />
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => {
        const m = STATUS_META[p.moderationStatus] ?? { label: p.moderationStatus, tone: 'neutral' as ChipTone };
        return <Chip label={m.label} tone={m.tone} />;
      },
    },
    {
      key: 'signals',
      header: 'Signals',
      align: 'right',
      render: (p) => (
        <span style={{ fontSize: 12.5, color: 'var(--on-surface-variant)', whiteSpace: 'nowrap' }}>
          {p.downloadCount} ⬇ · {p.viewCount} 👁
          {p.ratingCount > 0 && p.ratingAverage != null ? ` · ${p.ratingAverage.toFixed(1)}★` : ''}
        </span>
      ),
    },
    {
      key: 'reports',
      header: 'Reports',
      align: 'right',
      render: (p) =>
        p.openReportCount > 0 ? (
          <Chip label={`${p.openReportCount} open`} tone="danger" />
        ) : (
          <span style={{ fontSize: 12.5, color: 'var(--outline)' }}>0</span>
        ),
    },
    {
      key: 'created',
      header: 'Created',
      align: 'right',
      render: (p) => (
        <span style={{ color: 'var(--on-surface-variant)', whiteSpace: 'nowrap' }}>{fmtDate(p.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (p) => (
        <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
          {p.moderationStatus === 'approved' ? (
            <a
              className="adm-btn"
              href={`/learn/community/${p.shareId}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in community library (new tab)"
              title="Open in community library"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                fontSize: 12.5,
                fontWeight: 600,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--outline-variant)',
                background: 'var(--surface-container-high)',
                color: 'var(--on-surface)',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16 }}>
                open_in_new
              </span>
              View
            </a>
          ) : null}
          <ActionButton
            size="sm"
            tone="danger"
            icon="unpublished"
            onClick={() => {
              setActionError(null);
              setUnpublishTarget(p);
            }}
            title="Force-unpublish"
          >
            Unpublish
          </ActionButton>
        </div>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <AdminHeader
        eyebrow="Moderation"
        title="Community paths"
        description="Every published path across all moderation states. Force-unpublish takes a path down and dismisses its open tickets — approve/reject for flagged paths runs through the Tickets queue."
      />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search path titles" />
        <select
          className="ns-input"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by moderation status"
          style={{ padding: '9px 12px', fontSize: 14, minWidth: 160 }}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="adm-btn"
          aria-pressed={reportedOnly}
          onClick={() => {
            setReportedOnly((v) => !v);
            setPage(1);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            fontSize: 13.5,
            fontWeight: 600,
            borderRadius: 'var(--radius-md)',
            border: `1px solid ${reportedOnly ? 'var(--error)' : 'var(--outline-variant)'}`,
            background: reportedOnly ? 'rgba(253,111,133,0.14)' : 'var(--surface-container-high)',
            color: reportedOnly ? 'var(--error)' : 'var(--on-surface)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16 }}>
            flag
          </span>
          Reported only
        </button>
      </div>

      {error ? (
        <EmptyShell icon="error" title="Couldn’t load paths" body={`The request failed (${error}). Refresh to retry.`} />
      ) : loading && !data ? (
        <EmptyShell icon="hourglass_empty" title="Loading paths" body="Pulling the publication pipeline." />
      ) : !data || data.paths.length === 0 ? (
        <EmptyShell
          icon="travel_explore"
          title="No paths match"
          body={query || reportedOnly || status !== 'all' ? 'Try a different filter.' : 'No paths have been published yet.'}
        />
      ) : (
        <>
          <DataTable columns={columns} rows={data.paths} getRowKey={(p) => p.shareId} />
          <Paginator
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            shown={data.paths.length}
            onPage={setPage}
          />
        </>
      )}

      {unpublishTarget ? (
        <Modal title="Force-unpublish path?" onClose={() => (unpublishing ? undefined : setUnpublishTarget(null))}>
          <p style={{ fontSize: 13.5, color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.55 }}>
            <strong style={{ color: 'var(--on-surface)' }}>{unpublishTarget.title}</strong> by @
            {unpublishTarget.author.username || 'unknown'} will be removed from the library. Open tickets are
            auto-dismissed and the action is logged to the admin audit trail. Existing clones are unaffected.
          </p>
          {actionError ? (
            <div role="alert" style={{ fontSize: 12.5, color: 'var(--error)' }}>
              {actionError}
            </div>
          ) : null}
          <ModalActions>
            <ActionButton icon="close" onClick={() => setUnpublishTarget(null)} disabled={unpublishing}>
              Cancel
            </ActionButton>
            <ActionButton icon="unpublished" tone="danger" onClick={confirmUnpublish} loading={unpublishing}>
              Unpublish
            </ActionButton>
          </ModalActions>
        </Modal>
      ) : null}
    </div>
  );
}
