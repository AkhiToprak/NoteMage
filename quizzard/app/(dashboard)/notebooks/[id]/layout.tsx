'use client';

import { use } from 'react';
import { ChevronsRight } from 'lucide-react';
import { NotebookWorkspaceProvider, useNotebookWorkspace } from '@/components/notebook/NotebookWorkspaceContext';
import UnifiedSidebar from '@/components/notebook/UnifiedSidebar';

function NotebookWorkspaceInner({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed, setSidebarCollapsed } = useNotebookWorkspace();

  return (
    <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden' }}>
      <div style={{
        width: sidebarCollapsed ? '0px' : '280px',
        minWidth: sidebarCollapsed ? '0px' : '280px',
        transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1), min-width 0.25s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        <UnifiedSidebar />
      </div>
      <div style={{
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        background: '#12112a',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}>
        {sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            title="Expand sidebar"
            style={{
              position: 'absolute', left: 8, top: 14, zIndex: 20,
              width: 28, height: 28, borderRadius: 7,
              background: 'rgba(17,17,38,0.9)', border: '1px solid rgba(140,82,255,0.15)',
              color: 'rgba(237,233,255,0.5)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'rgba(237,233,255,0.9)';
              e.currentTarget.style.background = 'rgba(140,82,255,0.18)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'rgba(237,233,255,0.5)';
              e.currentTarget.style.background = 'rgba(17,17,38,0.9)';
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
