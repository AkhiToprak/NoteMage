'use client';

import { useEffect, useState } from 'react';
import { getRandomGreeting, interpolateGreeting } from '@/lib/greetings';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { responsiveValue } from '@/lib/responsive';

interface DashboardGreetingProps {
  userName: string;
}

export default function DashboardGreeting({ userName }: DashboardGreetingProps) {
  const { bp } = useBreakpoint();
  const [greeting, setGreeting] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Generate a random greeting immediately (used as fallback)
    const fallback = getRandomGreeting(userName);

    fetch('/api/user/profile')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const custom = data?.data?.customGreeting;
        if (custom && typeof custom === 'string') {
          setGreeting(interpolateGreeting(custom, userName));
        } else {
          setGreeting(fallback);
        }
        // Trigger fade-in after a frame
        requestAnimationFrame(() => setVisible(true));
      })
      .catch(() => {
        setGreeting(fallback);
        requestAnimationFrame(() => setVisible(true));
      });
  }, [userName]);

  if (!greeting) return null;

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition:
          'opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1), transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
        fontFamily: 'var(--font-display)',
        fontSize: responsiveValue(bp, {
          phone: '22px',
          tablet: '28px',
          desktop: '34px',
        }),
        fontWeight: 700,
        letterSpacing: '-0.03em',
        lineHeight: 1.2,
        background: 'linear-gradient(135deg, var(--on-surface) 0%, var(--primary) 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        paddingBottom: '4px', // prevents clipping on descenders
      }}
    >
      {greeting}
    </div>
  );
}
