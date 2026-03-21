'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import FriendsList from '@/components/social/FriendsList';
import AddFriendModal from '@/components/social/AddFriendModal';

interface FriendRequest {
  id: string;
  requester: { id: string; username: string; avatarUrl: string | null };
  createdAt: string;
}

interface SharedNotebook {
  shareId: string;
  notebookId: string;
  name: string;
  color: string | null;
  author: { id: string; username: string; avatarUrl: string | null };
  sharedAt: string;
}

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  cardBg: '#121222',
  elevated: '#1d1d33',
  primary: '#ae89ff',
  deepPurple: '#884efb',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#737390',
  success: '#4ade80',
  error: '#fd6f85',
  border: '#464560',
} as const;

const AVATAR_COLORS = [
  'linear-gradient(135deg, #ae89ff, #884efb)',
  'linear-gradient(135deg, #ff89ae, #fb4e88)',
  'linear-gradient(135deg, #89ffd4, #4efba5)',
  'linear-gradient(135deg, #ffde59, #fbae4e)',
];

function getAvatarGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SocialPanel() {
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [sharedNotebooks, setSharedNotebooks] = useState<SharedNotebook[]>([]);
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingShared, setLoadingShared] = useState(true);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  // Hover states
  const [hoveredFindBtn, setHoveredFindBtn] = useState(false);
  const [hoveredAccept, setHoveredAccept] = useState<string | null>(null);
  const [hoveredDecline, setHoveredDecline] = useState<string | null>(null);
  const [hoveredNb, setHoveredNb] = useState<string | null>(null);
  const [hoveredSeeAll, setHoveredSeeAll] = useState(false);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch('/api/friends?status=pending&direction=incoming');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setRequests((json.data.friends || []).slice(0, 3));
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  const fetchShared = useCallback(async () => {
    try {
      const res = await fetch('/api/community/notebooks?filter=all&limit=3');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setSharedNotebooks((json.data.notebooks || []).slice(0, 3));
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoadingShared(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
    fetchShared();
  }, [fetchRequests, fetchShared]);

  const handleRespond = async (requestId: string, action: 'accepted' | 'declined') => {
    setRespondingTo(requestId);
    try {
      const res = await fetch(`/api/friends/request/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.id !== requestId));
      }
    } catch {
      // silently fail
    } finally {
      setRespondingTo(null);
    }
  };

  return (
    <>
      <div
        style={{
          position: 'sticky',
          top: 88,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Friend Requests */}
        {!loadingRequests && requests.length > 0 && (
          <div
            style={{
              background: COLORS.cardBg,
              borderRadius: 16,
              border: `1px solid ${COLORS.border}`,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px 10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
                  Friend Requests
                </span>
                <span
                  style={{
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    background: COLORS.primary,
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 5px',
                  }}
                >
                  {requests.length}
                </span>
              </div>
              <Link
                href="/dashboard"
                onMouseEnter={() => setHoveredSeeAll(true)}
                onMouseLeave={() => setHoveredSeeAll(false)}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: hoveredSeeAll ? COLORS.primary : COLORS.textMuted,
                  textDecoration: 'none',
                  transition: `color 0.15s ${EASING}`,
                }}
              >
                See all
              </Link>
            </div>

            <div style={{ padding: '0 10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {requests.map((req) => {
                const isResponding = respondingTo === req.id;
                return (
                  <div
                    key={req.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 8px',
                      borderRadius: 10,
                    }}
                  >
                    {req.requester.avatarUrl ? (
                      <img
                        src={req.requester.avatarUrl}
                        alt={req.requester.username}
                        style={{ width: 32, height: 32, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 10,
                          background: getAvatarGradient(req.requester.id),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 13,
                          fontWeight: 700,
                          color: '#fff',
                          flexShrink: 0,
                        }}
                      >
                        {req.requester.username[0].toUpperCase()}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: COLORS.textPrimary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {req.requester.username}
                      </div>
                      <div style={{ fontSize: 10, color: COLORS.textMuted }}>
                        {timeAgo(req.createdAt)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => handleRespond(req.id, 'accepted')}
                        disabled={isResponding}
                        onMouseEnter={() => setHoveredAccept(req.id)}
                        onMouseLeave={() => setHoveredAccept(null)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          border: 'none',
                          background: hoveredAccept === req.id ? COLORS.success : 'rgba(74,222,128,0.12)',
                          color: hoveredAccept === req.id ? '#fff' : COLORS.success,
                          cursor: isResponding ? 'wait' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: `all 0.15s ${EASING}`,
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>
                      </button>
                      <button
                        onClick={() => handleRespond(req.id, 'declined')}
                        disabled={isResponding}
                        onMouseEnter={() => setHoveredDecline(req.id)}
                        onMouseLeave={() => setHoveredDecline(null)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          border: 'none',
                          background: hoveredDecline === req.id ? COLORS.error : 'rgba(253,111,133,0.1)',
                          color: hoveredDecline === req.id ? '#fff' : COLORS.error,
                          cursor: isResponding ? 'wait' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: `all 0.15s ${EASING}`,
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Friends */}
        <div
          style={{
            background: COLORS.cardBg,
            borderRadius: 16,
            border: `1px solid ${COLORS.border}`,
            padding: '14px 12px 12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 4px',
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
              Friends
            </span>
            <button
              onClick={() => setAddFriendOpen(true)}
              onMouseEnter={() => setHoveredFindBtn(true)}
              onMouseLeave={() => setHoveredFindBtn(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                borderRadius: 7,
                border: 'none',
                background: hoveredFindBtn ? 'rgba(174,137,255,0.12)' : 'transparent',
                color: hoveredFindBtn ? COLORS.primary : COLORS.textMuted,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                transition: `all 0.15s ${EASING}`,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                person_add
              </span>
              Find
            </button>
          </div>
          <FriendsList compact />
        </div>

        {/* Shared With Me */}
        {!loadingShared && sharedNotebooks.length > 0 && (
          <div
            style={{
              background: COLORS.cardBg,
              borderRadius: 16,
              border: `1px solid ${COLORS.border}`,
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '14px 16px 10px' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
                Shared With Me
              </span>
            </div>
            <div style={{ padding: '0 8px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {sharedNotebooks.map((nb) => {
                const isHovered = hoveredNb === nb.shareId;
                return (
                  <div
                    key={nb.shareId}
                    onMouseEnter={() => setHoveredNb(nb.shareId)}
                    onMouseLeave={() => setHoveredNb(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 10,
                      background: isHovered ? 'rgba(174,137,255,0.06)' : 'transparent',
                      cursor: 'pointer',
                      transition: `background 0.1s`,
                    }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 3,
                        background: nb.color || COLORS.primary,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: COLORS.textPrimary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {nb.name}
                      </div>
                      <div style={{ fontSize: 10, color: COLORS.textMuted }}>
                        by {nb.author.username} · {timeAgo(nb.sharedAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <AddFriendModal open={addFriendOpen} onClose={() => setAddFriendOpen(false)} />
    </>
  );
}
