export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800">
        {/* Sidebar */}
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="h-16 border-b border-zinc-200 dark:border-zinc-800">
          {/* Header */}
        </header>
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
