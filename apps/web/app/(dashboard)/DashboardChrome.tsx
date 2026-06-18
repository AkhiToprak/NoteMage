'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import HomeHeader from '@/components/layout/HomeHeader';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useStudyHeartbeat } from '@/hooks/useStudyHeartbeat';
import { TimerProvider } from '@/contexts/TimerContext';
import { UnlockProvider } from '@/components/cosmetics/UnlockToast';
import { ToastProvider } from '@/components/ui/Toast';
import { nativeBridge, isInsideNativeShell } from '@/lib/native-bridge';

/** Matches /learn/chats and any sub-route — needs full viewport for left rail + thread */
const LEARN_CHATS_RE = /^\/learn\/chats(\/|$)/;
/** Matches /study-packs/new — upload wizard is immersive, owns the viewport */
const STUDY_PACKS_NEW_RE = /^\/study-packs\/new(\/|$)/;
/** Matches /lesson and any nested lesson route — lesson screen is immersive */
const LESSON_RE = /^\/lesson(\/|$)/;
/** Matches /tutorial — guided sample tutorial owns the viewport, no chrome */
const TUTORIAL_RE = /^\/tutorial(\/|$)/;

export function DashboardChrome({ children }: { children: React.ReactNode }) {
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

  // Bind the iOS in-app-purchase identity to this account (RevenueCat
  // appUserID = User.id) so StoreKit purchases attach to the right user.
  // No-op outside the iOS shell.
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id && isInsideNativeShell()) {
      void nativeBridge.setAppUser?.(session.user.id);
    }
  }, [status, session?.user?.id]);

  // Track minutes-in-app for the activity heatmap. Only runs when authed.
  useStudyHeartbeat(status === 'authenticated');
  const isLearnChats = LEARN_CHATS_RE.test(pathname);
  const isStudyPacksNew = STUDY_PACKS_NEW_RE.test(pathname);
  const isLesson = LESSON_RE.test(pathname);
  const isTutorial = TUTORIAL_RE.test(pathname);
  const isFullHeight =
    isLearnChats || isStudyPacksNew || isLesson || isTutorial;
  // /learn owns its own spacing: the tab strip is full-bleed (flush under the
  // header, edge to edge) and every /learn page self-pads (centered maxWidth +
  // its own horizontal padding). Drop the generic <main> padding here — it
  // otherwise insets the tab strip with a top + side margin.
  const isLearn = pathname === '/learn' || pathname.startsWith('/learn/');

  return (
    <TimerProvider>
      <UnlockProvider>
        <ToastProvider>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              height: '100dvh',
              overflow: 'hidden',
              background: 'var(--background)',
            }}
          >
            {!isStudyPacksNew && !isLesson && !isTutorial && <HomeHeader />}
            <main
              style={{
                flex: 1,
                minHeight: 0,
                overflowX: 'hidden',
                overflowY: isFullHeight ? 'hidden' : 'auto',
                padding: isFullHeight || isLearn ? '0' : isPhone ? '18px' : isTablet ? '20px' : '32px',
                color: 'var(--on-surface)',
                display: isFullHeight ? 'flex' : undefined,
                flexDirection: isFullHeight ? 'column' : undefined,
              }}
            >
              {children}
            </main>
            {/* Phone-only thumb nav. Hidden on full-height surfaces (learn
              chats, study-pack wizard, lesson, tutorial) which own the viewport. */}
            {!isFullHeight && <MobileBottomNav />}
          </div>
        </ToastProvider>
      </UnlockProvider>
    </TimerProvider>
  );
}

export default DashboardChrome;
