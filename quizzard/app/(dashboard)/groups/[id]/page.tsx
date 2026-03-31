'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

interface Member {
  id: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  user: {
    name: string | null;
    username: string;
    avatarUrl: string | null;
  };
}

interface SharedNotebook {
  id: string;
  notebookId: string;
  notebook: {
    name: string;
    color: string | null;
  };
}

interface GroupDetail {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  members: Member[];
  notebooks: SharedNotebook[];
}

interface Friend {
  friendshipId: string;
  id: string;
  username: string;
  name?: string | null;
  avatarUrl?: string | null;
}

interface UserNotebook {
  id: string;
  name: string;
  color: string | null;
}

const COLORS = {
  pageBg: '#111126',
  cardBg: '#161630',
  elevated: '#232342',
  inputBg: '#2a2a4c',
  primary: '#ae89ff',
  deepPurple: '#884efb',
  deepPurple2: '#8348f6',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  error: '#fd6f85',
  success: '#4ade80',
  yellow: '#ffde59',
  border: '#555578',
} as const;

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

function Avatar({
  user,
  size = 36,
}: {
  user: { name?: string | null; avatarUrl?: string | null; username: string };
  size?: number;
}) {
  const initial = (user.name?.[0] || user.username[0] || '?').toUpperCase();
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.deepPurple2} 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        fontWeight: 700,
        color: '#fff',
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const isOwner = role === 'OWNER';
  const isAdmin = role === 'ADMIN';
  const bg = isOwner
    ? 'rgba(255, 222, 89, 0.15)'
    : isAdmin
      ? 'rgba(174, 137, 255, 0.15)'
      : 'transparent';
  const color = isOwner ? COLORS.yellow : isAdmin ? COLORS.primary : COLORS.textMuted;
  const label = isOwner ? 'Owner' : isAdmin ? 'Admin' : 'Member';

  if (role === 'MEMBER') return null;

  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color,
        background: bg,
        borderRadius: 6,
        padding: '2px 8px',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {label}
    </span>
  );
}

/* ─── Invite Friends Modal ─── */
function InviteModal({
  open,
  onClose,
  groupId,
  existingMemberIds,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  existingMemberIds: string[];
  onInvited: () => void;
}) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [inviting, setInviting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoveredClose, setHoveredClose] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setFilter('');
      setError(null);
      return;
    }
    setTimeout(() => inputRef.current?.focus(), 100);
    setLoading(true);
    fetch('/api/friends')
      .then((r) => r.json())
      .then((data) => {
        setFriends(data.data?.friends ?? []);
      })
      .catch(() => setError('Failed to load friends'))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleInvite = async (userId: string) => {
    setInviting(userId);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || 'Failed to invite');
      }
      onInvited();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite');
    } finally {
      setInviting(null);
    }
  };

  if (!open) return null;

  const filtered = friends.filter(
    (f) =>
      !existingMemberIds.includes(f.id) &&
      (f.username.toLowerCase().includes(filter.toLowerCase()) ||
        (f.name || '').toLowerCase().includes(filter.toLowerCase()))
  );

  return (
    <>
      <style>{`
        @keyframes invFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes invSlideUp { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
      <div
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'invFadeIn 0.2s ease-out',
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Invite Friend"
          style={{
            maxWidth: 440, width: 'calc(100% - 32px)', background: COLORS.cardBg,
            borderRadius: 24, padding: 32, boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
            animation: `invSlideUp 0.3s ${EASING}`, display: 'flex', flexDirection: 'column', gap: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
              Invite Friend
            </h2>
            <button
              onClick={onClose}
              onMouseEnter={() => setHoveredClose(true)}
              onMouseLeave={() => setHoveredClose(false)}
              aria-label="Close"
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8,
                color: hoveredClose ? COLORS.textPrimary : COLORS.textMuted,
                transition: `color 0.2s ${EASING}`,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
            </button>
          </div>

          <div style={{ position: 'relative' }}>
            <span
              className="material-symbols-outlined"
              style={{
                position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                fontSize: 20, color: COLORS.textMuted, pointerEvents: 'none',
              }}
            >
              search
            </span>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search friends..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{
                width: '100%', background: COLORS.inputBg, border: `1px solid ${COLORS.border}`,
                borderRadius: 12, padding: '12px 14px 12px 44px', fontSize: 14,
                color: COLORS.textPrimary, outline: 'none', boxSizing: 'border-box',
                transition: `border-color 0.2s ${EASING}, box-shadow 0.2s ${EASING}`,
                fontFamily: 'inherit',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = COLORS.primary;
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(174,137,255,0.15)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = COLORS.border;
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          {error && (
            <div style={{ fontSize: 13, color: COLORS.error, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>error</span>
              {error}
            </div>
          )}

          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: COLORS.textMuted, fontSize: 14 }}>
                Loading friends...
              </div>
            ) : filtered.length === 0 ? (
              <div
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '32px 16px', gap: 8,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 36, color: COLORS.textMuted }}>
                  person_search
                </span>
                <span style={{ fontSize: 14, color: COLORS.textSecondary }}>
                  {friends.length === 0 ? 'No friends to invite' : 'No matching friends'}
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {filtered.map((friend) => (
                  <div
                    key={friend.id}
                    onMouseEnter={() => setHoveredRow(friend.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px', borderRadius: 12,
                      background: hoveredRow === friend.id ? COLORS.elevated : 'transparent',
                      transition: `background 0.2s ${EASING}`,
                    }}
                  >
                    <Avatar user={friend} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14, fontWeight: 700, color: COLORS.textPrimary,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                      >
                        {friend.username}
                      </div>
                      {friend.name && (
                        <div
                          style={{
                            fontSize: 12, color: COLORS.textSecondary,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}
                        >
                          {friend.name}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleInvite(friend.id)}
                      disabled={inviting === friend.id}
                      style={{
                        background: COLORS.primary, color: '#1a0040',
                        fontSize: 12, fontWeight: 600, borderRadius: 8,
                        padding: '6px 14px', border: 'none',
                        cursor: inviting === friend.id ? 'not-allowed' : 'pointer',
                        opacity: inviting === friend.id ? 0.5 : 1,
                        transition: `opacity 0.2s ${EASING}`,
                        whiteSpace: 'nowrap', flexShrink: 0,
                      }}
                    >
                      {inviting === friend.id ? 'Inviting...' : 'Invite'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Share Notebook Modal ─── */
function ShareNotebookModal({
  open,
  onClose,
  groupId,
  existingNotebookIds,
  onShared,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  existingNotebookIds: string[];
  onShared: () => void;
}) {
  const [notebooks, setNotebooks] = useState<UserNotebook[]>([]);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoveredClose, setHoveredClose] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      return;
    }
    setLoading(true);
    fetch('/api/notebooks?folderId=all')
      .then((r) => r.json())
      .then((data) => {
        setNotebooks(data.data?.notebooks ?? data.notebooks ?? data ?? []);
      })
      .catch(() => setError('Failed to load notebooks'))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleShare = async (notebookId: string) => {
    setSharing(notebookId);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/notebooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notebookId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || 'Failed to share notebook');
      }
      onShared();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share');
    } finally {
      setSharing(null);
    }
  };

  if (!open) return null;

  const available = notebooks.filter((n) => !existingNotebookIds.includes(n.id));

  return (
    <>
      <style>{`
        @keyframes snmFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes snmSlideUp { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
      <div
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'snmFadeIn 0.2s ease-out',
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Share Notebook"
          style={{
            maxWidth: 440, width: 'calc(100% - 32px)', background: COLORS.cardBg,
            borderRadius: 24, padding: 32, boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
            animation: `snmSlideUp 0.3s ${EASING}`, display: 'flex', flexDirection: 'column', gap: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
              Share Notebook
            </h2>
            <button
              onClick={onClose}
              onMouseEnter={() => setHoveredClose(true)}
              onMouseLeave={() => setHoveredClose(false)}
              aria-label="Close"
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8,
                color: hoveredClose ? COLORS.textPrimary : COLORS.textMuted,
                transition: `color 0.2s ${EASING}`,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
            </button>
          </div>

          {error && (
            <div style={{ fontSize: 13, color: COLORS.error, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>error</span>
              {error}
            </div>
          )}

          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: COLORS.textMuted, fontSize: 14 }}>
                Loading notebooks...
              </div>
            ) : available.length === 0 ? (
              <div
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '32px 16px', gap: 8,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 36, color: COLORS.textMuted }}>
                  auto_stories
                </span>
                <span style={{ fontSize: 14, color: COLORS.textSecondary }}>
                  {notebooks.length === 0 ? 'No notebooks available' : 'All notebooks already shared'}
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {available.map((nb) => (
                  <div
                    key={nb.id}
                    onClick={() => handleShare(nb.id)}
                    onMouseEnter={() => setHoveredRow(nb.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', borderRadius: 12,
                      background: hoveredRow === nb.id ? COLORS.elevated : 'transparent',
                      cursor: sharing === nb.id ? 'not-allowed' : 'pointer',
                      opacity: sharing === nb.id ? 0.5 : 1,
                      transition: `background 0.2s ${EASING}, opacity 0.2s ${EASING}`,
                    }}
                  >
                    <div
                      style={{
                        width: 8, height: 36, borderRadius: 4, flexShrink: 0,
                        background: nb.color || COLORS.primary,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14, fontWeight: 600, color: COLORS.textPrimary,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                      >
                        {nb.name}
                      </div>
                    </div>
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 20, color: COLORS.textMuted, flexShrink: 0 }}
                    >
                      add_circle
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Delete Confirm Dialog ─── */
function DeleteConfirm({
  open,
  onClose,
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  const [hoveredDelete, setHoveredDelete] = useState(false);
  const [hoveredCancel, setHoveredCancel] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <style>{`
        @keyframes delFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes delSlideUp { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
      <div
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'delFadeIn 0.2s ease-out',
        }}
      >
        <div
          role="alertdialog"
          aria-modal="true"
          style={{
            maxWidth: 400, width: 'calc(100% - 32px)', background: COLORS.cardBg,
            borderRadius: 20, padding: 28, boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
            animation: `delSlideUp 0.25s ${EASING}`, display: 'flex', flexDirection: 'column', gap: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44, height: 44, borderRadius: 12,
                background: 'rgba(253,111,133,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: COLORS.error }}>
                delete_forever
              </span>
            </div>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
                Delete Group
              </h3>
              <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '4px 0 0' }}>
                This action cannot be undone.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              onMouseEnter={() => setHoveredCancel(true)}
              onMouseLeave={() => setHoveredCancel(false)}
              style={{
                background: hoveredCancel ? COLORS.elevated : 'transparent',
                border: `1px solid ${COLORS.border}`, borderRadius: 10,
                color: COLORS.textSecondary, fontSize: 13, fontWeight: 600,
                padding: '10px 18px', cursor: 'pointer',
                transition: `background 0.2s ${EASING}`,
              }}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              onMouseEnter={() => setHoveredDelete(true)}
              onMouseLeave={() => setHoveredDelete(false)}
              style={{
                background: hoveredDelete && !loading ? '#e55570' : COLORS.error,
                border: 'none', borderRadius: 10,
                color: '#fff', fontSize: 13, fontWeight: 600,
                padding: '10px 18px', cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                transition: `background 0.2s ${EASING}, opacity 0.2s ${EASING}`,
              }}
            >
              {loading ? 'Deleting...' : 'Delete Group'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Group Detail Page ─── */
export default function GroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const groupId = params.id as string;

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showInvite, setShowInvite] = useState(false);
  const [showShareNotebook, setShowShareNotebook] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const [hoveredBack, setHoveredBack] = useState(false);
  const [hoveredSettings, setHoveredSettings] = useState(false);
  const [hoveredInvite, setHoveredInvite] = useState(false);
  const [hoveredShare, setHoveredShare] = useState(false);
  const [hoveredNotebook, setHoveredNotebook] = useState<string | null>(null);

  const isOwner = session?.user?.id === group?.ownerId;
  const currentMember = group?.members.find((m) => m.userId === session?.user?.id);
  const isAdmin = currentMember?.role === 'ADMIN' || isOwner;

  const fetchGroup = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}`);
      if (!res.ok) throw new Error('Failed to fetch group');
      const data = await res.json();
      setGroup(data.data ?? data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup]);

  // Close settings dropdown on outside click
  useEffect(() => {
    if (!showSettings) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSettings]);

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete group');
      router.push('/groups');
    } catch {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '32px 40px', maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ width: 200, height: 28, borderRadius: 8, background: COLORS.elevated }} />
          <div style={{ width: '60%', height: 16, borderRadius: 6, background: COLORS.elevated }} />
          <div style={{ width: '100%', height: 200, borderRadius: 16, background: COLORS.cardBg, border: `1px solid ${COLORS.border}` }} />
          <div style={{ width: '100%', height: 200, borderRadius: 16, background: COLORS.cardBg, border: `1px solid ${COLORS.border}` }} />
        </div>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 12, padding: '80px 16px',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 48, color: COLORS.error }}>
          error
        </span>
        <span style={{ fontSize: 15, color: COLORS.error }}>{error || 'Group not found'}</span>
        <button
          onClick={() => router.push('/groups')}
          style={{
            background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: 8,
            color: COLORS.primary, fontSize: 13, fontWeight: 600, padding: '8px 16px', cursor: 'pointer',
          }}
        >
          Back to Groups
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          padding: '32px 40px',
          maxWidth: 1000,
          margin: '0 auto',
          fontFamily: 'inherit',
        }}
      >
        {/* Back + Header */}
        <div style={{ marginBottom: 28 }}>
          <button
            onClick={() => router.push('/groups')}
            onMouseEnter={() => setHoveredBack(true)}
            onMouseLeave={() => setHoveredBack(false)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'none', border: 'none',
              color: hoveredBack ? COLORS.textPrimary : COLORS.textMuted,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              padding: '4px 0', marginBottom: 16,
              transition: `color 0.2s ${EASING}`,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
            All Groups
          </button>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <h1
                style={{
                  fontSize: 28, fontWeight: 700, color: COLORS.textPrimary,
                  margin: 0, letterSpacing: '-0.02em',
                }}
              >
                {group.name}
              </h1>
              {group.description && (
                <p style={{ fontSize: 14, color: COLORS.textSecondary, margin: '8px 0 0', lineHeight: 1.5 }}>
                  {group.description}
                </p>
              )}
            </div>

            {isOwner && (
              <div ref={settingsRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowSettings((s) => !s)}
                  onMouseEnter={() => setHoveredSettings(true)}
                  onMouseLeave={() => setHoveredSettings(false)}
                  aria-label="Settings"
                  style={{
                    background: hoveredSettings ? COLORS.elevated : 'transparent',
                    border: `1px solid ${COLORS.border}`, borderRadius: 10,
                    padding: 8, cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    color: hoveredSettings ? COLORS.textPrimary : COLORS.textMuted,
                    transition: `background 0.2s ${EASING}, color 0.2s ${EASING}`,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 22 }}>settings</span>
                </button>

                {showSettings && (
                  <div
                    style={{
                      position: 'absolute', right: 0, top: '100%', marginTop: 8,
                      background: COLORS.cardBg, border: `1px solid ${COLORS.border}`,
                      borderRadius: 12, padding: 6, minWidth: 180,
                      boxShadow: '0 12px 40px rgba(0,0,0,0.4)', zIndex: 50,
                    }}
                  >
                    <button
                      onClick={() => { setShowSettings(false); setShowDeleteConfirm(true); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        width: '100%', background: 'none', border: 'none',
                        color: COLORS.error, fontSize: 13, fontWeight: 600,
                        padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                        transition: `background 0.2s ${EASING}`,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(253,111,133,0.1)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                      Delete Group
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Members Section */}
        <div
          style={{
            background: COLORS.cardBg, borderRadius: 16,
            border: `1px solid ${COLORS.border}`, padding: 24, marginBottom: 24,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: COLORS.primary }}>
                group
              </span>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
                Members
              </h2>
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 22, height: 22, borderRadius: 11,
                  background: COLORS.elevated, color: COLORS.textSecondary,
                  fontSize: 12, fontWeight: 600, padding: '0 6px',
                }}
              >
                {group.members.length}
              </span>
            </div>

            {isAdmin && (
              <button
                onClick={() => setShowInvite(true)}
                onMouseEnter={() => setHoveredInvite(true)}
                onMouseLeave={() => setHoveredInvite(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'none', border: 'none',
                  color: hoveredInvite ? '#c4abff' : COLORS.primary,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  padding: '4px 8px', borderRadius: 8,
                  transition: `color 0.2s ${EASING}`,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>person_add</span>
                Invite
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {group.members.map((member) => (
              <div
                key={member.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderRadius: 12,
                }}
              >
                <Avatar user={member.user} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        fontSize: 14, fontWeight: 700, color: COLORS.textPrimary,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {member.user.name || member.user.username}
                    </span>
                    <RoleBadge role={member.role} />
                  </div>
                  <div
                    style={{
                      fontSize: 12, color: COLORS.textSecondary,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    @{member.user.username}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Shared Notebooks Section */}
        <div
          style={{
            background: COLORS.cardBg, borderRadius: 16,
            border: `1px solid ${COLORS.border}`, padding: 24,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: COLORS.primary }}>
                auto_stories
              </span>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
                Shared Notebooks
              </h2>
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 22, height: 22, borderRadius: 11,
                  background: COLORS.elevated, color: COLORS.textSecondary,
                  fontSize: 12, fontWeight: 600, padding: '0 6px',
                }}
              >
                {group.notebooks.length}
              </span>
            </div>

            <button
              onClick={() => setShowShareNotebook(true)}
              onMouseEnter={() => setHoveredShare(true)}
              onMouseLeave={() => setHoveredShare(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'none', border: 'none',
                color: hoveredShare ? '#c4abff' : COLORS.primary,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                padding: '4px 8px', borderRadius: 8,
                transition: `color 0.2s ${EASING}`,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
              Share Notebook
            </button>
          </div>

          {group.notebooks.length === 0 ? (
            <div
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 8, padding: '32px 16px',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 40, color: COLORS.textMuted }}>
                auto_stories
              </span>
              <span style={{ fontSize: 14, color: COLORS.textSecondary }}>
                No shared notebooks yet
              </span>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 14,
              }}
            >
              {group.notebooks.map((sn) => (
                <div
                  key={sn.id}
                  onClick={() => router.push(`/notebooks/${sn.notebookId}`)}
                  onMouseEnter={() => setHoveredNotebook(sn.id)}
                  onMouseLeave={() => setHoveredNotebook(null)}
                  style={{
                    background: hoveredNotebook === sn.id ? COLORS.elevated : '#12122a',
                    borderRadius: 12, padding: '16px 18px',
                    cursor: 'pointer', position: 'relative', overflow: 'hidden',
                    border: `1px solid ${hoveredNotebook === sn.id ? COLORS.primary + '44' : COLORS.border}`,
                    transition: `background 0.2s ${EASING}, border-color 0.2s ${EASING}, transform 0.2s ${EASING}`,
                    transform: hoveredNotebook === sn.id ? 'translateY(-1px)' : 'translateY(0)',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0, width: 6,
                      background: sn.notebook.color || COLORS.primary,
                      borderRadius: '12px 0 0 12px',
                    }}
                  />
                  <div
                    style={{
                      fontSize: 14, fontWeight: 600, color: COLORS.textPrimary,
                      paddingLeft: 8,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    {sn.notebook.name}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <InviteModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        groupId={groupId}
        existingMemberIds={group.members.map((m) => m.userId)}
        onInvited={fetchGroup}
      />
      <ShareNotebookModal
        open={showShareNotebook}
        onClose={() => setShowShareNotebook(false)}
        groupId={groupId}
        existingNotebookIds={group.notebooks.map((n) => n.notebookId)}
        onShared={fetchGroup}
      />
      <DeleteConfirm
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        loading={deleteLoading}
      />
    </>
  );
}
