'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';

/** Matches /notebooks/<uuid-or-id> and anything nested below it */
const NOTEBOOK_WORKSPACE_RE = /^\/notebooks\/[^/]+/;
const AI_CHAT_RE = /^\/ai-chat/;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();

  // Redirect to onboarding wizard if not completed
  useEffect(() => {
    if (status === 'authenticated' && session?.user && !(session.user as any).onboardingComplete) {
      router.replace('/auth/register');
    }
  }, [status, session, router]);
  const isNotebookWorkspace = NOTEBOOK_WORKSPACE_RE.test(pathname);
  const isAiChat = AI_CHAT_RE.test(pathname);

  // AI chat needs full-height layout with no padding, but keeps sidebar + header
  const isFullHeight = isNotebookWorkspace || isAiChat;

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: '#0d0d1a',
      }}
    >
      {!isNotebookWorkspace && <Sidebar />}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {!isNotebookWorkspace && <Header />}
        <main
          style={{
            flex: 1,
            minHeight: 0,
            overflow: isFullHeight ? 'hidden' : 'auto',
            padding: isFullHeight ? '0' : '32px',
            color: '#e5e3ff',
            display: isFullHeight ? 'flex' : undefined,
            flexDirection: isFullHeight ? 'column' : undefined,
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
