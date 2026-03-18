'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';

/** Matches /notebooks/<uuid-or-id> and anything nested below it */
const NOTEBOOK_WORKSPACE_RE = /^\/notebooks\/[^/]+/;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isNotebookWorkspace = NOTEBOOK_WORKSPACE_RE.test(pathname);

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: '#09081a',
      }}
    >
      {!isNotebookWorkspace && <Sidebar />}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <Header />
        <main
          style={{
            flex: 1,
            minHeight: 0,
            overflow: isNotebookWorkspace ? 'hidden' : 'auto',
            padding: isNotebookWorkspace ? '0' : '32px',
            color: '#ede9ff',
            display: isNotebookWorkspace ? 'flex' : undefined,
            flexDirection: isNotebookWorkspace ? 'column' : undefined,
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
