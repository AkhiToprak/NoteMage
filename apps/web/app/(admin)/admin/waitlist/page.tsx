/* Hallmark · component-scope · utilitarian · theme: project design system
 * Waitlist table — was a raw-JSON link on the dashboard. Lists subscribers
 * (paginated) and surfaces the existing "send launch announcement" blast
 * behind a deliberate two-step confirm (it emails every subscriber).
 */
'use client';

import { useState } from 'react';
import {
  AdminHeader,
  DataTable,
  EmptyShell,
  Paginator,
  ActionButton,
  useAdminData,
  type Column,
} from '../_components/ui';

type Subscriber = { id: string; email: string; createdAt: string };
type WaitlistData = {
  subscribers: Subscriber[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const LIMIT = 50;

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AdminWaitlistPage() {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useAdminData<WaitlistData>(`/api/admin/waitlist?page=${page}&limit=${LIMIT}`);

  // Launch-announcement blast — guarded two-step because POST emails everyone.
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function sendAnnouncement() {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/waitlist', { method: 'POST' });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || `Failed (${res.status})`);
      setResult({ ok: true, msg: json.message || 'Announcement queued.' });
    } catch (err) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : 'Failed to send.' });
    } finally {
      setSending(false);
      setConfirming(false);
    }
  }

  const columns: Column<Subscriber>[] = [
    { key: 'email', header: 'Email', render: (r) => <span style={{ fontWeight: 500 }}>{r.email}</span> },
    {
      key: 'createdAt',
      header: 'Joined',
      align: 'right',
      render: (r) => <span style={{ color: 'var(--on-surface-variant)' }}>{fmtDate(r.createdAt)}</span>,
    },
  ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <AdminHeader
        eyebrow="Growth"
        title="Waitlist"
        description="Everyone who signed up before launch. The announcement blast emails every subscriber — use it once."
        actions={
          confirming ? (
            <>
              <ActionButton icon="close" onClick={() => setConfirming(false)} disabled={sending}>
                Cancel
              </ActionButton>
              <ActionButton icon="send" tone="primary" onClick={sendAnnouncement} loading={sending}>
                Confirm send
              </ActionButton>
            </>
          ) : (
            <ActionButton
              icon="campaign"
              onClick={() => setConfirming(true)}
              disabled={!data || data.total === 0}
            >
              Send launch announcement
            </ActionButton>
          )
        }
      />

      {result ? (
        <div
          role={result.ok ? 'status' : 'alert'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            border: `1px solid ${result.ok ? 'var(--outline-variant)' : 'var(--error)'}`,
            background: 'var(--surface-container)',
            color: result.ok ? 'var(--on-surface)' : 'var(--error)',
            fontSize: 13,
          }}
        >
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>
            {result.ok ? 'check_circle' : 'error'}
          </span>
          {result.msg}
        </div>
      ) : null}

      {error ? (
        <EmptyShell icon="error" title="Couldn’t load the waitlist" body={`The request failed (${error}). Refresh to retry.`} />
      ) : loading && !data ? (
        <EmptyShell icon="hourglass_empty" title="Loading subscribers" body="Pulling the waitlist." />
      ) : !data || data.subscribers.length === 0 ? (
        <EmptyShell icon="inbox" title="No subscribers yet" body="Waitlist signups will appear here." />
      ) : (
        <>
          <DataTable columns={columns} rows={data.subscribers} getRowKey={(r) => r.id} />
          <Paginator
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            shown={data.subscribers.length}
            onPage={setPage}
          />
        </>
      )}
    </div>
  );
}
