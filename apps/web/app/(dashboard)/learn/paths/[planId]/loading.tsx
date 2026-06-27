import AppShell from '@/components/app/AppShell';

/* Route skeleton shown while the server resolves the path. Mirrors the View's
   own LoadingShell so navigation feels instant before the path map streams in. */

export default function PathDetailLoading() {
  return (
    <AppShell width="wide">
      <p style={{ margin: '32px auto', textAlign: 'center', color: 'var(--body)', fontSize: '14px' }}>
        Loading path…
      </p>
    </AppShell>
  );
}
