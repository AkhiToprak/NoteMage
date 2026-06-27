'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
import AppMobileNav from '@/components/app/AppMobileNav';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useStudyHeartbeat } from '@/hooks/useStudyHeartbeat';
import { TimerProvider } from '@/contexts/TimerContext';
import { UnlockProvider } from '@/components/cosmetics/UnlockToast';
import { ToastProvider } from '@/components/ui/Toast';
import {
  MageProvider,
  MagePanel,
  MageAutoOpen,
  MageSelectionAction,
} from '@/components/mage';
import { nativeBridge, isInsideNativeShell } from '@/lib/native-bridge';
import GradingSystemGate from '@/components/onboarding/GradingSystemGate';

/** Matches /lesson and any nested lesson route — lesson screen is immersive */
const LESSON_RE = /^\/lesson(\/|$)/;
/** Matches /tutorial — guided sample tutorial owns the viewport, no chrome */
const TUTORIAL_RE = /^\/tutorial(\/|$)/;
/** Exam Mode Phase 3 — the timed mock-exam run surface (the immersive sealed
 *  player) owns the viewport. Anchored to the run route only ($) so the setup
 *  (/exam/:id/mock) and results (/exam/:id/mock/:mockId/results) screens keep the
 *  AppShell sidebar + phone nav. */
const MOCK_RUN_RE = /^\/exam\/[^/]+\/mock\/[^/]+$/;
/** Exam Mode Phase 5 — the good-result celebration is a full-bleed takeover (no
 *  sidebar, no phone nav), like the welcome-back overlay. Anchored to the
 *  celebration route only ($) so the rest of the post-exam loop (result /
 *  reflection / report / feedback) keeps the AppShell sidebar. */
const CELEBRATION_RE = /^\/exam\/[^/]+\/celebration$/;
/** Redesigned (cream) screens that carry their own left sidebar (AppShell).
 *  They run full-height but keep the phone nav. The create-path wizard
 *  (/paths/new) is one of these — the Figma WCP screens show the sidebar. */
const APP_SHELL_RE = /^\/(dashboard|my-path|profile|exam|exams|progress|learn\/paths|paths\/new|settings)(\/|$)/;

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
  const isLesson = LESSON_RE.test(pathname);
  const isTutorial = TUTORIAL_RE.test(pathname);
  const isMockRun = MOCK_RUN_RE.test(pathname);
  const isCelebration = CELEBRATION_RE.test(pathname);
  const isAppShell = APP_SHELL_RE.test(pathname);
  // Immersive routes own the whole viewport (no header, no phone nav). AppShell
  // routes also drop the header and run full-height, but keep the phone nav.
  const isImmersive = isLesson || isTutorial || isMockRun || isCelebration;
  const isFullHeight = isImmersive || isAppShell;
  // /learn owns its own spacing: the tab strip is full-bleed (flush under the
  // header, edge to edge) and every /learn page self-pads (centered maxWidth +
  // its own horizontal padding). Drop the generic <main> padding here — it
  // otherwise insets the tab strip with a top + side margin.
  const isLearn = pathname === '/learn' || pathname.startsWith('/learn/');

  return (
    <TimerProvider>
      <UnlockProvider>
        <ToastProvider>
          <MageProvider>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100dvh',
                overflow: 'hidden',
                background: 'var(--background)',
              }}
            >
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
              {/* Phone-only thumb nav. Hidden on immersive surfaces (lesson,
                tutorial, mock run, celebration) which own the viewport. The
                redesigned cream AppShell routes get the matching cream
                AppMobileNav (mirrors AppSidebar); the remaining legacy dark
                routes keep the dark MobileBottomNav. */}
              {!isImmersive && (isAppShell ? <AppMobileNav /> : <MobileBottomNav />)}
            </div>
            {/* Global Mage panel. Fixed overlay, sits outside the chrome flow
              and rides on top of every route. Opened from the sidebar "Ask Mage"
              card and the highlight-to-ask CTA (the floating launcher button was
              removed). Phase 10: MageAutoOpen opens the panel for redirected
              /learn/chats deep-links (?mage=open); MageSelectionAction is the
              highlight-to-ask floating CTA. */}
            <MagePanel />
            <MageAutoOpen />
            <MageSelectionAction />
            {/* First-run grading-system picker (after signup, once per account). */}
            <GradingSystemGate />
          </MageProvider>
        </ToastProvider>
      </UnlockProvider>
    </TimerProvider>
  );
}

export default DashboardChrome;
