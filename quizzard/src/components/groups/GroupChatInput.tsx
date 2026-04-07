'use client';

import React, { useState, useRef, useCallback } from 'react';

const COLORS = {
  elevated: '#131328',
  inputBg: '#1c1c38',
  primary: '#ae89ff',
  textPrimary: '#e5e3ff',
  textMuted: '#8888a8',
  yellow: '#ffde59',
  border: '#555578',
} as const;

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

interface Props {
  onSend: (content: string) => Promise<void>;
  sending: boolean;
}

export default function GroupChatInput({ onSend, sending }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [sendHover, setSendHover] = useState(false);

  const canSend = value.trim().length > 0 && !sending;

  const handleSend = useCallback(async () => {
    if (!canSend) return;
    const content = value.trim();
    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = '44px';
    await onSend(content);
  }, [canSend, value, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '44px';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, []);

  return (
    <div style={{
      padding: '16px 24px',
      background: `${COLORS.elevated}e6`,
      backdropFilter: 'blur(20px)',
      borderTop: `1px solid ${COLORS.border}1a`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 1200, margin: '0 auto' }}>
        <button style={{
          width: 36, height: 36, borderRadius: '50%', border: 'none',
          background: 'transparent', color: COLORS.textMuted, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          transition: `color 0.2s ${EASING}`,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24 }}>add_circle</span>
        </button>

        <div style={{ flex: 1, position: 'relative' }}>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => { setValue(e.target.value); handleInput(); }}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            rows={1}
            style={{
              width: '100%', minHeight: 44, maxHeight: 160,
              background: COLORS.inputBg, border: 'none', borderRadius: 16,
              padding: '12px 20px', fontSize: 14, color: COLORS.textPrimary,
              resize: 'none', outline: 'none', lineHeight: 1.4,
              fontFamily: 'inherit',
            }}
          />
        </div>

        <button
          onClick={handleSend}
          disabled={!canSend}
          onMouseEnter={() => setSendHover(true)}
          onMouseLeave={() => setSendHover(false)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: canSend ? COLORS.yellow : `${COLORS.yellow}33`,
            color: canSend ? '#5f4f00' : COLORS.textMuted,
            border: 'none', borderRadius: 16,
            padding: '12px 24px', fontWeight: 700, fontSize: 14,
            cursor: canSend ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', flexShrink: 0,
            transform: sendHover && canSend ? 'scale(1.03)' : 'scale(1)',
            transition: `transform 0.2s ${EASING}, opacity 0.2s ${EASING}`,
            opacity: canSend ? 1 : 0.5,
          }}
        >
          Send
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>send</span>
        </button>
      </div>
    </div>
  );
}
