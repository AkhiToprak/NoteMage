'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { UserName } from '@/components/user/UserName';
import { UserAvatar } from '@/components/user/UserAvatar';

const COLORS = {
  pageBg: '#1a1a36',
  cardBg: '#21213e',
  elevated: '#2d2d52',
  inputBg: '#35355c',
  primary: '#ae89ff',
  deepPurple2: '#8348f6',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  success: '#4ade80',
  yellow: '#ffde59',
  border: '#555578',
} as const;

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

interface Friend {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  nameStyle?: { fontId?: string; colorId?: string } | null;
  equippedFrameId?: string | null;
  equippedTitleId?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  groupId: string;
  existingMemberIds: string[];
}

export default function InviteMemberModal({ open, onClose, groupId, existingMemberIds }: Props) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  // Fetch friends. Every setState — including the leading setLoading(true)
  // and reset of invitedIds/search — is deferred into a microtask via
  // Promise.resolve().then() so the effect body itself contains no
  // synchronous setState calls (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setLoading(true);
      setInvitedIds(new Set());
      setSearch('');
      try {
        const res = await fetch('/api/friends');
        if (cancelled) return;
        if (res.ok) {
          const json = await res.json();
          if (cancelled) return;
          setFriends(
            (json.data?.friends || []).map(
              (f: {
                id: string;
                username: string;
                name?: string | null;
                avatarUrl?: string | null;
                nameStyle?: { fontId?: string; colorId?: string } | null;
                equippedFrameId?: string | null;
                equippedTitleId?: string | null;
              }) => ({
                id: f.id,
                username: f.username,
                name: f.name || null,
                avatarUrl: f.avatarUrl || null,
                nameStyle: f.nameStyle ?? null,
                equippedFrameId: f.equippedFrameId ?? null,
                equippedTitleId: f.equippedTitleId ?? null,
              })
            )
          );
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = friends.filter((f) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return f.username.toLowerCase().includes(s) || (f.name || '').toLowerCase().includes(s);
  });

  const handleInvite = useCallback(
    async (friendId: string) => {
      try {
        const res = await fetch(`/api/groups/${groupId}/invitations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: friendId }),
        });
        if (res.ok) {
          setInvitedIds((prev) => new Set(prev).add(friendId));
        }
      } catch {
        /* ignore */
      }
    },
    [groupId]
  );

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.elevated,
          borderRadius: 20,
          width: '100%',
          maxWidth: 480,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '24px 24px 16px', borderBottom: `1px solid ${COLORS.border}1a` }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 800, color: COLORS.textPrimary }}>
              Invite Member
            </h3>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: COLORS.textMuted,
                cursor: 'pointer',
                padding: 4,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 24 }}>
                close
              </span>
            </button>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search friends..."
            style={{
              width: '100%',
              padding: '12px 16px',
              background: COLORS.inputBg,
              border: 'none',
              borderRadius: 12,
              color: COLORS.textPrimary,
              fontSize: 14,
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }} className="custom-scrollbar">
          {loading ? (
            <p style={{ textAlign: 'center', color: COLORS.textMuted, padding: 24, fontSize: 14 }}>
              Loading friends...
            </p>
          ) : filtered.length === 0 ? (
            <p style={{ textAlign: 'center', color: COLORS.textMuted, padding: 24, fontSize: 14 }}>
              {search ? 'No friends match your search' : 'No friends to invite'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map((friend) => {
                const isMember = existingMemberIds.includes(friend.id);
                const isInvited = invitedIds.has(friend.id);
                return (
                  <div
                    key={friend.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      borderRadius: 12,
                      background: COLORS.cardBg,
                    }}
                  >
                    <UserAvatar user={friend} size={36} radius={10} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <UserName
                        user={friend}
                        as="p"
                        style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}
                      />
                      <p style={{ fontSize: 12, color: COLORS.textMuted }}>@{friend.username}</p>
                    </div>
                    {isMember ? (
                      <span style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 600 }}>
                        Already a member
                      </span>
                    ) : isInvited ? (
                      <span
                        style={{
                          fontSize: 12,
                          color: COLORS.success,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                          check_circle
                        </span>
                        Invited
                      </span>
                    ) : (
                      <button
                        onClick={() => handleInvite(friend.id)}
                        style={{
                          padding: '6px 16px',
                          borderRadius: 8,
                          border: 'none',
                          background: `${COLORS.primary}33`,
                          color: COLORS.primary,
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          transition: `background 0.2s ${EASING}`,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = COLORS.primary;
                          e.currentTarget.style.color = '#fff';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = `${COLORS.primary}33`;
                          e.currentTarget.style.color = COLORS.primary;
                        }}
                      >
                        Invite
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
