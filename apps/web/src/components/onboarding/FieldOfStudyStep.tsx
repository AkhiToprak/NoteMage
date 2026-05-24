'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { matchFields } from '@/lib/onboarding/fields-of-study';

interface FieldOfStudyStepProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Onboarding screen 6 — "What are you studying?". A type-ahead over a curated
 * field-of-study taxonomy: as the user types we suggest matching fields they
 * can tap to select, but free text is still accepted for anything not listed.
 * Persists to `User.fieldOfStudy`. Skippable, so an empty value is valid.
 */
export default function FieldOfStudyStep({ value, onChange }: FieldOfStudyStepProps) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const suggestions = useMemo(() => matchFields(value), [value]);
  const showList = open && suggestions.length > 0;

  const choose = (field: string) => {
    onChange(field);
    setOpen(false);
    setHighlight(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, -1));
    } else if (e.key === 'Enter') {
      // Only intercept Enter when a suggestion is actively highlighted —
      // otherwise let it bubble so the screen's Continue can fire.
      if (showList && highlight >= 0) {
        e.preventDefault();
        choose(suggestions[highlight]);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.stopPropagation();
        setOpen(false);
        setHighlight(-1);
      }
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={(e) => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setOpen(true);
          e.currentTarget.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)';
        }}
        onBlur={(e) => {
          // Delay so a mousedown on an option still registers before close.
          blurTimer.current = setTimeout(() => setOpen(false), 120);
          e.currentTarget.style.boxShadow = 'none';
        }}
        onKeyDown={handleKeyDown}
        placeholder="e.g. Computer Science, Biology, Law…"
        maxLength={100}
        autoFocus
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          highlight >= 0 ? `${listboxId}-opt-${highlight}` : undefined
        }
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
      />

      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 20,
            margin: 0,
            padding: '6px',
            listStyle: 'none',
            background: 'var(--surface-container-highest)',
            border: '1px solid var(--outline-variant)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 8px 32px rgba(174,137,255,0.06), 0 2px 8px rgba(0,0,0,0.3)',
            maxHeight: '232px',
            overflowY: 'auto',
          }}
        >
          {suggestions.map((field, idx) => {
            const active = idx === highlight;
            return (
              <li
                key={field}
                id={`${listboxId}-opt-${idx}`}
                role="option"
                aria-selected={active}
                // preventDefault keeps the input focused so onClick fires
                // before the blur-close timer.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => choose(field)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  color: 'var(--on-surface)',
                  fontSize: '15px',
                  background: active ? 'rgba(174,137,255,0.14)' : 'transparent',
                  transition: 'background 0.15s cubic-bezier(0.22,1,0.36,1)',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  aria-hidden="true"
                  style={{ fontSize: '18px', color: 'var(--on-surface-variant)', flexShrink: 0 }}
                >
                  school
                </span>
                <span>{renderMatch(field, value)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Bold the portion of `field` that matches the typed `query`. */
function renderMatch(field: string, query: string) {
  const q = query.trim();
  if (!q) return field;
  const i = field.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return field;
  return (
    <>
      {field.slice(0, i)}
      <strong style={{ color: 'var(--primary)', fontWeight: 700 }}>
        {field.slice(i, i + q.length)}
      </strong>
      {field.slice(i + q.length)}
    </>
  );
}
