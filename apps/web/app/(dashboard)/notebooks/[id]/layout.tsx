'use client';

import { use, useEffect } from 'react';
import { ChevronsRight } from 'lucide-react';
import {
  NotebookWorkspaceProvider,
  useNotebookWorkspace,
} from '@/components/notebook/NotebookWorkspaceContext';
import UnifiedSidebar from '@/components/notebook/UnifiedSidebar';
import { useBreakpoint } from '@/hooks/useBreakpoint';

function NotebookWorkspaceInner({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed, setSidebarCollapsed } = useNotebookWorkspace();
  const { isPhone, isPhoneOrTablet } = useBreakpoint();

  // Auto-collapse sidebar on phone/tablet
  useEffect(() => {
    if (isPhoneOrTablet) {
      setSidebarCollapsed(true);
    }
  }, [isPhoneOrTablet, setSidebarCollapsed]);

  return (
    <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden' }}>
      {/* Desktop: inline sidebar with width transition */}
      {!isPhoneOrTablet && (
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
      {isPhoneOrTablet && !sidebarCollapsed && (
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
          background: '#12112a',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {sidebarCollapsed && (
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
              background: 'rgba(26, 26, 54,0.9)',
              border: '1px solid rgba(140,82,255,0.15)',
              color: 'rgba(237,233,255,0.5)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'rgba(237,233,255,0.9)';
              e.currentTarget.style.background = 'rgba(140,82,255,0.18)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(237,233,255,0.5)';
              e.currentTarget.style.background = 'rgba(26, 26, 54,0.9)';
            }}
          >
            <ChevronsRight size={15} />
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
