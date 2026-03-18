'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, FileText, FilePlus, Trash2 } from 'lucide-react';
import { useNotebookWorkspace } from '@/components/notebook/NotebookWorkspaceContext';
import { getSectionColor } from '@/components/notebook/SectionListItem';

export default function PagePanel() {
  const router = useRouter();
  const { notebookId, flatSections, sections, activeSectionId, activePageId, refreshSections } = useNotebookWorkspace();
  const [isCreating, setIsCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Find the active section node from the flat list
  const activeSection = flatSections.find(s => s.id === activeSectionId) ?? null;
  const pages = activeSection?.pages ?? [];

  // Find color for active section
  const sectionNode = sections.flatMap(function flatten(s): typeof sections { return [s, ...s.children.flatMap(flatten)]; }).find(s => s.id === activeSectionId);
  const accentColor = sectionNode ? getSectionColor(sectionNode) : '#8c52ff';

  useEffect(() => {
    if (isCreating && inputRef.current) inputRef.current.focus();
  }, [isCreating]);

  const handleCreate = useCallback(async () => {
    const title = draftTitle.trim() || 'Untitled';
    if (!activeSectionId) return;
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sections/${activeSectionId}/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const json = await res.json();
      setDraftTitle('');
      setIsCreating(false);
      refreshSections();
      if (json.success && json.data?.id) {
        router.push(`/notebooks/${notebookId}/pages/${json.data.id}`);
      }
    } catch { setIsCreating(false); setDraftTitle(''); }
  }, [notebookId, activeSectionId, draftTitle, refreshSections, router]);

  const handleDeletePage = useCallback(async (pageId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await fetch(`/api/notebooks/${notebookId}/pages/${pageId}`, { method: 'DELETE' });
      refreshSections();
      if (activePageId === pageId) router.push(`/notebooks/${notebookId}`);
    } catch { /* silent */ }
  }, [notebookId, activePageId, router, refreshSections]);

  return (
    <div style={{
      width: '200px',
      minWidth: '200px',
      background: '#0a0918',
      borderRight: '1px solid rgba(140,82,255,0.08)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      fontFamily: "'Gliker', 'DM Sans', sans-serif",
    }}>
      {/* Section name header */}
      <div style={{
        padding: '14px 14px 10px',
        borderBottom: '1px solid rgba(140,82,255,0.08)',
        minHeight: '58px',
        display: 'flex',
        alignItems: 'center',
      }}>
        {activeSection ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
            <div style={{ width: '3px', height: '16px', borderRadius: '2px', background: accentColor, flexShrink: 0 }} />
            <span style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'rgba(237,233,255,0.7)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {activeSection.title}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: '12px', color: 'rgba(237,233,255,0.25)' }}>Select a section</span>
        )}
      </div>

      {/* Page list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {pages.length === 0 && !isCreating && activeSection && (
          <div style={{ padding: '24px 14px', textAlign: 'center' }}>
            <p style={{ fontSize: '12px', color: 'rgba(237,233,255,0.2)', margin: 0, lineHeight: 1.5 }}>
              No pages yet.<br />Click &quot;Add page&quot; to start.
            </p>
          </div>
        )}

        {pages.map(page => {
          const isActive = page.id === activePageId;
          return (
            <PageRow
              key={page.id}
              page={page}
              isActive={isActive}
              notebookId={notebookId}
              accentColor={accentColor}
              onDelete={handleDeletePage}
            />
          );
        })}

        {/* Inline page creation */}
        {isCreating && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 14px',
            borderLeft: `2px solid ${accentColor}60`,
          }}>
            <FilePlus size={12} style={{ color: 'rgba(237,233,255,0.3)', flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              value={draftTitle}
              onChange={e => setDraftTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); handleCreate(); }
                else if (e.key === 'Escape') { setIsCreating(false); setDraftTitle(''); }
              }}
              placeholder="Page title..."
              style={{
                flex: 1, minWidth: 0,
                background: 'rgba(140,82,255,0.08)',
                border: '1px solid rgba(140,82,255,0.3)',
                borderRadius: '4px',
                padding: '3px 7px',
                fontFamily: "'Gliker', 'DM Sans', sans-serif",
                fontSize: '12px',
                color: '#ede9ff',
                outline: 'none',
              }}
            />
          </div>
        )}
      </div>

      {/* Add page button */}
      <div style={{ padding: '8px 10px', borderTop: '1px solid rgba(140,82,255,0.06)' }}>
        <button
          onClick={() => { if (activeSectionId) setIsCreating(true); }}
          disabled={!activeSectionId}
          style={{
            width: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
            padding: '6px 0',
            borderRadius: '5px',
            border: '1px solid rgba(140,82,255,0.1)',
            background: 'transparent',
            color: activeSectionId ? 'rgba(237,233,255,0.35)' : 'rgba(237,233,255,0.15)',
            fontFamily: "'Gliker', 'DM Sans', sans-serif",
            fontSize: '11px',
            fontWeight: 500,
            cursor: activeSectionId ? 'pointer' : 'not-allowed',
            transition: 'background 0.12s ease, color 0.12s ease',
          }}
          onMouseEnter={e => {
            if (activeSectionId) {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(140,82,255,0.07)';
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,233,255,0.6)';
            }
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = activeSectionId ? 'rgba(237,233,255,0.35)' : 'rgba(237,233,255,0.15)';
          }}
        >
          <Plus size={12} />
          Add page
        </button>
      </div>
    </div>
  );
}

function PageRow({ page, isActive, notebookId, accentColor, onDelete }: {
  page: { id: string; title: string };
  isActive: boolean;
  notebookId: string;
  accentColor: string;
  onDelete: (id: string, e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      href={`/notebooks/${notebookId}/pages/${page.id}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '7px 14px',
          background: isActive
            ? `linear-gradient(135deg, ${accentColor}18 0%, rgba(81,112,255,0.10) 100%)`
            : hovered ? 'rgba(237,233,255,0.04)' : 'transparent',
          borderLeft: isActive ? `2px solid ${accentColor}` : '2px solid transparent',
          transition: 'background 0.1s ease',
          cursor: 'pointer',
        }}
      >
        <FileText size={13} style={{ color: isActive ? accentColor : 'rgba(237,233,255,0.25)', flexShrink: 0 }} />
        <span style={{
          flex: 1, minWidth: 0,
          fontFamily: "'Gliker', 'DM Sans', sans-serif",
          fontSize: '13px',
          fontWeight: isActive ? 600 : 400,
          color: isActive ? '#ede9ff' : 'rgba(237,233,255,0.6)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {page.title}
        </span>
        {hovered && !isActive && (
          <button
            onClick={e => onDelete(page.id, e)}
            title="Delete page"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '18px', height: '18px', borderRadius: '3px',
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'rgba(237,233,255,0.3)', padding: 0, flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,233,255,0.3)'; }}
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
    </Link>
  );
}
