'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface ShareNotebookModalProps {
  open: boolean;
  onClose: () => void;
  notebookId: string;
  notebookName: string;
}

interface Friend {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
}

interface ShareInfo {
  id: string;
  type: 'copy' | 'live_view';
  visibility: 'public' | 'friends';
  sharedWithId?: string;
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

type Tab = 'community' | 'friend' | 'link';
type Visibility = 'public' | 'friends';
type ShareType = 'copy' | 'live_view';

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

export default function ShareNotebookModal({
  open,
  onClose,
  notebookId,
  notebookName,
}: ShareNotebookModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('community');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [shareType, setShareType] = useState<ShareType>('copy');
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareSuccess, setShareSuccess] = useState(false);

  // Existing share state
  const [existingShares, setExistingShares] = useState<ShareInfo[]>([]);
  const [loadingShares, setLoadingShares] = useState(false);
  const [isUnsharing, setIsUnsharing] = useState(false);

  // Friends state
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
  const [friendShareType, setFriendShareType] = useState<ShareType>('copy');
  const [isSendingToFriends, setIsSendingToFriends] = useState(false);
  const [friendSendSuccess, setFriendSendSuccess] = useState(false);

  // Publish fields state
  const [publishTitle, setPublishTitle] = useState('');
  const [publishDescription, setPublishDescription] = useState('');
  const [publishImagePreviews, setPublishImagePreviews] = useState<{ name: string; dataUrl: string }[]>([]);
  // uploadingImage state reserved for future use
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFiles = useRef<File[]>([]);

  // Link state
  const [copied, setCopied] = useState(false);

  // Hover states
  const [hoveredClose, setHoveredClose] = useState(false);
  const [hoveredTab, setHoveredTab] = useState<Tab | null>(null);
  const [hoveredVisibility, setHoveredVisibility] = useState<Visibility | null>(null);
  const [hoveredShareType, setHoveredShareType] = useState<string | null>(null);
  const [hoveredFriend, setHoveredFriend] = useState<string | null>(null);
  const [hoveredShareBtn, setHoveredShareBtn] = useState(false);
  const [hoveredUnshareBtn, setHoveredUnshareBtn] = useState(false);
  const [hoveredSendBtn, setHoveredSendBtn] = useState(false);
  const [hoveredCopyBtn, setHoveredCopyBtn] = useState(false);
  const [hoveredCloseBottom, setHoveredCloseBottom] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);

  const isPubliclyShared = existingShares.some((s) => s.visibility === 'public');
  const currentVisibility = existingShares.length > 0 ? existingShares[0].visibility : null;

  // Fetch existing shares
  const fetchShares = useCallback(async () => {
    setLoadingShares(true);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/share`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setExistingShares(json.data.shares || []);
        }
      }
    } catch {
      // Silently fail — shares just won't show
    } finally {
      setLoadingShares(false);
    }
  }, [notebookId]);

  // Fetch friends
  const fetchFriends = useCallback(async () => {
    setLoadingFriends(true);
    setFriendsError(null);
    try {
      const res = await fetch('/api/friends');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setFriends(json.data.friends || []);
        } else {
          setFriendsError('Failed to load friends');
        }
      } else {
        setFriendsError('Failed to load friends');
      }
    } catch {
      setFriendsError('Failed to load friends');
    } finally {
      setLoadingFriends(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchShares();
      fetchFriends();
      setShareError(null);
      setShareSuccess(false);
      setFriendSendSuccess(false);
      setSelectedFriendIds(new Set());
      setCopied(false);
      setPublishTitle(notebookName);
      setPublishDescription('');
      setPublishImagePreviews([]);
      pendingFiles.current = [];
    }
  }, [open, fetchShares, fetchFriends]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid immediate close on the same click that opened
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 10);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handler);
    };
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const handleShareCommunity = async () => {
    setIsSharing(true);
    setShareError(null);
    setShareSuccess(false);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: shareType,
          visibility,
          title: publishTitle.trim() || undefined,
          description: publishDescription.trim() || undefined,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          // Upload pending images to the newly created share
          const shareId = json.data?.share?.id;
          if (shareId && pendingFiles.current.length > 0) {
            for (const file of pendingFiles.current) {
              const formData = new FormData();
              formData.append('file', file);
              await fetch(`/api/community/notebooks/${shareId}/images`, {
                method: 'POST',
                body: formData,
              });
            }
            pendingFiles.current = [];
          }
          setShareSuccess(true);
          await fetchShares();
        } else {
          setShareError(json.error || 'Failed to share');
        }
      } else {
        const json = await res.json().catch(() => ({}));
        setShareError(json.error || 'Failed to share');
      }
    } catch {
      setShareError('Network error. Please try again.');
    } finally {
      setIsSharing(false);
    }
  };

  const handleUnshare = async () => {
    setIsUnsharing(true);
    setShareError(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/share`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setExistingShares([]);
        setShareSuccess(false);
      } else {
        setShareError('Failed to unshare');
      }
    } catch {
      setShareError('Network error. Please try again.');
    } finally {
      setIsUnsharing(false);
    }
  };

  const handleSendToFriends = async () => {
    if (selectedFriendIds.size === 0) return;
    setIsSendingToFriends(true);
    setShareError(null);
    setFriendSendSuccess(false);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: friendShareType,
          visibility: 'friends',
          sharedWithIds: Array.from(selectedFriendIds),
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setFriendSendSuccess(true);
          setSelectedFriendIds(new Set());
          await fetchShares();
        } else {
          setShareError(json.error || 'Failed to send');
        }
      } else {
        const json = await res.json().catch(() => ({}));
        setShareError(json.error || 'Failed to send');
      }
    } catch {
      setShareError('Network error. Please try again.');
    } finally {
      setIsSendingToFriends(false);
    }
  };

  const toggleFriend = (id: string) => {
    setSelectedFriendIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles = Array.from(files).slice(0, 10 - pendingFiles.current.length);
    for (const file of newFiles) {
      if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) continue;
      if (file.size > 5 * 1024 * 1024) continue;
      pendingFiles.current.push(file);
      const reader = new FileReader();
      reader.onload = () => {
        setPublishImagePreviews((prev) => [...prev, { name: file.name, dataUrl: reader.result as string }]);
      };
      reader.readAsDataURL(file);
    }
    // Reset input so re-selecting the same file works
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    pendingFiles.current.splice(index, 1);
    setPublishImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCopyLink = async () => {
    const link = `${window.location.origin}/community/notebooks?id=${notebookId}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = link;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!open) return null;

  const shareLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/community/notebooks?id=${notebookId}`;

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'community', label: 'Community', icon: 'public' },
    { key: 'friend', label: 'Send to Friend', icon: 'person_add' },
    { key: 'link', label: 'Link', icon: 'link' },
  ];

  const renderVisibilityToggle = () => {
    const options: { key: Visibility; label: string; icon: string }[] = [
      { key: 'public', label: 'Public', icon: 'public' },
      { key: 'friends', label: 'Friends Only', icon: 'group' },
    ];
    return (
      <div style={{ display: 'flex', gap: 10 }}>
        {options.map((opt) => {
          const isActive = visibility === opt.key;
          const isHovered = hoveredVisibility === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => setVisibility(opt.key)}
              onMouseEnter={() => setHoveredVisibility(opt.key)}
              onMouseLeave={() => setHoveredVisibility(null)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: 12,
                border: `1.5px solid ${isActive ? COLORS.primary : isHovered ? COLORS.textMuted : COLORS.border}`,
                background: isActive ? 'rgba(174,137,255,0.12)' : 'transparent',
                color: isActive ? COLORS.primary : isHovered ? COLORS.textSecondary : COLORS.textMuted,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: `all 0.2s ${EASING}`,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                {opt.icon}
              </span>
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  };

  const renderShareTypeToggle = (
    current: ShareType,
    onChange: (v: ShareType) => void,
    prefix: string
  ) => {
    const options: { key: ShareType; label: string; icon: string; desc: string }[] = [
      { key: 'copy', label: 'Copy', icon: 'content_copy', desc: 'Recipients get their own copy' },
      { key: 'live_view', label: 'Live View', icon: 'visibility', desc: 'Recipients see the original' },
    ];
    return (
      <div style={{ display: 'flex', gap: 10 }}>
        {options.map((opt) => {
          const isActive = current === opt.key;
          const hoverKey = `${prefix}-${opt.key}`;
          const isHovered = hoveredShareType === hoverKey;
          return (
            <button
              key={opt.key}
              onClick={() => onChange(opt.key)}
              onMouseEnter={() => setHoveredShareType(hoverKey)}
              onMouseLeave={() => setHoveredShareType(null)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: '12px 16px',
                borderRadius: 12,
                border: `1.5px solid ${isActive ? COLORS.primary : isHovered ? COLORS.textMuted : COLORS.border}`,
                background: isActive ? 'rgba(174,137,255,0.12)' : 'transparent',
                color: isActive ? COLORS.primary : isHovered ? COLORS.textSecondary : COLORS.textMuted,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: `all 0.2s ${EASING}`,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                {opt.icon}
              </span>
              <span>{opt.label}</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 400,
                  color: isActive ? COLORS.primary : COLORS.textMuted,
                  opacity: 0.8,
                }}
              >
                {opt.desc}
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  const renderCommunityTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Custom Title */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            color: COLORS.textSecondary,
            marginBottom: 8,
          }}
        >
          Title
        </label>
        <input
          type="text"
          value={publishTitle}
          onChange={(e) => setPublishTitle(e.target.value)}
          placeholder={notebookName}
          maxLength={200}
          style={{
            width: '100%',
            padding: '11px 14px',
            borderRadius: 10,
            border: `1.5px solid ${COLORS.border}`,
            background: COLORS.inputBg,
            color: COLORS.textPrimary,
            fontSize: 14,
            fontWeight: 600,
            outline: 'none',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            transition: `border-color 0.2s ${EASING}`,
          }}
          onFocus={(e) => (e.target.style.borderColor = COLORS.primary)}
          onBlur={(e) => (e.target.style.borderColor = COLORS.border)}
        />
      </div>

      {/* Description / Blog Text */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            color: COLORS.textSecondary,
            marginBottom: 8,
          }}
        >
          Description
          <span style={{ fontWeight: 400, color: COLORS.textMuted, marginLeft: 6 }}>optional</span>
        </label>
        <textarea
          value={publishDescription}
          onChange={(e) => setPublishDescription(e.target.value)}
          placeholder="Tell the community about this notebook..."
          maxLength={10000}
          rows={4}
          style={{
            width: '100%',
            padding: '11px 14px',
            borderRadius: 10,
            border: `1.5px solid ${COLORS.border}`,
            background: COLORS.inputBg,
            color: COLORS.textPrimary,
            fontSize: 13,
            lineHeight: 1.6,
            outline: 'none',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            resize: 'vertical',
            minHeight: 80,
            transition: `border-color 0.2s ${EASING}`,
          }}
          onFocus={(e) => (e.target.style.borderColor = COLORS.primary)}
          onBlur={(e) => (e.target.style.borderColor = COLORS.border)}
        />
      </div>

      {/* Image Upload */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            color: COLORS.textSecondary,
            marginBottom: 8,
          }}
        >
          Images
          <span style={{ fontWeight: 400, color: COLORS.textMuted, marginLeft: 6 }}>optional, max 10</span>
        </label>

        {/* Image previews */}
        {publishImagePreviews.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 10,
            }}
          >
            {publishImagePreviews.map((img, i) => (
              <div
                key={i}
                style={{
                  position: 'relative',
                  width: 72,
                  height: 72,
                  borderRadius: 10,
                  overflow: 'hidden',
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <img
                  src={img.dataUrl}
                  alt={img.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
                <button
                  onClick={() => removeImage(i)}
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(0,0,0,0.6)',
                    color: '#fff',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                    close
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          onChange={handleImageSelect}
          style={{ display: 'none' }}
        />
        {publishImagePreviews.length < 10 && (
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 10,
              border: `1.5px dashed ${COLORS.border}`,
              background: 'transparent',
              color: COLORS.textMuted,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: `all 0.2s ${EASING}`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = COLORS.primary;
              e.currentTarget.style.color = COLORS.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = COLORS.border;
              e.currentTarget.style.color = COLORS.textMuted;
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              add_photo_alternate
            </span>
            Add images
          </button>
        )}
      </div>

      <div>
        <label
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            color: COLORS.textSecondary,
            marginBottom: 10,
          }}
        >
          Visibility
        </label>
        {renderVisibilityToggle()}
      </div>

      <div>
        <label
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            color: COLORS.textSecondary,
            marginBottom: 10,
          }}
        >
          Share Type
        </label>
        {renderShareTypeToggle(shareType, setShareType, 'community')}
      </div>

      {shareError && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(253,111,133,0.1)',
            border: `1px solid ${COLORS.error}`,
            color: COLORS.error,
            fontSize: 13,
          }}
        >
          {shareError}
        </div>
      )}

      {shareSuccess && !existingShares.length && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(74,222,128,0.1)',
            border: `1px solid ${COLORS.success}`,
            color: COLORS.success,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            check_circle
          </span>
          Shared successfully!
        </div>
      )}

      <button
        onClick={handleShareCommunity}
        disabled={isSharing}
        onMouseEnter={() => setHoveredShareBtn(true)}
        onMouseLeave={() => setHoveredShareBtn(false)}
        style={{
          width: '100%',
          padding: '13px 20px',
          borderRadius: 12,
          border: 'none',
          background: hoveredShareBtn
            ? `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.deepPurple2})`
            : `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.deepPurple})`,
          color: '#fff',
          fontSize: 14,
          fontWeight: 700,
          cursor: isSharing ? 'wait' : 'pointer',
          opacity: isSharing ? 0.7 : 1,
          transition: `all 0.2s ${EASING}`,
          transform: hoveredShareBtn && !isSharing ? 'translateY(-1px)' : 'none',
          boxShadow: hoveredShareBtn
            ? '0 8px 24px rgba(174,137,255,0.3)'
            : '0 4px 16px rgba(174,137,255,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {isSharing ? (
          <>
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: 18,
                animation: 'spin 1s linear infinite',
              }}
            >
              progress_activity
            </span>
            Sharing...
          </>
        ) : (
          <>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              share
            </span>
            Share with Community
          </>
        )}
      </button>

      {existingShares.length > 0 && (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            background: COLORS.elevated,
            border: `1px solid ${COLORS.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: COLORS.textSecondary,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: COLORS.success }}>
              check_circle
            </span>
            Currently shared as{' '}
            <span style={{ color: COLORS.primary, fontWeight: 600 }}>
              {currentVisibility === 'public' ? 'Public' : 'Friends Only'}
            </span>
          </div>
          <button
            onClick={handleUnshare}
            disabled={isUnsharing}
            onMouseEnter={() => setHoveredUnshareBtn(true)}
            onMouseLeave={() => setHoveredUnshareBtn(false)}
            style={{
              width: '100%',
              padding: '10px 16px',
              borderRadius: 10,
              border: `1.5px solid ${COLORS.error}`,
              background: hoveredUnshareBtn ? 'rgba(253,111,133,0.1)' : 'transparent',
              color: COLORS.error,
              fontSize: 13,
              fontWeight: 600,
              cursor: isUnsharing ? 'wait' : 'pointer',
              opacity: isUnsharing ? 0.7 : 1,
              transition: `all 0.2s ${EASING}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            {isUnsharing ? (
              <>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 16, animation: 'spin 1s linear infinite' }}
                >
                  progress_activity
                </span>
                Unsharing...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  delete
                </span>
                Unshare
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );

  const renderFriendTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {loadingFriends ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 40,
            color: COLORS.textMuted,
            fontSize: 14,
            gap: 10,
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 20, animation: 'spin 1s linear infinite' }}
          >
            progress_activity
          </span>
          Loading friends...
        </div>
      ) : friendsError ? (
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 12,
            background: 'rgba(253,111,133,0.08)',
            border: `1px solid rgba(253,111,133,0.2)`,
            color: COLORS.error,
            fontSize: 13,
            textAlign: 'center',
          }}
        >
          {friendsError}
        </div>
      ) : friends.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            gap: 12,
            color: COLORS.textMuted,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 40, opacity: 0.5 }}>
            group_off
          </span>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Add friends to share notebooks</span>
        </div>
      ) : (
        <>
          <div
            style={{
              maxHeight: 220,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              marginLeft: -4,
              marginRight: -4,
              paddingLeft: 4,
              paddingRight: 4,
            }}
          >
            {friends.map((friend) => {
              const isSelected = selectedFriendIds.has(friend.id);
              const isHovered = hoveredFriend === friend.id;
              return (
                <button
                  key={friend.id}
                  onClick={() => toggleFriend(friend.id)}
                  onMouseEnter={() => setHoveredFriend(friend.id)}
                  onMouseLeave={() => setHoveredFriend(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: 'none',
                    background: isSelected
                      ? 'rgba(174,137,255,0.08)'
                      : isHovered
                      ? 'rgba(255,255,255,0.07)'
                      : 'transparent',
                    cursor: 'pointer',
                    transition: `all 0.2s ${EASING}`,
                    width: '100%',
                    textAlign: 'left',
                  }}
                >
                  {/* Checkbox */}
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      border: `2px solid ${isSelected ? COLORS.primary : COLORS.border}`,
                      background: isSelected ? COLORS.primary : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: `all 0.2s ${EASING}`,
                    }}
                  >
                    {isSelected && (
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: 14, color: '#fff', fontWeight: 700 }}
                      >
                        check
                      </span>
                    )}
                  </div>

                  {/* Avatar */}
                  {friend.avatarUrl ? (
                    <img
                      src={friend.avatarUrl}
                      alt={friend.username}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        objectFit: 'cover',
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        background: getAvatarGradient(friend.id),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        fontWeight: 700,
                        color: '#fff',
                        flexShrink: 0,
                      }}
                    >
                      {(friend.username || friend.name || '?')[0].toUpperCase()}
                    </div>
                  )}

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: COLORS.textPrimary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {friend.username}
                    </div>
                    {friend.name && (
                      <div
                        style={{
                          fontSize: 12,
                          color: COLORS.textMuted,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {friend.name}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                color: COLORS.textSecondary,
                marginBottom: 10,
              }}
            >
              Share Type
            </label>
            {renderShareTypeToggle(friendShareType, setFriendShareType, 'friend')}
          </div>

          {friendSendSuccess && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(74,222,128,0.1)',
                border: `1px solid ${COLORS.success}`,
                color: COLORS.success,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                check_circle
              </span>
              Sent successfully!
            </div>
          )}

          <button
            onClick={handleSendToFriends}
            disabled={selectedFriendIds.size === 0 || isSendingToFriends}
            onMouseEnter={() => setHoveredSendBtn(true)}
            onMouseLeave={() => setHoveredSendBtn(false)}
            style={{
              width: '100%',
              padding: '13px 20px',
              borderRadius: 12,
              border: 'none',
              background:
                selectedFriendIds.size === 0
                  ? COLORS.elevated
                  : hoveredSendBtn
                  ? `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.deepPurple2})`
                  : `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.deepPurple})`,
              color: selectedFriendIds.size === 0 ? COLORS.textMuted : '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor:
                selectedFriendIds.size === 0 || isSendingToFriends ? 'not-allowed' : 'pointer',
              opacity: isSendingToFriends ? 0.7 : 1,
              transition: `all 0.2s ${EASING}`,
              transform:
                hoveredSendBtn && selectedFriendIds.size > 0 && !isSendingToFriends
                  ? 'translateY(-1px)'
                  : 'none',
              boxShadow:
                selectedFriendIds.size > 0 && hoveredSendBtn
                  ? '0 8px 24px rgba(174,137,255,0.3)'
                  : selectedFriendIds.size > 0
                  ? '0 4px 16px rgba(174,137,255,0.15)'
                  : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {isSendingToFriends ? (
              <>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 18, animation: 'spin 1s linear infinite' }}
                >
                  progress_activity
                </span>
                Sending...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  send
                </span>
                {selectedFriendIds.size === 0
                  ? 'Select friends to send'
                  : `Send to ${selectedFriendIds.size} friend${selectedFriendIds.size > 1 ? 's' : ''}`}
              </>
            )}
          </button>
        </>
      )}
    </div>
  );

  const renderLinkTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {isPubliclyShared ? (
        <>
          <label
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: COLORS.textSecondary,
            }}
          >
            Shareable Link
          </label>
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'stretch',
            }}
          >
            <input
              type="text"
              readOnly
              value={shareLink}
              style={{
                flex: 1,
                padding: '11px 14px',
                borderRadius: 10,
                border: `1.5px solid ${COLORS.border}`,
                background: COLORS.inputBg,
                color: COLORS.textPrimary,
                fontSize: 13,
                outline: 'none',
                fontFamily: 'monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              onFocus={(e) => e.target.select()}
            />
            <button
              onClick={handleCopyLink}
              onMouseEnter={() => setHoveredCopyBtn(true)}
              onMouseLeave={() => setHoveredCopyBtn(false)}
              style={{
                padding: '0 18px',
                borderRadius: 10,
                border: 'none',
                background: copied
                  ? COLORS.success
                  : hoveredCopyBtn
                  ? COLORS.primary
                  : COLORS.elevated,
                color: copied ? '#fff' : hoveredCopyBtn ? '#fff' : COLORS.textPrimary,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: `all 0.2s ${EASING}`,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                {copied ? 'check' : 'content_copy'}
              </span>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            gap: 12,
            color: COLORS.textMuted,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 40, opacity: 0.5 }}>
            link_off
          </span>
          <span style={{ fontSize: 14, fontWeight: 500, textAlign: 'center' }}>
            Share publicly first to get a link
          </span>
          <span style={{ fontSize: 12, color: COLORS.textMuted, opacity: 0.7 }}>
            Go to the Community tab and share as Public
          </span>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Inline keyframes */}
      <style>{`
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'modalFadeIn 0.2s ease-out',
        }}
      >
        {/* Modal */}
        <div
          ref={modalRef}
          style={{
            maxWidth: 520,
            width: 'calc(100% - 32px)',
            background: COLORS.cardBg,
            borderRadius: 24,
            boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
            animation: 'modalSlideUp 0.3s cubic-bezier(0.22,1,0.36,1)',
            maxHeight: 'calc(100vh - 48px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ padding: '28px 28px 0' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 20,
                    fontWeight: 700,
                    color: COLORS.textPrimary,
                    lineHeight: 1.3,
                  }}
                >
                  Share Notebook
                </h2>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: 14,
                    color: COLORS.textSecondary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {notebookName}
                </p>
              </div>
              <button
                onClick={onClose}
                onMouseEnter={() => setHoveredClose(true)}
                onMouseLeave={() => setHoveredClose(false)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: 'none',
                  background: hoveredClose ? COLORS.elevated : 'transparent',
                  color: hoveredClose ? COLORS.textPrimary : COLORS.textMuted,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: `all 0.2s ${EASING}`,
                  flexShrink: 0,
                  marginLeft: 12,
                }}
                aria-label="Close"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                  close
                </span>
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div
            style={{
              display: 'flex',
              padding: '20px 28px 0',
              gap: 0,
              borderBottom: `1px solid ${COLORS.border}`,
            }}
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              const isHovered = hoveredTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    setActiveTab(tab.key);
                    setShareError(null);
                  }}
                  onMouseEnter={() => setHoveredTab(tab.key)}
                  onMouseLeave={() => setHoveredTab(null)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '10px 8px 14px',
                    border: 'none',
                    borderBottom: `2px solid ${isActive ? COLORS.primary : 'transparent'}`,
                    background: 'transparent',
                    color: isActive
                      ? COLORS.primary
                      : isHovered
                      ? COLORS.textSecondary
                      : COLORS.textMuted,
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 500,
                    cursor: 'pointer',
                    transition: `all 0.2s ${EASING}`,
                    marginBottom: -1,
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

          {/* Tab content */}
          <div
            style={{
              padding: 28,
              overflowY: 'auto',
              flex: 1,
            }}
          >
            {loadingShares && activeTab !== 'friend' ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 40,
                  color: COLORS.textMuted,
                  gap: 10,
                  fontSize: 14,
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 20, animation: 'spin 1s linear infinite' }}
                >
                  progress_activity
                </span>
                Loading...
              </div>
            ) : activeTab === 'community' ? (
              renderCommunityTab()
            ) : activeTab === 'friend' ? (
              renderFriendTab()
            ) : (
              renderLinkTab()
            )}
          </div>

          {/* Bottom close button */}
          <div style={{ padding: '0 28px 28px' }}>
            <button
              onClick={onClose}
              onMouseEnter={() => setHoveredCloseBottom(true)}
              onMouseLeave={() => setHoveredCloseBottom(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: hoveredCloseBottom ? COLORS.textSecondary : COLORS.textMuted,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                padding: '8px 0',
                transition: `color 0.2s ${EASING}`,
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
