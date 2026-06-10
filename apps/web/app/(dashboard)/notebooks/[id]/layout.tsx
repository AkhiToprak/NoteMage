'use client';

import { use, useEffect, useLayoutEffect, useState } from 'react';
import {
  NotebookWorkspaceProvider,
  useNotebookWorkspace,
} from '@/components/notebook/NotebookWorkspaceContext';
import UnifiedSidebar from '@/components/notebook/UnifiedSidebar';
import { useBreakpoint } from '@/hooks/useBreakpoint';

// useLayoutEffect on the client (commits before the browser paints, so desktop
// shows no sidebar shift), useEffect on the server (sidesteps the SSR
// "useLayoutEffect does nothing on the server" warning).
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function NotebookWorkspaceInner({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed, setSidebarCollapsed } = useNotebookWorkspace();
  const { isPhone, isPhoneOrTablet } = useBreakpoint();

  // Gate every breakpoint-dependent branch behind a mount flag. useBreakpoint
  // returns 'desktop' on the SSR snapshot, so without this the 280px desktop
  // sidebar painted at phone widths and squeezed the content until hydration.
  // A layout effect flips `mounted` before the first paint, so the phone never
  // paints the desktop sidebar and the desktop sees no sidebar shift.
  const [mounted, setMounted] = useState(false);
  useIsomorphicLayoutEffect(() => {
    setMounted(true);
  }, []);

  // Auto-collapse on phone/tablet. As a layout effect it commits before paint,
  // so the overlay drawer never flashes open on first load (sidebarCollapsed
  // seeds to false in context).
  useIsomorphicLayoutEffect(() => {
    if (isPhoneOrTablet) setSidebarCollapsed(true);
  }, [isPhoneOrTablet, setSidebarCollapsed]);

  const showInlineSidebar = mounted && !isPhoneOrTablet;
  const showOverlaySidebar = mounted && isPhoneOrTablet && !sidebarCollapsed;
  const showToggle = mounted && sidebarCollapsed;

  return (
    <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden' }}>
      {/* Desktop: inline sidebar with width transition */}
      {showInlineSidebar && (
        <div
          style={{
            width: sidebarCollapsed ? '0px' : '280px',
            minWidth: sidebarCollapsed ? '0px' : '280px',
            transition:
              'width 0.25s cubic-bezier(0.4,0,0.2,1), min-width 0.25s cubic-bezier(0.4,0,0.2,1)',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <UnifiedSidebar />
        </div>
      )}
      {/* Phone/Tablet: overlay sidebar */}
      {showOverlaySidebar && (
        <>
          <style>{`
            @keyframes burgerSlideIn {
              from { transform: translateX(-100%); }
              to { transform: translateX(0); }
            }
            @keyframes burgerBackdropIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}</style>
          {/* Backdrop */}
          <div
            onClick={() => setSidebarCollapsed(true)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              zIndex: 200,
              animation: 'burgerBackdropIn 0.2s ease-out',
            }}
          />
          {/* Sidebar panel */}
          <div
            style={{
              position: 'fixed',
              left: 0,
              top: 0,
              bottom: 0,
              width: isPhone ? '100vw' : 280,
              zIndex: 201,
              animation: 'burgerSlideIn 0.3s cubic-bezier(0.22,1,0.36,1)',
            }}
          >
            <UnifiedSidebar />
          </div>
        </>
      )}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          background: '#000000',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          // Reserve a left gutter for the floating expand toggle so it never
          // overlaps page titles (canvas, flashcard/quiz viewers, editor). The
          // toggle is absolutely positioned inside this padding gutter.
          paddingLeft: showToggle ? 44 : 0,
        }}
      >
        {showToggle && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            title="Expand sidebar"
            style={{
              position: 'absolute',
              left: 8,
              top: 14,
              zIndex: 20,
              width: 28,
              height: 28,
              borderRadius: 7,
              background: 'rgba(0, 0, 0, 0.9)',
              border: '1px solid rgba(140,82,255,0.15)',
              color: 'var(--ink-50)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--ink-80)';
              e.currentTarget.style.background = 'rgba(140,82,255,0.18)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--ink-50)';
              e.currentTarget.style.background =
                'color-mix(in srgb, var(--surface-container) 90%, transparent)';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>keyboard_double_arrow_right</span>
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export default function NotebookWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <NotebookWorkspaceProvider notebookId={id}>
      <NotebookWorkspaceInner>{children}</NotebookWorkspaceInner>
    </NotebookWorkspaceProvider>
  );
}
