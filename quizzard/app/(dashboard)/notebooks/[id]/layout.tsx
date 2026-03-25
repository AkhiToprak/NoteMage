'use client';

import { use } from 'react';
import { NotebookWorkspaceProvider } from '@/components/notebook/NotebookWorkspaceContext';
import UnifiedSidebar from '@/components/notebook/UnifiedSidebar';

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
      <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden' }}>
        <UnifiedSidebar />
        <div style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          background: '#12112a',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {children}
        </div>
      </div>
    </NotebookWorkspaceProvider>
  );
}
