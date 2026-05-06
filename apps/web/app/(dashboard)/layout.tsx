'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import HomeHeader from '@/components/layout/HomeHeader';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useStudyHeartbeat } from '@/hooks/useStudyHeartbeat';
import { TimerProvider } from '@/contexts/TimerContext';
import { UnlockProvider } from '@/components/cosmetics/UnlockToast';

/** Matches /notebooks/<uuid-or-id> and anything nested below it */
const NOTEBOOK_WORKSPACE_RE = /^\/notebooks\/[^/]+/;
/** Matches /groups/<id> detail pages */
const GROUP_DETAIL_RE = /^\/groups\/[^/]+/;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const { isPhone, isTablet } = useBreakpoint();

  // Redirect to onboarding wizard if not completed
  useEffect(() => {
    if (status === 'authenticated' && session?.user && !session.user.onboardingComplete) {
      router.replace('/auth/register');
    }
  }, [status, session, router]);

  // Track minutes-in-app for the activity heatmap. Only runs when authed.
  useStudyHeartbeat(status === 'authenticated');
  const isNotebookWorkspace = NOTEBOOK_WORKSPACE_RE.test(pathname);
  const isGroupDetail = GROUP_DETAIL_RE.test(pathname);
  const isFullHeight = isNotebookWorkspace || isGroupDetail;

  return (
    <TimerProvider>
      <UnlockProvider>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100dvh',
            overflow: 'hidden',
            background: '#1a1a36',
          }}
        >
          {!isNotebookWorkspace && !isGroupDetail && <HomeHeader />}
          <main
            style={{
              flex: 1,
              minHeight: 0,
              overflowX: 'hidden',
              overflowY: isFullHeight ? 'hidden' : 'auto',
              padding: isFullHeight ? '0' : isPhone ? '16px' : isTablet ? '20px' : '32px',
              color: '#e5e3ff',
              display: isFullHeight ? 'flex' : undefined,
              flexDirection: isFullHeight ? 'column' : undefined,
            }}
          >
            {children}
          </main>
        </div>
      </UnlockProvider>
    </TimerProvider>
  );
}
