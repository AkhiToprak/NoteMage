// The /start signup funnel is cream-hardcoded and stays light regardless of
// the user's theme preference. Pin it here so it renders identically for
// OS-dark / stored-dark users.
export default function StartLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="light" style={{ display: 'contents', colorScheme: 'light' }}>
      {children}
    </div>
  );
}
