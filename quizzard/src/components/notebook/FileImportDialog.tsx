'use client';

import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react';
import { FileUp, X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

interface FileImportDialogProps {
  notebookId: string;
  sectionId: string;
  onImported: () => void;
  onClose: () => void;
}

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.txt,.md,.pptx,.xlsx,.xls';
const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

export default function FileImportDialog({
  notebookId,
  sectionId,
  onImported,
  onClose,
}: FileImportDialogProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [fileName, setFileName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      // Client-side validation
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setErrorMessage('Unsupported file type. Please use PDF, DOCX, PPTX, XLSX, TXT, or MD.');
        setUploadState('error');
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setErrorMessage('File exceeds the 10MB size limit.');
        setUploadState('error');
        return;
      }

      setFileName(file.name);
      setUploadState('uploading');
      setErrorMessage('');

      try {
        const formData = new FormData();
        formData.append('file', file);

        const isPptx = file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          || file.type === 'application/vnd.ms-excel';
        const importPath = isPptx ? 'import-pptx' : isExcel ? 'import-xlsx' : 'import';
        const res = await fetch(
          `/api/notebooks/${notebookId}/sections/${sectionId}/${importPath}`,
          { method: 'POST', body: formData }
        );

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `Upload failed (${res.status})`);
        }

        setUploadState('success');
        // Brief delay so user sees success state, then notify parent
        setTimeout(() => {
          onImported();
        }, 600);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Upload failed');
        setUploadState('error');
      }
    },
    [notebookId, sectionId, onImported]
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);

      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleZoneClick = useCallback(() => {
    if (uploadState === 'idle' || uploadState === 'error') {
      fileInputRef.current?.click();
    }
  }, [uploadState]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

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
            Import File
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

        {/* Drop zone */}
        <div
          onClick={handleZoneClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          style={{
            border: `2px dashed ${
              dragOver ? 'rgba(140,82,255,0.5)' : 'rgba(140,82,255,0.2)'
            }`,
            borderRadius: '12px',
            padding: '40px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            cursor:
              uploadState === 'idle' || uploadState === 'error'
                ? 'pointer'
                : 'default',
            background: dragOver
              ? 'rgba(140,82,255,0.06)'
              : 'rgba(140,82,255,0.02)',
            transition: 'border-color 0.2s ease, background 0.2s ease',
            minHeight: '180px',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            onChange={handleInputChange}
            style={{ display: 'none' }}
          />

          {uploadState === 'idle' && (
            <>
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
                <FileUp size={24} style={{ color: '#8c52ff' }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <p
                  style={{
                    margin: '0 0 4px 0',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#ede9ff',
                  }}
                >
                  Drag a file here or click to browse
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: '12px',
                    color: 'rgba(237,233,255,0.4)',
                  }}
                >
                  PDF, DOCX, PPTX, XLSX, TXT, MD — max 10MB
                </p>
              </div>
            </>
          )}

          {uploadState === 'uploading' && (
            <>
              <Loader2
                size={28}
                style={{
                  color: '#8c52ff',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <p
                style={{
                  margin: 0,
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#ede9ff',
                }}
              >
                Importing {fileName}...
              </p>
              {/* Inline keyframes for spinner */}
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </>
          )}

          {uploadState === 'success' && (
            <>
              <CheckCircle2 size={28} style={{ color: '#4ade80' }} />
              <p
                style={{
                  margin: 0,
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#4ade80',
                }}
              >
                Imported successfully
              </p>
            </>
          )}

          {uploadState === 'error' && (
            <>
              <AlertCircle size={28} style={{ color: '#f87171' }} />
              <div style={{ textAlign: 'center' }}>
                <p
                  style={{
                    margin: '0 0 4px 0',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#f87171',
                  }}
                >
                  {errorMessage}
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: '12px',
                    color: 'rgba(237,233,255,0.4)',
                  }}
                >
                  Click to try again
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: '16px',
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
        </div>
      </div>
    </div>
  );
}
