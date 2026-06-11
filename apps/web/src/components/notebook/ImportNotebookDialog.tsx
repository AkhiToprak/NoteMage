'use client';

import { useState, useEffect, useCallback } from 'react';
import { useModalDimensions } from '@/hooks/useModalDimensions';
import OneNoteImportProgressModal from './OneNoteImportProgressModal';
import PdfImportTab from './PdfImportTab';

interface ImportNotebookDialogProps {
  notebookId: string;
  onImported: () => void;
  onClose: () => void;
}

type TabType = 'onenote' | 'pdf';

interface OneNoteSection {
  id: string;
  displayName: string;
}

interface OneNoteNotebook {
  id: string;
  displayName: string;
  sections: OneNoteSection[];
}

// Phase 5 — the inline `importing`/`success` states are gone; the async job's
// progress + result now live in OneNoteImportProgressModal, mounted over the
// picker once a job is queued.
type OneNoteState = 'checking' | 'disconnected' | 'loading' | 'picker' | 'error';

// OneNote import is hidden from users for now — pending Microsoft publisher
// verification, which needs a registered business entity we don't have yet.
// All backend routes (/api/import/onenote/*), microsoftAuth, the OneNoteTab
// component below, and OneNoteImportProgressModal stay wired; flip this to true
// to restore the tab.
const ONENOTE_IMPORT_ENABLED: boolean = false;

// Import sources in display order. OneNote is prepended only when enabled
// (hidden by default — see ONENOTE_IMPORT_ENABLED); with it off, PDF is the
// only source and the tab bar collapses. GoodNotes/Apple Notes were dropped —
// both were just "export to PDF and upload", which the PDF importer does better.
const IMPORT_TABS: [TabType, string][] = [
  ...(ONENOTE_IMPORT_ENABLED ? ([['onenote', 'OneNote']] as [TabType, string][]) : []),
  ['pdf', 'PDF'],
];

export default function ImportNotebookDialog({
  notebookId,
  onImported,
  onClose,
}: ImportNotebookDialogProps) {
  // Default to the first rendered tab so IMPORT_TABS stays the single source of
  // truth (currently PDF; OneNote when the flag is on).
  const [activeTab, setActiveTab] = useState<TabType>(IMPORT_TABS[0][0]);
  // The PDF tab locks dismissal while files render/upload client-side —
  // closing then would silently abandon the remaining files.
  const [locked, setLocked] = useState(false);

  const requestClose = useCallback(() => {
    if (!locked) onClose();
  }, [locked, onClose]);

  const dims = useModalDimensions(540);

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
      onClick={requestClose}
    >
      <div
        style={{
          ...dims,
          background: '#1e1d35',
          border: '1px solid rgba(174,137,255,0.40)',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'inherit',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
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
            onClick={requestClose}
            disabled={locked}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(196,169,255,0.5)',
              cursor: locked ? 'not-allowed' : 'pointer',
              opacity: locked ? 0.4 : 1,
              width: '44px',
              height: '44px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              margin: '-10px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
              close
            </span>
          </button>
        </div>

        {/* Tabs — hidden when PDF is the only enabled source */}
        {IMPORT_TABS.length > 1 && (
          <div
            style={{
              display: 'flex',
              gap: '2px',
              padding: '10px 20px',
              borderBottom: '1px solid rgba(174,137,255,0.20)',
            }}
          >
            {/* Inline styles can't express pseudo-states; a scoped class gives the
                tabs their hover / focus-visible / active states and keeps motion on
                transform+opacity with spring easing (per the project motion rules). */}
            <style>{`
              .import-tab {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 7px 14px;
                border-radius: 8px;
                border: none;
                cursor: pointer;
                font-size: 12.5px;
                font-weight: 500;
                font-family: inherit;
                background: transparent;
                color: rgba(196, 169, 255, 0.5);
                transition:
                  transform 0.18s cubic-bezier(0.22, 1, 0.36, 1),
                  opacity 0.18s cubic-bezier(0.22, 1, 0.36, 1);
              }
              .import-tab:hover {
                color: #c4a9ff;
              }
              .import-tab:focus-visible {
                outline: 2px solid #c4a9ff;
                outline-offset: 2px;
              }
              .import-tab:active {
                transform: scale(0.96);
              }
              .import-tab[data-active='true'] {
                background: rgba(140, 82, 255, 0.2);
                color: #c4a9ff;
              }
              @media (prefers-reduced-motion: reduce) {
                .import-tab {
                  transition-duration: 0.05s;
                }
              }
            `}</style>
            {IMPORT_TABS.map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className="import-tab"
                data-active={activeTab === tab ? 'true' : undefined}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Tab content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', minHeight: '300px' }}>
          {activeTab === 'onenote' && (
            <OneNoteTab notebookId={notebookId} onImported={onImported} onClose={onClose} />
          )}
          {activeTab === 'pdf' && (
            <PdfImportTab
              notebookId={notebookId}
              onImported={onImported}
              onClose={onClose}
              onLockChange={setLocked}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// OneNote Tab
// ═══════════════════════════════════════════════════════════════════

function OneNoteTab({
  notebookId,
  onImported,
  onClose,
}: {
  notebookId: string;
  onImported: () => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<OneNoteState>('checking');
  const [notebooks, setNotebooks] = useState<OneNoteNotebook[]>([]);
  const [expandedNotebooks, setExpandedNotebooks] = useState<Set<string>>(new Set());
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  // Phase 5 — async trigger flow. Once the POST returns, `jobId` mounts the
  // progress modal over the picker; `starting` covers the brief queue-and-fire
  // POST; `startError` surfaces a failure to even queue the job, while the
  // picker stays put so the section selection survives.
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');

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

  // Queue-and-fire: POST the trigger, capture the jobId, and let
  // OneNoteImportProgressModal stream the worker over SSE. Doubles as the
  // modal's "Try again" handler — OneNote has no in-place retry, so a fresh
  // job re-imports the same selection. A failure here means the job never
  // queued, so drop any open modal and surface the error back in the picker
  // (the selection is preserved for an immediate re-try).
  const handleImport = useCallback(async () => {
    if (selectedSections.size === 0) return;
    setStarting(true);
    setStartError('');
    try {
      const res = await fetch('/api/import/onenote/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetNotebookId: notebookId,
          sectionIds: Array.from(selectedSections),
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        data?: { jobId?: string };
      } | null;
      if (!res.ok || !json?.success || !json.data?.jobId) {
        throw new Error(json?.error ?? 'We couldn’t start the import. Please try again.');
      }
      setJobId(json.data.jobId);
    } catch (err) {
      setJobId(null);
      setStartError(
        err instanceof Error ? err.message : 'We couldn’t start the import. Please try again.'
      );
    } finally {
      setStarting(false);
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
  const canImport = selectedSections.size > 0 && !starting;
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
            marginTop: '16px',
            paddingTop: '12px',
            borderTop: '1px solid rgba(174,137,255,0.20)',
          }}
        >
          {startError && (
            <p
              role="alert"
              style={{
                fontSize: '12px',
                color: 'var(--error)',
                margin: '0 0 10px',
                textAlign: 'center',
                lineHeight: 1.5,
              }}
            >
              {startError}
            </p>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleImport}
              disabled={!canImport}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 18px',
                borderRadius: '8px',
                border: 'none',
                background: canImport ? '#8c52ff' : 'rgba(140,82,255,0.2)',
                color: canImport ? 'var(--on-surface)' : 'rgba(196,169,255,0.4)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: starting ? 'progress' : canImport ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
              }}
            >
              {starting ? (
                <>
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 14, animation: 'spin 1s linear infinite' }}
                    aria-hidden
                  >
                    progress_activity
                  </span>
                  Starting…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>
                    upload
                  </span>
                  Import{selectedSections.size > 0 ? ` (${selectedSections.size})` : ''}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Async progress modal — overlays the picker once a job is queued.
          onRetry re-fires handleImport (fresh job); onClose dismisses the
          whole import dialog, matching the PDF flow. */}
      {jobId && (
        <OneNoteImportProgressModal
          notebookId={notebookId}
          jobId={jobId}
          sectionCount={selectedSections.size}
          onClose={onClose}
          onRetry={handleImport}
          onImported={onImported}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
