'use client';

import { useState } from 'react';

export interface PollData {
  question: string;
  options: string[];
}

interface PollCreatorProps {
  value: PollData;
  onChange: (poll: PollData) => void;
  onRemove: () => void;
}

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  elevated: '#232342',
  inputBg: '#2a2a4c',
  primary: '#ae89ff',
  deepPurple: '#884efb',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  error: '#fd6f85',
  border: '#555578',
} as const;

const MAX_OPTIONS = 4;
const MIN_OPTIONS = 2;

export default function PollCreator({ value, onChange, onRemove }: PollCreatorProps) {
  const [hoveredRemoveIdx, setHoveredRemoveIdx] = useState<number | null>(null);
  const [hoveredAddBtn, setHoveredAddBtn] = useState(false);
  const [hoveredCloseBtn, setHoveredCloseBtn] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const updateQuestion = (question: string) => {
    onChange({ ...value, question });
  };

  const updateOption = (idx: number, text: string) => {
    const options = [...value.options];
    options[idx] = text;
    onChange({ ...value, options });
  };

  const addOption = () => {
    if (value.options.length >= MAX_OPTIONS) return;
    onChange({ ...value, options: [...value.options, ''] });
  };

  const removeOption = (idx: number) => {
    if (value.options.length <= MIN_OPTIONS) return;
    const options = value.options.filter((_, i) => i !== idx);
    onChange({ ...value, options });
  };

  return (
    <div
      style={{
        background: COLORS.elevated,
        borderRadius: 16,
        border: `1px solid ${COLORS.border}`,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        animation: 'pollSlideIn 0.25s ease-out',
      }}
    >
      <style>{`
        @keyframes pollSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 18, color: COLORS.primary }}
          >
            ballot
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
            Create Poll
          </span>
        </div>
        <button
          onClick={onRemove}
          onMouseEnter={() => setHoveredCloseBtn(true)}
          onMouseLeave={() => setHoveredCloseBtn(false)}
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            border: 'none',
            background: hoveredCloseBtn ? 'rgba(253,111,133,0.12)' : 'transparent',
            color: hoveredCloseBtn ? COLORS.error : COLORS.textMuted,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: `all 0.2s ${EASING}`,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
        </button>
      </div>

      {/* Question */}
      <input
        type="text"
        placeholder="Ask a question..."
        value={value.question}
        onChange={(e) => updateQuestion(e.target.value)}
        onFocus={() => setFocusedField('question')}
        onBlur={() => setFocusedField(null)}
        maxLength={200}
        style={{
          width: '100%',
          padding: '11px 14px',
          borderRadius: 10,
          border: `1.5px solid ${focusedField === 'question' ? COLORS.primary : COLORS.border}`,
          background: COLORS.inputBg,
          color: COLORS.textPrimary,
          fontSize: 14,
          fontWeight: 600,
          outline: 'none',
          transition: `border-color 0.2s ${EASING}`,
          boxSizing: 'border-box',
        }}
      />

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {value.options.map((opt, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                border: `2px solid ${COLORS.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 700,
                color: COLORS.textMuted,
              }}
            >
              {String.fromCharCode(65 + idx)}
            </div>
            <input
              type="text"
              placeholder={`Option ${idx + 1}`}
              value={opt}
              onChange={(e) => updateOption(idx, e.target.value)}
              onFocus={() => setFocusedField(`opt-${idx}`)}
              onBlur={() => setFocusedField(null)}
              maxLength={100}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: 8,
                border: `1.5px solid ${focusedField === `opt-${idx}` ? COLORS.primary : COLORS.border}`,
                background: COLORS.inputBg,
                color: COLORS.textPrimary,
                fontSize: 13,
                outline: 'none',
                transition: `border-color 0.2s ${EASING}`,
              }}
            />
            {value.options.length > MIN_OPTIONS && (
              <button
                onClick={() => removeOption(idx)}
                onMouseEnter={() => setHoveredRemoveIdx(idx)}
                onMouseLeave={() => setHoveredRemoveIdx(null)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: 'none',
                  background:
                    hoveredRemoveIdx === idx ? 'rgba(253,111,133,0.12)' : 'transparent',
                  color: hoveredRemoveIdx === idx ? COLORS.error : COLORS.textMuted,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: `all 0.15s ${EASING}`,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  remove_circle_outline
                </span>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add option */}
      {value.options.length < MAX_OPTIONS && (
        <button
          onClick={addOption}
          onMouseEnter={() => setHoveredAddBtn(true)}
          onMouseLeave={() => setHoveredAddBtn(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px',
            borderRadius: 8,
            border: `1.5px dashed ${hoveredAddBtn ? COLORS.primary : COLORS.border}`,
            background: 'transparent',
            color: hoveredAddBtn ? COLORS.primary : COLORS.textMuted,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: `all 0.2s ${EASING}`,
            width: '100%',
            justifyContent: 'center',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
          Add Option
        </button>
      )}
    </div>
  );
}
