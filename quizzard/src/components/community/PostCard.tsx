'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import PollDisplay from './PollDisplay';
import NotebookEmbed from './NotebookEmbed';
import CommentSection from './CommentSection';

interface PostImage {
  id: string;
  url: string;
  sortOrder: number;
}

interface PollOption {
  id: string;
  text: string;
  sortOrder: number;
  voteCount: number;
  userVoted: boolean;
}

interface Poll {
  id: string;
  question: string;
  options: PollOption[];
}

export interface PostData {
  id: string;
  content: string;
  visibility: string;
  notebookRef: string | null;
  createdAt: string;
  author: { id: string; username: string; avatarUrl: string | null };
  images: PostImage[];
  poll: Poll | null;
  voteScore: number;
  commentCount: number;
  userVote: number; // 1 = upvoted, -1 = downvoted, 0 = none
}

interface PostCardProps {
  post: PostData;
  onDelete?: (postId: string) => void;
  onUpdate?: (post: PostData) => void;
}

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  cardBg: '#161630',
  elevated: '#232342',
  inputBg: '#2a2a4c',
  primary: '#ae89ff',
  deepPurple: '#884efb',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  error: '#fd6f85',
  border: '#555578',
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
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Simple URL linkification with protocol validation
function linkifyContent(text: string): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      urlRegex.lastIndex = 0; // Reset regex state
      // Validate URL to ensure only http/https protocols
      try {
        const url = new URL(part);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return part;
        return (
          <a
            key={i}
            href={url.toString()}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: COLORS.primary, textDecoration: 'none' }}
            onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
          >
            {part}
          </a>
        );
      } catch {
        return part;
      }
    }
    return part;
  });
}

export default function PostCard({ post, onDelete, onUpdate }: PostCardProps) {
  const { data: session } = useSession();
  const currentUserId = (session?.user as { id?: string; role?: string } | undefined)?.id;
  const currentUserRole = (session?.user as { id?: string; role?: string } | undefined)?.role;
  const isAuthor = currentUserId === post.author.id;
  const isAdmin = currentUserRole === 'admin';

  const [userVote, setUserVote] = useState(post.userVote);
  const [voteScore, setVoteScore] = useState(post.voteScore);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [showComments, setShowComments] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [poll, setPoll] = useState(post.poll);
  const [voting, setVoting] = useState(false);

  // Hover states
  const [hoveredUpvote, setHoveredUpvote] = useState(false);
  const [hoveredDownvote, setHoveredDownvote] = useState(false);
  const [hoveredComment, setHoveredComment] = useState(false);
  const [hoveredMenu, setHoveredMenu] = useState(false);
  const [hoveredMenuItem, setHoveredMenuItem] = useState<string | null>(null);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  const handleVote = async (value: 1 | -1) => {
    if (voting) return;
    setVoting(true);
    // Optimistic update
    const prevVote = userVote;
    const prevScore = voteScore;
    if (userVote === value) {
      // Toggle off
      setUserVote(0);
      setVoteScore((s) => s - value);
    } else {
      // New or switch vote
      setUserVote(value);
      setVoteScore((s) => s - prevVote + value);
    }
    try {
      const res = await fetch(`/api/posts/${post.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setUserVote(json.data.userVote);
          setVoteScore(json.data.voteScore);
        }
      }
    } catch {
      // Revert optimistic
      setUserVote(prevVote);
      setVoteScore(prevScore);
    } finally {
      setVoting(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editContent.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent.trim() }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setIsEditing(false);
          onUpdate?.({ ...post, content: editContent.trim() });
        }
      }
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/posts/${post.id}`, { method: 'DELETE' });
      if (res.ok) {
        onDelete?.(post.id);
      }
    } catch {
      // silently fail
    } finally {
      setDeleting(false);
    }
  };

  // Image grid layout
  const renderImages = () => {
    if (post.images.length === 0) return null;
    const count = post.images.length;
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: count === 1 ? '1fr' : '1fr 1fr',
          gap: 4,
          borderRadius: 14,
          overflow: 'hidden',
          marginTop: 12,
        }}
      >
        {post.images.map((img, idx) => (
          <div
            key={img.id}
            onClick={() => setLightboxImg(img.url)}
            style={{
              aspectRatio: count === 1 ? '16/9' : '1',
              cursor: 'pointer',
              overflow: 'hidden',
              gridColumn: count === 3 && idx === 0 ? '1 / -1' : undefined,
            }}
          >
            <img
              src={img.url}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transition: `transform 0.3s ${EASING}`,
              }}
              onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.03)')}
              onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <div
        style={{
          background: COLORS.cardBg,
          borderRadius: 20,
          border: `1px solid ${COLORS.border}`,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 20px 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {post.author.avatarUrl ? (
              <img
                src={post.author.avatarUrl}
                alt={post.author.username}
                style={{ width: 40, height: 40, borderRadius: 12, objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: getAvatarGradient(post.author.id),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#fff',
                }}
              >
                {post.author.username[0].toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>
                {post.author.username}
              </div>
              <div style={{ fontSize: 12, color: COLORS.textMuted }}>
                {timeAgo(post.createdAt)}
              </div>
            </div>
          </div>

          {/* Menu — always visible, actions gated by role */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              onMouseEnter={() => setHoveredMenu(true)}
              onMouseLeave={() => setHoveredMenu(false)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: 'none',
                background: hoveredMenu || showMenu ? COLORS.elevated : 'transparent',
                color: hoveredMenu || showMenu ? COLORS.textPrimary : COLORS.textMuted,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: `all 0.15s ${EASING}`,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                more_horiz
              </span>
            </button>

            {showMenu && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: 4,
                  minWidth: 140,
                  background: COLORS.elevated,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 12,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  padding: 4,
                  zIndex: 10,
                }}
              >
                {/* Edit — only for author */}
                {isAuthor && (
                  <button
                    onClick={() => {
                      setIsEditing(true);
                      setEditContent(post.content);
                      setShowMenu(false);
                    }}
                    onMouseEnter={() => setHoveredMenuItem('edit')}
                    onMouseLeave={() => setHoveredMenuItem(null)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: hoveredMenuItem === 'edit' ? 'rgba(255,255,255,0.07)' : 'transparent',
                      color: COLORS.textPrimary,
                      fontSize: 13,
                      cursor: 'pointer',
                      transition: `background 0.1s`,
                      textAlign: 'left',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
                    Edit
                  </button>
                )}
                {/* Delete — for author and admin */}
                {(isAuthor || isAdmin) && (
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      handleDelete();
                    }}
                    onMouseEnter={() => setHoveredMenuItem('delete')}
                    onMouseLeave={() => setHoveredMenuItem(null)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: hoveredMenuItem === 'delete' ? 'rgba(253,111,133,0.08)' : 'transparent',
                      color: COLORS.error,
                      fontSize: 13,
                      cursor: 'pointer',
                      transition: `background 0.1s`,
                      textAlign: 'left',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                    {deleting ? 'Deleting...' : isAdmin && !isAuthor ? 'Delete (Admin)' : 'Delete'}
                  </button>
                )}
                {/* No actions available */}
                {!isAuthor && !isAdmin && (
                  <div
                    style={{
                      padding: '10px 12px',
                      fontSize: 13,
                      color: COLORS.textMuted,
                      textAlign: 'center',
                    }}
                  >
                    No actions available
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '12px 20px 0' }}>
          {isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                maxLength={2000}
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1.5px solid ${COLORS.primary}`,
                  background: COLORS.inputBg,
                  color: COLORS.textPrimary,
                  fontSize: 14,
                  lineHeight: 1.6,
                  resize: 'vertical',
                  outline: 'none',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setIsEditing(false)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    border: `1px solid ${COLORS.border}`,
                    background: 'transparent',
                    color: COLORS.textSecondary,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={!editContent.trim() || saving}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: COLORS.primary,
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: saving ? 'wait' : 'pointer',
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                fontSize: 14,
                color: COLORS.textSecondary,
                lineHeight: 1.65,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {linkifyContent(post.content)}
            </div>
          )}
        </div>

        {/* Images */}
        {post.images.length > 0 && (
          <div style={{ padding: '0 20px' }}>{renderImages()}</div>
        )}

        {/* Notebook embed */}
        {post.notebookRef && (
          <div style={{ padding: '12px 20px 0' }}>
            <NotebookEmbed notebookId={post.notebookRef} />
          </div>
        )}

        {/* Poll */}
        {poll && (
          <div style={{ padding: '12px 20px 0' }}>
            <PollDisplay
              postId={post.id}
              poll={poll}
              onVote={(updatedPoll) => setPoll(updatedPoll)}
            />
          </div>
        )}

        {/* Action bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '12px 20px',
            marginTop: 4,
          }}
        >
          {/* Upvote */}
          <button
            onClick={() => handleVote(1)}
            onMouseEnter={() => setHoveredUpvote(true)}
            onMouseLeave={() => setHoveredUpvote(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '6px 8px',
              borderRadius: 8,
              border: 'none',
              background: hoveredUpvote ? 'rgba(174,137,255,0.08)' : 'transparent',
              color: userVote === 1 ? COLORS.primary : hoveredUpvote ? COLORS.primary : COLORS.textMuted,
              cursor: 'pointer',
              transition: `all 0.15s ${EASING}`,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: 22,
                fontVariationSettings: userVote === 1 ? '"FILL" 1' : '"FILL" 0',
                transition: `all 0.2s ${EASING}`,
                transform: userVote === 1 ? 'scale(1.15)' : 'scale(1)',
              }}
            >
              arrow_upward
            </span>
          </button>

          {/* Vote score */}
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: voteScore > 0 ? COLORS.primary : voteScore < 0 ? COLORS.error : COLORS.textMuted,
              minWidth: 20,
              textAlign: 'center',
              userSelect: 'none',
            }}
          >
            {voteScore}
          </span>

          {/* Downvote */}
          <button
            onClick={() => handleVote(-1)}
            onMouseEnter={() => setHoveredDownvote(true)}
            onMouseLeave={() => setHoveredDownvote(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '6px 8px',
              borderRadius: 8,
              border: 'none',
              background: hoveredDownvote ? 'rgba(253,111,133,0.08)' : 'transparent',
              color: userVote === -1 ? COLORS.error : hoveredDownvote ? COLORS.error : COLORS.textMuted,
              cursor: 'pointer',
              transition: `all 0.15s ${EASING}`,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: 22,
                fontVariationSettings: userVote === -1 ? '"FILL" 1' : '"FILL" 0',
                transition: `all 0.2s ${EASING}`,
                transform: userVote === -1 ? 'scale(1.15)' : 'scale(1)',
              }}
            >
              arrow_downward
            </span>
          </button>

          {/* Comment */}
          <button
            onClick={() => setShowComments(!showComments)}
            onMouseEnter={() => setHoveredComment(true)}
            onMouseLeave={() => setHoveredComment(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 8,
              border: 'none',
              background: hoveredComment ? 'rgba(174,137,255,0.08)' : 'transparent',
              color: showComments
                ? COLORS.primary
                : hoveredComment
                ? COLORS.primary
                : COLORS.textMuted,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: `all 0.15s ${EASING}`,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
              chat_bubble_outline
            </span>
            {commentCount > 0 && <span>{commentCount}</span>}
          </button>
        </div>

        {/* Comments section */}
        {showComments && (
          <div
            style={{
              padding: '0 20px 18px',
              borderTop: `1px solid rgba(70,69,96,0.3)`,
              paddingTop: 14,
            }}
          >
            <CommentSection
              postId={post.id}
              commentCount={commentCount}
              expanded
            />
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxImg && (
        <div
          onClick={() => setLightboxImg(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out',
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
          <img
            src={lightboxImg}
            alt=""
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: 12,
            }}
          />
        </div>
      )}
    </>
  );
}
