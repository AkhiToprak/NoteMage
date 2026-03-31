'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export interface NotebookPreviewCardProps {
  shareId: string;
  notebookId: string;
  name: string;
  subject?: string | null;
  color?: string | null;
  sectionCount: number;
  shareType: string;
  title?: string | null;
  description?: string | null;
  author: { id: string; username: string; avatarUrl?: string | null };
  sharedAt: string;
  onCopy?: (notebookId: string) => void;
  isAdmin?: boolean;
  onAdminDelete?: (shareId: string) => void;
}

const TRANSITION = 'cubic-bezier(0.22,1,0.36,1)';

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getInitial(username: string): string {
  return username.charAt(0).toUpperCase();
}

export default function NotebookPreviewCard({
  shareId,
  notebookId,
  name,
  subject,
  color,
  sectionCount,
  shareType,
  title,
  description,
  author,
  sharedAt,
  onCopy,
  isAdmin,
  onAdminDelete,
}: NotebookPreviewCardProps) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const [copyBtnHovered, setCopyBtnHovered] = useState(false);
  const [copying, setCopying] = useState(false);
  const [adminDeleteHovered, setAdminDeleteHovered] = useState(false);
  const [adminDeleting, setAdminDeleting] = useState(false);

  const accentColor = color || '#ae89ff';
  const isLive = shareType.toLowerCase() === 'live';

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onCopy || copying) return;
    setCopying(true);
    try {
      await onCopy(notebookId);
    } finally {
      setCopying(false);
    }
  };

  const handleAdminDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onAdminDelete || adminDeleting) return;
    setAdminDeleting(true);
    try {
      await onAdminDelete(shareId);
    } finally {
      setAdminDeleting(false);
    }
  };

  const handleCardClick = () => {
    router.push(`/community/${shareId}`);
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleCardClick}
      style={{
        position: 'relative',
        background: '#161630',
        borderRadius: '16px',
        overflow: 'hidden',
        border: `1px solid ${hovered ? 'rgba(174,137,255,0.3)' : '#555578'}`,
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered
          ? '0 8px 24px rgba(174,137,255,0.12)'
          : '0 2px 8px rgba(0,0,0,0.2)',
        transition: `transform 0.2s ${TRANSITION}, box-shadow 0.2s ${TRANSITION}, border-color 0.2s ${TRANSITION}`,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top color bar */}
      <div
        style={{
          height: '4px',
          width: '100%',
          background: accentColor,
          flexShrink: 0,
        }}
      />

      {/* Card body */}
      <div
        style={{
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          flex: 1,
        }}
      >
        {/* Name + subject */}
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 700,
              color: '#e5e3ff',
              lineHeight: 1.35,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title || name}
          </h3>

          {description && (
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '12px',
                color: '#aaa8c8',
                lineHeight: 1.4,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {description}
            </p>
          )}

          {subject && (
            <span
              style={{
                display: 'inline-block',
                marginTop: '8px',
                padding: '2px 8px',
                background: 'rgba(174,137,255,0.15)',
                color: '#ae89ff',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '6px',
                lineHeight: '18px',
              }}
            >
              {subject}
            </span>
          )}
        </div>

        {/* Author row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {author.avatarUrl ? (
            <Image
              src={author.avatarUrl}
              alt={author.username}
              width={24}
              height={24}
              style={{
                borderRadius: '50%',
                objectFit: 'cover',
              }}
            />
          ) : (
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #ae89ff 0%, #884efb 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 700,
                color: '#fff',
                flexShrink: 0,
              }}
            >
              {getInitial(author.username)}
            </div>
          )}
          <span
            style={{
              fontSize: '12px',
              color: '#aaa8c8',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {author.username}
          </span>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Bottom row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '12px',
            borderTop: '1px solid rgba(70,69,96,0.15)',
          }}
        >
          {/* Section count */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: '#8888a8',
              fontSize: '12px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
              folder
            </span>
            <span>
              {sectionCount} section{sectionCount !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Share type badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              padding: '2px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              background: isLive ? 'rgba(74,222,128,0.12)' : 'rgba(174,137,255,0.12)',
              color: isLive ? '#4ade80' : '#ae89ff',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
              {isLive ? 'sync' : 'content_copy'}
            </span>
            {isLive ? 'Live' : 'Copy'}
          </div>
        </div>

        {/* Shared at */}
        <div
          style={{
            fontSize: '10px',
            color: '#8888a8',
            fontStyle: 'italic',
          }}
        >
          Shared {timeAgo(sharedAt)}
        </div>
      </div>

      {/* Get Copy button — appears on hover */}
      {onCopy && (
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            right: '16px',
            opacity: hovered ? 1 : 0,
            transform: hovered ? 'translateY(0)' : 'translateY(4px)',
            transition: `opacity 0.2s ${TRANSITION}, transform 0.2s ${TRANSITION}`,
            pointerEvents: hovered ? 'auto' : 'none',
          }}
        >
          <button
            onClick={handleCopy}
            disabled={copying}
            onMouseEnter={() => setCopyBtnHovered(true)}
            onMouseLeave={() => setCopyBtnHovered(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 14px',
              background: copyBtnHovered ? '#8348f6' : '#ae89ff',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '9999px',
              cursor: copying ? 'wait' : 'pointer',
              transition: `background 0.2s ${TRANSITION}`,
              fontFamily: 'inherit',
              opacity: copying ? 0.7 : 1,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
              {copying ? 'hourglass_empty' : 'content_copy'}
            </span>
            {copying ? 'Copying...' : 'Get Copy'}
          </button>
        </div>
      )}

      {/* Admin delete button — appears on hover for admins only */}
      {isAdmin && onAdminDelete && (
        <div
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            opacity: hovered ? 1 : 0,
            transition: `opacity 0.2s ${TRANSITION}`,
            pointerEvents: hovered ? 'auto' : 'none',
          }}
        >
          <button
            onClick={handleAdminDelete}
            disabled={adminDeleting}
            onMouseEnter={() => setAdminDeleteHovered(true)}
            onMouseLeave={() => setAdminDeleteHovered(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              background: adminDeleteHovered ? 'rgba(253,111,133,0.2)' : 'rgba(253,111,133,0.1)',
              color: '#fd6f85',
              fontSize: '11px',
              fontWeight: 600,
              border: '1px solid rgba(253,111,133,0.25)',
              borderRadius: '8px',
              cursor: adminDeleting ? 'wait' : 'pointer',
              transition: `background 0.15s ${TRANSITION}`,
              fontFamily: 'inherit',
              opacity: adminDeleting ? 0.7 : 1,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
              delete
            </span>
            {adminDeleting ? '...' : 'Remove'}
          </button>
        </div>
      )}
    </div>
  );
}
