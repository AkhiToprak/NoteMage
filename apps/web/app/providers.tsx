'use client';

import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { CelebrationProvider } from '@/components/mascot';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <CelebrationProvider>{children}</CelebrationProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
