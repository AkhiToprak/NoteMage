'use client';

import { useState, useEffect } from 'react';
import type { FolderData } from './FolderCard';

interface FolderFormProps {
  folder?: FolderData | null;
  onSubmit: (data: { name: string; color?: string }) => void;
  onCancel: () => void;
  isLoading: boolean;
}

const COLOR_SWATCHES = ['#8c52ff', '#5170ff', '#ffde59', '#ff7043', '#4ade80', '#38bdf8', '#f472b6', '#a78bfa'];

export default function FolderForm({ folder, onSubmit, onCancel, isLoading }: FolderFormProps) {
  const [name, setName] = useState(folder?.name ?? '');
  const [color, setColor] = useState(folder?.color ?? '#8c52ff');

  useEffect(() => {
    if (folder) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(folder.name);
      setColor(folder.color ?? '#8c52ff');
    }
  }, [folder]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), color });
  };

  const isEdit = !!folder;

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
      onClick={() => { if (!isLoading) onCancel(); }}
    >
      <div
        style={{
          background: '#1c1c38',
          borderRadius: '20px',
          padding: '32px',
          width: '100%',
          maxWidth: '440px',
          boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
          animation: 'slideUp 0.2s cubic-bezier(0.22,1,0.36,1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        `}</style>

        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 24px' }}>
          {isEdit ? 'Rename Folder' : 'New Folder'}
        </h2>

        <form onSubmit={handleSubmit}>
          {/* Name */}
          <label style={{ display: 'block', marginBottom: '16px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#aaa8c8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Folder Name
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Semester 2"
              maxLength={100}
              autoFocus
              style={{
                display: 'block',
                width: '100%',
                marginTop: '8px',
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1px solid rgba(174,137,255,0.15)',
                background: '#12122a',
                color: '#e5e3ff',
                fontSize: '15px',
                fontFamily: 'inherit',
                outline: 'none',
                transition: 'border-color 0.15s',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(174,137,255,0.4)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(174,137,255,0.15)'; }}
            />
          </label>

          {/* Color */}
          <label style={{ display: 'block', marginBottom: '24px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#aaa8c8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Color
            </span>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    border: color === c ? '2px solid #e5e3ff' : '2px solid transparent',
                    background: c,
                    cursor: 'pointer',
                    outline: color === c ? `2px solid ${c}` : 'none',
                    outlineOffset: '2px',
                    transition: 'outline 0.15s, border-color 0.15s',
                    padding: 0,
                  }}
                />
              ))}
            </div>
          </label>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '12px',
                background: '#2a2a4c',
                border: 'none',
                fontSize: '14px',
                fontWeight: 600,
                color: '#aaa8c8',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !name.trim()}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '12px',
                background: isLoading || !name.trim() ? 'rgba(174,137,255,0.2)' : '#ae89ff',
                border: 'none',
                fontSize: '14px',
                fontWeight: 700,
                color: isLoading || !name.trim() ? '#aaa8c8' : '#2a0066',
                cursor: isLoading || !name.trim() ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {isLoading ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save' : 'Create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
