'use client';

import { useState } from 'react';

interface ScholarNameStepProps {
  scholarName: string;
  onChange: (name: string) => void;
  onNext: () => void;
  onSkip: () => void;
  loading: boolean;
  error: string;
}

const MAX_LENGTH = 30;
const NAME_REGEX = /^[a-zA-Z0-9\s\-']+$/;

export default function ScholarNameStep({
  scholarName,
  onChange,
  onNext,
  onSkip,
  loading,
  error,
}: ScholarNameStepProps) {
  const [validationError, setValidationError] = useState('');
  const [inputFocused, setInputFocused] = useState(false);

  const displayName = scholarName.trim() || 'Mage';
  const charCount = scholarName.length;
  const displayError = error || validationError;

  const handleChange = (value: string) => {
    if (value.length > MAX_LENGTH) return;
    setValidationError('');
    onChange(value);
  };

  const handleNext = () => {
    const trimmed = scholarName.trim();
    if (trimmed && !NAME_REGEX.test(trimmed)) {
      setValidationError('Name can only contain letters, numbers, spaces, hyphens, and apostrophes.');
      return;
    }
    onNext();
  };

  return (
    <>
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 8px' }}>
          Name your Mage
        </h2>
        <p style={{ fontSize: '14px', color: '#aaa8c8', margin: 0 }}>
          Give your AI study assistant a unique name.
        </p>
      </div>

      {displayError && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '12px',
            background: 'rgba(253,111,133,0.12)',
            color: '#fd6f85',
            fontSize: '14px',
            marginBottom: '20px',
          }}
        >
          {displayError}
        </div>
      )}

      {/* Preview Bubble */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '28px',
        }}
      >
        <div
          style={{
            background: '#232342',
            borderRadius: '20px',
            padding: '20px 24px',
            border: '1px solid #555578',
            maxWidth: '320px',
            width: '100%',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #ae89ff 0%, #884efb 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
              boxShadow: '0 0 0 4px rgba(174,137,255,0.2), 0 8px 32px rgba(174,137,255,0.2)',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '28px', color: '#fff' }}
            >
              auto_awesome
            </span>
          </div>
          <p
            style={{
              fontSize: '15px',
              color: '#c0bed8',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Hey! I&apos;m{' '}
            <span style={{ color: '#ae89ff', fontWeight: 700 }}>{displayName}</span>, your
            personal study assistant.
          </p>
        </div>
      </div>

      {/* Name Input */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={scholarName}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="e.g. Archimedes, Sage, Athena..."
            maxLength={MAX_LENGTH}
            style={{
              width: '100%',
              padding: '16px',
              paddingRight: '60px',
              background: '#1c1c38',
              border: `1px solid ${inputFocused ? 'rgba(174,137,255,0.5)' : '#555578'}`,
              borderRadius: '16px',
              color: '#e5e3ff',
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

      {/* Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button
          onClick={handleNext}
          disabled={loading}
          style={{
            width: '100%',
            padding: '16px',
            background: loading
              ? '#555578'
              : 'linear-gradient(135deg, #ae89ff 0%, #884efb 100%)',
            border: 'none',
            borderRadius: '16px',
            color: loading ? '#aaa8c8' : '#2a0066',
            fontSize: '16px',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: loading ? 'none' : '0 8px 24px rgba(174,137,255,0.3)',
            transition:
              'transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.transform = 'scale(1.02)';
              e.currentTarget.style.boxShadow = '0 12px 32px rgba(174,137,255,0.4)';
            }
          }}
          onMouseLeave={(e) => {
            if (!loading) {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(174,137,255,0.3)';
            }
          }}
          onMouseDown={(e) => {
            if (!loading) e.currentTarget.style.transform = 'scale(0.98)';
          }}
          onMouseUp={(e) => {
            if (!loading) e.currentTarget.style.transform = 'scale(1.02)';
          }}
        >
          Continue
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
            arrow_forward
          </span>
        </button>

        <button
          onClick={onSkip}
          disabled={loading}
          style={{
            width: '100%',
            padding: '14px',
            background: 'transparent',
            border: 'none',
            borderRadius: '16px',
            color: '#8888a8',
            fontSize: '15px',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            transition: 'color 0.2s cubic-bezier(0.22,1,0.36,1)',
          }}
          onMouseEnter={(e) => {
            if (!loading) e.currentTarget.style.color = '#aaa8c8';
          }}
          onMouseLeave={(e) => {
            if (!loading) e.currentTarget.style.color = '#8888a8';
          }}
        >
          Skip for now
        </button>
      </div>
    </>
  );
}
