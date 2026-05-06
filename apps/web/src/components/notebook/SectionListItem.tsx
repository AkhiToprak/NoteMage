'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { ChevronRight, Trash2, FolderPlus } from 'lucide-react';
import { useNotebookWorkspace } from '@/components/notebook/NotebookWorkspaceContext';
import type { SectionNode } from '@/components/notebook/SectionTree';

const SECTION_COLORS = [
  '#8c52ff',
  '#5170ff',
  '#a855f7',
  '#6366f1',
  '#7c3aed',
  '#4f46e5',
  '#9333ea',
  '#3b82f6',
];

export function getSectionColor(
  section: SectionNode | { id: string; color: string | null }
): string {
  if (section.color) return section.color;
  const hash = section.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return SECTION_COLORS[hash % SECTION_COLORS.length];
}

interface SectionListItemProps {
  section: SectionNode;
  depth?: number;
}

export default function SectionListItem({ section, depth = 0 }: SectionListItemProps) {
  const { activeSectionId, setActiveSectionId, notebookId, refreshSections } =
    useNotebookWorkspace();
  const [expanded, setExpanded] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [isCreatingChild, setIsCreatingChild] = useState(false);
  const [childDraft, setChildDraft] = useState('');
  const childInputRef = useRef<HTMLInputElement>(null);

  const isActive = activeSectionId === section.id;
  const color = getSectionColor(section);

  useEffect(() => {
    if (isCreatingChild && childInputRef.current) {
      childInputRef.current.focus();
    }
  }, [isCreatingChild]);

  const handleDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!window.confirm(`Delete section "${section.title}" and all its pages?`)) return;
      try {
        await fetch(`/api/notebooks/${notebookId}/sections/${section.id}`, { method: 'DELETE' });
        refreshSections();
      } catch {
        /* silent */
      }
    },
    [notebookId, section.id, section.title, refreshSections]
  );

  const handleAddSubsection = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(true);
    setIsCreatingChild(true);
  }, []);

  const handleCreateChild = useCallback(async () => {
    const title = childDraft.trim();
    if (!title) {
      setIsCreatingChild(false);
      setChildDraft('');
      return;
    }
    try {
      await fetch(`/api/notebooks/${notebookId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, parentId: section.id }),
      });
      setChildDraft('');
      setIsCreatingChild(false);
      refreshSections();
    } catch {
      setIsCreatingChild(false);
      setChildDraft('');
    }
  }, [notebookId, section.id, childDraft, refreshSections]);

  const paddingLeft = 12 + depth * 14;

  return (
    <>
      <div
        onClick={() => setActiveSectionId(section.id)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          paddingLeft: `${paddingLeft}px`,
          paddingRight: '6px',
          paddingTop: '7px',
          paddingBottom: '7px',
          cursor: 'pointer',
          background: isActive
            ? 'rgba(140,82,255,0.12)'
            : hovered
              ? 'rgba(237,233,255,0.04)'
              : 'transparent',
          borderLeft: `3px solid ${isActive ? color : hovered ? color + '80' : color + '50'}`,
          transition: 'background 0.12s ease, border-color 0.12s ease',
          userSelect: 'none',
        }}
      >
        {/* Expand/collapse */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          style={{
            display: 'flex',
            flexShrink: 0,
            color: 'rgba(237,233,255,0.3)',
            marginLeft: '-4px',
            width: '14px',
          }}
        >
          {section.children.length > 0 || isCreatingChild ? (
            <ChevronRight
              size={13}
              style={{
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.12s ease',
              }}
            />
          ) : (
            <div style={{ width: '13px' }} />
          )}
        </div>

        {/* Title */}
        <span
          style={{
            flex: 1,
            fontFamily: 'inherit',
            fontSize: depth === 0 ? '13px' : '12px',
            fontWeight: isActive ? 600 : 400,
            color: isActive ? '#ede9ff' : 'rgba(237,233,255,0.65)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          {section.title}
        </span>

        {/* Action buttons on hover */}
        {hovered && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
            {/* Add subsection */}
            <button
              onClick={handleAddSubsection}
              title="Add subsection"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'rgba(237,233,255,0.3)',
                padding: 0,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = '#a47bff';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,233,255,0.3)';
              }}
            >
              <FolderPlus size={11} />
            </button>
            {/* Delete */}
            <button
              onClick={handleDelete}
              title="Delete section"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'rgba(237,233,255,0.3)',
                padding: 0,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,233,255,0.3)';
              }}
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>

      {/* Subsection creation input */}
      {isCreatingChild && expanded && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            paddingLeft: `${paddingLeft + 18}px`,
            paddingRight: '8px',
            paddingTop: '5px',
            paddingBottom: '5px',
            borderLeft: '3px solid rgba(140,82,255,0.4)',
          }}
        >
          <FolderPlus size={11} style={{ color: 'rgba(237,233,255,0.3)', flexShrink: 0 }} />
          <input
            ref={childInputRef}
            type="text"
            value={childDraft}
            onChange={(e) => setChildDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreateChild();
              } else if (e.key === 'Escape') {
                setIsCreatingChild(false);
                setChildDraft('');
              }
            }}
            onBlur={() => {
              if (!childDraft.trim()) {
                setIsCreatingChild(false);
                setChildDraft('');
              } else handleCreateChild();
            }}
            placeholder="Subsection name..."
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

      {/* Children */}
      {expanded &&
        section.children.map((child) => (
          <SectionListItem key={child.id} section={child} depth={depth + 1} />
        ))}
    </>
  );
}
