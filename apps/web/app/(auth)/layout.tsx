import { BGPattern } from '@/components/ui/bg-pattern';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        background: '#000000',
        color: 'var(--on-surface)',
        minHeight: '100vh',
        overflowX: 'hidden',
        position: 'relative',
        isolation: 'isolate',
      }}
    >
      <BGPattern
        variant="dots"
        size={22}
        fill="rgba(174, 137, 255, 0.14)"
        style={{ position: 'fixed' }}
      />

      {/* Grain texture */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 999,
          opacity: 0.022,
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='400' height='400' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Centered content */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px 24px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '560px',
            animation: 'authSlideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {children}
        </div>
      </div>

      <style>{`
        @keyframes authSlideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  );
}
