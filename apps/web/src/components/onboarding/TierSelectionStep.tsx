'use client';

import PricingCard from '@/components/pricing/PricingCard';
import { TIERS, type TierKey } from '@/lib/tiers';
import { useCurrency } from '@/hooks/useCurrency';
import { Mascot } from '@/components/mascot';

interface TierSelectionStepProps {
  selectedTier: TierKey;
  onSelect: (tier: TierKey) => void;
  onNext: () => void;
  loading: boolean;
  error: string;
}

export default function TierSelectionStep({
  selectedTier,
  onSelect,
  onNext,
  loading,
  error,
}: TierSelectionStepProps) {
  const { formatPrice } = useCurrency();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Mascot pose="thinking" size="md" idle="sway" />
      </div>
      <div
        style={{
          display: 'flex',
          gap: '16px',
          justifyContent: 'center',
          alignItems: 'stretch',
        }}
      >
        {(['FREE', 'PLUS', 'PRO'] as TierKey[]).map((tier) => (
          <PricingCard
            key={tier}
            tier={tier}
            selected={selectedTier === tier}
            onSelect={onSelect}
            formattedPrice={formatPrice(TIERS[tier].priceCHF)}
            compact
          />
        ))}
      </div>

      {error && (
        <p style={{ color: '#ff6b6b', fontSize: '13px', margin: 0, textAlign: 'center' }}>
          {error}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <button
          onClick={onNext}
          disabled={loading}
          style={{
            padding: '14px 48px',
            borderRadius: '14px',
            border: 'none',
            fontWeight: 700,
            fontSize: '15px',
            cursor: loading ? 'wait' : 'pointer',
            background: '#ae89ff',
            color: '#fff',
            opacity: loading ? 0.6 : 1,
            transition: 'opacity 0.2s',
          }}
        >
          {loading ? 'Saving…' : selectedTier === 'FREE' ? 'Continue' : 'Continue to Payment'}
        </button>
        <p style={{ color: '#aaa8c8', fontSize: '12px', margin: 0 }}>
          You can change your plan anytime.
        </p>
      </div>
    </div>
  );
}
