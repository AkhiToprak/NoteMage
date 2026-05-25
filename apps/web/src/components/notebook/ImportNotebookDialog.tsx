'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useDirectUpload } from '@/hooks/useDirectUpload';
import { validateFile } from '@/lib/file-validation';
import { renderPdfToPngs, type RenderedPdfPage } from '@/lib/pdf-client-render';
import PdfImportProgressModal from './PdfImportProgressModal';

interface ImportNotebookDialogProps {
  notebookId: string;
  onImported: () => void;
  onClose: () => void;
}

type TabType = 'onenote' | 'goodnotes' | 'applenotes' | 'pdf';

interface OneNoteSection {
  id: string;
  displayName: string;
}

interface OneNoteNotebook {
  id: string;
  displayName: string;
  sections: OneNoteSection[];
}

type OneNoteState =
  | 'checking'
  | 'disconnected'
  | 'loading'
  | 'picker'
  | 'importing'
  | 'success'
  | 'error';

export default function ImportNotebookDialog({
  notebookId,
  onImported,
  onClose,
}: ImportNotebookDialogProps) {
  const [activeTab, setActiveTab] = useState<TabType>('onenote');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '540px',
          maxHeight: '80vh',
          background: '#1e1d35',
          borderRadius: '16px',
          border: '1px solid rgba(174,137,255,0.40)',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'inherit',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(174,137,255,0.20)',
          }}
        >
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--on-surface)' }}>
            Import Notebook
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(196,169,255,0.5)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
              close
            </span>
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '2px',
            padding: '10px 20px',
            borderBottom: '1px solid rgba(174,137,255,0.20)',
          }}
        >
          {(
            [
              ['onenote', 'OneNote'],
              ['goodnotes', 'GoodNotes'],
              ['applenotes', 'Apple Notes'],
              ['pdf', 'PDF'],
            ] as const
          ).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as TabType)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12.5px',
                fontWeight: 500,
                fontFamily: 'inherit',
                background: activeTab === tab ? 'rgba(140,82,255,0.2)' : 'transparent',
                color: activeTab === tab ? '#c4a9ff' : 'rgba(196,169,255,0.5)',
                transition: 'background 0.12s ease',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', minHeight: '300px' }}>
          {activeTab === 'onenote' && (
            <OneNoteTab notebookId={notebookId} onImported={onImported} />
          )}
          {activeTab === 'goodnotes' && (
            <GoodNotesTab notebookId={notebookId} onImported={onImported} />
          )}
          {activeTab === 'applenotes' && <AppleNotesTab />}
          {activeTab === 'pdf' && (
            <PdfTab notebookId={notebookId} onImported={onImported} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// OneNote Tab
// ═══════════════════════════════════════════════════════════════════

function OneNoteTab({ notebookId, onImported }: { notebookId: string; onImported: () => void }) {
  const [state, setState] = useState<OneNoteState>('checking');
  const [notebooks, setNotebooks] = useState<OneNoteNotebook[]>([]);
  const [expandedNotebooks, setExpandedNotebooks] = useState<Set<string>>(new Set());
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [importProgress, setImportProgress] = useState('');
  const [importResult, setImportResult] = useState<{
    sectionsImported: number;
    pagesImported: number;
    errors: string[];
  } | null>(null);

  const loadNotebooks = useCallback(async () => {
    setState('loading');
    setError('');
    try {
      const res = await fetch('/api/import/onenote/notebooks');
      const json = await res.json();
      if (json.success && json.data) {
        setNotebooks(json.data);
        setState('picker');
        // Auto-expand first notebook
        if (json.data.length > 0) {
          setExpandedNotebooks(new Set([json.data[0].id]));
        }
      } else {
        setError(json.error || 'Failed to load notebooks');
        setState('error');
      }
    } catch {
      setError('Failed to load notebooks');
      setState('error');
    }
  }, []);

  const checkStatus = useCallback(async () => {
    setState('checking');
    try {
      const res = await fetch('/api/import/onenote/status');
      const json = await res.json();
      if (json.success && json.data?.connected) {
        loadNotebooks();
      } else {
        setState('disconnected');
      }
    } catch {
      setState('disconnected');
    }
  }, [loadNotebooks]);

  // Check connection status on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkStatus();
  }, [checkStatus]);

  // Listen for OAuth popup messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // Only accept messages from our own origin to prevent cross-origin attacks
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'onenote-auth-success') {
        loadNotebooks();
      } else if (event.data?.type === 'onenote-auth-error') {
        setError(event.data.message || 'Authentication failed');
        setState('error');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [loadNotebooks]);

  const connectMicrosoft = useCallback(async () => {
    try {
      const res = await fetch('/api/import/onenote/auth');
      const json = await res.json();
      if (json.success && json.data?.url) {
        // Open OAuth popup
        const popup = window.open(json.data.url, 'onenote-auth', 'width=600,height=700,popup=yes');
        if (!popup) {
          // Popup blocked — fallback to redirect
          window.location.href = json.data.url;
        }
      } else {
        setError(json.error || 'Failed to start authentication');
        setState('error');
      }
    } catch {
      setError('Failed to start authentication');
      setState('error');
    }
  }, []);

  const disconnectMicrosoft = useCallback(async () => {
    try {
      await fetch('/api/import/onenote/disconnect', { method: 'POST' });
      setNotebooks([]);
      setSelectedSections(new Set());
      setState('disconnected');
    } catch {
      /* silent */
    }
  }, []);

  const toggleNotebook = useCallback((nbId: string) => {
    setExpandedNotebooks((prev) => {
      const next = new Set(prev);
      if (next.has(nbId)) next.delete(nbId);
      else next.add(nbId);
      return next;
    });
  }, []);

  const toggleSection = useCallback((sectionId: string) => {
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }, []);

  const handleImport = useCallback(async () => {
    if (selectedSections.size === 0) return;
    setState('importing');
    setImportProgress(
      `Importing ${selectedSections.size} section${selectedSections.size !== 1 ? 's' : ''}...`
    );
    setError('');

    try {
      const res = await fetch('/api/import/onenote/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetNotebookId: notebookId,
          sectionIds: Array.from(selectedSections),
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setImportResult(json.data);
        setState('success');
      } else {
        setError(json.error || 'Import failed');
        setState('error');
      }
    } catch {
      setError('Import failed');
      setState('error');
    }
  }, [notebookId, selectedSections]);

  // ── Render states ──

  if (state === 'checking') {
    return <CenteredMessage text="Checking connection..." loading />;
  }

  if (state === 'disconnected') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          padding: '32px 0',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '14px',
            background: 'rgba(140,82,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 23 23" fill="none">
            <path d="M11 0H0V11H11V0Z" fill="#F25022" />
            <path d="M23 0H12V11H23V0Z" fill="#7FBA00" />
            <path d="M11 12H0V23H11V12Z" fill="#00A4EF" />
            <path d="M23 12H12V23H23V12Z" fill="#FFB900" />
          </svg>
        </div>
        <div style={{ textAlign: 'center' }}>
          <p
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--on-surface)',
              margin: '0 0 6px',
            }}
          >
            Connect Microsoft Account
          </p>
          <p
            style={{
              fontSize: '12.5px',
              color: 'var(--ink-40)',
              margin: 0,
              lineHeight: 1.5,
              maxWidth: '320px',
            }}
          >
            Sign in to your Microsoft account to import notebooks, sections, and pages from OneNote.
          </p>
        </div>
        <button
          onClick={connectMicrosoft}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 24px',
            borderRadius: '10px',
            border: 'none',
            background: '#8c52ff',
            color: 'var(--on-surface)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 23 23" fill="none">
            <path d="M11 0H0V11H11V0Z" fill="var(--on-surface)" fillOpacity="0.8" />
            <path d="M23 0H12V11H23V0Z" fill="var(--on-surface)" fillOpacity="0.6" />
            <path d="M11 12H0V23H11V12Z" fill="var(--on-surface)" fillOpacity="0.6" />
            <path d="M23 12H12V23H23V12Z" fill="var(--on-surface)" fillOpacity="0.4" />
          </svg>
          Sign in with Microsoft
        </button>
      </div>
    );
  }

  if (state === 'loading') {
    return <CenteredMessage text="Loading your OneNote notebooks..." loading />;
  }

  if (state === 'importing') {
    return <CenteredMessage text={importProgress} loading />;
  }

  if (state === 'success' && importResult) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          padding: '32px 0',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'rgba(74,222,128,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 24, color: 'rgba(74,222,128,0.8)' }}
            aria-hidden
          >
            check
          </span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <p
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--on-surface)',
              margin: '0 0 6px',
            }}
          >
            Import Complete
          </p>
          <p
            style={{
              fontSize: '12.5px',
              color: 'var(--ink-50)',
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            Imported {importResult.sectionsImported} section
            {importResult.sectionsImported !== 1 ? 's' : ''} with {importResult.pagesImported} page
            {importResult.pagesImported !== 1 ? 's' : ''}.
          </p>
          {importResult.errors.length > 0 && (
            <p style={{ fontSize: '11px', color: 'rgba(252,165,165,0.7)', marginTop: '8px' }}>
              {importResult.errors.length} item{importResult.errors.length !== 1 ? 's' : ''} could
              not be imported.
            </p>
          )}
        </div>
        <button
          onClick={onImported}
          style={{
            padding: '8px 20px',
            borderRadius: '8px',
            border: 'none',
            background: '#8c52ff',
            color: 'var(--on-surface)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Done
        </button>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          padding: '32px 0',
        }}
      >
        <p
          style={{
            fontSize: '13px',
            color: 'rgba(252,165,165,0.8)',
            textAlign: 'center',
            margin: 0,
          }}
        >
          {error}
        </p>
        <button
          onClick={checkStatus}
          style={{
            padding: '7px 16px',
            borderRadius: '8px',
            border: '1px solid rgba(140,82,255,0.3)',
            background: 'transparent',
            color: '#c4a9ff',
            fontSize: '12px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // state === 'picker'
  return (
    <div>
      {/* Connected header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '14px',
        }}
      >
        <span style={{ fontSize: '12px', color: 'rgba(74,222,128,0.7)', fontWeight: 500 }}>
          ● Connected to Microsoft
        </span>
        <button
          onClick={disconnectMicrosoft}
          style={{
            fontSize: '11px',
            color: 'rgba(252,165,165,0.5)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textDecoration: 'underline',
            fontFamily: 'inherit',
          }}
        >
          Disconnect
        </button>
      </div>

      {/* Notebook tree */}
      {notebooks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <p style={{ fontSize: '13px', color: 'var(--ink-30)', margin: 0 }}>
            No OneNote notebooks found in your Microsoft account.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {notebooks.map((nb) => {
            const isExpanded = expandedNotebooks.has(nb.id);
            return (
              <div key={nb.id}>
                <button
                  onClick={() => toggleNotebook(nb.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '8px 8px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                  }}
                >
                  {isExpanded ? (
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 14, color: 'rgba(196,169,255,0.5)', flexShrink: 0 }}
                      aria-hidden
                    >
                      expand_more
                    </span>
                  ) : (
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 14, color: 'rgba(196,169,255,0.5)', flexShrink: 0 }}
                      aria-hidden
                    >
                      chevron_right
                    </span>
                  )}
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--on-surface)' }}>
                    {nb.displayName}
                  </span>
                  <span style={{ fontSize: '11px', color: 'rgba(196,169,255,0.35)' }}>
                    ({nb.sections.length} section{nb.sections.length !== 1 ? 's' : ''})
                  </span>
                </button>

                {isExpanded &&
                  nb.sections.map((section) => {
                    const isSelected = selectedSections.has(section.id);
                    return (
                      <button
                        key={section.id}
                        onClick={() => toggleSection(section.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          width: '100%',
                          padding: '6px 8px 6px 34px',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                          background: isSelected ? 'rgba(140,82,255,0.1)' : 'transparent',
                          fontFamily: 'inherit',
                          transition: 'background 0.1s ease',
                        }}
                      >
                        <div
                          style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '4px',
                            border: isSelected ? 'none' : '1.5px solid rgba(140,82,255,0.3)',
                            background: isSelected ? '#8c52ff' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            transition: 'background 0.1s ease, border-color 0.1s ease',
                          }}
                        >
                          {isSelected && (
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: 10, color: 'var(--on-surface)' }}
                              aria-hidden
                            >
                              check
                            </span>
                          )}
                        </div>
                        <span
                          className="material-symbols-outlined"
                          style={{ fontSize: 13, color: 'rgba(196,169,255,0.4)', flexShrink: 0 }}
                          aria-hidden
                        >
                          description
                        </span>
                        <span
                          style={{
                            fontSize: '12.5px',
                            color: isSelected ? 'var(--on-surface)' : 'var(--ink-50)',
                          }}
                        >
                          {section.displayName}
                        </span>
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </div>
      )}

      {/* Import button */}
      {notebooks.length > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: '16px',
            paddingTop: '12px',
            borderTop: '1px solid rgba(174,137,255,0.20)',
          }}
        >
          <button
            onClick={handleImport}
            disabled={selectedSections.size === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              background: selectedSections.size > 0 ? '#8c52ff' : 'rgba(140,82,255,0.2)',
              color: selectedSections.size > 0 ? 'var(--on-surface)' : 'rgba(196,169,255,0.4)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: selectedSections.size > 0 ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>
              upload
            </span>
            Import{selectedSections.size > 0 ? ` (${selectedSections.size})` : ''}
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// GoodNotes Tab
// ═══════════════════════════════════════════════════════════════════

function GoodNotesTab({ notebookId, onImported }: { notebookId: string; onImported: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'success' | 'error'>(
    'idle'
  );
  const [errorMessage, setErrorMessage] = useState('');
  const { upload } = useDirectUpload();

  const handlePdfUpload = useCallback(
    async (file: File) => {
      if (file.type !== 'application/pdf') {
        setErrorMessage('Please select a PDF file.');
        setUploadState('error');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setErrorMessage('File exceeds the 10MB size limit.');
        setUploadState('error');
        return;
      }

      setUploadState('uploading');
      setErrorMessage('');

      try {
        // Create a new section for the GoodNotes import
        const sectionRes = await fetch(`/api/notebooks/${notebookId}/sections`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: file.name.replace(/\.pdf$/i, '') }),
        });
        if (!sectionRes.ok) throw new Error('Failed to create section');
        const sectionJson = await sectionRes.json();
        const sectionId = sectionJson.data.id;

        // Upload PDF directly to Supabase Storage
        const { storagePath } = await upload(file, 'section-import', { notebookId, sectionId });

        // Import the PDF into the new section
        const importRes = await fetch(`/api/notebooks/${notebookId}/sections/${sectionId}/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath, fileName: file.name, fileType: file.type }),
        });
        if (!importRes.ok) {
          const body = await importRes.json().catch(() => null);
          throw new Error(body?.error || `Upload failed (${importRes.status})`);
        }

        setUploadState('success');
        setTimeout(() => onImported(), 600);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Upload failed');
        setUploadState('error');
      }
    },
    [notebookId, onImported, upload]
  );

  return (
    <div style={{ padding: '8px 0' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'rgba(140,82,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 20, color: '#c4a9ff' }}
            aria-hidden
          >
            description
          </span>
        </div>
        <div>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--on-surface)', margin: 0 }}>
            Import from GoodNotes
          </p>
          <p
            style={{
              fontSize: '11.5px',
              color: 'var(--ink-40)',
              margin: '2px 0 0',
            }}
          >
            Via PDF export
          </p>
        </div>
      </div>

      <div
        style={{
          padding: '14px 16px',
          borderRadius: '10px',
          background: 'rgba(140,82,255,0.06)',
          border: '1px solid rgba(174,137,255,0.20)',
          marginBottom: '14px',
        }}
      >
        <p
          style={{
            fontSize: '12.5px',
            color: 'var(--ink-50)',
            margin: '0 0 4px',
            lineHeight: 1.5,
          }}
        >
          GoodNotes uses a proprietary format that cannot be directly imported. Export your notes as
          PDF first, then import the PDF file.
        </p>
      </div>

      <InstructionSteps
        steps={[
          'Open GoodNotes on your iPad or Mac',
          'Select the notebook you want to export',
          'Tap the share icon (⬆) or go to File → Export',
          'Choose "PDF" as the export format',
          'Save or AirDrop the PDF to your computer',
        ]}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handlePdfUpload(file);
        }}
      />

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadState === 'uploading' || uploadState === 'success'}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          width: '100%',
          marginTop: '16px',
          padding: '12px',
          borderRadius: '10px',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: '14px',
          fontWeight: 600,
          background: uploadState === 'success' ? 'rgba(74,222,128,0.15)' : 'rgba(140,82,255,0.8)',
          color: uploadState === 'success' ? '#4ade80' : 'var(--on-surface)',
          opacity: uploadState === 'uploading' ? 0.6 : 1,
          transition: 'opacity 0.15s ease',
        }}
      >
        {uploadState === 'uploading' ? (
          <>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 16, animation: 'spin 1s linear infinite' }}
              aria-hidden
            >
              progress_activity
            </span>{' '}
            Importing PDF...
          </>
        ) : uploadState === 'success' ? (
          <>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
              check
            </span>{' '}
            Imported!
          </>
        ) : (
          <>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
              upload
            </span>{' '}
            Import PDF from GoodNotes
          </>
        )}
      </button>

      {uploadState === 'error' && errorMessage && (
        <p style={{ fontSize: '12px', color: '#fd6f85', margin: '8px 0 0', textAlign: 'center' }}>
          {errorMessage}
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Apple Notes Tab
// ═══════════════════════════════════════════════════════════════════

function AppleNotesTab() {
  return (
    <div style={{ padding: '8px 0' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'rgba(140,82,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 20, color: '#c4a9ff' }}
            aria-hidden
          >
            description
          </span>
        </div>
        <div>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--on-surface)', margin: 0 }}>
            Import from Apple Notes
          </p>
          <p
            style={{
              fontSize: '11.5px',
              color: 'var(--ink-40)',
              margin: '2px 0 0',
            }}
          >
            Via PDF export
          </p>
        </div>
      </div>

      <div
        style={{
          padding: '14px 16px',
          borderRadius: '10px',
          background: 'rgba(140,82,255,0.06)',
          border: '1px solid rgba(174,137,255,0.20)',
          marginBottom: '14px',
        }}
      >
        <p
          style={{
            fontSize: '12.5px',
            color: 'var(--ink-50)',
            margin: '0 0 4px',
            lineHeight: 1.5,
          }}
        >
          Apple Notes does not provide a public API for web apps. Export your notes as PDF first,
          then import the PDF file.
        </p>
      </div>

      <InstructionSteps
        steps={[
          'Open the Notes app on your Mac',
          'Select the note(s) you want to export',
          'Go to File → Export as PDF',
          'Save the PDF file to your computer',
          'In Notemage, open any section and click the Upload (↑) button to import the PDF as a page',
        ]}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PDF Tab
// ═══════════════════════════════════════════════════════════════════

/** pdfjs raises a `PasswordException` for encrypted PDFs. */
function isPasswordError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /password/i.test(`${err.name} ${err.message}`);
}

function PdfTab({
  notebookId,
  onImported,
  onClose,
}: {
  notebookId: string;
  onImported: () => void;
  onClose: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload } = useDirectUpload();

  const [phase, setPhase] = useState<'idle' | 'rendering' | 'uploading' | 'starting'>('idle');
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [modalGeneration, setModalGeneration] = useState(0);
  const [pendingFileName, setPendingFileName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const busy = phase !== 'idle';

  const ensureSectionId = useCallback(async (): Promise<string> => {
    const res = await fetch(`/api/notebooks/${notebookId}/sections`);
    const json = await res.json();
    if (json?.success && Array.isArray(json.data) && json.data.length > 0) {
      return json.data[0].id as string;
    }
    const created = await fetch(`/api/notebooks/${notebookId}/sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Imports' }),
    });
    const createdJson = await created.json();
    if (!createdJson?.success || !createdJson?.data?.id) {
      throw new Error('Could not create a section for the imported PDF');
    }
    return createdJson.data.id as string;
  }, [notebookId]);

  // Mirrors the structured pipeline: render the PDF to page PNGs, upload the
  // raw PDF + PNGs to temp-imports/, then start a server-side import job.
  // PdfImportProgressModal tracks that job over SSE and builds ONE editable
  // page — headings, tables, callouts, figures — not flat screenshots.
  const handleFile = useCallback(
    async (file: File) => {
      const validationError = validateFile(file, 'pdf-import');
      if (validationError) {
        setErrorMessage(validationError);
        return;
      }
      setErrorMessage('');
      setPendingFileName(file.name);
      setPhase('rendering');
      setProgress(null);

      try {
        const sectionId = await ensureSectionId();

        let pages: RenderedPdfPage[];
        try {
          pages = await renderPdfToPngs(file, {
            onProgress: ({ current, total }) => setProgress({ current, total }),
          });
        } catch (err) {
          throw new Error(
            isPasswordError(err)
              ? 'This PDF is password-protected. Remove the password and try again.'
              : 'We couldn’t read this PDF — it may be damaged or in an unsupported format.',
          );
        }
        if (pages.length === 0) {
          throw new Error('We couldn’t find any pages in this PDF.');
        }

        setPhase('uploading');
        const totalUploads = pages.length + 1;
        setProgress({ current: 0, total: totalUploads });

        const { storagePath: pdfPath } = await upload(file, 'pdf-import', { notebookId });
        setProgress({ current: 1, total: totalUploads });

        const pageImagePaths: string[] = [];
        for (let i = 0; i < pages.length; i += 1) {
          const page = pages[i];
          const pngFile = new File([page.blob], `page-${page.pageNumber}.png`, {
            type: 'image/png',
          });
          const { storagePath } = await upload(pngFile, 'pdf-import', { notebookId });
          pageImagePaths.push(storagePath);
          setProgress({ current: i + 2, total: totalUploads });
        }

        setPhase('starting');
        const res = await fetch(`/api/notebooks/${notebookId}/pdf-import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sectionId, fileName: file.name, pdfPath, pageImagePaths }),
        });
        const json = (await res.json().catch(() => null)) as
          | { success?: boolean; error?: string; data?: { jobId?: string } }
          | null;
        if (!res.ok || !json?.success || !json.data?.jobId) {
          throw new Error(json?.error ?? 'We couldn’t start the import. Please try again.');
        }

        setJobId(json.data.jobId);
        setModalGeneration(0);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Import failed. Please try again.');
      } finally {
        setPhase('idle');
        setProgress(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [notebookId, upload, ensureSectionId],
  );

  const buttonLabel =
    phase === 'rendering'
      ? progress
        ? `Rendering page ${progress.current} / ${progress.total}`
        : 'Rendering PDF…'
      : phase === 'uploading'
        ? progress
          ? `Uploading ${progress.current} / ${progress.total}`
          : 'Uploading…'
        : 'Starting import…';

  return (
    <div style={{ padding: '8px 0' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'rgba(140,82,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 20, color: '#c4a9ff' }}
            aria-hidden
          >
            upload_file
          </span>
        </div>
        <div>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--on-surface)', margin: 0 }}>
            Import PDF
          </p>
          <p
            style={{
              fontSize: '11.5px',
              color: 'var(--ink-40)',
              margin: '2px 0 0',
            }}
          >
            Converted to a structured, editable page
          </p>
        </div>
      </div>

      <div
        style={{
          padding: '14px 16px',
          borderRadius: '10px',
          background: 'rgba(140,82,255,0.06)',
          border: '1px solid rgba(174,137,255,0.20)',
          marginBottom: '14px',
        }}
      >
        <p
          style={{
            fontSize: '12.5px',
            color: 'var(--ink-50)',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Your PDF is turned into a single editable page — headings, lists, tables, callouts, and
          figures are extracted as real, editable content rather than flat images. A new page is
          added to your notebook.
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      <button
        onClick={() => !busy && !jobId && fileInputRef.current?.click()}
        disabled={busy}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          width: '100%',
          marginTop: '4px',
          padding: '12px',
          borderRadius: '10px',
          border: 'none',
          cursor: busy ? 'progress' : 'pointer',
          fontFamily: 'inherit',
          fontSize: '14px',
          fontWeight: 600,
          background: 'rgba(140,82,255,0.8)',
          color: 'var(--on-surface)',
          opacity: busy ? 0.7 : 1,
          transition: 'opacity 0.15s ease',
        }}
      >
        {busy ? (
          <>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 16, animation: 'spin 1s linear infinite' }}
              aria-hidden
            >
              progress_activity
            </span>
            {buttonLabel}
          </>
        ) : (
          <>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
              upload_file
            </span>{' '}
            Choose PDF file
          </>
        )}
      </button>

      {errorMessage && (
        <p style={{ fontSize: '12px', color: '#fd6f85', margin: '8px 0 0', textAlign: 'center' }}>
          {errorMessage}
        </p>
      )}

      {jobId && (
        <PdfImportProgressModal
          key={`${jobId}:${modalGeneration}`}
          notebookId={notebookId}
          jobId={jobId}
          fileName={pendingFileName}
          onClose={onClose}
          onRetried={() => setModalGeneration((g) => g + 1)}
          onImported={onImported}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Shared UI components
// ═══════════════════════════════════════════════════════════════════

function CenteredMessage({ text, loading }: { text: string; loading?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        padding: '48px 0',
        color: 'var(--ink-40)',
        fontSize: '13px',
      }}
    >
      {loading && (
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 16, animation: 'spin 1s linear infinite' }}
          aria-hidden
        >
          progress_activity
        </span>
      )}
      {text}
      {loading && (
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      )}
    </div>
  );
}

function InstructionSteps({ steps }: { steps: string[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {steps.map((step, i) => (
        <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <div
            style={{
              width: '22px',
              height: '22px',
              borderRadius: '6px',
              background: 'rgba(140,82,255,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: '11px',
              fontWeight: 700,
              color: '#c4a9ff',
            }}
          >
            {i + 1}
          </div>
          <p
            style={{
              fontSize: '12.5px',
              color: 'var(--ink-50)',
              margin: 0,
              lineHeight: 1.5,
              paddingTop: '2px',
            }}
          >
            {step}
          </p>
        </div>
      ))}
    </div>
  );
}
