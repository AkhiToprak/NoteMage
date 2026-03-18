'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { buildSectionTree } from '@/components/notebook/SectionTree';
import type { SectionData, SectionNode } from '@/components/notebook/SectionTree';

interface NotebookMeta {
  name: string;
  color: string | null;
}

interface WorkspaceContextValue {
  notebookId: string;
  notebook: NotebookMeta | null;
  sections: SectionNode[];        // tree structure
  flatSections: SectionData[];    // flat list for lookups
  activeSectionId: string | null;
  setActiveSectionId: (id: string) => void;
  activePageId: string | null;
  refreshSections: () => void;
}

const NotebookWorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useNotebookWorkspace() {
  const ctx = useContext(NotebookWorkspaceContext);
  if (!ctx) throw new Error('useNotebookWorkspace must be used inside NotebookWorkspaceProvider');
  return ctx;
}

export function NotebookWorkspaceProvider({ notebookId, children }: { notebookId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [notebook, setNotebook] = useState<NotebookMeta | null>(null);
  const [flatSections, setFlatSections] = useState<SectionData[]>([]);
  const [sections, setSections] = useState<SectionNode[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  // Derive activePageId from URL
  const activePageId = (() => {
    const match = pathname.match(/\/notebooks\/[^/]+\/pages\/([^/]+)/);
    return match?.[1] ?? null;
  })();

  const fetchNotebook = useCallback(async () => {
    try {
      const res = await fetch(`/api/notebooks/${notebookId}`);
      const json = await res.json();
      if (json.success && json.data) {
        setNotebook({ name: json.data.name, color: json.data.color });
      }
    } catch { /* silent */ }
  }, [notebookId]);

  const fetchSections = useCallback(async () => {
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sections`);
      const json = await res.json();
      if (json.success && json.data) {
        const flat = json.data as SectionData[];
        setFlatSections(flat);
        setSections(buildSectionTree(flat));
      }
    } catch { /* silent */ }
  }, [notebookId]);

  useEffect(() => {
    fetchNotebook();
    fetchSections();
  }, [fetchNotebook, fetchSections]);

  // Derive activeSectionId from activePageId after sections load
  useEffect(() => {
    if (flatSections.length === 0) return;
    if (activePageId) {
      const owner = flatSections.find(s => s.pages.some(p => p.id === activePageId));
      if (owner) {
        setActiveSectionId(owner.id);
        return;
      }
    }
    // Default: first root section
    const firstRoot = flatSections.find(s => s.parentId === null) ?? flatSections[0];
    if (firstRoot && !activeSectionId) {
      setActiveSectionId(firstRoot.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatSections, activePageId]);

  return (
    <NotebookWorkspaceContext.Provider value={{
      notebookId, notebook, sections, flatSections,
      activeSectionId, setActiveSectionId,
      activePageId, refreshSections: fetchSections,
    }}>
      {children}
    </NotebookWorkspaceContext.Provider>
  );
}
