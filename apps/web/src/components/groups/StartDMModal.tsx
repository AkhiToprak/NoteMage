'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { UserName } from '@/components/user/UserName';
import { UserAvatar } from '@/components/user/UserAvatar';

const COLORS = {
  cardBg: '#21213e',
  elevated: '#2d2d52',
  inputBg: '#35355c',
  primary: '#ae89ff',
  deepPurple2: '#8348f6',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
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
}

export default function StartDMModal({ open, onClose }: Props) {
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);

  // Defer all setState — including the leading reset of search/starting and
  // setLoading(true) — into a microtask via Promise.resolve().then() so the
  // effect body itself contains no synchronous setState
  // (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setLoading(true);
      setSearch('');
      setStarting(null);
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

  const handleStartDM = useCallback(
    async (friendId: string) => {
      setStarting(friendId);
      try {
        const res = await fetch('/api/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'direct', otherUserId: friendId }),
        });
        if (res.ok) {
          const json = await res.json();
          const dmId = json.data?.id;
          if (dmId) {
            onClose();
            router.push(`/groups/${dmId}`);
          }
        }
      } catch {
        /* ignore */
      }
      setStarting(null);
    },
    [onClose, router]
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
          maxWidth: 440,
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ padding: '24px 24px 16px', borderBottom: `1px solid ${COLORS.border}1a` }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 800, color: COLORS.textPrimary, margin: 0 }}>
              New Message
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
            autoFocus
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

        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }} className="custom-scrollbar">
          {loading ? (
            <p style={{ textAlign: 'center', color: COLORS.textMuted, padding: 24, fontSize: 14 }}>
              Loading...
            </p>
          ) : filtered.length === 0 ? (
            <p style={{ textAlign: 'center', color: COLORS.textMuted, padding: 24, fontSize: 14 }}>
              {search ? 'No friends match' : 'No friends yet'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtered.map((friend) => {
                const isStarting = starting === friend.id;
                return (
                  <button
                    key={friend.id}
                    onClick={() => handleStartDM(friend.id)}
                    disabled={!!starting}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      borderRadius: 12,
                      border: 'none',
                      background: isStarting ? `${COLORS.primary}1a` : COLORS.cardBg,
                      cursor: starting ? 'wait' : 'pointer',
                      fontFamily: 'inherit',
                      textAlign: 'left',
                      width: '100%',
                      transition: `background 0.15s ${EASING}`,
                    }}
                  >
                    <UserAvatar user={friend} size={40} radius="50%" />
                    <div>
                      <UserName
                        user={friend}
                        as="p"
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: COLORS.textPrimary,
                          margin: 0,
                        }}
                      />
                      <p style={{ fontSize: 12, color: COLORS.textMuted, margin: 0 }}>
                        @{friend.username}
                      </p>
                    </div>
                    <span
                      className="material-symbols-outlined"
                      style={{ marginLeft: 'auto', fontSize: 20, color: COLORS.textMuted }}
                    >
                      {isStarting ? 'hourglass_empty' : 'chat'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
