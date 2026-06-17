'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useNotebookWorkspace } from '@/components/notebook/NotebookWorkspaceContext';
import CreateChatModal from '@/components/learn/CreateChatModal';

function ContentSkeleton() {
  const bar = (
    width: string,
    height: number,
    marginBottom: number,
    delay: number
  ): React.CSSProperties => ({
    width,
    height,
    marginBottom,
    borderRadius: 8,
    background: 'var(--surface-container-high)',
    animation: 'nm-nb-skel 1.5s ease-in-out infinite',
    animationDelay: `${delay}s`,
  });
  return (
    <div aria-hidden>
      <style>{`@keyframes nm-nb-skel { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
      <div style={bar('44%', 34, 28, 0)} />
      <div style={bar('100%', 14, 12, 0.05)} />
      <div style={bar('94%', 14, 12, 0.1)} />
      <div style={bar('97%', 14, 28, 0.15)} />
      <div style={bar('100%', 14, 12, 0.2)} />
      <div style={bar('90%', 14, 12, 0.25)} />
      <div style={bar('96%', 14, 0, 0.3)} />
    </div>
  );
}

export default function NotebookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { flatSections, sectionsLoaded, refreshChats } = useNotebookWorkspace();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [skipRedirect, setSkipRedirect] = useState(false);
  const skipRedirectRef = useRef(false);

  // Auto-open modal when ?new=1 is in URL (e.g. from "New chat" sidebar button)
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      skipRedirectRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSkipRedirect(true);
      setShowCreateModal(true);
      router.replace(`/notebooks/${id}`);
    }
  }, [searchParams, id, router]);

  // Redirect to last-opened page or first page
  useEffect(() => {
    if (!sectionsLoaded) return;
    if (skipRedirectRef.current) return; // don't redirect when create-chat modal is open

    const allPages = flatSections.flatMap((s) => s.pages);
    if (allPages.length === 0) return; // render empty state below

    // Try last-opened page from localStorage
    try {
      const lastPageId = localStorage.getItem(`notebook-${id}-lastPage`);
      if (lastPageId && allPages.some((p) => p.id === lastPageId)) {
        router.replace(`/notebooks/${id}/pages/${lastPageId}`);
        return;
      }
    } catch {}

    // Fallback: first page by sortOrder
    const sorted = [...flatSections].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const s of sorted) {
      const sp = [...s.pages].sort((a, b) => a.sortOrder - b.sortOrder);
      if (sp.length > 0) {
        router.replace(`/notebooks/${id}/pages/${sp[0].id}`);
        return;
      }
    }
  }, [flatSections, sectionsLoaded, id, router, searchParams]);

  const handleChatCreated = (chatId: string) => {
    setShowCreateModal(false);
    refreshChats();
    router.push(`/notebooks/${id}/chats/${chatId}`);
  };

  const handleCreateModalClose = () => {
    setShowCreateModal(false);
  };

  const hasPages = sectionsLoaded && flatSections.some((s) => s.pages.length > 0);
  // While loading sections — or once loaded with pages, in the beat before the
  // redirect navigates — show a skeleton so the page never flashes content.
  // The create-chat flow (?new=1) suppresses both the redirect and the skeleton,
  // so the modal sits over a blank canvas rather than an endless skeleton. When
  // a notebook has no pages there's nothing to open: leave the canvas blank.
  const showSkeleton = !skipRedirect && (!sectionsLoaded || hasPages);

  return (
    <div style={{ flex: 1, overflowY: 'auto', height: '100%' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px' }}>
        {showSkeleton && <ContentSkeleton />}
      </div>

      {/* Create chat modal */}
      {showCreateModal && (
        <CreateChatModal
          defaultNotebookId={id}
          onClose={handleCreateModalClose}
          onCreate={handleChatCreated}
        />
      )}
    </div>
  );
}
