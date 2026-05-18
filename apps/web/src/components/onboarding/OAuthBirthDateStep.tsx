'use client';

import DateOfBirthField from './DateOfBirthField';
import { MIN_AGE } from '@/lib/age';

interface OAuthBirthDateStepProps {
  birthDate: string;
  agreed: boolean;
  onChange: (field: string, value: string | boolean) => void;
  disabled?: boolean;
}

/**
 * Onboarding screen 1 (OAuth path): OAuth users never see the credentials
 * form, so the 13+ gate and terms agreement get a dedicated home here. An
 * under-13 date of birth deletes the already-created account server-side.
 */
export default function OAuthBirthDateStep({
  birthDate,
  agreed,
  onChange,
  disabled,
}: OAuthBirthDateStepProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <DateOfBirthField
          value={birthDate}
          onChange={(value) => onChange('birthDate', value)}
          disabled={disabled}
        />
        <p style={{ margin: '8px 0 0 4px', fontSize: '12px', color: 'var(--outline)' }}>
          You must be at least {MIN_AGE} to use NoteMage.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '0 4px' }}>
        <input
          type="checkbox"
          id="terms-oauth"
          checked={agreed}
          onChange={(e) => onChange('agreed', e.target.checked)}
          disabled={disabled}
          style={{
            marginTop: '2px',
            width: '18px',
            height: '18px',
            borderRadius: '4px',
            background: 'var(--surface-container-highest)',
            border: 'none',
            accentColor: '#ae89ff',
            flexShrink: 0,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        />
        <label
          htmlFor="terms-oauth"
          style={{
            fontSize: '13px',
            color: 'var(--on-surface-variant)',
            lineHeight: '1.6',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          I agree to the{' '}
          <a href="#" style={{ color: '#b9c3ff', textDecoration: 'none' }}>
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="#" style={{ color: '#b9c3ff', textDecoration: 'none' }}>
            Privacy Policy
          </a>
          .
        </label>
      </div>
    </div>
  );
}
