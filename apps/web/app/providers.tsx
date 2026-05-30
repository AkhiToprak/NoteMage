'use client';

import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { CelebrationProvider } from '@/components/mascot';
import { PostHogProvider } from '@/components/analytics/PostHogProvider';
import { PostHogIdentify } from '@/components/analytics/PostHogIdentify';
import { AnalyticsConsentBanner } from '@/components/analytics/AnalyticsConsentBanner';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PostHogProvider>
      <SessionProvider refetchOnWindowFocus={false}>
        <PostHogIdentify />
        <ThemeProvider>
          <CelebrationProvider>
            {children}
            <AnalyticsConsentBanner />
          </CelebrationProvider>
        </ThemeProvider>
      </SessionProvider>
    </PostHogProvider>
  );
}
