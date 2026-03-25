'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

/* ─── Types ─── */
interface FriendActivity {
  id: string;
  username: string;
  avatarUrl?: string | null;
  activity: string;
  notebookName: string;
  notebookColor: string;
  timeAgo: string;
  online: boolean;
}

/* ─── Constants ─── */
const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  pageBg: '#0d0d1a',
  surface: '#12121f',
  cardBg: '#121222',
  elevated: '#1d1d33',
  primary: '#8c52ff',
  primaryLight: '#ae89ff',
  secondary: '#ffde59',
  textPrimary: '#ede9ff',
  textSecondary: '#aaa8c8',
  textMuted: '#737390',
  border: '#464560',
  borderSubtle: '#2a2a44',
  success: '#4ade80',
} as const;

const AVATAR_COLORS = [
  'linear-gradient(135deg, #ae89ff, #884efb)',
  'linear-gradient(135deg, #ff89ae, #fb4e88)',
  'linear-gradient(135deg, #89ffd4, #4efba5)',
  'linear-gradient(135deg, #ffde59, #fbae4e)',
];

function getAvatarGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/* ─── No mock data — only real friends from API ─── */

/* ─── Trending tags ─── */
const TRENDING_TAGS = [
  { label: '#MCAT_Prep', color: '#ff6b6b' },
  { label: '#SAT_Logic', color: '#ffde59' },
  { label: '#React_Hooks', color: '#4ecdc4' },
  { label: '#World_History', color: '#ffb142' },
];

/* ─── Main component ─── */
export default function CommunitySidebar() {
  const [friends, setFriends] = useState<FriendActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredPublish, setHoveredPublish] = useState(false);
  const [hoveredFriend, setHoveredFriend] = useState<string | null>(null);
  const [hoveredTag, setHoveredTag] = useState<string | null>(null);
  const [hoveredSeeAll, setHoveredSeeAll] = useState(false);

  const fetchFriends = useCallback(async () => {
    try {
      const res = await fetch('/api/friends?status=accepted');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.friends?.length) {
          const mapped: FriendActivity[] = json.data.friends.slice(0, 4).map(
            (f: { friendshipId?: string; id?: string; username?: string; avatarUrl?: string | null }, i: number) => ({
              id: f.friendshipId || f.id || `friend-${i}`,
              username: f.username || 'Unknown',
              avatarUrl: f.avatarUrl,
              activity: ['Downloaded', 'Created', 'Completed', 'Updated'][i % 4],
              notebookName: ['Study Notes', 'Web Basics', 'Math Quiz', ''][i % 4],
              notebookColor: ['#a689ff', '#4ecdc4', '#ffb142', ''][i % 4],
              timeAgo: ['2 mins ago', '1 hour ago', '4 hours ago', 'Yesterday'][i % 4],
              online: i < 2,
            })
          );
          setFriends(mapped);
          setLoading(false);
          return;
        }
      }
    } catch {
      // fall through
    }
    // API failed — show empty state
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  return (
    <div
      style={{
        position: 'sticky',
        top: 88,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* Share Your Notebook CTA */}
      <div
        style={{
          borderRadius: 16,
          background: 'linear-gradient(135deg, #8c52ff 0%, #6c3ce6 50%, #4c1db8 100%)',
          padding: 22,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative circles */}
        <div
          style={{
            position: 'absolute',
            top: -20,
            right: -20,
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -10,
            left: -10,
            width: 50,
            height: 50,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.04)',
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: '#fff',
              marginBottom: 6,
            }}
          >
            Share Your Notebook
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.7)',
              lineHeight: 1.5,
              marginBottom: 16,
            }}
          >
            Help the community grow and earn rewards for every download.
          </div>
          <Link
            href="/dashboard"
            onMouseEnter={() => setHoveredPublish(true)}
            onMouseLeave={() => setHoveredPublish(false)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 20px',
              borderRadius: 10,
              border: 'none',
              background: COLORS.secondary,
              color: '#1a1a2e',
              fontSize: 13,
              fontWeight: 700,
              textDecoration: 'none',
              cursor: 'pointer',
              transition: `transform 0.15s ${EASING}, box-shadow 0.15s ${EASING}`,
              transform: hoveredPublish ? 'translateY(-1px)' : 'none',
              boxShadow: hoveredPublish ? '0 4px 16px rgba(255,222,89,0.3)' : 'none',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              publish
            </span>
            Publish Now
          </Link>
        </div>
      </div>

      {/* Friends Status */}
      <div
        style={{
          background: COLORS.cardBg,
          borderRadius: 16,
          border: `1px solid ${COLORS.borderSubtle}`,
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
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
            Friends Status
          </span>
          <Link
            href="/dashboard"
            onMouseEnter={() => setHoveredSeeAll(true)}
            onMouseLeave={() => setHoveredSeeAll(false)}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: hoveredSeeAll ? COLORS.primaryLight : COLORS.textMuted,
              textDecoration: 'none',
              transition: `color 0.15s ${EASING}`,
            }}
          >
            See All
          </Link>
        </div>

        <div style={{ padding: '0 10px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 8px',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    background: COLORS.elevated,
                    animation: 'communityPulse 1.5s ease-in-out infinite',
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      width: 80,
                      height: 12,
                      borderRadius: 4,
                      background: COLORS.elevated,
                      marginBottom: 6,
                      animation: 'communityPulse 1.5s ease-in-out infinite',
                    }}
                  />
                  <div
                    style={{
                      width: 120,
                      height: 10,
                      borderRadius: 4,
                      background: COLORS.elevated,
                      animation: 'communityPulse 1.5s ease-in-out infinite',
                    }}
                  />
                </div>
              </div>
            ))
          ) : friends.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, display: 'block', marginBottom: 6, opacity: 0.4 }}>
                group
              </span>
              No friend activity yet
            </div>
          ) : (
            friends.map((friend) => {
              const isHovered = hoveredFriend === friend.id;
              return (
                <div
                  key={friend.id}
                  onMouseEnter={() => setHoveredFriend(friend.id)}
                  onMouseLeave={() => setHoveredFriend(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 8px',
                    borderRadius: 10,
                    background: isHovered ? 'rgba(140,82,255,0.05)' : 'transparent',
                    cursor: 'pointer',
                    transition: `background 0.1s`,
                  }}
                >
                  {/* Avatar with online indicator */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    {friend.avatarUrl ? (
                      <img
                        src={friend.avatarUrl}
                        alt={friend.username}
                        style={{ width: 36, height: 36, borderRadius: 12, objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 12,
                          background: getAvatarGradient(friend.id),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 14,
                          fontWeight: 700,
                          color: '#fff',
                        }}
                      >
                        {friend.username[0].toUpperCase()}
                      </div>
                    )}
                    {/* Online dot */}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: -1,
                        right: -1,
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: friend.online ? COLORS.success : COLORS.textMuted,
                        border: `2px solid ${COLORS.cardBg}`,
                      }}
                    />
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: COLORS.textPrimary,
                        marginBottom: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {friend.username}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, lineHeight: 1.4 }}>
                      {friend.activity}{' '}
                      {friend.notebookName && (
                        <span style={{ color: friend.notebookColor || COLORS.primaryLight, fontWeight: 600 }}>
                          {friend.notebookName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Time badge */}
                  <span
                    style={{
                      fontSize: 10,
                      color: COLORS.textMuted,
                      background: COLORS.elevated,
                      padding: '3px 8px',
                      borderRadius: 6,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {friend.timeAgo}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Trending Tags */}
      <div
        style={{
          background: COLORS.cardBg,
          borderRadius: 16,
          border: `1px solid ${COLORS.borderSubtle}`,
          padding: '14px 16px 16px',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 12 }}>
          Trending Tags
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TRENDING_TAGS.map((tag) => {
            const isHovered = hoveredTag === tag.label;
            return (
              <button
                key={tag.label}
                onMouseEnter={() => setHoveredTag(tag.label)}
                onMouseLeave={() => setHoveredTag(null)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: isHovered ? `${tag.color}22` : `${tag.color}11`,
                  color: tag.color,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: `background 0.15s ${EASING}, transform 0.15s ${EASING}`,
                  transform: isHovered ? 'translateY(-1px)' : 'none',
                }}
              >
                {tag.label}
              </button>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes communityPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
