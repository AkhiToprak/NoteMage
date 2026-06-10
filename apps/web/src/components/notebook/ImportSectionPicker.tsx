'use client';

import { useId, useRef, useState } from 'react';

// Destination picker for the import organize masks (FileImportDialog and the
// PDF tab of ImportNotebookDialog). Lists the notebook's existing sections
// plus any not-yet-created "draft" sections, and offers an inline
// "New section…" input. Drafts are owned by the parent and shared across
// rows, so two files can target the same new section; the parent creates
// each used draft exactly once when the import is committed.

export interface SectionOption {
  id: string;
  title: string;
  /** Set for subsections — used to render a "Parent / Child" label. */
  parentId?: string | null;
}

export interface DraftSection {
  /** Local-only id (`draft:<n>`) — resolved to a real section id at commit. */
  id: string;
  title: string;
}

const NEW_SECTION_VALUE = '__new-section__';

interface ImportSectionPickerProps {
  sections: SectionOption[];
  drafts: DraftSection[];
  /** Selected section id or draft id. */
  value: string;
  onChange: (id: string) => void;
  /** Register a new draft and return its id (parent owns the drafts array). */
  onCreateDraft: (title: string) => string;
  disabled?: boolean;
  ariaLabel: string;
}

export default function ImportSectionPicker({
  sections,
  drafts,
  value,
  onChange,
  onCreateDraft,
  disabled = false,
  ariaLabel,
}: ImportSectionPickerProps) {
  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const titleById = new Map(sections.map((s) => [s.id, s.title]));
  const labelFor = (s: SectionOption) => {
    const parentTitle = s.parentId ? titleById.get(s.parentId) : undefined;
    return parentTitle ? `${parentTitle} / ${s.title}` : s.title;
  };

  const confirmDraft = () => {
    const title = draftTitle.trim();
    if (!title) return;
    const id = onCreateDraft(title);
    onChange(id);
    setDraftTitle('');
    setCreating(false);
  };

  const cancelDraft = () => {
    setDraftTitle('');
    setCreating(false);
  };

  if (creating) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={draftTitle}
          maxLength={200}
          placeholder="Section name"
          aria-label="New section name"
          autoFocus
          onChange={(e) => setDraftTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              confirmDraft();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelDraft();
            }
          }}
          style={{
            flex: 1,
            minWidth: 0,
            boxSizing: 'border-box',
            padding: '7px 10px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--outline-variant)',
            background: 'var(--surface-container)',
            color: 'var(--on-surface)',
            fontSize: '12.5px',
            fontFamily: 'inherit',
            outline: 'none',
          }}
          onFocus={(e) => {
            e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)';
          }}
          onBlur={(e) => {
            e.target.style.boxShadow = 'none';
          }}
        />
        <IconButton
          icon="check"
          label="Create section"
          onClick={confirmDraft}
          disabled={draftTitle.trim().length === 0}
          accent
        />
        <IconButton icon="close" label="Cancel new section" onClick={cancelDraft} />
      </div>
    );
  }

  return (
    <select
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value === NEW_SECTION_VALUE) {
          setCreating(true);
          return;
        }
        onChange(e.target.value);
      }}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: '7px 10px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--outline-variant)',
        background: 'var(--surface-container)',
        color: 'var(--on-surface)',
        fontSize: '12.5px',
        fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        outline: 'none',
      }}
      onFocus={(e) => {
        e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)';
      }}
      onBlur={(e) => {
        e.target.style.boxShadow = 'none';
      }}
    >
      {sections.map((s) => (
        <option key={s.id} value={s.id}>
          {labelFor(s)}
        </option>
      ))}
      {drafts.map((d) => (
        <option key={d.id} value={d.id}>
          {d.title} (new)
        </option>
      ))}
      <option value={NEW_SECTION_VALUE}>＋ New section…</option>
    </select>
  );
}

function IconButton({
  icon,
  label,
  onClick,
  disabled = false,
  accent = false,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="nm-import-picker-iconbtn"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        flexShrink: 0,
        borderRadius: 'var(--radius-full)',
        border: 'none',
        background: accent ? 'var(--primary)' : 'transparent',
        color: accent ? 'var(--on-primary)' : 'var(--on-surface-variant)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'transform 0.16s cubic-bezier(0.22,1,0.36,1), opacity 0.16s ease',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.transform = 'scale(1.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
      onMouseDown={(e) => {
        if (!disabled) e.currentTarget.style.transform = 'scale(0.94)';
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '17px' }}>
        {icon}
      </span>
      <style>{`
        .nm-import-picker-iconbtn:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }
      `}</style>
    </button>
  );
}
