'use client';

import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { NotebookData } from './NotebookCard';
import { PRESETS, matchPresets, type Preset } from '@/lib/presets';

const COLOR_SWATCHES = [
  '#8c52ff',
  '#5170ff',
  '#ffde59',
  '#ff7043',
  '#4ade80',
  '#38bdf8',
  '#f472b6',
  '#a78bfa',
];

export interface FormData {
  name: string;
  subject: string;
  description: string;
  color: string;
  presetId?: string;
}

interface NotebookFormProps {
  notebook?: NotebookData | null;
  onSubmit: (data: FormData) => void;
  onCancel: () => void;
  isLoading: boolean;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(140,82,255,0.08)',
  border: '1px solid rgba(140,82,255,0.3)',
  borderRadius: '12px',
  padding: '11px 14px',
  fontFamily: 'inherit',
  fontSize: '14px',
  color: '#ede9ff',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s ease',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'inherit',
  fontSize: '12px',
  fontWeight: '600',
  color: 'rgba(237,233,255,0.5)',
  marginBottom: '6px',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

export default function NotebookForm({ notebook, onSubmit, onCancel, isLoading }: NotebookFormProps) {
  const isEditing = !!notebook;

  const [form, setForm] = useState<Omit<FormData, 'presetId'>>({
    name: notebook?.name ?? '',
    subject: notebook?.subject ?? '',
    description: notebook?.description ?? '',
    color: notebook?.color ?? '#8c52ff',
  });
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Preset state
  const [suggestions, setSuggestions] = useState<Preset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);
  const [showAllPresets, setShowAllPresets] = useState(false);
  // Language Learning special case
  const [isLanguageMode, setIsLanguageMode] = useState(false);
  const [languageName, setLanguageName] = useState('');
  const langInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm({
      name: notebook?.name ?? '',
      subject: notebook?.subject ?? '',
      description: notebook?.description ?? '',
      color: notebook?.color ?? '#8c52ff',
    });
    setSelectedPreset(null);
    setSuggestions([]);
    setShowAllPresets(false);
    setIsLanguageMode(false);
    setLanguageName('');
  }, [notebook]);

  // Focus language input when entering language mode
  useEffect(() => {
    if (isLanguageMode) {
      setTimeout(() => langInputRef.current?.focus(), 50);
    }
  }, [isLanguageMode]);

  const handleSubjectChange = (value: string) => {
    setForm((p) => ({ ...p, subject: value }));
    // Clear selected preset when user manually edits subject
    if (selectedPreset && !isLanguageMode) {
      setSelectedPreset(null);
      setShowAllPresets(false);
    }
    setSuggestions(matchPresets(value));
  };

  const applyPreset = (preset: Preset) => {
    if (preset.id === 'language-learning') {
      setIsLanguageMode(true);
      setSelectedPreset(preset);
      setForm((p) => ({ ...p, color: preset.color, subject: '' }));
      setLanguageName('');
    } else {
      setSelectedPreset(preset);
      setIsLanguageMode(false);
      setForm((p) => ({ ...p, subject: preset.label, color: preset.color }));
    }
    setSuggestions([]);
    setShowAllPresets(false);
  };

  const clearPreset = () => {
    setSelectedPreset(null);
    setIsLanguageMode(false);
    setLanguageName('');
    setForm((p) => ({ ...p, subject: '' }));
    setSuggestions([]);
  };

  const handleLanguageChange = (value: string) => {
    setLanguageName(value);
    setForm((p) => ({ ...p, subject: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSubmit({ ...form, presetId: selectedPreset?.id });
  };

  const noSuggestions =
    !selectedPreset &&
    !isLanguageMode &&
    form.subject.trim().length >= 2 &&
    suggestions.length === 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          background: '#111126',
          border: '1px solid rgba(140,82,255,0.2)',
          borderRadius: '18px',
          padding: '28px',
          width: '100%',
          maxWidth: '440px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(140,82,255,0.1)',
          animation: 'slideUp 0.25s cubic-bezier(0.22,1,0.36,1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(16px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-4px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .preset-pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 5px 12px;
            border-radius: 9999px;
            border: 1px solid rgba(255,255,255,0.12);
            background: rgba(255,255,255,0.07);
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            font-family: 'Gliker', 'DM Sans', sans-serif;
            transition: background 0.12s ease, border-color 0.12s ease, transform 0.1s ease;
            white-space: nowrap;
          }
          .preset-pill:hover {
            background: rgba(255,255,255,0.1);
            border-color: rgba(255,255,255,0.2);
            transform: translateY(-1px);
          }
          .preset-pill:active { transform: scale(0.96); }
          .preset-all-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 10px;
            border-radius: 10px;
            background: transparent;
            border: none;
            cursor: pointer;
            width: 100%;
            text-align: left;
            font-family: 'Gliker', 'DM Sans', sans-serif;
            transition: background 0.1s ease;
          }
          .preset-all-item:hover { background: rgba(255,255,255,0.06); }
        `}</style>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <h2
            style={{
              fontFamily: 'inherit',
              fontSize: '18px',
              fontWeight: '700',
              color: '#ede9ff',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            {isEditing ? 'Edit Notebook' : 'New Notebook'}
          </h2>
          <button
            onClick={onCancel}
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              background: 'rgba(237,233,255,0.06)',
              border: '1px solid rgba(237,233,255,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'rgba(237,233,255,0.5)',
              transition: 'background 0.12s ease, color 0.12s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(237,233,255,0.1)';
              (e.currentTarget as HTMLButtonElement).style.color = '#ede9ff';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(237,233,255,0.06)';
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,233,255,0.5)';
            }}
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Name */}
          <div>
            <label style={labelStyle}>
              Name <span style={{ color: '#8c52ff' }}>*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              onFocus={() => setFocusedField('name')}
              onBlur={() => setFocusedField(null)}
              placeholder="e.g. Organic Chemistry"
              required
              style={{
                ...inputStyle,
                borderColor: focusedField === 'name' ? 'rgba(140,82,255,0.6)' : 'rgba(140,82,255,0.3)',
              }}
            />
          </div>

          {/* Subject */}
          <div>
            <label style={labelStyle}>Subject</label>

            {/* Active preset badge */}
            {selectedPreset && !isLanguageMode && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  background: `${selectedPreset.color}18`,
                  border: `1px solid ${selectedPreset.color}40`,
                  marginBottom: '8px',
                  animation: 'fadeIn 0.15s ease',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: selectedPreset.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontFamily: 'inherit',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: selectedPreset.color,
                    flex: 1,
                  }}
                >
                  {selectedPreset.label} template
                </span>
                <button
                  type="button"
                  onClick={clearPreset}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'rgba(237,233,255,0.35)',
                    padding: '0',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {/* Language Learning mode */}
            {isLanguageMode && selectedPreset ? (
              <div style={{ animation: 'fadeIn 0.15s ease' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    background: `${selectedPreset.color}18`,
                    border: `1px solid ${selectedPreset.color}40`,
                    marginBottom: '8px',
                  }}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: selectedPreset.color,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'inherit',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: selectedPreset.color,
                      flex: 1,
                    }}
                  >
                    Language Learning template
                  </span>
                  <button
                    type="button"
                    onClick={clearPreset}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'rgba(237,233,255,0.35)',
                      padding: '0',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
                <label
                  style={{
                    display: 'block',
                    fontFamily: 'inherit',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: 'rgba(237,233,255,0.4)',
                    marginBottom: '6px',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Which language?
                </label>
                <input
                  ref={langInputRef}
                  type="text"
                  value={languageName}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  onFocus={() => setFocusedField('language')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="e.g. Spanish, Japanese, French…"
                  style={{
                    ...inputStyle,
                    borderColor: focusedField === 'language'
                      ? `${selectedPreset.color}99`
                      : `${selectedPreset.color}50`,
                  }}
                />
              </div>
            ) : !selectedPreset ? (
              <input
                type="text"
                value={form.subject}
                onChange={(e) => handleSubjectChange(e.target.value)}
                onFocus={() => setFocusedField('subject')}
                onBlur={() => setFocusedField(null)}
                placeholder="e.g. Biology, History, Math"
                style={{
                  ...inputStyle,
                  borderColor: focusedField === 'subject' ? 'rgba(140,82,255,0.6)' : 'rgba(140,82,255,0.3)',
                }}
              />
            ) : null}

            {/* Suggestion pills */}
            {suggestions.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: '6px',
                  flexWrap: 'wrap',
                  marginTop: '8px',
                  animation: 'fadeIn 0.15s ease',
                }}
              >
                {suggestions.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="preset-pill"
                    onClick={() => applyPreset(preset)}
                    style={{ color: preset.color, borderColor: `${preset.color}40` }}
                  >
                    <span
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: preset.color,
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
                    {preset.label}
                  </button>
                ))}
              </div>
            )}

            {/* No-match: browse all templates */}
            {noSuggestions && !showAllPresets && (
              <div style={{ marginTop: '8px', animation: 'fadeIn 0.15s ease' }}>
                <button
                  type="button"
                  onClick={() => setShowAllPresets(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '0',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '12px',
                    color: 'rgba(174,137,255,0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                    auto_awesome
                  </span>
                  Browse templates
                </button>
              </div>
            )}

            {/* All presets picker */}
            {showAllPresets && (
              <div
                style={{
                  marginTop: '8px',
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                  padding: '6px',
                  animation: 'fadeIn 0.15s ease',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 8px 8px',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'inherit',
                      fontSize: '11px',
                      fontWeight: '600',
                      color: 'rgba(237,233,255,0.35)',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Choose a template
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAllPresets(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'rgba(237,233,255,0.3)',
                      display: 'flex',
                      padding: '0',
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="preset-all-item"
                    onClick={() => applyPreset(preset)}
                  >
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: preset.color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: 'inherit',
                        fontSize: '13px',
                        fontWeight: '600',
                        color: '#ede9ff',
                      }}
                    >
                      {preset.label}
                    </span>
                    <span
                      style={{
                        fontFamily: 'inherit',
                        fontSize: '11px',
                        color: 'rgba(237,233,255,0.35)',
                        marginLeft: 'auto',
                      }}
                    >
                      {preset.scaffold.length} sections
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              onFocus={() => setFocusedField('description')}
              onBlur={() => setFocusedField(null)}
              placeholder="What's this notebook about?"
              rows={3}
              style={{
                ...inputStyle,
                resize: 'vertical',
                minHeight: '80px',
                borderColor: focusedField === 'description' ? 'rgba(140,82,255,0.6)' : 'rgba(140,82,255,0.3)',
              }}
            />
          </div>

          {/* Color picker */}
          <div>
            <label style={labelStyle}>Color</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, color: c }))}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: c,
                    border: form.color === c ? '2px solid #fff' : '2px solid transparent',
                    outline: form.color === c ? `2px solid ${c}` : 'none',
                    outlineOffset: '2px',
                    cursor: 'pointer',
                    transition: 'transform 0.12s ease, outline 0.12s ease',
                    transform: form.color === c ? 'scale(1.15)' : 'scale(1)',
                    boxShadow: form.color === c ? `0 0 10px ${c}60` : 'none',
                  }}
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                flex: 1,
                padding: '11px',
                borderRadius: '12px',
                background: 'rgba(237,233,255,0.06)',
                border: '1px solid rgba(237,233,255,0.12)',
                fontFamily: 'inherit',
                fontSize: '14px',
                fontWeight: '600',
                color: 'rgba(237,233,255,0.6)',
                cursor: 'pointer',
                transition: 'background 0.12s ease, color 0.12s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(237,233,255,0.1)';
                (e.currentTarget as HTMLButtonElement).style.color = '#ede9ff';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(237,233,255,0.06)';
                (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,233,255,0.6)';
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !form.name.trim()}
              style={{
                flex: 2,
                padding: '11px',
                borderRadius: '12px',
                background:
                  isLoading || !form.name.trim()
                    ? 'rgba(140,82,255,0.3)'
                    : 'linear-gradient(135deg, #8c52ff, #5170ff)',
                border: 'none',
                fontFamily: 'inherit',
                fontSize: '14px',
                fontWeight: '700',
                color: isLoading || !form.name.trim() ? 'rgba(237,233,255,0.4)' : '#ede9ff',
                cursor: isLoading || !form.name.trim() ? 'not-allowed' : 'pointer',
                boxShadow:
                  isLoading || !form.name.trim() ? 'none' : '0 4px 20px rgba(140,82,255,0.28)',
                transition: 'opacity 0.12s ease, transform 0.1s ease',
              }}
              onMouseEnter={(e) => {
                if (!isLoading && form.name.trim()) {
                  (e.currentTarget as HTMLButtonElement).style.opacity = '0.9';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.opacity = '1';
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
              }}
            >
              {isLoading ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Notebook'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
