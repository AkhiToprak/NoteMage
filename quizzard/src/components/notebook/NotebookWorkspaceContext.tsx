'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { buildSectionTree } from '@/components/notebook/SectionTree';
import type { SectionData, SectionNode } from '@/components/notebook/SectionTree';

interface NotebookMeta {
  name: string;
  color: string | null;
}

export interface FlashcardSetSummary {
  id: string;
  title: string;
  createdAt: string;
  _count?: { flashcards: number };
}

export interface QuizSetSummary {
  id: string;
  title: string;
  createdAt: string;
  _count?: { questions: number };
}

export interface StudyPlanSummary {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  source: string;
  _count: { phases: number };
}

export interface NotebookChatItem {
  id: string;
  title: string;
  contextPageIds: string[];
  contextDocIds: string[];
  createdAt: string;
  updatedAt: string;
  _count: { messages: number };
  flashcardSets: FlashcardSetSummary[];
  quizSets: QuizSetSummary[];
}

interface WorkspaceContextValue {
  notebookId: string;
  notebook: NotebookMeta | null;
  sections: SectionNode[];
  flatSections: SectionData[];
  activeSectionId: string | null;
  setActiveSectionId: (id: string) => void;
  activePageId: string | null;
  activeChatId: string | null;
  activeFlashcardSetId: string | null;
  activeQuizSetId: string | null;
  activeStudyPlanId: string | null;
  chats: NotebookChatItem[];
  studyPlans: StudyPlanSummary[];
  flashcardSets: FlashcardSetSummary[];
  quizSets: QuizSetSummary[];
  refreshChats: () => void;
  refreshSections: () => void;
  refreshStudyPlans: () => void;
  refreshFlashcardSets: () => void;
  refreshQuizSets: () => void;
  isScholarView: boolean;
  sectionsLoaded: boolean;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

const NotebookWorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useNotebookWorkspace() {
  const ctx = useContext(NotebookWorkspaceContext);
  if (!ctx) throw new Error('useNotebookWorkspace must be used inside NotebookWorkspaceProvider');
  return ctx;
}

export function NotebookWorkspaceProvider({
  notebookId,
  children,
}: {
  notebookId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [notebook, setNotebook] = useState<NotebookMeta | null>(null);
  const [flatSections, setFlatSections] = useState<SectionData[]>([]);
  const [sections, setSections] = useState<SectionNode[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [sectionsLoaded, setSectionsLoaded] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chats, setChats] = useState<NotebookChatItem[]>([]);
  const [studyPlans, setStudyPlans] = useState<StudyPlanSummary[]>([]);
  const [flashcardSets, setFlashcardSets] = useState<FlashcardSetSummary[]>([]);
  const [quizSets, setQuizSets] = useState<QuizSetSummary[]>([]);

  // Derive activePageId from URL
  const activePageId = (() => {
    const match = pathname.match(/\/notebooks\/[^/]+\/pages\/([^/]+)/);
    return match?.[1] ?? null;
  })();

  // Derive activeChatId from URL
  const activeChatId = (() => {
    const match = pathname.match(/\/notebooks\/[^/]+\/chats\/([^/]+)/);
    return match?.[1] ?? null;
  })();

  // Derive activeFlashcardSetId from URL
  const activeFlashcardSetId = (() => {
    const match = pathname.match(/\/notebooks\/[^/]+\/flashcards\/([^/]+)/);
    return match?.[1] ?? null;
  })();

  // Derive activeQuizSetId from URL
  const activeQuizSetId = (() => {
    const match = pathname.match(/\/notebooks\/[^/]+\/quizzes\/([^/]+)/);
    return match?.[1] ?? null;
  })();

  // Derive activeStudyPlanId from URL
  const activeStudyPlanId = (() => {
    const match = pathname.match(/\/notebooks\/[^/]+\/study-plan\/([^/]+)/);
    return match?.[1] ?? null;
  })();

  const fetchNotebook = useCallback(async () => {
    try {
      const res = await fetch(`/api/notebooks/${notebookId}`);
      const json = await res.json();
      if (json.success && json.data) {
        setNotebook({ name: json.data.name, color: json.data.color });
      }
    } catch {
      /* silent */
    }
  }, [notebookId]);

  const fetchSections = useCallback(async () => {
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sections`);
      const json = await res.json();
      if (json.success && json.data) {
        const flat = json.data as SectionData[];
        setFlatSections(flat);
        setSections(buildSectionTree(flat));
        setSectionsLoaded(true);
      }
    } catch {
      setSectionsLoaded(true); /* silent */
    }
  }, [notebookId]);

  const fetchChats = useCallback(async () => {
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/chats`);
      const json = await res.json();
      if (json.success && json.data) {
        setChats(json.data as NotebookChatItem[]);
      }
    } catch {
      /* silent */
    }
  }, [notebookId]);

  const fetchStudyPlans = useCallback(async () => {
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/study-plans`);
      const json = await res.json();
      if (json.success && json.data) {
        setStudyPlans(json.data as StudyPlanSummary[]);
      }
    } catch {
      /* silent */
    }
  }, [notebookId]);

  const fetchFlashcardSets = useCallback(async () => {
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/flashcard-sets`);
      const json = await res.json();
      if (json.success && json.data) {
        setFlashcardSets(json.data as FlashcardSetSummary[]);
      }
    } catch {
      /* silent */
    }
  }, [notebookId]);

  const fetchQuizSets = useCallback(async () => {
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/quiz-sets`);
      const json = await res.json();
      if (json.success && json.data) {
        setQuizSets(json.data as QuizSetSummary[]);
      }
    } catch {
      /* silent */
    }
  }, [notebookId]);

  useEffect(() => {
    fetchNotebook();
    fetchSections();
    fetchChats();
    fetchStudyPlans();
    fetchFlashcardSets();
    fetchQuizSets();
  }, [fetchNotebook, fetchSections, fetchChats, fetchStudyPlans, fetchFlashcardSets, fetchQuizSets]);

  // Derive activeSectionId from activePageId after sections load
  useEffect(() => {
    if (flatSections.length === 0) return;
    if (activePageId) {
      const owner = flatSections.find((s) => s.pages.some((p) => p.id === activePageId));
      if (owner) {
        setActiveSectionId(owner.id);
        return;
      }
    }
    // Default: first root section
    const firstRoot = flatSections.find((s) => s.parentId === null) ?? flatSections[0];
    if (firstRoot && !activeSectionId) {
      setActiveSectionId(firstRoot.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatSections, activePageId]);

  return (
    <NotebookWorkspaceContext.Provider
      value={{
        notebookId,
        notebook,
        sections,
        flatSections,
        sectionsLoaded,
        activeSectionId,
        setActiveSectionId,
        activePageId,
        activeChatId,
        activeFlashcardSetId,
        activeQuizSetId,
        activeStudyPlanId,
        chats,
        studyPlans,
        flashcardSets,
        quizSets,
        refreshChats: fetchChats,
        refreshSections: fetchSections,
        refreshStudyPlans: fetchStudyPlans,
        refreshFlashcardSets: fetchFlashcardSets,
        refreshQuizSets: fetchQuizSets,
        isScholarView: activeChatId !== null,
        sidebarCollapsed,
        setSidebarCollapsed,
      }}
    >
      {children}
    </NotebookWorkspaceContext.Provider>
  );
}
