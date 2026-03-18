'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { NotebookData } from './NotebookCard';

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

interface FormData {
  name: string;
  subject: string;
  description: string;
  color: string;
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
  fontFamily: "'Gliker', 'DM Sans', sans-serif",
  fontSize: '14px',
  color: '#ede9ff',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s ease',
};

export default function NotebookForm({ notebook, onSubmit, onCancel, isLoading }: NotebookFormProps) {
  const isEditing = !!notebook;
  const [form, setForm] = useState<FormData>({
    name: notebook?.name ?? '',
    subject: notebook?.subject ?? '',
    description: notebook?.description ?? '',
    color: notebook?.color ?? '#8c52ff',
  });
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      name: notebook?.name ?? '',
      subject: notebook?.subject ?? '',
      description: notebook?.description ?? '',
      color: notebook?.color ?? '#8c52ff',
    });
  }, [notebook]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSubmit(form);
  };

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
          background: '#0d0c20',
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
        `}</style>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <h2
            style={{
              fontFamily: "'Gliker', 'DM Sans', sans-serif",
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
            <label
              style={{
                display: 'block',
                fontFamily: "'Gliker', 'DM Sans', sans-serif",
                fontSize: '12px',
                fontWeight: '600',
                color: 'rgba(237,233,255,0.5)',
                marginBottom: '6px',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
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
            <label
              style={{
                display: 'block',
                fontFamily: "'Gliker', 'DM Sans', sans-serif",
                fontSize: '12px',
                fontWeight: '600',
                color: 'rgba(237,233,255,0.5)',
                marginBottom: '6px',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Subject
            </label>
            <input
              type="text"
              value={form.subject}
              onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
              onFocus={() => setFocusedField('subject')}
              onBlur={() => setFocusedField(null)}
              placeholder="e.g. Biology, History, Math"
              style={{
                ...inputStyle,
                borderColor: focusedField === 'subject' ? 'rgba(140,82,255,0.6)' : 'rgba(140,82,255,0.3)',
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label
              style={{
                display: 'block',
                fontFamily: "'Gliker', 'DM Sans', sans-serif",
                fontSize: '12px',
                fontWeight: '600',
                color: 'rgba(237,233,255,0.5)',
                marginBottom: '6px',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Description
            </label>
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
            <label
              style={{
                display: 'block',
                fontFamily: "'Gliker', 'DM Sans', sans-serif",
                fontSize: '12px',
                fontWeight: '600',
                color: 'rgba(237,233,255,0.5)',
                marginBottom: '10px',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Color
            </label>
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
                fontFamily: "'Gliker', 'DM Sans', sans-serif",
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
                background: isLoading || !form.name.trim()
                  ? 'rgba(140,82,255,0.3)'
                  : 'linear-gradient(135deg, #8c52ff, #5170ff)',
                border: 'none',
                fontFamily: "'Gliker', 'DM Sans', sans-serif",
                fontSize: '14px',
                fontWeight: '700',
                color: isLoading || !form.name.trim() ? 'rgba(237,233,255,0.4)' : '#ede9ff',
                cursor: isLoading || !form.name.trim() ? 'not-allowed' : 'pointer',
                boxShadow: isLoading || !form.name.trim() ? 'none' : '0 4px 20px rgba(140,82,255,0.28)',
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
