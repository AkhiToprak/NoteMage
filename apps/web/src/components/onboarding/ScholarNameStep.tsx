'use client';

import { useState } from 'react';

/** Allowed characters for a mage name — letters, numbers, spaces, hyphens, apostrophes. */
export const MAGE_NAME_REGEX = /^[a-zA-Z0-9\s\-']+$/;

const MAX_LENGTH = 30;

interface ScholarNameStepProps {
  scholarName: string;
  onChange: (name: string) => void;
}

export default function ScholarNameStep({ scholarName, onChange }: ScholarNameStepProps) {
  const [inputFocused, setInputFocused] = useState(false);

  const displayName = scholarName.trim() || 'Mage';
  const charCount = scholarName.length;

  const handleChange = (value: string) => {
    if (value.length > MAX_LENGTH) return;
    onChange(value);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Preview Bubble */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            background: 'var(--surface-container-high)',
            borderRadius: '18px',
            padding: '14px 20px',
            border: '1px solid #555578',
            maxWidth: '320px',
            width: '100%',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: '#ae89ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 8px',
              boxShadow: '0 0 0 4px rgba(174,137,255,0.2), 0 8px 32px rgba(174,137,255,0.2)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '22px', color: '#fff' }}>
              auto_awesome
            </span>
          </div>
          <p style={{ fontSize: '14px', color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.5 }}>
            Hey! I&apos;m <span style={{ color: '#ae89ff', fontWeight: 700 }}>{displayName}</span>, your
            personal study assistant.
          </p>
        </div>
      </div>

      {/* Name Input */}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={scholarName}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          placeholder="e.g. Archimedes, Sage, Athena…"
          maxLength={MAX_LENGTH}
          style={{
            width: '100%',
            padding: '12px 16px',
            paddingRight: '60px',
            background: 'var(--surface-container)',
            border: `1px solid ${inputFocused ? 'rgba(174,137,255,0.5)' : '#555578'}`,
            borderRadius: '14px',
            color: 'var(--on-surface)',
            fontSize: '16px',
            fontFamily: 'inherit',
            outline: 'none',
            transition: 'border-color 0.2s cubic-bezier(0.22,1,0.36,1)',
            boxSizing: 'border-box',
          }}
        />
        <span
          style={{
            position: 'absolute',
            right: '16px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '12px',
            color: charCount >= MAX_LENGTH ? '#fd6f85' : '#8888a8',
          }}
        >
          {charCount}/{MAX_LENGTH}
        </span>
      </div>
    </div>
  );
}
