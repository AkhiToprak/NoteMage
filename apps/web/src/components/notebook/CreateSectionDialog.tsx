'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { FolderPlus } from 'lucide-react';

interface CreateSectionDialogProps {
  notebookId: string;
  parentId?: string;
  onCreated: () => void;
  onCancel: () => void;
}

export default function CreateSectionDialog({
  notebookId,
  parentId,
  onCreated,
  onCancel,
}: CreateSectionDialogProps) {
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleCreate = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      onCancel();
      return;
    }
    try {
      await fetch(`/api/notebooks/${notebookId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed, ...(parentId && { parentId }) }),
      });
      onCreated();
    } catch {
      onCancel();
    }
  }, [notebookId, parentId, title, onCreated, onCancel]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 6px 4px 8px',
      }}
    >
      <FolderPlus size={14} style={{ color: 'rgba(237,233,255,0.3)', flexShrink: 0 }} />
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleCreate();
          } else if (e.key === 'Escape') {
            onCancel();
          }
        }}
        placeholder="Section name..."
        style={{
          flex: 1,
          minWidth: 0,
          background: 'rgba(140,82,255,0.06)',
          border: '1px solid rgba(140,82,255,0.2)',
          borderRadius: '4px',
          padding: '3px 8px',
          fontFamily: 'inherit',
          fontSize: '13px',
          fontWeight: 600,
          color: '#ede9ff',
          outline: 'none',
        }}
      />
    </div>
  );
}
