'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

interface SchoolStepProps {
  value: string;
  onChange: (value: string) => void;
}

interface SchoolSuggestion {
  name: string;
  userCount: number;
}

/**
 * Onboarding screen 7 — "Where do you go to school?". A type-ahead over
 * distinct `User.school` values returned by /api/schools/search; the
 * suggestion list grows as more users pick a school, so there's no curated
 * taxonomy to maintain. Free text is accepted for schools nobody has typed
 * yet. Visually modelled on FieldOfStudyStep — only the data source differs.
 * Skippable; an empty value is valid.
 */
export default function SchoolStep({ value, onChange }: SchoolStepProps) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [suggestions, setSuggestions] = useState<SchoolSuggestion[]>([]);

  const fetchSuggestions = useCallback(async (q: string) => {
    try {
      const res = await fetch(`/api/schools/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const json = await res.json().catch(() => null);
      const list: SchoolSuggestion[] = json?.data?.schools ?? [];
      setSuggestions(list);
    } catch {
      // Autocomplete is a hint, not a gate — silently ignore network errors.
    }
  }, []);

  // Re-fetch as the user types, debounced 250ms. An empty input surfaces the
  // most popular schools as a starting hint the first time the step renders.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, fetchSuggestions]);

  const showList = open && suggestions.length > 0;

  const choose = (school: string) => {
    onChange(school);
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
        choose(suggestions[highlight].name);
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
        placeholder="e.g. ETH Zürich, MIT, Berkeley High…"
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
          {suggestions.map((suggestion, idx) => {
            const active = idx === highlight;
            return (
              <li
                key={suggestion.name}
                id={`${listboxId}-opt-${idx}`}
                role="option"
                aria-selected={active}
                // preventDefault keeps the input focused so onClick fires
                // before the blur-close timer.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => choose(suggestion.name)}
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
                <span style={{ flex: 1, minWidth: 0 }}>
                  {renderMatch(suggestion.name, value)}
                </span>
                {suggestion.userCount > 1 && (
                  <span style={{ fontSize: '12px', color: 'var(--outline)', flexShrink: 0 }}>
                    {suggestion.userCount} mages
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Bold the portion of `name` that matches the typed `query`. */
function renderMatch(name: string, query: string) {
  const q = query.trim();
  if (!q) return name;
  const i = name.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return name;
  return (
    <>
      {name.slice(0, i)}
      <strong style={{ color: 'var(--primary)', fontWeight: 700 }}>
        {name.slice(i, i + q.length)}
      </strong>
      {name.slice(i + q.length)}
    </>
  );
}
