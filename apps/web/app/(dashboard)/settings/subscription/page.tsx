'use client';

import SettingsShell from '@/components/settings/SettingsShell';
import { SettingsCard, CardHead } from '@/components/settings/SettingsKit';
import SubscriptionPanel from '@/components/settings/SubscriptionPanel';

/* Subscription settings (cream redesign). Reached from /profile → "Subscription".
   SubscriptionPanel carries the real billing logic (Lemon Squeezy upgrade /
   portal / cancel, iOS StoreKit). It's a legacy "rework" component styled
   against the dark global tokens, so it's wrapped in `.nm-rework-cream` — the
   sanctioned remap that makes those tokens resolve to the warm cream palette
   (otherwise its text renders light-on-light on the AppShell surface). */

export default function SubscriptionSettingsPage() {
  return (
    <SettingsShell label="Subscription" subtitle="Manage your plan and billing.">
      <SettingsCard>
        <CardHead icon="credit_card" tint="lilac" title="Your plan" desc="Upgrade, manage billing, or cancel anytime." />
        <div className="nm-rework-cream">
          <SubscriptionPanel />
        </div>
      </SettingsCard>
    </SettingsShell>
  );
}
