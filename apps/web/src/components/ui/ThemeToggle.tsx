'use client';

import { useTheme, type ThemePreference } from '@/contexts/ThemeContext';
import { haptics } from '@/lib/haptics';

const OPTIONS: { value: ThemePreference; icon: string; label: string }[] = [
  { value: 'light', icon: 'light_mode', label: 'Light theme' },
  { value: 'dark', icon: 'dark_mode', label: 'Dark theme' },
  { value: 'system', icon: 'desktop_windows', label: 'System theme' },
];

interface Props {
  compact?: boolean;
}

export default function ThemeToggle({ compact = false }: Props) {
  const { preference, setPreference } = useTheme();
  const size = compact ? 28 : 32;

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        padding: '3px',
        borderRadius: '9999px',
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
      }}
    >
      {OPTIONS.map(({ value, icon, label }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => {
              if (!active) haptics.select();
              setPreference(value);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: `${size}px`,
              height: `${size}px`,
              borderRadius: '9999px',
              border: 'none',
              cursor: 'pointer',
              background: active ? '#ae89ff' : 'transparent',
              color: active ? 'var(--on-primary)' : 'var(--on-surface-variant)',
              transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
              padding: 0,
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => {
              if (!active) {
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: compact ? '16px' : '18px' }}
            >
              {icon}
            </span>
          </button>
        );
      })}
    </div>
  );
}
