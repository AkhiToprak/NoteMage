'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackEvent } from '@/lib/telemetry';

// /learn layout. The old horizontal tab strip (Overview / Paths / Flashcards /
// Quizzes / Chats / Community) was removed — navigation between Learn Hub
// surfaces now lives in the global header + burger nav. Mage Revolution Phase 10
// folded the /learn/chats sub-tree into the global panel, leaving Community as
// the only Learn surface. This layout keeps the flex-column wrapper and still
// fires the `learn.tab_view` telemetry as the active surface changes.

type LearnSlug = 'community';

const SURFACES: ReadonlyArray<{ href: string; slug: LearnSlug; exact?: boolean }> = [
  { href: '/learn/community', slug: 'community' },
];

function resolveActiveSlug(pathname: string): LearnSlug | null {
  for (const s of SURFACES) {
    const match = s.exact
      ? pathname === s.href
      : pathname === s.href || pathname.startsWith(`${s.href}/`);
    if (match) return s.slug;
  }
  return null;
}

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const activeSlug = resolveActiveSlug(pathname);

  // Fire `learn.tab_view` once per surface transition. Keying on the resolved
  // slug (not the raw pathname) avoids re-firing within a single surface
  // (e.g. /learn/chats → /learn/chats/abc).
  useEffect(() => {
    if (!activeSlug) return;
    trackEvent('learn.tab_view', { tab: activeSlug });
  }, [activeSlug]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        width: '100%',
      }}
    >
      {children}
    </div>
  );
}
