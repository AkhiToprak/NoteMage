'use client';

import { useRef, useState } from 'react';
import type { PickedFile } from '@/hooks/useMultiImport';
import { useCoarsePointer } from '@/hooks/useCoarsePointer';

// Sub-step A of the multi-PDF import flow — pick the PDFs. PDF upload is
// the fully wired source; paste-notes and link import are planned as
// later same-tray source types.

interface ImportSourceStepProps {
  files: PickedFile[];
  maxFiles: number;
  error: string | null;
  busy: boolean;
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (id: string) => void;
  onContinue: () => void;
  /** Optional skip control — rendered in the onboarding finale only. */
  onSkip?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImportSourceStep({
  files,
  maxFiles,
  error,
  busy,
  onAddFiles,
  onRemoveFile,
  onContinue,
  onSkip,
}: ImportSourceStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  // Touch / WebView devices can't drag-and-drop — adapt the dropzone copy.
  const coarsePointer = useCoarsePointer();
  const atLimit = files.length >= maxFiles;

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
          Import your study material
        </h2>
        <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.55, color: 'var(--on-surface-variant)' }}>
          Add your PDFs — lecture slides, textbooks, notes. NoteMage detects the subjects and sorts
          them into notebooks for you.
        </p>
      </header>

      <button
        type="button"
        onClick={() => !atLimit && inputRef.current?.click()}
        disabled={atLimit || busy}
        onDragOver={(e) => {
          e.preventDefault();
          if (!atLimit) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (!atLimit) onAddFiles(Array.from(e.dataTransfer.files));
        }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          padding: '28px 20px',
          borderRadius: 'var(--radius-lg)',
          border: `1.5px dashed ${dragActive ? 'var(--primary)' : 'var(--outline-variant)'}`,
          background: dragActive ? 'rgba(174,137,255,0.08)' : 'var(--surface-container-high)',
          color: 'var(--on-surface)',
          cursor: atLimit || busy ? 'not-allowed' : 'pointer',
          opacity: atLimit ? 0.55 : 1,
          fontFamily: 'inherit',
          transition: 'border-color 0.2s ease, background 0.2s ease',
        }}
      >
        <span
          className="material-symbols-outlined"
          aria-hidden="true"
          style={{ fontSize: '34px', color: 'var(--primary)' }}
        >
          upload_file
        </span>
        <span style={{ fontSize: '14.5px', fontWeight: 700 }}>
          {atLimit
            ? `Limit reached — ${maxFiles} PDFs`
            : coarsePointer
              ? 'Tap to add PDFs'
              : 'Drag PDFs here, or click to browse'}
        </span>
        <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>
          {files.length} of {maxFiles} added
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) onAddFiles(Array.from(e.target.files));
          e.target.value = '';
        }}
      />

      {files.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '34vh',
            overflowY: 'auto',
          }}
        >
          {files.map((file) => (
            <li
              key={file.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--surface-container-high)',
                border: '1px solid var(--outline-variant)',
              }}
            >
              <span
                className="material-symbols-outlined"
                aria-hidden="true"
                style={{ fontSize: '20px', color: 'var(--primary)', flexShrink: 0 }}
              >
                picture_as_pdf
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: '13.5px',
                  color: 'var(--on-surface)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {file.name}
              </span>
              <span
                style={{
                  fontSize: '12px',
                  color: 'var(--on-surface-variant)',
                  flexShrink: 0,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatBytes(file.size)}
              </span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => onRemoveFile(file.id)}
                disabled={busy}
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
                  cursor: busy ? 'not-allowed' : 'pointer',
                  transition: 'transform 0.16s cubic-bezier(0.22,1,0.36,1), background 0.16s ease',
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
            </li>
          ))}
        </ul>
      )}

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '2px' }}>
        <button
          type="button"
          onClick={onContinue}
          disabled={files.length === 0 || busy}
          style={{
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
            cursor: files.length === 0 || busy ? 'not-allowed' : 'pointer',
            opacity: files.length === 0 || busy ? 0.5 : 1,
            transition: 'transform 0.16s cubic-bezier(0.22,1,0.36,1)',
          }}
          onMouseEnter={(e) => {
            if (files.length > 0 && !busy) e.currentTarget.style.transform = 'scale(1.02)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseDown={(e) => {
            if (files.length > 0 && !busy) e.currentTarget.style.transform = 'scale(0.97)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          Continue
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '19px' }}>
            arrow_forward
          </span>
        </button>

        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            disabled={busy}
            style={{
              padding: '9px',
              borderRadius: 'var(--radius-full)',
              border: 'none',
              background: 'transparent',
              color: 'var(--on-surface-variant)',
              fontSize: '13.5px',
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--on-surface)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--on-surface-variant)';
            }}
          >
            Skip for now
          </button>
        )}
      </div>
    </div>
  );
}
