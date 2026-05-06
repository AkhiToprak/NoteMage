'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, Trash2 } from 'lucide-react';
import type { PageSummary } from '@/components/notebook/SectionTree';

interface PageLockInfo {
  lockedById: string;
  lockedByUsername: string;
  isSelf: boolean;
}

interface PageItemProps {
  page: PageSummary;
  notebookId: string;
  isActive: boolean;
  onRefresh: () => void;
  lockInfo?: PageLockInfo | null;
}

export default function PageItem({
  page,
  notebookId,
  isActive,
  onRefresh,
  lockInfo,
}: PageItemProps) {
  const [hovered, setHovered] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete "${page.title}"?`)) return;

    try {
      await fetch(`/api/notebooks/${notebookId}/pages/${page.id}`, { method: 'DELETE' });
      onRefresh();
    } catch {
      // silent
    }
  };

  return (
    <Link
      href={`/notebooks/${notebookId}/pages/${page.id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '5px 10px 5px 38px',
        borderRadius: '6px',
        textDecoration: 'none',
        fontFamily: 'inherit',
        fontSize: '13px',
        color: isActive ? '#ede9ff' : 'rgba(237,233,255,0.55)',
        fontWeight: isActive ? 500 : 400,
        background: isActive
          ? 'linear-gradient(135deg, rgba(140,82,255,0.25), rgba(81,112,255,0.15))'
          : hovered
            ? 'rgba(140,82,255,0.06)'
            : 'transparent',
        boxShadow: isActive ? 'inset 0 0 0 1px rgba(140,82,255,0.3)' : 'none',
        transition: 'background 0.12s ease, color 0.12s ease',
        position: 'relative',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <FileText
        size={14}
        style={{
          color: isActive ? '#8c52ff' : 'rgba(237,233,255,0.3)',
          flexShrink: 0,
        }}
      />
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          minWidth: 0,
        }}
      >
        {page.title}
      </span>

      {/* Lock indicator */}
      {lockInfo && (
        <span
          className="material-symbols-outlined"
          title={lockInfo.isSelf ? 'You are editing' : `${lockInfo.lockedByUsername} is editing`}
          style={{
            fontSize: 13,
            flexShrink: 0,
            color: lockInfo.isSelf ? '#60a5fa' : '#fb923c',
          }}
        >
          {lockInfo.isSelf ? 'edit' : 'lock'}
        </span>
      )}

      {hovered && !lockInfo && (
        <button
          onClick={handleDelete}
          title="Delete page"
          style={{
            flexShrink: 0,
            width: '20px',
            height: '20px',
            borderRadius: '4px',
            border: 'none',
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'rgba(237,233,255,0.35)',
            padding: 0,
            transition: 'color 0.12s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#fca5a5';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'rgba(237,233,255,0.35)';
          }}
        >
          <Trash2 size={12} />
        </button>
      )}
    </Link>
  );
}
