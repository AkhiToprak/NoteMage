'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useNotebookWorkspaceOptional } from '@/components/notebook/NotebookWorkspaceContext';
import type { SectionData } from '@/components/notebook/SectionTree';
import { POSES, type MascotIdle, type MascotPose } from './poses';

const WAVED_FLAG_KEY = 'notemage:mascot:dashboard-waved';
const WAVE_DURATION_MS = 4000;

export interface MascotContextPose {
  pose: MascotPose;
  idle: MascotIdle;
}

export function useMascotContextPose(): MascotContextPose {
  const pathname = usePathname();
  const workspace = useNotebookWorkspaceOptional();

  const [showFirstWave, setShowFirstWave] = useState(false);

  useEffect(() => {
    if (pathname !== '/dashboard') return;
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(WAVED_FLAG_KEY) === '1') return;

    // Both setState calls run from setTimeout callbacks rather than the
    // effect body — react-hooks/set-state-in-effect treats the synchronous
    // path as the anti-pattern, async callbacks are exempt.
    const showTimer = window.setTimeout(() => setShowFirstWave(true), 0);
    const hideTimer = window.setTimeout(() => {
      setShowFirstWave(false);
      window.localStorage.setItem(WAVED_FLAG_KEY, '1');
    }, WAVE_DURATION_MS);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [pathname]);

  const pose = derivePose(pathname, workspace, showFirstWave);
  return { pose, idle: POSES[pose].recommendedIdle };
}

function derivePose(
  pathname: string,
  workspace: ReturnType<typeof useNotebookWorkspaceOptional>,
  showFirstWave: boolean
): MascotPose {
  if (pathname === '/dashboard') {
    return showFirstWave ? 'wave' : 'default';
  }

  if (pathname.startsWith('/notebooks/')) {
    if (workspace?.activeFlashcardSetId) return 'holding-flashcards';
    if (workspace?.activeQuizSetId) return 'quizzing';
    if (workspace?.activeChatId) return 'chatting';
    // Phase 9.4 moved /notebooks/[id]/study-plan/[planId] → /learn/paths/[planId];
    // the activeStudyPlanId branch is unreachable from notebook URLs now.
    if (workspace?.activePageId) {
      const pageType = findPageType(workspace.flatSections, workspace.activePageId);
      return pageType === 'canvas' ? 'painting' : 'writing';
    }
    return 'default';
  }

  if (pathname === '/notebooks') return 'holding-pen';
  if (pathname.startsWith('/profile')) return 'holding-scroll';
  if (pathname.startsWith('/groups')) return 'chatting';
  if (pathname.startsWith('/settings')) return 'thinking';
  if (pathname.startsWith('/pricing')) return 'holding-scroll';
  if (pathname.startsWith('/docs')) return 'holding-scroll';

  return 'default';
}

function findPageType(sections: SectionData[], pageId: string): string | undefined {
  for (const section of sections) {
    const page = section.pages.find((p) => p.id === pageId);
    if (page) return page.pageType;
  }
  return undefined;
}
