'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

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
  onShareClick?: () => void;
  /** Opens the Start Co-work modal when the popover item is clicked. */
  onStartCoworkClick?: () => void;
}

export default function GroupChatInput({
  onSend,
  sending,
  onShareClick,
  onStartCoworkClick,
}: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [sendHover, setSendHover] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [popoverOpen]);

  // Close popover on Escape
  useEffect(() => {
    if (!popoverOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopoverOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [popoverOpen]);

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
        <div ref={popoverRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setPopoverOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={popoverOpen}
            aria-label="Open attachment menu"
            style={{
              width: 36, height: 36, borderRadius: '50%', border: 'none',
              background: popoverOpen ? 'rgba(174, 137, 255, 0.18)' : 'transparent',
              color: popoverOpen ? COLORS.primary : COLORS.textMuted,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: `color 0.2s ${EASING}, background 0.2s ${EASING}, transform 0.25s ${EASING}`,
              transform: popoverOpen ? 'rotate(45deg)' : 'rotate(0deg)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 24 }}>add_circle</span>
          </button>

          {popoverOpen && (
            <div
              role="menu"
              aria-label="Chat actions"
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 8px)',
                left: 0,
                zIndex: 50,
                minWidth: 240,
                padding: 6,
                borderRadius: 14,
                background: 'rgba(20, 18, 44, 0.96)',
                border: '1px solid rgba(174, 137, 255, 0.28)',
                boxShadow:
                  '0 24px 64px rgba(0, 0, 0, 0.55), 0 8px 24px rgba(140, 82, 255, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                fontFamily: 'inherit',
              }}
            >
              {onShareClick && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setPopoverOpen(false);
                    onShareClick();
                  }}
                  style={popoverItemStyle}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(174, 137, 255, 0.14)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span
                    style={{
                      ...popoverIconStyle,
                      background: 'rgba(174, 137, 255, 0.14)',
                      borderColor: 'rgba(174, 137, 255, 0.3)',
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 18, color: COLORS.primary }}
                    >
                      folder_open
                    </span>
                  </span>
                  <span style={popoverItemTextStyle}>
                    <span style={popoverItemTitleStyle}>Share content</span>
                    <span style={popoverItemSubStyle}>
                      Share a notebook, flashcard set or quiz
                    </span>
                  </span>
                </button>
              )}

              {onStartCoworkClick && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setPopoverOpen(false);
                    onStartCoworkClick();
                  }}
                  style={popoverItemStyle}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 222, 89, 0.12)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span
                    style={{
                      ...popoverIconStyle,
                      background: 'rgba(255, 222, 89, 0.14)',
                      borderColor: 'rgba(255, 222, 89, 0.35)',
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 18, color: COLORS.yellow }}
                    >
                      groups
                    </span>
                  </span>
                  <span style={popoverItemTextStyle}>
                    <span style={popoverItemTitleStyle}>Start co-work session</span>
                    <span style={popoverItemSubStyle}>
                      Pick a page and work on it together
                    </span>
                  </span>
                </button>
              )}
            </div>
          )}
        </div>

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

/* ── Popover item styling (shared between all menu entries) ───────────── */

const popoverItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: 'none',
  background: 'transparent',
  color: COLORS.textPrimary,
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'inherit',
  transition: `background 0.18s ${EASING}`,
};

const popoverIconStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 10,
  border: '1px solid transparent',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const popoverItemTextStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  flex: 1,
};

const popoverItemTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: COLORS.textPrimary,
  lineHeight: 1.2,
};

const popoverItemSubStyle: React.CSSProperties = {
  fontSize: 11,
  color: COLORS.textMuted,
  marginTop: 2,
  lineHeight: 1.4,
};
