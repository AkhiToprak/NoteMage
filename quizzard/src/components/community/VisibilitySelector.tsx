'use client';

import { useState, useRef, useEffect } from 'react';

export type PostVisibility = 'public' | 'friends' | 'specific';

interface VisibilitySelectorProps {
  value: PostVisibility;
  onChange: (v: PostVisibility) => void;
}

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  cardBg: '#161630',
  elevated: '#232342',
  inputBg: '#2a2a4c',
  primary: '#ae89ff',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  border: '#555578',
} as const;

const OPTIONS: { key: PostVisibility; label: string; icon: string; desc: string }[] = [
  { key: 'public', label: 'Public', icon: 'public', desc: 'Visible to everyone' },
  { key: 'friends', label: 'Friends', icon: 'group', desc: 'Only your friends' },
  { key: 'specific', label: 'Specific', icon: 'person_search', desc: 'Choose who sees this' },
];

export default function VisibilitySelector({ value, onChange }: VisibilitySelectorProps) {
  const [open, setOpen] = useState(false);
  const [hoveredOption, setHoveredOption] = useState<PostVisibility | null>(null);
  const [hoveredTrigger, setHoveredTrigger] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current = OPTIONS.find((o) => o.key === value) || OPTIONS[0];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setHoveredTrigger(true)}
        onMouseLeave={() => setHoveredTrigger(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderRadius: 8,
          border: `1.5px solid ${hoveredTrigger || open ? COLORS.primary : COLORS.border}`,
          background: open ? 'rgba(174,137,255,0.08)' : 'transparent',
          color: open || hoveredTrigger ? COLORS.primary : COLORS.textSecondary,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          transition: `all 0.2s ${EASING}`,
          whiteSpace: 'nowrap',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
          {current.icon}
        </span>
        {current.label}
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: 16,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: `transform 0.2s ${EASING}`,
          }}
        >
          expand_more
        </span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 6,
            minWidth: 220,
            background: COLORS.elevated,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 14,
            boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
            padding: 6,
            zIndex: 20,
            animation: 'dropdownSlide 0.15s ease-out',
          }}
        >
          <style>{`
            @keyframes dropdownSlide {
              from { opacity: 0; transform: translateY(6px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          {OPTIONS.map((opt) => {
            const isActive = value === opt.key;
            const isHovered = hoveredOption === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => {
                  onChange(opt.key);
                  setOpen(false);
                }}
                onMouseEnter={() => setHoveredOption(opt.key)}
                onMouseLeave={() => setHoveredOption(null)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: 'none',
                  background: isActive
                    ? 'rgba(174,137,255,0.1)'
                    : isHovered
                    ? 'rgba(255,255,255,0.06)'
                    : 'transparent',
                  cursor: 'pointer',
                  transition: `all 0.15s ${EASING}`,
                  textAlign: 'left',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 20,
                    color: isActive ? COLORS.primary : COLORS.textMuted,
                  }}
                >
                  {opt.icon}
                </span>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: isActive ? COLORS.primary : COLORS.textPrimary,
                    }}
                  >
                    {opt.label}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: COLORS.textMuted,
                      marginTop: 1,
                    }}
                  >
                    {opt.desc}
                  </div>
                </div>
                {isActive && (
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 18, color: COLORS.primary }}
                  >
                    check
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
