'use client';

import SectionItem from '@/components/notebook/SectionItem';

export interface PageSummary {
  id: string;
  title: string;
  pageType: string;
  updatedAt: string;
  sortOrder: number;
}

export interface FlashcardSetSummary {
  id: string;
  title: string;
  createdAt: string;
}

export interface QuizSetSummary {
  id: string;
  title: string;
  createdAt: string;
}

export interface SectionNode {
  id: string;
  title: string;
  parentId: string | null;
  sortOrder: number;
  color: string | null;
  pages: PageSummary[];
  flashcardSets: FlashcardSetSummary[];
  quizSets: QuizSetSummary[];
  children: SectionNode[];
}

/** Raw shape returned by the API (no children field). */
export interface SectionData {
  id: string;
  title: string;
  parentId: string | null;
  sortOrder: number;
  color: string | null;
  pages: PageSummary[];
  flashcardSets: FlashcardSetSummary[];
  quizSets: QuizSetSummary[];
}

/** Build a tree from a flat list of sections. */
export function buildSectionTree(flat: SectionData[]): SectionNode[] {
  const map = new Map<string, SectionNode>();

  for (const s of flat) {
    map.set(s.id, { ...s, children: [] });
  }

  const roots: SectionNode[] = [];

  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: SectionNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const n of nodes) sortNodes(n.children);
  };
  sortNodes(roots);

  return roots;
}

interface SectionTreeProps {
  sections: SectionNode[];
  activePageId?: string;
  notebookId: string;
  onRefresh: () => void;
}

export default function SectionTree({
  sections,
  activePageId,
  notebookId,
  onRefresh,
}: SectionTreeProps) {
  if (sections.length === 0) {
    return (
      <div
        style={{
          padding: '32px 16px',
          textAlign: 'center',
          fontFamily: 'inherit',
          fontSize: '13px',
          color: 'rgba(237,233,255,0.3)',
        }}
      >
        No sections yet
      </div>
    );
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {sections.map((section) => (
        <SectionItem
          key={section.id}
          section={section}
          depth={0}
          activePageId={activePageId}
          notebookId={notebookId}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  );
}
