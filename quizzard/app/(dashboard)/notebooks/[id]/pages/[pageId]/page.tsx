'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PageEditor from '@/components/notebook/PageEditor';
import CoWorkBar from '@/components/notebook/CoWorkBar';
import CoWorkChat from '@/components/notebook/CoWorkChat';
import {
  setCurrentCoworkSession,
  type CurrentCoworkSession,
} from '@/lib/cowork-join';
import dynamic from 'next/dynamic';

const InfiniteCanvas = dynamic(() => import('@/components/notebook/InfiniteCanvas'), {
  ssr: false,
});

interface CoworkSessionState {
  sessionId: string;
  hostId: string;
  isActive: boolean;
}

export default function PageEditorPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const { id: notebookId, pageId } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const highlightTerm = searchParams.get('highlight') || undefined;
  const coworkParam = searchParams.get('cowork');
  // The chat the user came from — set by `coworkPageUrl` on both the host
  // start flow and every invite-card join. Used to route participants back
  // to their origin chat on session-end / leave. Falls back to the notebook
  // home if unset (e.g. someone deep-linked the URL manually).
  const fromGroupId = searchParams.get('from');
  const { data: session } = useSession();
  const currentUserId =
    (session?.user as { id?: string } | undefined)?.id || null;
  const currentUsername =
    session?.user?.name || session?.user?.email || 'You';
  const [pageType, setPageType] = useState<string | null>(null);
  const [coworkSession, setCoworkSession] = useState<CoworkSessionState | null>(
    null
  );

  useEffect(() => {
    fetch(`/api/notebooks/${notebookId}/pages/${pageId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data?.pageType) {
          setPageType(json.data.pageType);
        } else {
          setPageType('text');
        }
      })
      .catch(() => setPageType('text'));
  }, [notebookId, pageId]);

  useEffect(() => {
    try {
      localStorage.setItem(`notebook-${notebookId}-lastPage`, pageId);
    } catch {}
  }, [notebookId, pageId]);

  // Load cowork session state when ?cowork=<sessionId> is present
  useEffect(() => {
    if (!coworkParam) {
      setCoworkSession(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/notebooks/${notebookId}/cowork/${coworkParam}`
        );
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const data = json?.data;
        if (data && data.isActive !== false) {
          setCoworkSession({
            sessionId: data.id,
            hostId: data.hostId,
            isActive: true,
          });
          // Persist as the currently-active session so the user gets
          // auto-leave on the next invite click.
          const next: CurrentCoworkSession = {
            sessionId: data.id,
            notebookId,
          };
          setCurrentCoworkSession(next);
        } else {
          setCoworkSession(null);
          setCurrentCoworkSession(null);
        }
      } catch {
        if (!cancelled) setCoworkSession(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coworkParam, notebookId]);

  // When the session ends (host ended it, polling/socket detected the
  // inactive state, or a non-host clicked Leave), send the user back to
  // the chat they came from. That's the contract with the invite card —
  // entering a session from a group chat should return you to the same
  // chat, not drop you on a notebook page you might not even own.
  // Fall back to the notebook home only if we don't know the origin.
  const handleSessionEnd = useCallback(() => {
    setCoworkSession(null);
    setCurrentCoworkSession(null);
    if (fromGroupId) {
      router.push(`/groups/${fromGroupId}`);
    } else {
      router.push(`/notebooks/${notebookId}`);
    }
  }, [router, notebookId, fromGroupId]);

  if (!pageType) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'rgba(237,233,255,0.3)',
          fontFamily: 'inherit',
          fontSize: '14px',
        }}
      >
        Loading...
      </div>
    );
  }

  const editor =
    pageType === 'canvas' ? (
      <InfiniteCanvas
        notebookId={notebookId}
        pageId={pageId}
        coWorkSessionId={coworkSession?.sessionId || null}
        currentUserId={currentUserId || undefined}
      />
    ) : (
      <PageEditor
        notebookId={notebookId}
        pageId={pageId}
        highlightTerm={highlightTerm}
        coWorkSessionId={coworkSession?.sessionId || null}
        currentUserId={currentUserId || undefined}
      />
    );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      {coworkSession && currentUserId && (
        <CoWorkBar
          notebookId={notebookId}
          sessionId={coworkSession.sessionId}
          hostId={coworkSession.hostId}
          currentUserId={currentUserId}
          onSessionEnd={handleSessionEnd}
        />
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {editor}
      </div>
      {coworkSession && currentUserId && (
        <CoWorkChat
          notebookId={notebookId}
          sessionId={coworkSession.sessionId}
          currentUserId={currentUserId}
          currentUsername={currentUsername}
        />
      )}
    </div>
  );
}
