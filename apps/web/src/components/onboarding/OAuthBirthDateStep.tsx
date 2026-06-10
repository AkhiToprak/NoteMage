'use client';

import DateOfBirthField from './DateOfBirthField';

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
      {/* The 13+ rationale is stated in the screen's subheading — no caption here. */}
      <DateOfBirthField
        value={birthDate}
        onChange={(value) => onChange('birthDate', value)}
        disabled={disabled}
      />

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
          I have read and accept the{' '}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--brand-purple-strong)', textDecoration: 'underline', textUnderlineOffset: '2px' }}
          >
            Terms of Service
          </a>{' '}
          and{' '}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--brand-purple-strong)', textDecoration: 'underline', textUnderlineOffset: '2px' }}
          >
            Privacy Policy
          </a>
          .
        </label>
      </div>
    </div>
  );
}
