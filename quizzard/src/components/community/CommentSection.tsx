'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  parentCommentId: string | null;
  author: { id: string; username: string; avatarUrl: string | null };
  voteScore: number;
  userVote: number;
  replyCount: number;
  replies: Comment[];
}

interface CommentSectionProps {
  postId: string;
  commentCount: number;
  expanded?: boolean;
}

const EASING = 'cubic-bezier(0.22,1,0.36,1)';
const MAX_COMMENT = 500;

const COLORS = {
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
  if (mins < 60) return `${mins}m`;
  if (hrs < 24) return `${hrs}h`;
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ── Vote button pair for a single comment ── */
function CommentVoteButtons({
  postId,
  comment,
  onVoteUpdate,
}: {
  postId: string;
  comment: Comment;
  onVoteUpdate: (commentId: string, userVote: number, voteScore: number) => void;
}) {
  const [voting, setVoting] = useState(false);

  const handleVote = async (value: 1 | -1) => {
    if (voting) return;
    setVoting(true);
    const prevVote = comment.userVote;
    const prevScore = comment.voteScore;
    // Optimistic
    if (comment.userVote === value) {
      onVoteUpdate(comment.id, 0, comment.voteScore - value);
    } else {
      onVoteUpdate(comment.id, value, comment.voteScore - prevVote + value);
    }
    try {
      const res = await fetch(`/api/posts/${postId}/comments/${comment.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          onVoteUpdate(comment.id, json.data.userVote, json.data.voteScore);
        }
      }
    } catch {
      onVoteUpdate(comment.id, prevVote, prevScore);
    } finally {
      setVoting(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 4 }}>
      <button
        onClick={() => handleVote(1)}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '2px 4px',
          borderRadius: 5,
          border: 'none',
          background: 'transparent',
          color: comment.userVote === 1 ? COLORS.primary : COLORS.textMuted,
          cursor: 'pointer',
          transition: `color 0.15s ${EASING}`,
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: 16,
            fontVariationSettings: comment.userVote === 1 ? '"FILL" 1' : '"FILL" 0',
          }}
        >
          arrow_upward
        </span>
      </button>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: comment.voteScore > 0 ? COLORS.primary : comment.voteScore < 0 ? COLORS.error : COLORS.textMuted,
          minWidth: 14,
          textAlign: 'center',
          userSelect: 'none',
        }}
      >
        {comment.voteScore}
      </span>
      <button
        onClick={() => handleVote(-1)}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '2px 4px',
          borderRadius: 5,
          border: 'none',
          background: 'transparent',
          color: comment.userVote === -1 ? COLORS.error : COLORS.textMuted,
          cursor: 'pointer',
          transition: `color 0.15s ${EASING}`,
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: 16,
            fontVariationSettings: comment.userVote === -1 ? '"FILL" 1' : '"FILL" 0',
          }}
        >
          arrow_downward
        </span>
      </button>
    </div>
  );
}

/* ── Inline reply input ── */
function ReplyInput({
  postId,
  parentCommentId,
  onReplyPosted,
  onCancel,
  user,
}: {
  postId: string;
  parentCommentId: string;
  onReplyPosted: (reply: Comment) => void;
  onCancel: () => void;
  user: { id?: string; username?: string; avatarUrl?: string } | undefined;
}) {
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 100)}px`;
  }, [text]);

  const canPost = text.trim().length > 0 && text.length <= MAX_COMMENT && !posting;

  const handlePost = async () => {
    if (!canPost) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text.trim(), parentCommentId }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          onReplyPosted(json.data);
          setText('');
        }
      }
    } catch {
      // silently fail
    } finally {
      setPosting(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginTop: 8 }}>
      {user?.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt=""
          style={{ width: 20, height: 20, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
        />
      ) : (
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 6,
            background: getAvatarGradient(user?.id || ''),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            fontWeight: 700,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {(user?.username || '?')[0].toUpperCase()}
        </div>
      )}
      <div style={{ flex: 1, position: 'relative' }}>
        <textarea
          ref={inputRef}
          placeholder="Write a reply..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && canPost) {
              e.preventDefault();
              handlePost();
            }
            if (e.key === 'Escape') onCancel();
          }}
          rows={1}
          style={{
            width: '100%',
            minHeight: 30,
            maxHeight: 100,
            resize: 'none',
            padding: '6px 60px 6px 10px',
            borderRadius: 8,
            border: `1.5px solid ${focused ? COLORS.primary : COLORS.border}`,
            background: COLORS.inputBg,
            color: COLORS.textPrimary,
            fontSize: 12,
            lineHeight: 1.5,
            outline: 'none',
            overflow: 'hidden',
            fontFamily: 'inherit',
            transition: `border-color 0.2s ${EASING}`,
            boxSizing: 'border-box',
          }}
        />
        <div style={{ position: 'absolute', right: 4, bottom: 4, display: 'flex', gap: 2 }}>
          <button
            onClick={onCancel}
            style={{
              padding: '3px 8px',
              borderRadius: 5,
              border: 'none',
              background: 'transparent',
              color: COLORS.textMuted,
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handlePost}
            disabled={!canPost}
            style={{
              padding: '3px 8px',
              borderRadius: 5,
              border: 'none',
              background: canPost ? COLORS.deepPurple : 'transparent',
              color: canPost ? '#fff' : COLORS.textMuted,
              fontSize: 10,
              fontWeight: 700,
              cursor: canPost ? 'pointer' : 'default',
              transition: `all 0.15s ${EASING}`,
            }}
          >
            {posting ? '...' : 'Reply'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Single comment row (recursive for replies) ── */
function CommentRow({
  postId,
  comment,
  depth,
  isAdmin,
  user,
  onVoteUpdate,
  onReplyPosted,
  onDelete,
  deletingCommentId,
}: {
  postId: string;
  comment: Comment;
  depth: number;
  isAdmin: boolean;
  user: { id?: string; username?: string; avatarUrl?: string } | undefined;
  onVoteUpdate: (commentId: string, userVote: number, voteScore: number) => void;
  onReplyPosted: (parentId: string, reply: Comment) => void;
  onDelete: (commentId: string) => void;
  deletingCommentId: string | null;
}) {
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [showReplies, setShowReplies] = useState(comment.replies.length > 0);
  const [loadedMoreReplies, setLoadedMoreReplies] = useState(false);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [extraReplies, setExtraReplies] = useState<Comment[]>([]);
  const [hoveredReply, setHoveredReply] = useState(false);
  const [hoveredDelete, setHoveredDelete] = useState(false);

  const allReplies = [...comment.replies, ...extraReplies];
  const hasMoreReplies = comment.replyCount > allReplies.length && !loadedMoreReplies;

  const loadMoreReplies = async () => {
    if (loadingReplies) return;
    setLoadingReplies(true);
    try {
      const lastReply = allReplies[allReplies.length - 1];
      const cursor = lastReply ? new Date(lastReply.createdAt).toISOString() : undefined;
      const url = `/api/posts/${postId}/comments?parentId=${comment.id}&limit=20${cursor ? `&cursor=${cursor}` : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setExtraReplies((prev) => [...prev, ...json.data.comments]);
          if (!json.data.nextCursor) setLoadedMoreReplies(true);
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoadingReplies(false);
    }
  };

  const handleReplyPosted = (reply: Comment) => {
    onReplyPosted(comment.id, reply);
    setShowReplyInput(false);
    setShowReplies(true);
  };

  const maxDepth = 3;

  return (
    <div style={{ marginLeft: depth > 0 ? 20 : 0 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {/* Avatar */}
        {comment.author.avatarUrl ? (
          <img
            src={comment.author.avatarUrl}
            alt={comment.author.username}
            style={{
              width: depth === 0 ? 26 : 22,
              height: depth === 0 ? 26 : 22,
              borderRadius: 7,
              objectFit: 'cover',
              flexShrink: 0,
              marginTop: 2,
            }}
          />
        ) : (
          <div
            style={{
              width: depth === 0 ? 26 : 22,
              height: depth === 0 ? 26 : 22,
              borderRadius: 7,
              background: getAvatarGradient(comment.author.id),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: depth === 0 ? 11 : 9,
              fontWeight: 700,
              color: '#fff',
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            {comment.author.username[0].toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.textPrimary }}>
              {comment.author.username}
            </span>
            <span style={{ fontSize: 11, color: COLORS.textMuted }}>
              {timeAgo(comment.createdAt)}
            </span>
            {(isAdmin || user?.id === comment.author.id) && (
              <button
                onClick={() => onDelete(comment.id)}
                onMouseEnter={() => setHoveredDelete(true)}
                onMouseLeave={() => setHoveredDelete(false)}
                disabled={deletingCommentId === comment.id}
                style={{
                  marginLeft: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '2px 6px',
                  borderRadius: 6,
                  border: 'none',
                  background: hoveredDelete ? 'rgba(253,111,133,0.12)' : 'transparent',
                  color: hoveredDelete ? COLORS.error : COLORS.textMuted,
                  fontSize: 11,
                  cursor: deletingCommentId === comment.id ? 'wait' : 'pointer',
                  transition: `all 0.15s ${EASING}`,
                  flexShrink: 0,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
              </button>
            )}
          </div>
          <div
            style={{
              fontSize: 13,
              color: COLORS.textSecondary,
              lineHeight: 1.5,
              marginTop: 2,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {comment.content}
          </div>

          {/* Vote + Reply actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CommentVoteButtons postId={postId} comment={comment} onVoteUpdate={onVoteUpdate} />
            {depth < maxDepth && (
              <button
                onClick={() => setShowReplyInput(!showReplyInput)}
                onMouseEnter={() => setHoveredReply(true)}
                onMouseLeave={() => setHoveredReply(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: '4px 8px',
                  borderRadius: 5,
                  border: 'none',
                  background: 'transparent',
                  color: hoveredReply ? COLORS.primary : COLORS.textMuted,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: `color 0.15s ${EASING}`,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>reply</span>
                Reply
              </button>
            )}
          </div>

          {/* Reply input */}
          {showReplyInput && (
            <ReplyInput
              postId={postId}
              parentCommentId={comment.id}
              onReplyPosted={handleReplyPosted}
              onCancel={() => setShowReplyInput(false)}
              user={user}
            />
          )}

          {/* Nested replies */}
          {showReplies && allReplies.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              {allReplies.map((reply) => (
                <CommentRow
                  key={reply.id}
                  postId={postId}
                  comment={reply}
                  depth={depth + 1}
                  isAdmin={isAdmin}
                  user={user}
                  onVoteUpdate={onVoteUpdate}
                  onReplyPosted={onReplyPosted}
                  onDelete={onDelete}
                  deletingCommentId={deletingCommentId}
                />
              ))}
              {hasMoreReplies && (
                <button
                  onClick={loadMoreReplies}
                  disabled={loadingReplies}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: COLORS.primary,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: loadingReplies ? 'wait' : 'pointer',
                    padding: '2px 0',
                    textAlign: 'left',
                    marginLeft: 20,
                  }}
                >
                  {loadingReplies ? 'Loading...' : `View more replies (${comment.replyCount - allReplies.length})`}
                </button>
              )}
            </div>
          )}

          {/* Toggle replies if collapsed */}
          {!showReplies && comment.replyCount > 0 && (
            <button
              onClick={() => setShowReplies(true)}
              style={{
                background: 'none',
                border: 'none',
                color: COLORS.primary,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                padding: '4px 0',
                textAlign: 'left',
                marginTop: 4,
              }}
            >
              View {comment.replyCount} {comment.replyCount === 1 ? 'reply' : 'replies'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main CommentSection ── */
export default function CommentSection({ postId, commentCount, expanded = false }: CommentSectionProps) {
  const { data: session } = useSession();
  const user = session?.user as { id?: string; username?: string; avatarUrl?: string; role?: string } | undefined;
  const isAdmin = user?.role === 'admin';

  const [comments, setComments] = useState<Comment[]>([]);
  const [showAll, setShowAll] = useState(expanded);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const [hoveredPostBtn, setHoveredPostBtn] = useState(false);
  const [hoveredViewAll, setHoveredViewAll] = useState(false);
  const [focused, setFocused] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchComments = useCallback(async (cursor?: string) => {
    setLoading(true);
    try {
      const url = `/api/posts/${postId}/comments?limit=20${cursor ? `&cursor=${cursor}` : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          if (cursor) {
            setComments((prev) => [...prev, ...json.data.comments]);
          } else {
            setComments(json.data.comments);
          }
          setNextCursor(json.data.nextCursor);
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (showAll && comments.length === 0) {
      fetchComments();
    }
  }, [showAll, comments.length, fetchComments]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [commentText]);

  const handlePost = async () => {
    if (!commentText.trim() || posting) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentText.trim() }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setComments((prev) => [json.data, ...prev]);
          setCommentText('');
          if (!showAll) setShowAll(true);
        }
      }
    } catch {
      // silently fail
    } finally {
      setPosting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (deletingCommentId) return;
    setDeletingCommentId(commentId);
    try {
      const res = await fetch(`/api/admin/comments/${commentId}`, { method: 'DELETE' });
      if (res.ok) {
        // Remove from top-level or nested
        setComments((prev) => removeComment(prev, commentId));
      }
    } catch {
      // silently fail
    } finally {
      setDeletingCommentId(null);
    }
  };

  // Recursively update vote on a comment at any depth
  const handleVoteUpdate = useCallback((commentId: string, userVote: number, voteScore: number) => {
    setComments((prev) => updateCommentVote(prev, commentId, userVote, voteScore));
  }, []);

  // Add reply to a parent comment
  const handleReplyPosted = useCallback((parentId: string, reply: Comment) => {
    setComments((prev) => addReplyToComment(prev, parentId, reply));
  }, []);

  const charCount = commentText.length;
  const showCharCount = charCount > 400;
  const isOverLimit = charCount > MAX_COMMENT;
  const canPost = commentText.trim().length > 0 && !isOverLimit && !posting;

  const displayedComments = showAll ? comments : comments.slice(0, 2);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!showAll && commentCount > 2 && (
        <button
          onClick={() => {
            setShowAll(true);
            if (comments.length === 0) fetchComments();
          }}
          onMouseEnter={() => setHoveredViewAll(true)}
          onMouseLeave={() => setHoveredViewAll(false)}
          style={{
            background: 'none',
            border: 'none',
            color: hoveredViewAll ? COLORS.primary : COLORS.textMuted,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            padding: '2px 0',
            textAlign: 'left',
            transition: `color 0.15s ${EASING}`,
          }}
        >
          View all {commentCount} comments
        </button>
      )}

      {displayedComments.map((comment) => (
        <CommentRow
          key={comment.id}
          postId={postId}
          comment={comment}
          depth={0}
          isAdmin={isAdmin}
          user={user}
          onVoteUpdate={handleVoteUpdate}
          onReplyPosted={handleReplyPosted}
          onDelete={handleDeleteComment}
          deletingCommentId={deletingCommentId}
        />
      ))}

      {showAll && nextCursor && (
        <button
          onClick={() => fetchComments(nextCursor)}
          disabled={loading}
          style={{
            background: 'none',
            border: 'none',
            color: COLORS.textMuted,
            fontSize: 12,
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
            padding: '4px 0',
            textAlign: 'left',
          }}
        >
          {loading ? 'Loading...' : 'Load more comments'}
        </button>
      )}

      {/* Comment input */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.username || ''}
            style={{ width: 24, height: 24, borderRadius: 7, objectFit: 'cover', flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              background: getAvatarGradient(user?.id || ''),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 700,
              color: '#fff',
              flexShrink: 0,
            }}
          >
            {(user?.username || '?')[0].toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1, position: 'relative' }}>
          <textarea
            ref={textareaRef}
            placeholder="Write a comment..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && canPost) {
                e.preventDefault();
                handlePost();
              }
            }}
            rows={1}
            style={{
              width: '100%',
              minHeight: 34,
              maxHeight: 120,
              resize: 'none',
              padding: '7px 70px 7px 12px',
              borderRadius: 10,
              border: `1.5px solid ${focused ? COLORS.primary : COLORS.border}`,
              background: COLORS.inputBg,
              color: COLORS.textPrimary,
              fontSize: 13,
              lineHeight: 1.5,
              outline: 'none',
              overflow: 'hidden',
              fontFamily: 'inherit',
              transition: `border-color 0.2s ${EASING}`,
              boxSizing: 'border-box',
            }}
          />
          {showCharCount && (
            <span
              style={{
                position: 'absolute',
                right: 60,
                bottom: 8,
                fontSize: 10,
                color: isOverLimit ? COLORS.error : COLORS.textMuted,
              }}
            >
              {charCount}/{MAX_COMMENT}
            </span>
          )}
          <button
            onClick={handlePost}
            disabled={!canPost}
            onMouseEnter={() => setHoveredPostBtn(true)}
            onMouseLeave={() => setHoveredPostBtn(false)}
            style={{
              position: 'absolute',
              right: 6,
              bottom: 5,
              padding: '4px 12px',
              borderRadius: 7,
              border: 'none',
              background: canPost
                ? hoveredPostBtn
                  ? COLORS.primary
                  : COLORS.deepPurple
                : 'transparent',
              color: canPost ? '#fff' : COLORS.textMuted,
              fontSize: 11,
              fontWeight: 700,
              cursor: canPost ? 'pointer' : 'default',
              transition: `all 0.15s ${EASING}`,
            }}
          >
            {posting ? '...' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Helpers for immutable nested state updates ── */
function updateCommentVote(comments: Comment[], id: string, userVote: number, voteScore: number): Comment[] {
  return comments.map((c) => {
    if (c.id === id) return { ...c, userVote, voteScore };
    if (c.replies.length > 0) {
      const updatedReplies = updateCommentVote(c.replies, id, userVote, voteScore);
      if (updatedReplies !== c.replies) return { ...c, replies: updatedReplies };
    }
    return c;
  });
}

function addReplyToComment(comments: Comment[], parentId: string, reply: Comment): Comment[] {
  return comments.map((c) => {
    if (c.id === parentId) {
      return { ...c, replies: [...c.replies, reply], replyCount: c.replyCount + 1 };
    }
    if (c.replies.length > 0) {
      const updatedReplies = addReplyToComment(c.replies, parentId, reply);
      if (updatedReplies !== c.replies) return { ...c, replies: updatedReplies };
    }
    return c;
  });
}

function removeComment(comments: Comment[], id: string): Comment[] {
  return comments
    .filter((c) => c.id !== id)
    .map((c) => {
      if (c.replies.length > 0) {
        const updatedReplies = removeComment(c.replies, id);
        if (updatedReplies !== c.replies) return { ...c, replies: updatedReplies, replyCount: c.replyCount - 1 };
      }
      return c;
    });
}
