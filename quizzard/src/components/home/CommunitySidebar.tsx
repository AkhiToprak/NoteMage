'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePresence } from '@/hooks/usePresence';

/* ─── Types ─── */
interface FriendActivity {
  id: string;
  userId: string;
  username: string;
  avatarUrl?: string | null;
  activity: string;
  targetName: string;
  targetColor: string | null;
  targetId: string | null;
  timeAgo: string;
  online: boolean;
}

interface TrendingTag {
  id: string;
  name: string;
  viewCount: number;
}

/* ─── Constants ─── */
const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  pageBg: '#111126',
  surface: '#12121f',
  cardBg: '#161630',
  elevated: '#232342',
  primary: '#8c52ff',
  primaryLight: '#ae89ff',
  secondary: '#ffde59',
  textPrimary: '#ede9ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  border: '#555578',
  borderSubtle: '#2a2a44',
  success: '#4ade80',
} as const;

const AVATAR_COLORS = [
  'linear-gradient(135deg, #ae89ff, #884efb)',
  'linear-gradient(135deg, #ff89ae, #fb4e88)',
  'linear-gradient(135deg, #89ffd4, #4efba5)',
  'linear-gradient(135deg, #ffde59, #fbae4e)',
];

const TAG_COLORS = ['#ff6b6b', '#ffde59', '#4ecdc4', '#ffb142', '#ae89ff', '#ff89ae', '#63cdff', '#48db9c'];

function getAvatarGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getTagColor(index: number): string {
  return TAG_COLORS[index % TAG_COLORS.length];
}

/* ─── Main component ─── */
export default function CommunitySidebar() {
  const [friends, setFriends] = useState<FriendActivity[]>([]);
  const [trendingTags, setTrendingTags] = useState<TrendingTag[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [loadingTags, setLoadingTags] = useState(true);
  const [hoveredPublish, setHoveredPublish] = useState(false);
  const [hoveredFriend, setHoveredFriend] = useState<string | null>(null);
  const [hoveredTag, setHoveredTag] = useState<string | null>(null);
  const [hoveredSeeAll, setHoveredSeeAll] = useState(false);
  const { onlineFriendIds } = usePresence();

  const fetchFriendActivity = useCallback(async () => {
    try {
      const res = await fetch('/api/friends/activity?limit=4');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.activities) {
          setFriends(json.data.activities);
          setLoadingFriends(false);
          return;
        }
      }
    } catch {
      // fall through
    }
    setFriends([]);
    setLoadingFriends(false);
  }, []);

  const fetchTrendingTags = useCallback(async () => {
    try {
      const res = await fetch('/api/tags/trending?limit=4');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.tags) {
          setTrendingTags(json.data.tags);
          setLoadingTags(false);
          return;
        }
      }
    } catch {
      // fall through
    }
    setTrendingTags([]);
    setLoadingTags(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFriendActivity();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTrendingTags();
  }, [fetchFriendActivity, fetchTrendingTags]);

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
        <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ position: 'absolute', bottom: -10, left: -10, width: 50, height: 50, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
            Share Your Notebook
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, marginBottom: 16 }}>
            Help the community grow and earn rewards for every download.
          </div>
          <Link
            href="/publish"
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
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>publish</span>
            Publish Now
          </Link>
        </div>
      </div>

      {/* Friends Activity */}
      <div
        style={{
          background: COLORS.cardBg,
          borderRadius: 16,
          border: `1px solid ${COLORS.borderSubtle}`,
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>Friends Activity</span>
          <Link
            href="/community"
            onMouseEnter={() => setHoveredSeeAll(true)}
            onMouseLeave={() => setHoveredSeeAll(false)}
            style={{
              fontSize: 11, fontWeight: 600,
              color: hoveredSeeAll ? COLORS.primaryLight : COLORS.textMuted,
              textDecoration: 'none',
              transition: `color 0.15s ${EASING}`,
            }}
          >
            See All
          </Link>
        </div>

        <div style={{ padding: '0 10px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {loadingFriends ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px' }}>
                <div style={{ width: 36, height: 36, borderRadius: 12, background: COLORS.elevated, animation: 'communityPulse 1.5s ease-in-out infinite' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ width: 80, height: 12, borderRadius: 4, background: COLORS.elevated, marginBottom: 6, animation: 'communityPulse 1.5s ease-in-out infinite' }} />
                  <div style={{ width: 120, height: 10, borderRadius: 4, background: COLORS.elevated, animation: 'communityPulse 1.5s ease-in-out infinite' }} />
                </div>
              </div>
            ))
          ) : friends.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, display: 'block', marginBottom: 6, opacity: 0.4 }}>group</span>
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
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 8px', borderRadius: 10,
                    background: isHovered ? 'rgba(140,82,255,0.05)' : 'transparent',
                    cursor: friend.targetId ? 'pointer' : 'default',
                    transition: `background 0.1s`,
                  }}
                  onClick={() => {
                    if (friend.targetId) {
                      window.location.href = `/community/${friend.targetId}`;
                    }
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
                      <div style={{
                        width: 36, height: 36, borderRadius: 12,
                        background: getAvatarGradient(friend.id),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 700, color: '#fff',
                      }}>
                        {friend.username[0].toUpperCase()}
                      </div>
                    )}
                    <div style={{
                      position: 'absolute', bottom: -1, right: -1,
                      width: 10, height: 10, borderRadius: '50%',
                      background: (onlineFriendIds.has(friend.userId) || friend.online) ? COLORS.success : COLORS.textMuted,
                      border: `2px solid ${COLORS.cardBg}`,
                    }} />
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 700, color: COLORS.textPrimary,
                      marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {friend.username}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, lineHeight: 1.4 }}>
                      {friend.activity}{' '}
                      {friend.targetName && (
                        <span style={{ color: friend.targetColor || COLORS.primaryLight, fontWeight: 600 }}>
                          {friend.targetName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Time badge */}
                  <span style={{
                    fontSize: 10, color: COLORS.textMuted, background: COLORS.elevated,
                    padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
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
        {loadingTags ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{
                width: 80, height: 28, borderRadius: 8, background: COLORS.elevated,
                animation: 'communityPulse 1.5s ease-in-out infinite',
              }} />
            ))}
          </div>
        ) : trendingTags.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.textMuted, textAlign: 'center', padding: 12 }}>
            No trending tags yet
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {trendingTags.map((tag, i) => {
              const isHovered = hoveredTag === tag.id;
              const color = getTagColor(i);
              return (
                <Link
                  key={tag.id}
                  href={`/community?tag=${encodeURIComponent(tag.name)}`}
                  onMouseEnter={() => setHoveredTag(tag.id)}
                  onMouseLeave={() => setHoveredTag(null)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: isHovered ? `${color}22` : `${color}11`,
                    color: color,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: `background 0.15s ${EASING}, transform 0.15s ${EASING}`,
                    transform: isHovered ? 'translateY(-1px)' : 'none',
                    textDecoration: 'none',
                  }}
                >
                  #{tag.name}
                </Link>
              );
            })}
          </div>
        )}
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
