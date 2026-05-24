'use client';

import { useState } from 'react';
import PricingCard from '@/components/pricing/PricingCard';
import BillingIntervalToggle from '@/components/pricing/BillingIntervalToggle';
import {
  TIERS,
  monthlyEquivalent,
  yearlySavingsPct,
  type TierKey,
  type BillingInterval,
} from '@/lib/tiers';
import { useCurrency } from '@/hooks/useCurrency';

interface TierSelectionStepProps {
  selectedTier: TierKey;
  onSelect: (tier: TierKey) => void;
  /**
   * Phase 12 switchover flag. Must be resolved server-side and passed in (the
   * env var is stripped from the client bundle). Mounted as the wizard's plan
   * step — app/(auth)/auth/register/page.tsx reads freeTierAiPathsDisabled()
   * and threads it through OnboardingWizard, the same way app/pricing/page.tsx does.
   */
  freeAiPathsDisabled?: boolean;
}

export default function TierSelectionStep({
  selectedTier,
  onSelect,
  freeAiPathsDisabled = false,
}: TierSelectionStepProps) {
  const { formatPrice } = useCurrency();
  // Display-only: drives the prices shown on the cards. The actual cadence is
  // chosen on the Lemon Squeezy checkout (single product link).
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <BillingIntervalToggle
        value={billingInterval}
        onChange={setBillingInterval}
        savingsPct={yearlySavingsPct('PRO')}
        compact
      />
      <div
        className="tier-step-cards"
        style={{ display: 'flex', gap: '16px', justifyContent: 'center', alignItems: 'stretch' }}
      >
        {(['FREE', 'PRO'] as TierKey[]).map((tier) => (
          <PricingCard
            key={tier}
            tier={tier}
            selected={selectedTier === tier}
            onSelect={onSelect}
            formattedPrice={formatPrice(TIERS[tier].price[billingInterval])}
            interval={billingInterval}
            priceSubline={
              tier === 'PRO' && billingInterval === 'yearly'
                ? `${formatPrice(monthlyEquivalent(tier))} / mo`
                : undefined
            }
            freeAiPathsDisabled={freeAiPathsDisabled}
            compact
          />
        ))}
      </div>
      <p style={{ color: 'var(--on-surface-variant)', fontSize: '12px', margin: 0, textAlign: 'center' }}>
        You can change your plan anytime.
      </p>

      <style>{`
        /* Stack the two plan cards on phones and small tablets — the 560px
           onboarding card is too tight for a side-by-side row below ~768px.
           column-reverse keeps PRO (second in source order, so right-hand on
           desktop) on top on a phone instead of below the fold. The padding-top
           gives PRO's Most Popular badge room to sit above the card. */
        @media (max-width: 767px) {
          .tier-step-cards {
            flex-direction: column-reverse !important;
            align-items: center !important;
            padding-top: 8px !important;
          }
          .tier-step-cards > * { width: 100% !important; max-width: 360px !important; }
        }
      `}</style>
    </div>
  );
}
