import { DashboardChrome } from './DashboardChrome';
import { WelcomeBackServerGate } from '@/components/welcome-back/WelcomeBackServerGate';

// Server component so the welcome-back takeover can be decided during SSR and
// its cover appears in the initial HTML (no dashboard flash). All interactive
// chrome lives in the client `DashboardChrome`.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WelcomeBackServerGate />
      <DashboardChrome>{children}</DashboardChrome>
    </>
  );
}
