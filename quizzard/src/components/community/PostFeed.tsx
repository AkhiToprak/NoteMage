'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import PostCard, { PostData } from './PostCard';
import PostComposer from './PostComposer';

type FeedType = 'foryou' | 'friends' | 'trending';

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  pageBg: '#111126',
  cardBg: '#161630',
  elevated: '#232342',
  primary: '#ae89ff',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  border: '#555578',
} as const;

const FEED_TABS: { key: FeedType; label: string; icon: string }[] = [
  { key: 'foryou', label: 'For You', icon: 'explore' },
  { key: 'friends', label: 'Friends', icon: 'group' },
  { key: 'trending', label: 'Trending', icon: 'trending_up' },
];

function SkeletonCard({ delay }: { delay: number }) {
  return (
    <div
      style={{
        background: COLORS.cardBg,
        borderRadius: 20,
        border: `1px solid ${COLORS.border}`,
        padding: 20,
        animation: `skeletonPulse 1.5s ease-in-out infinite`,
        animationDelay: `${delay}ms`,
      }}
    >
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: COLORS.elevated,
          }}
        />
        <div style={{ flex: 1 }}>
          <div
            style={{
              width: 120,
              height: 14,
              borderRadius: 6,
              background: COLORS.elevated,
              marginBottom: 6,
            }}
          />
          <div
            style={{
              width: 60,
              height: 10,
              borderRadius: 5,
              background: COLORS.elevated,
            }}
          />
        </div>
      </div>
      <div
        style={{
          width: '100%',
          height: 14,
          borderRadius: 6,
          background: COLORS.elevated,
          marginBottom: 8,
        }}
      />
      <div
        style={{
          width: '75%',
          height: 14,
          borderRadius: 6,
          background: COLORS.elevated,
          marginBottom: 8,
        }}
      />
      <div
        style={{
          width: '50%',
          height: 14,
          borderRadius: 6,
          background: COLORS.elevated,
        }}
      />
    </div>
  );
}

export default function PostFeed() {
  const [feed, setFeed] = useState<FeedType>('foryou');
  const [posts, setPosts] = useState<PostData[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hoveredTab, setHoveredTab] = useState<FeedType | null>(null);

  const observerRef = useRef<HTMLDivElement>(null);

  const fetchPosts = useCallback(async (feedType: FeedType, cursor?: string) => {
    const isMore = !!cursor;
    if (isMore) setLoadingMore(true);
    else setLoading(true);

    try {
      const url = `/api/posts?feed=${feedType}&limit=20${cursor ? `&cursor=${cursor}` : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          if (isMore) {
            setPosts((prev) => [...prev, ...json.data.posts]);
          } else {
            setPosts(json.data.posts);
          }
          setNextCursor(json.data.nextCursor);
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Fetch on feed change
  useEffect(() => {
    setPosts([]);
    setNextCursor(null);
    fetchPosts(feed);
  }, [feed, fetchPosts]);

  // Infinite scroll observer
  useEffect(() => {
    if (!nextCursor || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && nextCursor) {
          fetchPosts(feed, nextCursor);
        }
      },
      { threshold: 0.1 }
    );
    const el = observerRef.current;
    if (el) observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
    };
  }, [nextCursor, loadingMore, feed, fetchPosts]);

  const handlePostCreated = () => {
    // Refresh feed
    setPosts([]);
    setNextCursor(null);
    fetchPosts(feed);
  };

  const handleDelete = (postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  const handleUpdate = (updated: PostData) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === updated.id ? { ...p, content: updated.content } : p))
    );
  };

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', width: '100%' }}>
      <style>{`
        @keyframes skeletonPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Feed tabs */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 20,
          background: COLORS.cardBg,
          borderRadius: 14,
          padding: 4,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        {FEED_TABS.map((tab) => {
          const isActive = feed === tab.key;
          const isHovered = hoveredTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setFeed(tab.key)}
              onMouseEnter={() => setHoveredTab(tab.key)}
              onMouseLeave={() => setHoveredTab(null)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '10px 14px',
                borderRadius: 10,
                border: 'none',
                background: isActive
                  ? COLORS.elevated
                  : 'transparent',
                color: isActive
                  ? COLORS.primary
                  : isHovered
                  ? COLORS.textSecondary
                  : COLORS.textMuted,
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                transition: `all 0.2s ${EASING}`,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                {tab.icon}
              </span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Composer */}
      <div style={{ marginBottom: 20 }}>
        <PostComposer onPostCreated={handlePostCreated} />
      </div>

      {/* Posts */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} delay={i * 150} />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            gap: 14,
            color: COLORS.textMuted,
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 48, opacity: 0.4 }}
          >
            {feed === 'friends' ? 'group_off' : feed === 'trending' ? 'trending_flat' : 'forum'}
          </span>
          <span style={{ fontSize: 15, fontWeight: 600 }}>
            {feed === 'friends'
              ? 'No posts from friends yet'
              : feed === 'trending'
              ? 'No trending posts yet'
              : 'No posts yet. Be the first!'}
          </span>
          <span style={{ fontSize: 13, opacity: 0.7 }}>
            {feed === 'friends'
              ? 'Add friends and encourage them to share'
              : 'Share something with the community above'}
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
            />
          ))}

          {/* Infinite scroll sentinel */}
          {nextCursor && (
            <div ref={observerRef} style={{ height: 1 }} />
          )}

          {/* Loading more */}
          {loadingMore && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                color: COLORS.textMuted,
                gap: 8,
                fontSize: 13,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 20, animation: 'spin 1s linear infinite' }}
              >
                progress_activity
              </span>
              Loading more...
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
