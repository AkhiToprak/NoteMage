'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Plus, FolderPlus } from 'lucide-react';
import { useNotebookWorkspace } from '@/components/notebook/NotebookWorkspaceContext';
import SectionListItem from '@/components/notebook/SectionListItem';

export default function SectionPanel() {
  const { notebookId, notebook, sections, refreshSections, isMageView } = useNotebookWorkspace();
  const [isCreating, setIsCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const accentColor = notebook?.color || '#8c52ff';

  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreating]);

  const handleCreate = useCallback(async () => {
    const title = draftTitle.trim();
    if (!title) {
      setIsCreating(false);
      setDraftTitle('');
      return;
    }
    try {
      await fetch(`/api/notebooks/${notebookId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      setDraftTitle('');
      setIsCreating(false);
      refreshSections();
    } catch {
      setIsCreating(false);
      setDraftTitle('');
    }
  }, [notebookId, draftTitle, refreshSections]);

  return (
    <aside
      style={{
        width: '180px',
        minWidth: '180px',
        background: '#1a1a36',
        borderRight: '1px solid rgba(140,82,255,0.1)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        fontFamily: 'inherit',
      }}
    >
      {/* Logo + notebook name */}
      <div
        style={{
          padding: '14px 14px 10px',
          borderBottom: '1px solid rgba(140,82,255,0.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <Link href="/home">
          <Image
            src="/logo_trimmed.png"
            alt="Notemage"
            width={120}
            height={30}
            style={{ objectFit: 'contain', objectPosition: 'left', cursor: 'pointer' }}
          />
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Link
            href="/notebooks"
            title="Back to notebooks"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '22px',
              height: '22px',
              borderRadius: '5px',
              background: 'transparent',
              border: 'none',
              textDecoration: 'none',
              color: 'rgba(237,233,255,0.4)',
              flexShrink: 0,
              transition: 'color 0.12s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(237,233,255,0.8)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(237,233,255,0.4)';
            }}
          >
            <ArrowLeft size={14} />
          </Link>
          <div
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: accentColor,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#ede9ff',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
            }}
          >
            {notebook?.name ?? '...'}
          </span>
        </div>
      </div>

      {/* Section list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sections.map((section) => (
          <SectionListItem key={section.id} section={section} />
        ))}

        {/* Inline section creation */}
        {isCreating && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              borderLeft: '3px solid rgba(140,82,255,0.4)',
            }}
          >
            <FolderPlus size={12} style={{ color: 'rgba(237,233,255,0.3)', flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreate();
                } else if (e.key === 'Escape') {
                  setIsCreating(false);
                  setDraftTitle('');
                }
              }}
              placeholder="Section name..."
              style={{
                flex: 1,
                minWidth: 0,
                background: 'rgba(140,82,255,0.08)',
                border: '1px solid rgba(140,82,255,0.3)',
                borderRadius: '4px',
                padding: '3px 7px',
                fontFamily: 'inherit',
                fontSize: '12px',
                color: '#ede9ff',
                outline: 'none',
              }}
            />
          </div>
        )}
      </div>

      {/* MAGE divider + button */}
      <div>
        {/* Divider */}
        <div
          style={{
            margin: '0 10px',
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(140,82,255,0.25), transparent)',
          }}
        />

        {/* Mage button */}
        <div style={{ padding: '8px 10px 4px' }}>
          <Link
            href={`/notebooks/${notebookId}`}
            style={{ textDecoration: 'none', display: 'block' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '8px',
                background: isMageView
                  ? 'linear-gradient(135deg, rgba(140,82,255,0.2) 0%, rgba(81,112,255,0.12) 100%)'
                  : 'transparent',
                border: isMageView ? '1px solid rgba(140,82,255,0.3)' : '1px solid transparent',
                cursor: 'pointer',
                transition: 'background 0.15s ease, border-color 0.15s ease',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={(e) => {
                if (!isMageView) {
                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(140,82,255,0.08)';
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(140,82,255,0.15)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isMageView) {
                  (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent';
                }
              }}
            >
              {/* Glow dot when active */}
              {isMageView && (
                <div
                  style={{
                    position: 'absolute',
                    top: '-8px',
                    right: '-8px',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(140,82,255,0.4) 0%, transparent 70%)',
                    pointerEvents: 'none',
                  }}
                />
              )}

              {/* Icon */}
              <div
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '6px',
                  background: isMageView
                    ? 'linear-gradient(135deg, rgba(140,82,255,0.4), rgba(81,112,255,0.3))'
                    : 'rgba(140,82,255,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'background 0.15s ease',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '13px',
                    color: isMageView ? '#c4a9ff' : 'rgba(174,137,255,0.5)',
                    fontVariationSettings: "'FILL' 1",
                    transition: 'color 0.15s ease',
                  }}
                >
                  school
                </span>
              </div>

              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: isMageView ? '#c4a9ff' : 'rgba(174,137,255,0.5)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  transition: 'color 0.15s ease',
                }}
              >
                Mage
              </span>
            </div>
          </Link>
        </div>
      </div>

      {/* Add section button */}
      <div style={{ padding: '4px 10px 8px', borderTop: '1px solid rgba(140,82,255,0.08)' }}>
        <button
          data-new-section-btn
          onClick={() => setIsCreating(true)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
            padding: '6px 0',
            borderRadius: '5px',
            border: '1px solid rgba(140,82,255,0.12)',
            background: 'transparent',
            color: 'rgba(237,233,255,0.35)',
            fontFamily: 'inherit',
            fontSize: '11px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.12s ease, color 0.12s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(140,82,255,0.07)';
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,233,255,0.6)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,233,255,0.35)';
          }}
        >
          <Plus size={12} />
          Add section
        </button>
      </div>
    </aside>
  );
}
