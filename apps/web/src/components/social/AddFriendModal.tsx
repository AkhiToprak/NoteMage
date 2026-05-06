'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserName } from '@/components/user/UserName';
import { UserAvatar } from '@/components/user/UserAvatar';

interface User {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  friendshipStatus: 'none' | 'pending_sent' | 'pending_received' | 'accepted';
  nameStyle?: { fontId?: string; colorId?: string } | null;
  equippedFrameId?: string | null;
  equippedTitleId?: string | null;
}

interface AddFriendModalProps {
  open: boolean;
  onClose: () => void;
}

const COLORS = {
  pageBg: '#1a1a36',
  cardBg: '#21213e',
  elevated: '#2d2d52',
  inputBg: '#35355c',
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

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

export default function AddFriendModal({ open, onClose }: AddFriendModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [hoveredClose, setHoveredClose] = useState(false);
  const [hoveredButtons, setHoveredButtons] = useState<Record<string, boolean>>({});

  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setResults([]);
      setError(null);
      setSearched(false);
      setLoading(false);
    }
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Debounced search
  const searchUsers = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery.trim())}`);
      if (!res.ok) {
        throw new Error('Failed to search users');
      }
      const json = await res.json();
      if (json.success) {
        setResults(json.data.users);
      } else {
        throw new Error(json.error || 'Search failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setResults([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!value.trim()) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      searchUsers(value);
    }, 300);
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleSendRequest = async (userId: string) => {
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) {
        throw new Error('Failed to send friend request');
      }

      setResults((prev) =>
        prev.map((user) =>
          user.id === userId ? { ...user, friendshipStatus: 'pending_sent' as const } : user
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send request');
    }
  };

  const handleAcceptRequest = async (userId: string) => {
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) {
        throw new Error('Failed to accept friend request');
      }

      setResults((prev) =>
        prev.map((user) =>
          user.id === userId ? { ...user, friendshipStatus: 'accepted' as const } : user
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept request');
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Focus trap
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !modalRef.current) return;

    const focusableEls = modalRef.current.querySelectorAll<HTMLElement>(
      'button, input, [tabindex]:not([tabindex="-1"])'
    );
    if (focusableEls.length === 0) return;

    const firstEl = focusableEls[0];
    const lastEl = focusableEls[focusableEls.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      }
    } else {
      if (document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
  };

  if (!open) return null;

  const renderAvatar = (user: User) => <UserAvatar user={user} size={40} radius="50%" />;

  const renderActionButton = (user: User) => {
    const isHovered = hoveredButtons[user.id] || false;

    switch (user.friendshipStatus) {
      case 'none':
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSendRequest(user.id);
            }}
            onMouseEnter={() => setHoveredButtons((p) => ({ ...p, [user.id]: true }))}
            onMouseLeave={() => setHoveredButtons((p) => ({ ...p, [user.id]: false }))}
            style={{
              background: isHovered ? COLORS.deepPurple : COLORS.primary,
              color: '#2a0066',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              padding: '6px 16px',
              border: 'none',
              cursor: 'pointer',
              transition: `all 0.2s ${EASING}`,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Add
          </button>
        );

      case 'pending_sent':
        return (
          <span
            style={{
              fontSize: 12,
              color: COLORS.textMuted,
              fontStyle: 'italic',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Pending
          </span>
        );

      case 'pending_received':
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleAcceptRequest(user.id);
            }}
            onMouseEnter={() => setHoveredButtons((p) => ({ ...p, [user.id]: true }))}
            onMouseLeave={() => setHoveredButtons((p) => ({ ...p, [user.id]: false }))}
            style={{
              background: isHovered ? '#38c96e' : COLORS.success,
              color: '#000',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              padding: '6px 16px',
              border: 'none',
              cursor: 'pointer',
              transition: `all 0.2s ${EASING}`,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Accept
          </button>
        );

      case 'accepted':
        return (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              color: COLORS.success,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              check_circle
            </span>
            Friends
          </span>
        );

      default:
        return null;
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                borderRadius: 12,
              }}
            >
              <div
                className="shimmer-skeleton"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div
                  className="shimmer-skeleton"
                  style={{ width: '40%', height: 14, borderRadius: 6 }}
                />
                <div
                  className="shimmer-skeleton"
                  style={{ width: '25%', height: 12, borderRadius: 6 }}
                />
              </div>
              <div
                className="shimmer-skeleton"
                style={{ width: 60, height: 28, borderRadius: 8, flexShrink: 0 }}
              />
            </div>
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 16px',
            gap: 8,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 32, color: COLORS.error }}>
            error
          </span>
          <span style={{ fontSize: 14, color: COLORS.error, textAlign: 'center' }}>{error}</span>
        </div>
      );
    }

    if (!searched && !query.trim()) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 16px',
            gap: 8,
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 40, color: COLORS.textMuted }}
          >
            group
          </span>
          <span style={{ fontSize: 14, color: COLORS.textSecondary }}>
            Search for people by username
          </span>
        </div>
      );
    }

    if (searched && results.length === 0) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 16px',
            gap: 8,
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 40, color: COLORS.textMuted }}
          >
            person_search
          </span>
          <span style={{ fontSize: 14, color: COLORS.textSecondary }}>No users found</span>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {results.map((user) => (
          <div
            key={user.id}
            onMouseEnter={() => setHoveredRow(user.id)}
            onMouseLeave={() => setHoveredRow(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              borderRadius: 12,
              background: hoveredRow === user.id ? COLORS.elevated : 'transparent',
              transition: `background 0.2s ${EASING}`,
              cursor: 'default',
            }}
          >
            {renderAvatar(user)}
            <div style={{ flex: 1, minWidth: 0 }}>
              <UserName
                as="div"
                user={user}
                preferUsername
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: COLORS.textPrimary,
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              />
              <div
                style={{
                  fontSize: 12,
                  color: COLORS.textSecondary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user.name}
              </div>
            </div>
            {renderActionButton(user)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <style>{`
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .shimmer-skeleton {
          background: linear-gradient(
            90deg,
            ${COLORS.elevated} 25%,
            ${COLORS.inputBg} 50%,
            ${COLORS.elevated} 75%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s ease-in-out infinite;
        }
        .add-friend-modal-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .add-friend-modal-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .add-friend-modal-scrollbar::-webkit-scrollbar-thumb {
          background: ${COLORS.border};
          border-radius: 3px;
        }
        .add-friend-modal-scrollbar::-webkit-scrollbar-thumb:hover {
          background: ${COLORS.textMuted};
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={handleBackdropClick}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'modalFadeIn 0.2s ease-out',
        }}
      >
        {/* Modal Card */}
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label="Find Friends"
          onKeyDown={handleKeyDown}
          style={{
            maxWidth: 480,
            width: 'calc(100% - 32px)',
            background: COLORS.cardBg,
            borderRadius: 24,
            padding: 32,
            boxShadow: '0 32px 64px rgba(0, 0, 0, 0.5)',
            animation: `modalSlideUp 0.3s ${EASING}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: COLORS.textPrimary,
                margin: 0,
                letterSpacing: '-0.01em',
              }}
            >
              Find Friends
            </h2>
            <button
              onClick={onClose}
              onMouseEnter={() => setHoveredClose(true)}
              onMouseLeave={() => setHoveredClose(false)}
              aria-label="Close"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                color: hoveredClose ? COLORS.textPrimary : COLORS.textMuted,
                transition: `color 0.2s ${EASING}`,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                close
              </span>
            </button>
          </div>

          {/* Search Input */}
          <div style={{ position: 'relative' }}>
            <span
              className="material-symbols-outlined"
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 20,
                color: COLORS.textMuted,
                pointerEvents: 'none',
              }}
            >
              search
            </span>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by username..."
              value={query}
              onChange={handleInputChange}
              style={{
                width: '100%',
                background: COLORS.inputBg,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 12,
                padding: '14px 14px 14px 44px',
                fontSize: 14,
                color: COLORS.textPrimary,
                outline: 'none',
                transition: `border-color 0.2s ${EASING}, box-shadow 0.2s ${EASING}`,
                boxSizing: 'border-box',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = COLORS.primary;
                e.currentTarget.style.boxShadow = `0 0 0 3px rgba(174, 137, 255, 0.15)`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = COLORS.border;
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          {/* Results */}
          <div
            className="add-friend-modal-scrollbar"
            style={{
              maxHeight: 320,
              overflowY: 'auto',
              margin: '0 -8px',
              padding: '0 8px',
            }}
          >
            {renderContent()}
          </div>
        </div>
      </div>
    </>
  );
}
