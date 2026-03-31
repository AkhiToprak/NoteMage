'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const COLORS = {
  cardBg: '#161630',
  elevated: '#232342',
  primary: '#8c52ff',
  primaryLight: '#ae89ff',
  textPrimary: '#ede9ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  border: '#555578',
  borderSubtle: '#2a2a44',
  error: '#fd6f85',
} as const;

const TAG_COLORS = [
  '#ff6b6b', '#ffde59', '#4ecdc4', '#ffb142',
  '#ae89ff', '#ff89ae', '#63cdff', '#48db9c',
];

function getTagColor(index: number): string {
  return TAG_COLORS[index % TAG_COLORS.length];
}

function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 30);
}

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  maxTags?: number;
  error?: string;
}

interface SuggestionTag {
  id: string;
  name: string;
  usageCount: number;
}

export default function TagInput({ tags, onChange, maxTags = 15, error }: TagInputProps) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<SuggestionTag[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    try {
      const res = await fetch(`/api/tags?search=${encodeURIComponent(query)}&limit=8`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.tags) {
          const filtered = json.data.tags.filter(
            (t: SuggestionTag) => !tags.includes(t.name)
          );
          setSuggestions(filtered);
          setShowSuggestions(filtered.length > 0);
          setSelectedIndex(-1);
        }
      }
    } catch {
      // ignore
    }
  }, [tags]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(input);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input, fetchSuggestions]);

  const addTag = (raw: string) => {
    const normalized = normalizeTag(raw);
    if (!normalized || tags.includes(normalized) || tags.length >= maxTags) return;
    onChange([...tags, normalized]);
    setInput('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter((t) => t !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        addTag(suggestions[selectedIndex].name);
      } else if (input.trim()) {
        addTag(input);
      }
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={() => inputRef.current?.focus()}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          padding: '10px 14px',
          borderRadius: 12,
          border: `1px solid ${error ? COLORS.error : focused ? COLORS.primaryLight : COLORS.borderSubtle}`,
          background: COLORS.elevated,
          cursor: 'text',
          minHeight: 48,
          alignItems: 'center',
          transition: 'border-color 0.15s ease',
        }}
      >
        {tags.map((tag, i) => (
          <span
            key={tag}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              borderRadius: 8,
              background: `${getTagColor(i)}18`,
              color: getTagColor(i),
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            #{tag}
            <button
              onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
              style={{
                border: 'none',
                background: 'none',
                color: 'inherit',
                cursor: 'pointer',
                padding: 0,
                fontSize: 16,
                lineHeight: 1,
                opacity: 0.7,
                display: 'flex',
              }}
            >
              ×
            </button>
          </span>
        ))}
        {tags.length < maxTags && (
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => { setFocused(true); }}
            onBlur={() => { setFocused(false); setTimeout(() => setShowSuggestions(false), 150); }}
            placeholder={tags.length === 0 ? 'Type a tag and press Enter...' : 'Add more...'}
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              color: COLORS.textPrimary,
              fontSize: 14,
              flex: 1,
              minWidth: 120,
              fontFamily: 'inherit',
            }}
          />
        )}
      </div>

      {/* Tag counter */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 6,
          fontSize: 12,
        }}
      >
        <span style={{ color: error ? COLORS.error : COLORS.textMuted }}>
          {error || 'Press Enter or comma to add a tag'}
        </span>
        <span style={{ color: tags.length >= maxTags ? COLORS.error : COLORS.textMuted }}>
          {tags.length}/{maxTags}
        </span>
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: COLORS.cardBg,
            border: `1px solid ${COLORS.borderSubtle}`,
            borderRadius: 12,
            overflow: 'hidden',
            zIndex: 50,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              onMouseDown={(e) => { e.preventDefault(); addTag(s.name); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '10px 14px',
                border: 'none',
                background: i === selectedIndex ? COLORS.elevated : 'transparent',
                color: COLORS.textPrimary,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <span>#{s.name}</span>
              <span style={{ fontSize: 11, color: COLORS.textMuted }}>
                {s.usageCount} notebook{s.usageCount !== 1 ? 's' : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
