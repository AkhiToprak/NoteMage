/* Hallmark · component-scope · utilitarian · theme: project design system
 * Users table — relocated from the Settings admin section into the /admin
 * console. Search + pagination + ban/unban + delete + cosmetics grant/revoke.
 * Admins and the signed-in admin's own row are non-actionable (the API
 * enforces this too; we hide the controls for clarity).
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
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
} from '../_components/ui';

type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  username: string;
  avatarUrl: string | null;
  role: string;
  banned: boolean;
  banReason: string | null;
  createdAt: string;
  notebookCount: number;
  postCount: number;
};

type UsersData = {
  users: AdminUserRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const LIMIT = 20;

// The only adminOnly cosmetics in the catalog — keep in sync with the catalog
// if a new adminOnly entry is added.
const GRANTABLE_COSMETICS: { id: string; label: string }[] = [
  { id: 'title.og-noter', label: 'Title: OG-Noter' },
  { id: 'title.tester', label: 'Title: Tester' },
  { id: 'font.minecraft', label: 'Font: Minecraft' },
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const selfId = (session?.user as { id?: string } | undefined)?.id;

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  // Debounce the search box into `query`; reset to page 1 on a new query.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const url = `/api/admin/users?page=${page}&limit=${LIMIT}${query ? `&search=${encodeURIComponent(query)}` : ''}`;
  const { data, loading, error, reload } = useAdminData<UsersData>(url);

  // Modal state
  const [banUser, setBanUser] = useState<AdminUserRow | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminUserRow | null>(null);
  const [cosmeticsUser, setCosmeticsUser] = useState<AdminUserRow | null>(null);
  const [pending, setPending] = useState<{ id: string; kind: string } | null>(null);

  async function mutate(id: string, kind: string, fn: () => Promise<Response>) {
    setPending({ id, kind });
    try {
      const res = await fn();
      if (res.ok) reload();
      return res.ok;
    } catch {
      return false;
    } finally {
      setPending(null);
    }
  }

  const banReasonRef = useRef('');

  async function confirmBan() {
    if (!banUser) return;
    const ok = await mutate(banUser.id, 'ban', () =>
      fetch(`/api/admin/users/${banUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ban', reason: banReasonRef.current.trim() || undefined }),
      })
    );
    if (ok) setBanUser(null);
  }

  async function unban(u: AdminUserRow) {
    await mutate(u.id, 'unban', () =>
      fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unban' }),
      })
    );
  }

  async function confirmDelete() {
    if (!deleteUser) return;
    const ok = await mutate(deleteUser.id, 'delete', () =>
      fetch(`/api/admin/users/${deleteUser.id}`, { method: 'DELETE' })
    );
    if (ok) setDeleteUser(null);
  }

  const columns: Column<AdminUserRow>[] = [
    {
      key: 'user',
      header: 'User',
      render: (u) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Avatar user={u} />
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, color: 'var(--on-surface)' }}>{u.name || u.username}</span>
              {u.role === 'admin' ? <Chip label="Admin" tone="warn" /> : null}
              {u.banned ? <Chip label="Banned" tone="danger" title={u.banReason || undefined} /> : null}
            </span>
            <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
              @{u.username} · {u.email}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'activity',
      header: 'Activity',
      align: 'right',
      render: (u) => (
        <span style={{ fontSize: 12.5, color: 'var(--on-surface-variant)', whiteSpace: 'nowrap' }}>
          {u.notebookCount} nb · {u.postCount} posts
        </span>
      ),
    },
    {
      key: 'joined',
      header: 'Joined',
      align: 'right',
      render: (u) => (
        <span style={{ color: 'var(--on-surface-variant)', whiteSpace: 'nowrap' }}>{fmtDate(u.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (u) => {
        // Admins and your own row are protected by the API; hide the controls.
        if (u.role === 'admin' || u.id === selfId) {
          return <span style={{ fontSize: 12, color: 'var(--outline)' }}>—</span>;
        }
        const rowBusy = pending?.id === u.id;
        return (
          <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
            <ActionButton
              size="sm"
              icon="auto_awesome"
              onClick={() => setCosmeticsUser(u)}
              disabled={rowBusy}
              title="Grant or revoke cosmetics"
            >
              Cosmetics
            </ActionButton>
            {u.banned ? (
              <ActionButton
                size="sm"
                icon="lock_open"
                onClick={() => unban(u)}
                loading={rowBusy && pending?.kind === 'unban'}
                disabled={rowBusy}
              >
                Unban
              </ActionButton>
            ) : (
              <ActionButton size="sm" icon="block" onClick={() => setBanUser(u)} disabled={rowBusy}>
                Ban
              </ActionButton>
            )}
            <ActionButton
              size="sm"
              tone="danger"
              icon="delete"
              onClick={() => setDeleteUser(u)}
              disabled={rowBusy}
              title="Delete user"
            />
          </div>
        );
      },
    },
  ];

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <AdminHeader
        eyebrow="People"
        title="Users"
        description="Every account. Search by name, username, or email. Bans, deletions, and cosmetic grants are logged to the admin audit trail."
      />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, username, or email" />
        {data ? (
          <span style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>{data.total} total</span>
        ) : null}
      </div>

      {error ? (
        <EmptyShell icon="error" title="Couldn’t load users" body={`The request failed (${error}). Refresh to retry.`} />
      ) : loading && !data ? (
        <EmptyShell icon="hourglass_empty" title="Loading users" body="Pulling the account list." />
      ) : !data || data.users.length === 0 ? (
        <EmptyShell
          icon="person_off"
          title="No users match"
          body={query ? `Nothing matches “${query}”.` : 'No accounts found.'}
        />
      ) : (
        <>
          <DataTable columns={columns} rows={data.users} getRowKey={(u) => u.id} />
          <Paginator
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            shown={data.users.length}
            onPage={setPage}
          />
        </>
      )}

      {/* Ban modal */}
      {banUser ? (
        <Modal title={`Ban @${banUser.username}`} onClose={() => setBanUser(null)}>
          <p style={{ fontSize: 13.5, color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.55 }}>
            They’ll be blocked from signing in. You can unban later. An optional reason is stored on the account.
          </p>
          <textarea
            className="ns-input"
            placeholder="Reason (optional)"
            aria-label="Ban reason"
            defaultValue=""
            onChange={(e) => (banReasonRef.current = e.target.value)}
            rows={3}
            style={{ width: '100%', resize: 'vertical', fontSize: 14, padding: '10px 12px' }}
          />
          <ModalActions>
            <ActionButton icon="close" onClick={() => setBanUser(null)} disabled={pending?.kind === 'ban'}>
              Cancel
            </ActionButton>
            <ActionButton
              icon="block"
              tone="danger"
              onClick={confirmBan}
              loading={pending?.kind === 'ban'}
            >
              Ban user
            </ActionButton>
          </ModalActions>
        </Modal>
      ) : null}

      {/* Delete confirm modal */}
      {deleteUser ? (
        <Modal title={`Delete @${deleteUser.username}?`} onClose={() => setDeleteUser(null)}>
          <p style={{ fontSize: 13.5, color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.55 }}>
            This permanently deletes the account and <strong style={{ color: 'var(--on-surface)' }}>all their data</strong>{' '}
            — notebooks, posts, paths. This cannot be undone.
          </p>
          <ModalActions>
            <ActionButton icon="close" onClick={() => setDeleteUser(null)} disabled={pending?.kind === 'delete'}>
              Cancel
            </ActionButton>
            <ActionButton
              icon="delete_forever"
              tone="danger"
              onClick={confirmDelete}
              loading={pending?.kind === 'delete'}
            >
              Delete permanently
            </ActionButton>
          </ModalActions>
        </Modal>
      ) : null}

      {/* Cosmetics modal */}
      {cosmeticsUser ? (
        <CosmeticsModal
          user={cosmeticsUser}
          onClose={() => setCosmeticsUser(null)}
          busy={pending?.id === cosmeticsUser.id && pending?.kind === 'cosmetic'}
          onGrant={(cid) =>
            mutate(cosmeticsUser.id, 'cosmetic', () =>
              fetch(`/api/admin/users/${cosmeticsUser.id}/cosmetics`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cosmeticId: cid }),
              })
            )
          }
          onRevoke={(cid) =>
            mutate(cosmeticsUser.id, 'cosmetic', () =>
              fetch(
                `/api/admin/users/${cosmeticsUser.id}/cosmetics?cosmeticId=${encodeURIComponent(cid)}`,
                { method: 'DELETE' }
              )
            )
          }
        />
      ) : null}
    </div>
  );
}

function Avatar({ user }: { user: AdminUserRow }) {
  const initial = (user.name || user.username || '?').charAt(0).toUpperCase();
  return user.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={user.avatarUrl}
      alt=""
      width={36}
      height={36}
      style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
    />
  ) : (
    <div
      aria-hidden
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        flexShrink: 0,
        background: user.banned ? 'var(--error)' : 'var(--primary)',
        color: user.banned ? 'var(--on-error)' : 'var(--on-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: 15,
      }}
    >
      {initial}
    </div>
  );
}

function CosmeticsModal({
  user,
  onClose,
  onGrant,
  onRevoke,
  busy,
}: {
  user: AdminUserRow;
  onClose: () => void;
  onGrant: (cosmeticId: string) => Promise<boolean>;
  onRevoke: (cosmeticId: string) => Promise<boolean>;
  busy: boolean;
}) {
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  async function run(cid: string, label: string, action: 'grant' | 'revoke') {
    setActiveId(cid);
    setFeedback(null);
    const ok = await (action === 'grant' ? onGrant(cid) : onRevoke(cid));
    setFeedback(
      ok
        ? { kind: 'ok', msg: `${action === 'grant' ? 'Granted' : 'Revoked'} ${label}` }
        : { kind: 'err', msg: `${action === 'grant' ? 'Grant' : 'Revoke'} failed` }
    );
    setActiveId(null);
  }

  return (
    <Modal title={`Cosmetics · @${user.username}`} onClose={onClose}>
      <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0 }}>
        Admin-only cosmetics. Grants notify the user; revokes also unequip if currently worn.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {GRANTABLE_COSMETICS.map((c) => (
          <div
            key={c.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--outline-variant)',
              background: 'var(--surface-container)',
            }}
          >
            <span style={{ fontSize: 13.5, color: 'var(--on-surface)' }}>{c.label}</span>
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <ActionButton
                size="sm"
                icon="add"
                tone="primary"
                onClick={() => run(c.id, c.label, 'grant')}
                loading={busy && activeId === c.id}
                disabled={busy}
              >
                Grant
              </ActionButton>
              <ActionButton
                size="sm"
                icon="remove"
                onClick={() => run(c.id, c.label, 'revoke')}
                loading={busy && activeId === c.id}
                disabled={busy}
              >
                Revoke
              </ActionButton>
            </span>
          </div>
        ))}
      </div>
      {feedback ? (
        <div
          role={feedback.kind === 'ok' ? 'status' : 'alert'}
          style={{ fontSize: 12.5, color: feedback.kind === 'ok' ? 'var(--on-surface)' : 'var(--error)' }}
        >
          {feedback.msg}
        </div>
      ) : null}
      <ModalActions>
        <ActionButton icon="close" onClick={onClose}>
          Done
        </ActionButton>
      </ModalActions>
    </Modal>
  );
}
