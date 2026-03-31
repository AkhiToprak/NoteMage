'use client';

import { useState, useRef, useCallback, useMemo, type DragEvent, type ChangeEvent } from 'react';
import { X, FileUp, Loader2, AlertCircle, CheckCircle2, FileSpreadsheet, ClipboardPaste, Archive } from 'lucide-react';

interface FlashcardImportDialogProps {
  notebookId: string;
  sectionId?: string;
  onImported: (setId: string) => void;
  onClose: () => void;
}

type Tab = 'csv' | 'quizlet' | 'anki';
type UploadState = 'idle' | 'uploading' | 'success' | 'error';

const TABS: { key: Tab; label: string; icon: typeof FileSpreadsheet }[] = [
  { key: 'csv', label: 'CSV / Excel', icon: FileSpreadsheet },
  { key: 'quizlet', label: 'Quizlet', icon: ClipboardPaste },
  { key: 'anki', label: 'Anki', icon: Archive },
];

export default function FlashcardImportDialog({
  notebookId,
  sectionId,
  onImported,
  onClose,
}: FlashcardImportDialogProps) {
  const [activeTab, setActiveTab] = useState<Tab>('csv');

  // File upload state (shared for csv and anki tabs)
  const [dragOver, setDragOver] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [fileName, setFileName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [title, setTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Quizlet paste state
  const [pasteText, setPasteText] = useState('');
  const [quizletTitle, setQuizletTitle] = useState('');
  const [termSep, setTermSep] = useState<'tab' | 'comma' | 'semicolon'>('tab');
  const [quizletSubmitting, setQuizletSubmitting] = useState(false);

  const resetUpload = useCallback(() => {
    setUploadState('idle');
    setFileName('');
    setErrorMessage('');
    setDragOver(false);
  }, []);

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    resetUpload();
  }, [resetUpload]);

  // --- File upload (CSV/Excel/Anki) ---

  const acceptedExtensions = activeTab === 'anki' ? '.apkg' : '.csv,.xlsx,.xls';

  const handleFile = useCallback(
    async (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const validExts = activeTab === 'anki' ? ['apkg'] : ['csv', 'xlsx', 'xls'];

      if (!validExts.includes(ext)) {
        setErrorMessage(
          activeTab === 'anki'
            ? 'Please upload a .apkg file'
            : 'Please upload a .csv, .xlsx, or .xls file'
        );
        setUploadState('error');
        return;
      }

      if (file.size > 50 * 1024 * 1024) {
        setErrorMessage('File exceeds 50MB limit');
        setUploadState('error');
        return;
      }

      setFileName(file.name);
      setUploadState('uploading');
      setErrorMessage('');

      try {
        const formData = new FormData();
        formData.append('file', file);
        if (title.trim()) formData.append('title', title.trim());
        if (sectionId) formData.append('sectionId', sectionId);

        const res = await fetch(`/api/notebooks/${notebookId}/flashcard-sets/import`, {
          method: 'POST',
          body: formData,
        });

        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || json.message || `Upload failed (${res.status})`);
        }

        setUploadState('success');
        setTimeout(() => {
          onImported(json.data.id);
        }, 600);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Upload failed');
        setUploadState('error');
      }
    },
    [activeTab, notebookId, sectionId, title, onImported]
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

  // --- Quizlet paste parsing ---

  const sepChar = useMemo(() => {
    if (termSep === 'tab') return '\t';
    if (termSep === 'comma') return ',';
    return ';';
  }, [termSep]);

  const parsedCards = useMemo(() => {
    if (!pasteText.trim()) return [];
    const lines = pasteText.split('\n').filter((l) => l.trim());
    return lines
      .map((line) => {
        const parts = line.split(sepChar);
        if (parts.length < 2) return null;
        const question = parts[0].trim();
        const answer = parts.slice(1).join(sepChar).trim();
        if (!question || !answer) return null;
        return { question, answer };
      })
      .filter(Boolean) as { question: string; answer: string }[];
  }, [pasteText, sepChar]);

  const handleQuizletImport = useCallback(async () => {
    if (parsedCards.length === 0 || !quizletTitle.trim()) return;
    setQuizletSubmitting(true);
    setErrorMessage('');

    try {
      const res = await fetch(`/api/notebooks/${notebookId}/flashcard-sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: quizletTitle.trim(),
          sectionId,
          source: 'quizlet',
          cards: parsedCards,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || 'Import failed');
      }

      onImported(json.data.id);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Import failed');
      setQuizletSubmitting(false);
    }
  }, [notebookId, sectionId, quizletTitle, parsedCards, onImported]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  // --- Shared styles ---

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    background: 'rgba(140,82,255,0.08)',
    border: '1px solid rgba(140,82,255,0.2)',
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '14px',
    color: '#ede9ff',
    fontFamily: 'inherit',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    color: 'rgba(237,233,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    display: 'block',
    marginBottom: '6px',
  };

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
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '520px',
          maxHeight: '85vh',
          background: '#1e1d35',
          border: '1px solid rgba(140,82,255,0.25)',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          fontFamily: 'inherit',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(140,82,255,0.15)',
            flexShrink: 0,
          }}
        >
          <h3
            style={{
              fontSize: '15px',
              fontWeight: 700,
              color: '#ede9ff',
              margin: 0,
              fontFamily: 'inherit',
            }}
          >
            Import Flashcards
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(237,233,255,0.4)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ede9ff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(237,233,255,0.4)';
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(140,82,255,0.12)',
            flexShrink: 0,
          }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '10px 8px',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #8c52ff' : '2px solid transparent',
                  background: isActive ? 'rgba(140,82,255,0.06)' : 'transparent',
                  color: isActive ? '#c4a9ff' : 'rgba(237,233,255,0.4)',
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  transition: 'color 0.15s ease, background 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.color = 'rgba(237,233,255,0.6)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.color = 'rgba(237,233,255,0.4)';
                }}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {/* CSV/Excel or Anki tab — file upload */}
          {(activeTab === 'csv' || activeTab === 'anki') && (
            <>
              {/* Title input */}
              <div>
                <label style={labelStyle}>Set Title (optional)</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Defaults to filename"
                  style={inputStyle}
                />
              </div>

              {/* Dropzone */}
              <div
                onClick={handleZoneClick}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                style={{
                  border: `2px dashed ${dragOver ? 'rgba(140,82,255,0.5)' : 'rgba(140,82,255,0.2)'}`,
                  borderRadius: '12px',
                  padding: '32px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  cursor: uploadState === 'idle' || uploadState === 'error' ? 'pointer' : 'default',
                  background: dragOver ? 'rgba(140,82,255,0.06)' : 'rgba(140,82,255,0.02)',
                  transition: 'border-color 0.2s ease, background 0.2s ease',
                  minHeight: '150px',
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={acceptedExtensions}
                  onChange={handleInputChange}
                  style={{ display: 'none' }}
                />

                {uploadState === 'idle' && (
                  <>
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '12px',
                        background: 'rgba(140,82,255,0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <FileUp size={22} style={{ color: '#8c52ff' }} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p
                        style={{
                          margin: '0 0 4px 0',
                          fontSize: '13px',
                          fontWeight: 600,
                          color: '#ede9ff',
                        }}
                      >
                        Drag a file here or click to browse
                      </p>
                      <p
                        style={{
                          margin: 0,
                          fontSize: '11px',
                          color: 'rgba(237,233,255,0.35)',
                        }}
                      >
                        {activeTab === 'anki' ? '.apkg files' : '.csv, .xlsx, .xls files'} — max 50MB
                      </p>
                    </div>
                  </>
                )}

                {uploadState === 'uploading' && (
                  <>
                    <Loader2
                      size={26}
                      style={{
                        color: '#8c52ff',
                        animation: 'flashcard-import-spin 1s linear infinite',
                      }}
                    />
                    <p
                      style={{
                        margin: 0,
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#ede9ff',
                      }}
                    >
                      Importing {fileName}...
                    </p>
                  </>
                )}

                {uploadState === 'success' && (
                  <>
                    <CheckCircle2 size={26} style={{ color: '#4ade80' }} />
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
                  </>
                )}

                {uploadState === 'error' && (
                  <>
                    <AlertCircle size={26} style={{ color: '#f87171' }} />
                    <div style={{ textAlign: 'center' }}>
                      <p
                        style={{
                          margin: '0 0 4px 0',
                          fontSize: '13px',
                          fontWeight: 600,
                          color: '#f87171',
                        }}
                      >
                        {errorMessage}
                      </p>
                      <p
                        style={{
                          margin: 0,
                          fontSize: '11px',
                          color: 'rgba(237,233,255,0.35)',
                        }}
                      >
                        Click to try again
                      </p>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* Quizlet tab — paste text */}
          {activeTab === 'quizlet' && (
            <>
              {/* Title */}
              <div>
                <label style={labelStyle}>Set Title</label>
                <input
                  type="text"
                  value={quizletTitle}
                  onChange={(e) => setQuizletTitle(e.target.value)}
                  placeholder="e.g. Biology Chapter 3"
                  style={inputStyle}
                />
              </div>

              {/* Separator */}
              <div>
                <label style={labelStyle}>Between term and definition</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {(
                    [
                      ['tab', 'Tab'],
                      ['comma', 'Comma'],
                      ['semicolon', 'Semicolon'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setTermSep(val)}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border:
                          termSep === val
                            ? '1px solid rgba(140,82,255,0.5)'
                            : '1px solid rgba(140,82,255,0.15)',
                        background:
                          termSep === val ? 'rgba(140,82,255,0.15)' : 'rgba(140,82,255,0.04)',
                        color: termSep === val ? '#c4a9ff' : 'rgba(237,233,255,0.5)',
                        fontSize: '12px',
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        transition: 'background 0.12s ease, border-color 0.12s ease',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Paste area */}
              <div>
                <label style={labelStyle}>Paste exported text</label>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={`term${sepChar === '\t' ? '\\t' : sepChar}definition\nterm${sepChar === '\t' ? '\\t' : sepChar}definition`}
                  rows={8}
                  style={{
                    ...inputStyle,
                    resize: 'vertical',
                    minHeight: '120px',
                    lineHeight: '1.5',
                  }}
                />
              </div>

              {/* Preview count */}
              {pasteText.trim() && (
                <p
                  style={{
                    margin: 0,
                    fontSize: '12px',
                    color: parsedCards.length > 0 ? '#4ade80' : 'rgba(237,233,255,0.4)',
                    fontWeight: 600,
                  }}
                >
                  Found {parsedCards.length} card{parsedCards.length !== 1 ? 's' : ''}
                </p>
              )}

              {/* Error */}
              {errorMessage && (
                <p style={{ margin: 0, fontSize: '12px', color: '#f87171' }}>{errorMessage}</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '8px',
            padding: '12px 20px',
            borderTop: '1px solid rgba(140,82,255,0.15)',
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid rgba(237,233,255,0.1)',
              background: 'transparent',
              color: 'rgba(237,233,255,0.5)',
              fontSize: '13px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>

          {activeTab === 'quizlet' && (
            <button
              onClick={handleQuizletImport}
              disabled={parsedCards.length === 0 || !quizletTitle.trim() || quizletSubmitting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background:
                  parsedCards.length > 0 && quizletTitle.trim() && !quizletSubmitting
                    ? 'linear-gradient(135deg, #8c52ff, #5170ff)'
                    : 'rgba(140,82,255,0.2)',
                color:
                  parsedCards.length > 0 && quizletTitle.trim() && !quizletSubmitting
                    ? '#fff'
                    : 'rgba(237,233,255,0.3)',
                fontSize: '13px',
                cursor:
                  parsedCards.length > 0 && quizletTitle.trim() && !quizletSubmitting
                    ? 'pointer'
                    : 'not-allowed',
                fontFamily: 'inherit',
                fontWeight: 600,
              }}
            >
              {quizletSubmitting && (
                <Loader2
                  size={14}
                  style={{ animation: 'flashcard-import-spin 1s linear infinite' }}
                />
              )}
              {quizletSubmitting ? 'Importing...' : `Import ${parsedCards.length} Cards`}
            </button>
          )}
        </div>

        {/* Spinner keyframes */}
        <style>{`@keyframes flashcard-import-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
