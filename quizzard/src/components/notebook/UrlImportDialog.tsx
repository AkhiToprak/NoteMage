'use client';

import { useState, useCallback } from 'react';
import { Globe, X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

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

  const handleImport = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setImportState('importing');
    setErrorMessage('');

    try {
      const res = await fetch(
        `/api/notebooks/${notebookId}/sections/${sectionId}/import-url`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trimmed }),
        }
      );

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
  }, [url, notebookId, sectionId, onImported]);

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
          background: '#111126',
          borderRadius: '16px',
          border: '1px solid rgba(140,82,255,0.18)',
          padding: '24px',
          fontFamily: 'inherit',
          color: '#ede9ff',
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
              color: '#ede9ff',
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
              color: 'rgba(237,233,255,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s ease, background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ede9ff';
              e.currentTarget.style.background = 'rgba(140,82,255,0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(237,233,255,0.5)';
              e.currentTarget.style.background = 'none';
            }}
            aria-label="Close"
          >
            <X size={18} />
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
              <Globe size={24} style={{ color: '#8c52ff' }} />
            </div>
            <p
              style={{
                margin: 0,
                fontSize: '13px',
                color: 'rgba(237,233,255,0.5)',
                textAlign: 'center',
                lineHeight: '1.5',
              }}
            >
              Paste a URL to import its text content as a new page.
            </p>
          </div>

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
              color: '#ede9ff',
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
              <Loader2
                size={16}
                style={{
                  color: '#8c52ff',
                  animation: 'url-import-spin 1s linear infinite',
                }}
              />
              <p
                style={{
                  margin: 0,
                  fontSize: '13px',
                  color: 'rgba(237,233,255,0.7)',
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
              <CheckCircle2 size={16} style={{ color: '#4ade80' }} />
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
              <AlertCircle size={16} style={{ color: '#f87171', flexShrink: 0 }} />
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
              color: 'rgba(237,233,255,0.7)',
              cursor: 'pointer',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(140,82,255,0.15)';
              e.currentTarget.style.color = '#ede9ff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(140,82,255,0.08)';
              e.currentTarget.style.color = 'rgba(237,233,255,0.7)';
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
              color: isDisabled ? 'rgba(237,233,255,0.3)' : '#fff',
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
              <Loader2
                size={14}
                style={{ animation: 'url-import-spin 1s linear infinite' }}
              />
            )}
            {importState === 'importing' ? 'Importing...' : 'Import'}
          </button>
        </div>

        {/* Spinner keyframes */}
        <style>{`@keyframes url-import-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
