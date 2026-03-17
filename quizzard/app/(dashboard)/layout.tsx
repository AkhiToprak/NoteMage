import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: '#09081a',
      }}
    >
      <Sidebar />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <Header />
        <main
          style={{
            flex: 1,
            padding: '32px',
            color: '#ede9ff',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
