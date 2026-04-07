'use client';

import { useState, useCallback } from 'react';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js';
import { getStripe } from '@/lib/stripe-client';
import type { TierKey } from '@/lib/tiers';
import { TIERS } from '@/lib/tiers';

interface PaymentStepProps {
  tier: TierKey;
  onSuccess: () => void;
  onBack: () => void;
  error: string;
}

export default function PaymentStep({ tier, onSuccess, onBack, error }: PaymentStepProps) {
  const [initError, setInitError] = useState('');

  const fetchClientSecret = useCallback(async () => {
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier }),
    });
    const data = await res.json();
    if (!res.ok || !data.data?.clientSecret) {
      const msg = data.error || 'Failed to initialize payment.';
      setInitError(msg);
      throw new Error(msg);
    }
    return data.data.clientSecret as string;
  }, [tier]);

  const handleComplete = useCallback(() => {
    onSuccess();
  }, [onSuccess]);

  if (initError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '14px 20px',
            borderRadius: '12px',
            background: 'rgba(253,111,133,0.08)',
            border: '1px solid rgba(253,111,133,0.2)',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '20px', color: 'var(--error, #fd6f85)' }}
          >
            error
          </span>
          <p style={{ color: 'var(--error, #fd6f85)', fontSize: '14px', margin: 0 }}>
            {initError}
          </p>
        </div>
        <button onClick={onBack} style={backButtonStyle}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
          Back to plan selection
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header with back button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={onBack} style={backButtonStyle}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
          Back
        </button>
        <p style={{ color: '#aaa8c8', fontSize: '14px', margin: 0 }}>
          Complete payment for{' '}
          <span style={{ color: tier === 'PRO' ? '#ffde59' : '#ae89ff', fontWeight: 600 }}>
            {TIERS[tier].name}
          </span>
        </p>
      </div>

      {/* Embedded checkout container */}
      <div
        style={{
          borderRadius: 'var(--radius-lg, 16px)',
          overflow: 'hidden',
          background: 'var(--surface-container-lowest, #080816)',
          minHeight: '400px',
        }}
      >
        <EmbeddedCheckoutProvider
          stripe={getStripe()}
          options={{ fetchClientSecret, onComplete: handleComplete }}
        >
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>

      {error && (
        <p style={{ color: 'var(--error, #fd6f85)', fontSize: '13px', margin: 0, textAlign: 'center' }}>
          {error}
        </p>
      )}
    </div>
  );
}

const backButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 16px',
  borderRadius: 'var(--radius-md, 12px)',
  border: '1px solid var(--outline-variant, rgba(255,255,255,0.1))',
  background: 'rgba(255,255,255,0.05)',
  color: 'var(--on-surface-variant, #aaa8c8)',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 0.15s, color 0.15s',
};
