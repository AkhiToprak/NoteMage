'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import SectionTree, { buildSectionTree } from '@/components/notebook/SectionTree';
import CreateSectionDialog from '@/components/notebook/CreateSectionDialog';
import type { SectionData, SectionNode } from '@/components/notebook/SectionTree';

interface NotebookMeta {
  name: string;
  color: string | null;
}

interface NotebookSidebarProps {
  notebookId: string;
}

export default function NotebookSidebar({ notebookId }: NotebookSidebarProps) {
  const pathname = usePathname();
  const [notebook, setNotebook] = useState<NotebookMeta | null>(null);
  const [sections, setSections] = useState<SectionNode[]>([]);
  const [isCreatingSection, setIsCreatingSection] = useState(false);
  const [newSectionHovered, setNewSectionHovered] = useState(false);
  const [backHovered, setBackHovered] = useState(false);

  // Extract active page id from the URL: /notebooks/[id]/pages/[pageId]
  const activePageId = (() => {
    const match = pathname.match(/\/notebooks\/[^/]+\/pages\/([^/]+)/);
    return match?.[1];
  })();

  const fetchNotebook = useCallback(async () => {
    try {
      const res = await fetch(`/api/notebooks/${notebookId}`);
      const json = await res.json();
      if (json.success && json.data) {
        setNotebook({ name: json.data.name, color: json.data.color });
      }
    } catch {
      // silent
    }
  }, [notebookId]);

  const fetchSections = useCallback(async () => {
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sections`);
      const json = await res.json();
      if (json.success && json.data) {
        const tree = buildSectionTree(json.data as SectionData[]);
        setSections(tree);
      }
    } catch {
      // silent
    }
  }, [notebookId]);

  useEffect(() => {
    fetchNotebook();
    fetchSections();
  }, [fetchNotebook, fetchSections]);

  const accentColor = notebook?.color || '#8c52ff';

  return (
    <aside
      style={{
        width: '256px',
        minWidth: '256px',
        background: '#111126',
        borderRight: '1px solid rgba(140,82,255,0.12)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        fontFamily: 'inherit',
      }}
    >
      {/* Top: notebook name + back arrow */}
      <div
        style={{
          padding: '16px 14px 12px',
          borderBottom: '1px solid rgba(140,82,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <Link
          href="/notebooks"
          title="Back to notebooks"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            background: backHovered ? 'rgba(140,82,255,0.1)' : 'transparent',
            border: 'none',
            textDecoration: 'none',
            flexShrink: 0,
            transition: 'background 0.12s ease',
          }}
          onMouseEnter={() => setBackHovered(true)}
          onMouseLeave={() => setBackHovered(false)}
        >
          <ArrowLeft size={16} style={{ color: 'rgba(237,233,255,0.5)' }} />
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: accentColor,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: '15px',
              fontWeight: 700,
              color: '#ede9ff',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {notebook?.name ?? '...'}
          </span>
        </div>
      </div>

      {/* Middle: scrollable section tree */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 6px',
        }}
      >
        <SectionTree
          sections={sections}
          activePageId={activePageId}
          notebookId={notebookId}
          onRefresh={fetchSections}
        />

        {isCreatingSection && (
          <CreateSectionDialog
            notebookId={notebookId}
            onCreated={() => {
              setIsCreatingSection(false);
              fetchSections();
            }}
            onCancel={() => setIsCreatingSection(false)}
          />
        )}
      </div>

      {/* Bottom: New Section button */}
      <div
        style={{
          padding: '10px 14px',
          borderTop: '1px solid rgba(140,82,255,0.1)',
        }}
      >
        <button
          data-new-section-btn
          onClick={() => setIsCreatingSection(true)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '7px 0',
            borderRadius: '6px',
            border: '1px solid rgba(140,82,255,0.15)',
            background: newSectionHovered ? 'rgba(140,82,255,0.08)' : 'transparent',
            color: newSectionHovered ? 'rgba(237,233,255,0.7)' : 'rgba(237,233,255,0.4)',
            fontFamily: 'inherit',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.12s ease, color 0.12s ease',
          }}
          onMouseEnter={() => setNewSectionHovered(true)}
          onMouseLeave={() => setNewSectionHovered(false)}
        >
          <Plus size={14} />
          New Section
        </button>
      </div>
    </aside>
  );
}
