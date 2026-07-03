import { redirect } from 'next/navigation';
import { DashboardChrome } from './DashboardChrome';
import { WelcomeBackServerGate } from '@/components/welcome-back/WelcomeBackServerGate';
import { getServerAuthUser } from '@/lib/server-auth';

// Server component so the welcome-back takeover can be decided during SSR and
// its cover appears in the initial HTML (no dashboard flash). All interactive
// chrome lives in the client `DashboardChrome`.
//
// Middleware only verifies the JWT signature (no DB round-trip), so a token
// whose authVersion is stale or missing — e.g. every session issued before
// authVersion revocation shipped — still passes middleware but fails the DB
// check in getServerAuthUser(). Without this redirect, pages that see a null
// user just render an empty/errored state instead of sending the user back
// to login.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerAuthUser();
  if (!user) redirect('/auth/login');

  return (
    <>
      <WelcomeBackServerGate />
      <DashboardChrome>{children}</DashboardChrome>
    </>
  );
}
