'use client';

import { useState, useCallback, useMemo } from 'react';

interface UrlImportDialogProps {
  notebookId: string;
  sectionId: string;
  onImported: () => void;
  onClose: () => void;
}

type ImportState = 'idle' | 'importing' | 'success' | 'error';

export default function UrlImportDialog({
  notebookId,
  sectionId,
  onImported,
  onClose,
}: UrlImportDialogProps) {
  const [url, setUrl] = useState('');
  const [importState, setImportState] = useState<ImportState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const isYouTubeUrl = useMemo(() => {
    return /(?:youtube\.com|youtu\.be)/i.test(url.trim());
  }, [url]);

  const youtubeVideoId = useMemo(() => {
    const trimmed = url.trim();
    const patterns = [
      /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
      /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    ];
    for (const p of patterns) {
      const m = trimmed.match(p);
      if (m) return m[1];
    }
    return null;
  }, [url]);

  const handleImport = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setImportState('importing');
    setErrorMessage('');

    try {
      const endpoint = isYouTubeUrl
        ? `/api/notebooks/${notebookId}/documents/youtube`
        : `/api/notebooks/${notebookId}/sections/${sectionId}/import-url`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(body?.error || `Import failed (${res.status})`);
      }

      setImportState('success');
      setTimeout(() => {
        onImported();
      }, 600);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Import failed');
      setImportState('error');
    }
  }, [url, notebookId, sectionId, onImported, isYouTubeUrl]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && url.trim() && importState === 'idle') {
        handleImport();
      }
    },
    [url, importState, handleImport]
  );

  const isDisabled = !url.trim() || importState === 'importing' || importState === 'success';

  return (
    <div
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          background: 'var(--background)',
          borderRadius: '16px',
          border: '1px solid rgba(174,137,255,0.36)',
          padding: '24px',
          fontFamily: 'inherit',
          color: 'var(--on-surface)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--on-surface)',
            }}
          >
            Import from URL
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '6px',
              color: 'var(--ink-50)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s ease, background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--on-surface)';
              e.currentTarget.style.background = 'rgba(140,82,255,0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--ink-50)';
              e.currentTarget.style.background = 'none';
            }}
            aria-label="Close"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
              close
            </span>
          </button>
        </div>

        {/* URL Input area */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Icon + description */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              padding: '16px 0 8px',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'rgba(140,82,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isYouTubeUrl ? (
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 24, color: '#ff0000' }}
                  aria-hidden
                >
                  smart_display
                </span>
              ) : (
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 24, color: '#8c52ff' }}
                  aria-hidden
                >
                  public
                </span>
              )}
            </div>
            <p
              style={{
                margin: 0,
                fontSize: '13px',
                color: 'var(--ink-50)',
                textAlign: 'center',
                lineHeight: '1.5',
              }}
            >
              {isYouTubeUrl
                ? "This is a YouTube video. We'll extract the transcript."
                : 'Paste a URL to import its text content as a new page.'}
            </p>
          </div>

          {/* YouTube thumbnail preview */}
          {isYouTubeUrl && youtubeVideoId && (
            <div
              style={{
                borderRadius: '10px',
                overflow: 'hidden',
                border: '1px solid rgba(140,82,255,0.15)',
                position: 'relative',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`}
                alt="Video thumbnail"
                style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover' }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '8px',
                  left: '8px',
                  background: 'rgba(255,0,0,0.85)',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 14, color: 'var(--on-surface)' }}
                  aria-hidden
                >
                  smart_display
                </span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--on-surface)' }}>
                  YouTube
                </span>
              </div>
            </div>
          )}

          {/* URL input */}
          <input
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (importState === 'error') {
                setImportState('idle');
                setErrorMessage('');
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="https://example.com/article"
            disabled={importState === 'importing' || importState === 'success'}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'rgba(140,82,255,0.08)',
              border: '1px solid rgba(140,82,255,0.2)',
              borderRadius: '8px',
              padding: '12px 14px',
              fontSize: '14px',
              color: 'var(--on-surface)',
              fontFamily: 'inherit',
              outline: 'none',
              transition: 'border-color 0.15s ease',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(140,82,255,0.5)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(140,82,255,0.2)';
            }}
          />

          {/* Status area */}
          {importState === 'importing' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 0',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 16,
                  color: '#8c52ff',
                  animation: 'url-import-spin 1s linear infinite',
                }}
                aria-hidden
              >
                progress_activity
              </span>
              <p
                style={{
                  margin: 0,
                  fontSize: '13px',
                  color: 'var(--ink-70)',
                }}
              >
                Fetching and extracting content...
              </p>
            </div>
          )}

          {importState === 'success' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 0',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 16, color: '#4ade80' }}
                aria-hidden
              >
                check_circle
              </span>
              <p
                style={{
                  margin: 0,
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#4ade80',
                }}
              >
                Imported successfully
              </p>
            </div>
          )}

          {importState === 'error' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 0',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 16, color: '#f87171', flexShrink: 0 }}
                aria-hidden
              >
                error
              </span>
              <p
                style={{
                  margin: 0,
                  fontSize: '13px',
                  color: '#f87171',
                }}
              >
                {errorMessage}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            marginTop: '20px',
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: 'rgba(140,82,255,0.08)',
              border: '1px solid rgba(140,82,255,0.15)',
              borderRadius: '8px',
              padding: '8px 20px',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: 'inherit',
              color: 'var(--ink-70)',
              cursor: 'pointer',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(140,82,255,0.15)';
              e.currentTarget.style.color = 'var(--on-surface)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(140,82,255,0.08)';
              e.currentTarget.style.color = 'var(--ink-70)';
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={isDisabled}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: isDisabled ? 'rgba(140,82,255,0.2)' : '#8c52ff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 20px',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: 'inherit',
              color: isDisabled ? 'var(--ink-30)' : 'var(--on-surface)',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!isDisabled) {
                e.currentTarget.style.background = '#7a3ff0';
              }
            }}
            onMouseLeave={(e) => {
              if (!isDisabled) {
                e.currentTarget.style.background = '#8c52ff';
              }
            }}
          >
            {importState === 'importing' && (
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 14, animation: 'url-import-spin 1s linear infinite' }}
                aria-hidden
              >
                progress_activity
              </span>
            )}
            {importState === 'importing'
              ? isYouTubeUrl
                ? 'Extracting transcript...'
                : 'Importing...'
              : isYouTubeUrl
                ? 'Extract Transcript'
                : 'Import'}
          </button>
        </div>

        {/* Spinner keyframes */}
        <style>{`@keyframes url-import-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
