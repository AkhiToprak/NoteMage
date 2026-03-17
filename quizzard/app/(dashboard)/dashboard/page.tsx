'use client';

import { useSession } from 'next-auth/react';
import { BookOpen, Brain, Zap, Flame } from 'lucide-react';

const statCards = [
  {
    label: 'Notebooks',
    value: '—',
    icon: BookOpen,
    color: '#8c52ff',
    bg: 'rgba(140, 82, 255, 0.1)',
    border: 'rgba(140, 82, 255, 0.2)',
  },
  {
    label: 'Quizzes Taken',
    value: '—',
    icon: Brain,
    color: '#5170ff',
    bg: 'rgba(81, 112, 255, 0.1)',
    border: 'rgba(81, 112, 255, 0.2)',
  },
  {
    label: 'Flashcards',
    value: '—',
    icon: Zap,
    color: '#ffde59',
    bg: 'rgba(255, 222, 89, 0.08)',
    border: 'rgba(255, 222, 89, 0.2)',
  },
  {
    label: 'Day Streak',
    value: '—',
    icon: Flame,
    color: '#ff7043',
    bg: 'rgba(255, 112, 67, 0.08)',
    border: 'rgba(255, 112, 67, 0.2)',
  },
];

export default function DashboardPage() {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(' ')[0] ?? 'there';

  return (
    <div style={{ maxWidth: '900px' }}>
      {/* Welcome heading */}
      <div style={{ marginBottom: '40px' }}>
        <h1
          style={{
            fontFamily: "'Gliker', 'DM Sans', sans-serif",
            fontSize: '32px',
            fontWeight: '700',
            color: '#ede9ff',
            margin: 0,
            letterSpacing: '-0.03em',
          }}
        >
          Welcome back, {firstName}!
        </h1>
        <p
          style={{
            fontFamily: "'Gliker', 'DM Sans', sans-serif",
            fontSize: '15px',
            color: 'rgba(237, 233, 255, 0.5)',
            marginTop: '8px',
          }}
        >
          Here&apos;s an overview of your study progress.
        </p>
      </div>

      {/* Stat cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
          gap: '16px',
          marginBottom: '40px',
        }}
      >
        {statCards.map(({ label, value, icon: Icon, color, bg, border }) => (
          <div
            key={label}
            style={{
              background: '#0d0c20',
              border: `1px solid ${border}`,
              borderRadius: '14px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: `0 4px 20px rgba(0,0,0,0.25)`,
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={20} style={{ color }} />
            </div>
            <div>
              <div
                style={{
                  fontFamily: "'Shrikhand', cursive",
                  fontSize: '26px',
                  color: '#ede9ff',
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                }}
              >
                {value}
              </div>
              <div
                style={{
                  fontFamily: "'Gliker', 'DM Sans', sans-serif",
                  fontSize: '13px',
                  color: 'rgba(237, 233, 255, 0.45)',
                  marginTop: '4px',
                }}
              >
                {label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent activity placeholder */}
      <div
        style={{
          background: '#0d0c20',
          border: '1px solid rgba(140, 82, 255, 0.15)',
          borderRadius: '14px',
          padding: '24px',
        }}
      >
        <h2
          style={{
            fontFamily: "'Gliker', 'DM Sans', sans-serif",
            fontSize: '15px',
            fontWeight: '600',
            color: '#ede9ff',
            margin: '0 0 20px 0',
            letterSpacing: '-0.01em',
          }}
        >
          Recent Activity
        </h2>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 0',
            gap: '10px',
          }}
        >
          <BookOpen size={32} style={{ color: 'rgba(140, 82, 255, 0.3)' }} />
          <p
            style={{
              fontFamily: "'Gliker', 'DM Sans', sans-serif",
              fontSize: '14px',
              color: 'rgba(237, 233, 255, 0.3)',
              margin: 0,
              textAlign: 'center',
            }}
          >
            No activity yet. Create your first notebook to get started.
          </p>
        </div>
      </div>
    </div>
  );
}
