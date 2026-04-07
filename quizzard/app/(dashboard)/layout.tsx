'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import HomeHeader from '@/components/layout/HomeHeader';

/** Matches /notebooks/<uuid-or-id> and anything nested below it */
const NOTEBOOK_WORKSPACE_RE = /^\/notebooks\/[^/]+/;

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
    if (status === 'authenticated' && session?.user && !session.user.onboardingComplete) {
      router.replace('/auth/register');
    }
  }, [status, session, router]);
  const isNotebookWorkspace = NOTEBOOK_WORKSPACE_RE.test(pathname);
  const isFullHeight = isNotebookWorkspace;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: '#111126',
      }}
    >
      {!isNotebookWorkspace && <HomeHeader />}
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
  );
}
