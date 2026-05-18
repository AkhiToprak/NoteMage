'use client';

interface FirstNameStepProps {
  value: string;
  onChange: (value: string) => void;
}

/** Onboarding screen 2 — the user's first name. Stored into `User.name`. */
export default function FirstNameStep({ value, onChange }: FirstNameStepProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Alex"
      maxLength={50}
      autoFocus
      autoComplete="given-name"
      style={{
        width: '100%',
        padding: '13px 16px',
        background: 'var(--surface-container-high)',
        border: '1px solid #555578',
        borderRadius: 'var(--radius-md)',
        color: 'var(--on-surface)',
        fontSize: '16px',
        fontFamily: 'inherit',
        outline: 'none',
        boxSizing: 'border-box',
        transition: 'box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
      }}
      onFocus={(e) => {
        e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)';
      }}
      onBlur={(e) => {
        e.target.style.boxShadow = 'none';
      }}
    />
  );
}
