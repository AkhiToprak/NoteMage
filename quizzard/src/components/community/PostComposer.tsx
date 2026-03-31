'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import VisibilitySelector, { PostVisibility } from './VisibilitySelector';
import PollCreator, { PollData } from './PollCreator';
import NotebookLinkPicker from './NotebookLinkPicker';

interface PostComposerProps {
  onPostCreated?: () => void;
}

const EASING = 'cubic-bezier(0.22,1,0.36,1)';
const MAX_CONTENT = 2000;
const MAX_IMAGES = 4;

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

interface LinkedNotebook {
  id: string;
  name: string;
  subject: string | null;
  color: string | null;
}

interface ImagePreview {
  file: File;
  url: string;
}

export default function PostComposer({ onPostCreated }: PostComposerProps) {
  const { data: session } = useSession();
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [poll, setPoll] = useState<PollData | null>(null);
  const [linkedNotebook, setLinkedNotebook] = useState<LinkedNotebook | null>(null);
  const [notebookPickerOpen, setNotebookPickerOpen] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hover states
  const [hoveredImageBtn, setHoveredImageBtn] = useState(false);
  const [hoveredPollBtn, setHoveredPollBtn] = useState(false);
  const [hoveredNbBtn, setHoveredNbBtn] = useState(false);
  const [hoveredPostBtn, setHoveredPostBtn] = useState(false);
  const [hoveredRemoveImg, setHoveredRemoveImg] = useState<number | null>(null);
  const [hoveredRemoveNb, setHoveredRemoveNb] = useState(false);
  const [focused, setFocused] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const user = session?.user as { id?: string; username?: string; avatarUrl?: string } | undefined;

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [content, autoResize]);

  // Cleanup image URLs on unmount
  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const remaining = MAX_IMAGES - images.length;
    const selected = Array.from(files).slice(0, remaining);
    const previews = selected.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setImages((prev) => [...prev, ...previews]);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (idx: number) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[idx].url);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handlePost = async () => {
    if (!content.trim() || isPosting) return;
    setIsPosting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('content', content.trim());
      formData.append('visibility', visibility);

      if (linkedNotebook) {
        formData.append('notebookRef', linkedNotebook.id);
      }

      for (const img of images) {
        formData.append('images', img.file);
      }

      if (poll) {
        formData.append('poll', JSON.stringify(poll));
      }

      const res = await fetch('/api/posts', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          // Reset form
          setContent('');
          setVisibility('public');
          setImages([]);
          setPoll(null);
          setLinkedNotebook(null);
          onPostCreated?.();
        } else {
          setError(json.error || 'Failed to create post');
        }
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || 'Failed to create post');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsPosting(false);
    }
  };

  const charCount = content.length;
  const showCharCount = charCount > 1800;
  const isOverLimit = charCount > MAX_CONTENT;
  const canPost = content.trim().length > 0 && !isOverLimit && !isPosting;

  return (
    <>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div
        style={{
          background: COLORS.cardBg,
          borderRadius: 20,
          border: `1px solid ${focused ? 'rgba(174,137,255,0.25)' : COLORS.border}`,
          padding: 20,
          transition: `border-color 0.2s ${EASING}`,
        }}
      >
        <div style={{ display: 'flex', gap: 14 }}>
          {/* Avatar */}
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.username || ''}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                objectFit: 'cover',
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: getAvatarGradient(user?.id || ''),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 15,
                fontWeight: 700,
                color: '#fff',
                flexShrink: 0,
              }}
            >
              {(user?.username || '?')[0].toUpperCase()}
            </div>
          )}

          {/* Content area */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <textarea
              ref={textareaRef}
              placeholder="Share something with the community..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              rows={1}
              style={{
                width: '100%',
                minHeight: 44,
                maxHeight: 240,
                resize: 'none',
                border: 'none',
                background: 'transparent',
                color: COLORS.textPrimary,
                fontSize: 14,
                lineHeight: 1.6,
                outline: 'none',
                padding: 0,
                fontFamily: 'inherit',
                whiteSpace: 'pre-wrap',
                boxSizing: 'border-box',
              }}
            />

            {/* Character counter */}
            {showCharCount && (
              <div
                style={{
                  textAlign: 'right',
                  fontSize: 11,
                  fontWeight: 600,
                  color: isOverLimit ? COLORS.error : COLORS.textMuted,
                  marginTop: 4,
                }}
              >
                {charCount}/{MAX_CONTENT}
              </div>
            )}

            {/* Image previews */}
            {images.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: images.length === 1 ? '1fr' : '1fr 1fr',
                  gap: 8,
                  marginTop: 12,
                }}
              >
                {images.map((img, idx) => (
                  <div
                    key={idx}
                    style={{
                      position: 'relative',
                      borderRadius: 12,
                      overflow: 'hidden',
                      aspectRatio: images.length === 1 ? '16/9' : '1',
                    }}
                  >
                    <img
                      src={img.url}
                      alt=""
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                    <button
                      onClick={() => removeImage(idx)}
                      onMouseEnter={() => setHoveredRemoveImg(idx)}
                      onMouseLeave={() => setHoveredRemoveImg(null)}
                      style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        border: 'none',
                        background:
                          hoveredRemoveImg === idx
                            ? 'rgba(253,111,133,0.9)'
                            : 'rgba(0,0,0,0.6)',
                        color: '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: `all 0.15s ${EASING}`,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                        close
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Linked notebook chip */}
            {linkedNotebook && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 12,
                  padding: '6px 10px 6px 8px',
                  borderRadius: 10,
                  background: COLORS.elevated,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 3,
                    background: linkedNotebook.color || COLORS.primary,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: COLORS.textPrimary,
                    maxWidth: 180,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {linkedNotebook.name}
                </span>
                <button
                  onClick={() => setLinkedNotebook(null)}
                  onMouseEnter={() => setHoveredRemoveNb(true)}
                  onMouseLeave={() => setHoveredRemoveNb(false)}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    border: 'none',
                    background: hoveredRemoveNb ? 'rgba(253,111,133,0.15)' : 'transparent',
                    color: hoveredRemoveNb ? COLORS.error : COLORS.textMuted,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: `all 0.15s ${EASING}`,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                    close
                  </span>
                </button>
              </div>
            )}

            {/* Poll creator */}
            {poll && (
              <div style={{ marginTop: 14 }}>
                <PollCreator
                  value={poll}
                  onChange={setPoll}
                  onRemove={() => setPoll(null)}
                />
              </div>
            )}

            {/* Error */}
            {error && (
              <div
                style={{
                  marginTop: 12,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'rgba(253,111,133,0.08)',
                  border: `1px solid rgba(253,111,133,0.2)`,
                  color: COLORS.error,
                  fontSize: 12,
                }}
              >
                {error}
              </div>
            )}

            {/* Toolbar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 14,
                paddingTop: 14,
                borderTop: `1px solid rgba(70,69,96,0.4)`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {/* Image upload */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  onChange={handleImageSelect}
                  style={{ display: 'none' }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={images.length >= MAX_IMAGES}
                  onMouseEnter={() => setHoveredImageBtn(true)}
                  onMouseLeave={() => setHoveredImageBtn(false)}
                  title={images.length >= MAX_IMAGES ? 'Max 4 images' : 'Add images'}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    border: 'none',
                    background: hoveredImageBtn ? 'rgba(174,137,255,0.1)' : 'transparent',
                    color:
                      images.length >= MAX_IMAGES
                        ? COLORS.textMuted
                        : hoveredImageBtn
                        ? COLORS.primary
                        : COLORS.textSecondary,
                    cursor: images.length >= MAX_IMAGES ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: `all 0.15s ${EASING}`,
                    opacity: images.length >= MAX_IMAGES ? 0.5 : 1,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                    image
                  </span>
                </button>

                {/* Poll toggle */}
                <button
                  onClick={() => {
                    if (poll) {
                      setPoll(null);
                    } else {
                      setPoll({ question: '', options: ['', ''] });
                    }
                  }}
                  onMouseEnter={() => setHoveredPollBtn(true)}
                  onMouseLeave={() => setHoveredPollBtn(false)}
                  title={poll ? 'Remove poll' : 'Add poll'}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    border: 'none',
                    background: poll
                      ? 'rgba(174,137,255,0.12)'
                      : hoveredPollBtn
                      ? 'rgba(174,137,255,0.1)'
                      : 'transparent',
                    color: poll
                      ? COLORS.primary
                      : hoveredPollBtn
                      ? COLORS.primary
                      : COLORS.textSecondary,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: `all 0.15s ${EASING}`,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                    ballot
                  </span>
                </button>

                {/* Notebook link */}
                <button
                  onClick={() => setNotebookPickerOpen(true)}
                  onMouseEnter={() => setHoveredNbBtn(true)}
                  onMouseLeave={() => setHoveredNbBtn(false)}
                  title={linkedNotebook ? 'Change notebook' : 'Link notebook'}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    border: 'none',
                    background: linkedNotebook
                      ? 'rgba(174,137,255,0.12)'
                      : hoveredNbBtn
                      ? 'rgba(174,137,255,0.1)'
                      : 'transparent',
                    color: linkedNotebook
                      ? COLORS.primary
                      : hoveredNbBtn
                      ? COLORS.primary
                      : COLORS.textSecondary,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: `all 0.15s ${EASING}`,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                    menu_book
                  </span>
                </button>

                {/* Divider */}
                <div
                  style={{
                    width: 1,
                    height: 20,
                    background: COLORS.border,
                    margin: '0 6px',
                  }}
                />

                {/* Visibility */}
                <VisibilitySelector value={visibility} onChange={setVisibility} />
              </div>

              {/* Post button */}
              <button
                onClick={handlePost}
                disabled={!canPost}
                onMouseEnter={() => setHoveredPostBtn(true)}
                onMouseLeave={() => setHoveredPostBtn(false)}
                style={{
                  padding: '8px 22px',
                  borderRadius: 10,
                  border: 'none',
                  background: canPost
                    ? hoveredPostBtn
                      ? `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.deepPurple2})`
                      : `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.deepPurple})`
                    : COLORS.elevated,
                  color: canPost ? '#fff' : COLORS.textMuted,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: canPost ? 'pointer' : 'not-allowed',
                  transition: `all 0.2s ${EASING}`,
                  transform: hoveredPostBtn && canPost ? 'translateY(-1px)' : 'none',
                  boxShadow:
                    hoveredPostBtn && canPost
                      ? '0 6px 20px rgba(174,137,255,0.3)'
                      : canPost
                      ? '0 3px 12px rgba(174,137,255,0.15)'
                      : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {isPosting ? (
                  <>
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 16, animation: 'spin 1s linear infinite' }}
                    >
                      progress_activity
                    </span>
                    Posting...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                      send
                    </span>
                    Post
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Notebook Link Picker Modal */}
      <NotebookLinkPicker
        open={notebookPickerOpen}
        onClose={() => setNotebookPickerOpen(false)}
        onSelect={setLinkedNotebook}
      />
    </>
  );
}
