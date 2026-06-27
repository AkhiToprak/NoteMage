'use client';

import { useMemo } from 'react';
import type { ImportGroup, PickedFile } from '@/hooks/useMultiImport';

// Sub-step C of the multi-PDF import flow — review and edit the AI-proposed
// grouping before the notebooks are created. Each card is one notebook:
// rename it, set a subject, pick a color, move PDFs between cards, or
// add/remove cards.

interface ImportOrganizeStepProps {
  groups: ImportGroup[];
  files: PickedFile[];
  palette: string[];
  notebookCount: number;
  error: string | null;
  committing: boolean;
  onRename: (id: string, name: string) => void;
  onSetSubject: (id: string, subject: string) => void;
  onSetColor: (id: string, color: string) => void;
  onMoveFile: (fileId: string, toGroupId: string) => void;
  onAddGroup: () => void;
  onRemoveGroup: (id: string) => void;
  onBack: () => void;
  onCommit: () => void;
}

export default function ImportOrganizeStep({
  groups,
  files,
  palette,
  notebookCount,
  error,
  committing,
  onRename,
  onSetSubject,
  onSetColor,
  onMoveFile,
  onAddGroup,
  onRemoveGroup,
  onBack,
  onCommit,
}: ImportOrganizeStepProps) {
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const file of files) map.set(file.id, file.name);
    return map;
  }, [files]);

  const canRemove = groups.length > 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: '22px',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: 'var(--on-surface)',
          }}
        >
          Organize your study packs
        </h2>
        <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.55, color: 'var(--on-surface-variant)' }}>
          Rename, recolor, or move PDFs between study packs, then create them.
        </p>
      </header>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxHeight: '46vh',
          overflowY: 'auto',
          paddingRight: '2px',
        }}
      >
        {groups.map((group) => (
          <div
            key={group.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              padding: '14px',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--surface-container-high)',
              border: '1px solid var(--outline-variant)',
              borderLeft: `3px solid ${group.color}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
                {palette.map((color) => {
                  const selected = color === group.color;
                  return (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Set color ${color}`}
                      aria-pressed={selected}
                      onClick={() => onSetColor(group.id, color)}
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: 'var(--radius-full)',
                        border: 'none',
                        background: color,
                        cursor: 'pointer',
                        padding: 0,
                        boxShadow: selected
                          ? `0 0 0 2px var(--surface-container-high), 0 0 0 3.5px ${color}`
                          : 'none',
                        transition: 'transform 0.16s cubic-bezier(0.22,1,0.36,1)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.15)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                    />
                  );
                })}
              </div>
              {canRemove && (
                <button
                  type="button"
                  aria-label="Remove study pack"
                  onClick={() => onRemoveGroup(group.id)}
                  disabled={committing}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '26px',
                    height: '26px',
                    flexShrink: 0,
                    borderRadius: 'var(--radius-full)',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--on-surface-variant)',
                    cursor: committing ? 'not-allowed' : 'pointer',
                    transition: 'background 0.16s ease, color 0.16s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--surface-container-highest)';
                    e.currentTarget.style.color = 'var(--error)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--on-surface-variant)';
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                    close
                  </span>
                </button>
              )}
            </div>

            <input
              type="text"
              value={group.name}
              maxLength={100}
              placeholder="Study pack name"
              onChange={(e) => onRename(group.id, e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '9px 11px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--outline-variant)',
                background: 'var(--surface-container)',
                color: 'var(--on-surface)',
                fontFamily: 'var(--font-display)',
                fontSize: '15px',
                fontWeight: 700,
                outline: 'none',
              }}
              onFocus={(e) => {
                e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)';
              }}
              onBlur={(e) => {
                e.target.style.boxShadow = 'none';
              }}
            />

            <input
              type="text"
              value={group.subject}
              maxLength={60}
              placeholder="Subject (optional)"
              onChange={(e) => onSetSubject(group.id, e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '7px 11px',
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

            {group.fileIds.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  padding: '8px 10px',
                  fontSize: '12px',
                  color: 'var(--on-surface-variant)',
                  background: 'var(--surface-container)',
                  borderRadius: 'var(--radius-md)',
                  textAlign: 'center',
                }}
              >
                No PDFs yet — move one here.
              </p>
            ) : (
              <ul
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                {group.fileIds.map((fileId) => (
                  <li
                    key={fileId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '7px 9px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--surface-container)',
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      aria-hidden="true"
                      style={{ fontSize: '17px', color: 'var(--on-surface-variant)', flexShrink: 0 }}
                    >
                      picture_as_pdf
                    </span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: '12.5px',
                        color: 'var(--on-surface)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {nameById.get(fileId) ?? 'PDF'}
                    </span>
                    {groups.length > 1 && (
                      <select
                        aria-label={`Move ${nameById.get(fileId) ?? 'PDF'} to another study pack`}
                        value=""
                        disabled={committing}
                        onChange={(e) => {
                          if (e.target.value) onMoveFile(fileId, e.target.value);
                        }}
                        style={{
                          flexShrink: 0,
                          maxWidth: '120px',
                          padding: '4px 6px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--outline-variant)',
                          background: 'var(--surface-container-high)',
                          color: 'var(--on-surface-variant)',
                          fontSize: '11.5px',
                          fontFamily: 'inherit',
                          cursor: committing ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <option value="">Move to…</option>
                        {groups
                          .filter((other) => other.id !== group.id)
                          .map((other) => (
                            <option key={other.id} value={other.id}>
                              {other.name.trim() || 'Untitled study pack'}
                            </option>
                          ))}
                      </select>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={onAddGroup}
          disabled={committing}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '7px',
            padding: '11px',
            borderRadius: 'var(--radius-lg)',
            border: '1.5px dashed var(--outline-variant)',
            background: 'transparent',
            color: 'var(--on-surface-variant)',
            fontSize: '13px',
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: committing ? 'not-allowed' : 'pointer',
            transition: 'border-color 0.2s ease, color 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--primary)';
            e.currentTarget.style.color = 'var(--primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--outline-variant)';
            e.currentTarget.style.color = 'var(--on-surface-variant)';
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            add
          </span>
          Add another study pack
        </button>
      </div>

      {error && (
        <p
          role="alert"
          style={{
            margin: 0,
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(253,111,133,0.12)',
            color: 'var(--error)',
            fontSize: '13px',
            lineHeight: 1.5,
          }}
        >
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          type="button"
          onClick={onBack}
          disabled={committing}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '13px 18px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--outline-variant)',
            background: 'transparent',
            color: 'var(--on-surface-variant)',
            fontSize: '14px',
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: committing ? 'not-allowed' : 'pointer',
            transition: 'background 0.16s ease, color 0.16s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--surface-container-high)';
            e.currentTarget.style.color = 'var(--on-surface)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--on-surface-variant)';
          }}
        >
          Back
        </button>
        <button
          type="button"
          onClick={onCommit}
          disabled={committing || notebookCount === 0}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '13px 20px',
            borderRadius: 'var(--radius-full)',
            border: 'none',
            background: 'var(--primary)',
            color: 'var(--on-primary)',
            fontSize: '14.5px',
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: committing || notebookCount === 0 ? 'not-allowed' : 'pointer',
            opacity: committing || notebookCount === 0 ? 0.6 : 1,
            transition: 'transform 0.16s cubic-bezier(0.22,1,0.36,1)',
          }}
          onMouseEnter={(e) => {
            if (!committing && notebookCount > 0) e.currentTarget.style.transform = 'scale(1.02)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseDown={(e) => {
            if (!committing && notebookCount > 0) e.currentTarget.style.transform = 'scale(0.97)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {committing
            ? 'Creating…'
            : `Create ${notebookCount} study pack${notebookCount === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}
