'use client';

import { useId, useMemo, useState } from 'react';

interface DateOfBirthFieldProps {
  /** Current value as `YYYY-MM-DD`, or '' when incomplete. Seeds the selects. */
  value: string;
  /** Fires with a complete `YYYY-MM-DD` string, or '' while any part is unset. */
  onChange: (value: string) => void;
  disabled?: boolean;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface Parts {
  year: string;
  month: string;
  day: string;
}

/** Split a `YYYY-MM-DD` seed value into its three parts (digits, no padding). */
function seedParts(value: string): Parts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return { year: '', month: '', day: '' };
  return { year: match[1], month: String(Number(match[2])), day: String(Number(match[3])) };
}

/** Days in a 1-indexed month; defaults to 31 until month/year are picked. */
function daysInMonth(month: number, year: number): number {
  if (!month) return 31;
  return new Date(Date.UTC(year || 2000, month, 0)).getUTCDate();
}

/**
 * Date-of-birth picker — three styled native selects (Month / Day / Year).
 * Native selects keep the control keyboard-accessible and WebView-safe; the
 * 13+ age gate is enforced by the caller, not by limiting the year list.
 */
export default function DateOfBirthField({ value, onChange, disabled }: DateOfBirthFieldProps) {
  const [parts, setParts] = useState<Parts>(() => seedParts(value));
  const baseId = useId();

  const years = useMemo(() => {
    const currentYear = new Date().getUTCFullYear();
    return Array.from({ length: 121 }, (_, i) => currentYear - i);
  }, []);

  const days = useMemo(() => {
    const count = daysInMonth(Number(parts.month), Number(parts.year));
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [parts.month, parts.year]);

  const emit = (next: Parts) => {
    setParts(next);
    if (next.year && next.month && next.day) {
      onChange(`${next.year}-${next.month.padStart(2, '0')}-${next.day.padStart(2, '0')}`);
    } else {
      onChange('');
    }
  };

  const handlePart = (key: keyof Parts, raw: string) => {
    const next: Parts = { ...parts, [key]: raw };
    // A month/year change can orphan a previously-valid day (e.g. 31 → Feb).
    const limit = daysInMonth(Number(next.month), Number(next.year));
    if (next.day && Number(next.day) > limit) next.day = String(limit);
    emit(next);
  };

  const selectStyle: React.CSSProperties = {
    width: '100%',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    padding: '12px 34px 12px 14px',
    background: 'var(--surface-container-highest)',
    border: '1px solid transparent',
    borderRadius: 'var(--radius-md)',
    color: 'var(--on-surface)',
    fontSize: '15px',
    fontFamily: 'inherit',
    outline: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    boxSizing: 'border-box',
    transition: 'box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
  };

  const renderSelect = (
    key: keyof Parts,
    label: string,
    placeholder: string,
    options: { value: string; label: string }[],
    flex: number
  ) => (
    <div style={{ flex, minWidth: 0 }}>
      <label
        htmlFor={`${baseId}-${key}`}
        style={{
          display: 'block',
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--on-surface-variant)',
          marginBottom: '6px',
          paddingLeft: '2px',
        }}
      >
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <select
          id={`${baseId}-${key}`}
          value={parts[key]}
          onChange={(e) => handlePart(key, e.target.value)}
          disabled={disabled}
          style={{ ...selectStyle, color: parts[key] ? 'var(--on-surface)' : 'var(--outline)' }}
          onFocus={(e) => {
            e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)';
          }}
          onBlur={(e) => {
            e.target.style.boxShadow = 'none';
          }}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} style={{ color: 'var(--on-surface)' }}>
              {opt.label}
            </option>
          ))}
        </select>
        <span
          className="material-symbols-outlined"
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '20px',
            color: 'var(--on-surface-variant)',
            pointerEvents: 'none',
          }}
        >
          expand_more
        </span>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: '10px' }}>
      {renderSelect(
        'month',
        'Month',
        'Month',
        MONTHS.map((name, i) => ({ value: String(i + 1), label: name })),
        1.5
      )}
      {renderSelect(
        'day',
        'Day',
        'Day',
        days.map((d) => ({ value: String(d), label: String(d) })),
        1
      )}
      {renderSelect(
        'year',
        'Year',
        'Year',
        years.map((y) => ({ value: String(y), label: String(y) })),
        1.1
      )}
    </div>
  );
}
