'use client';

import { useState, useRef, useCallback, useEffect, type DragEvent, type ChangeEvent } from 'react';
import { useDirectUpload } from '@/hooks/useDirectUpload';
import { useModalDimensions } from '@/hooks/useModalDimensions';
import { validateFile } from '@/lib/file-validation';
import ImportSectionPicker, {
  type DraftSection,
  type SectionOption,
} from './ImportSectionPicker';

// Section-level file import. Picking a file no longer imports it straight
// into the section the menu was opened from — an organize mask first lets
// the user name the resulting page and choose (or create) the destination
// section. PPTX is the exception for naming: each slide becomes its own
// titled page, so the page-name field is replaced by a note.

interface FileImportDialogProps {
  notebookId: string;
  /** Section the import menu was opened from — the picker's default. */
  sectionId: string;
  onImported: () => void;
  onClose: () => void;
}

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.txt,.md,.pptx,.xlsx,.xls';

type UploadState = 'idle' | 'organize' | 'uploading' | 'success' | 'error';

function stripExtension(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^./\\]+$/, '').trim();
  return withoutExt.length > 0 ? withoutExt : 'Imported File';
}

function isPptx(file: File): boolean {
  return (
    file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  );
}

function isExcel(file: File): boolean {
  return (
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel'
  );
}

export default function FileImportDialog({
  notebookId,
  sectionId,
  onImported,
  onClose,
}: FileImportDialogProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [targetSectionId, setTargetSectionId] = useState(sectionId);
  const [errorMessage, setErrorMessage] = useState('');

  // null = loading. Drafts are picker-created sections, made real on import.
  const [sections, setSections] = useState<SectionOption[] | null>(null);
  const [drafts, setDrafts] = useState<DraftSection[]>([]);
  const draftCounter = useRef(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload } = useDirectUpload();
  const dims = useModalDimensions(480);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/sections`);
        const json = await res.json();
        if (cancelled) return;
        if (json?.success && Array.isArray(json.data)) {
          setSections(
            json.data.map((s: { id: string; title: string; parentId?: string | null }) => ({
              id: s.id,
              title: s.title,
              parentId: s.parentId ?? null,
            })),
          );
        } else {
          setSections([{ id: sectionId, title: 'Current section', parentId: null }]);
        }
      } catch {
        // The list failing to load must not block the import — fall back to
        // the section the menu was opened from.
        if (!cancelled) {
          setSections([{ id: sectionId, title: 'Current section', parentId: null }]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notebookId, sectionId]);

  const createDraft = useCallback((draftTitle: string): string => {
    draftCounter.current += 1;
    const id = `draft:${draftCounter.current}`;
    setDrafts((prev) => [...prev, { id, title: draftTitle }]);
    return id;
  }, []);

  const handleFile = useCallback((picked: File) => {
    const validationError = validateFile(picked, 'section-import');
    if (validationError) {
      setErrorMessage(validationError);
      setUploadState('error');
      return;
    }
    setFile(picked);
    setTitle(stripExtension(picked.name));
    setErrorMessage('');
    setUploadState('organize');
  }, []);

  const handleImport = useCallback(async () => {
    if (!file) return;
    setUploadState('uploading');
    setErrorMessage('');

    try {
      // A drafted section becomes real only now, when the import commits.
      let resolvedSectionId = targetSectionId;
      if (resolvedSectionId.startsWith('draft:')) {
        const draft = drafts.find((d) => d.id === resolvedSectionId);
        if (!draft) throw new Error('Pick a section and try again.');
        const res = await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/sections`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: draft.title }),
        });
        const json = await res.json().catch(() => null);
        if (!json?.success || !json?.data?.id) {
          throw new Error(json?.error ?? `Couldn’t create the section “${draft.title}”.`);
        }
        const realId = json.data.id as string;
        setSections((prev) => [...(prev ?? []), { id: realId, title: draft.title, parentId: null }]);
        setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
        setTargetSectionId(realId);
        resolvedSectionId = realId;
      }

      // Upload directly to Supabase Storage
      const { storagePath } = await upload(file, 'section-import', {
        notebookId,
        sectionId: resolvedSectionId,
      });

      const importPath = isPptx(file) ? 'import-pptx' : isExcel(file) ? 'import-xlsx' : 'import';

      const res = await fetch(
        `/api/notebooks/${notebookId}/sections/${resolvedSectionId}/${importPath}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storagePath,
            fileName: file.name,
            fileType: file.type,
            // PPTX imports title each slide themselves.
            ...(importPath === 'import-pptx' ? {} : { title: title.trim() || undefined }),
          }),
        },
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
      setUploadState('organize');
    }
  }, [file, title, targetSectionId, drafts, notebookId, onImported, upload]);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);

      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFile(dropped);
    },
    [handleFile],
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
      const picked = e.target.files?.[0];
      if (picked) handleFile(picked);
      e.target.value = '';
    },
    [handleFile],
  );

  const handleZoneClick = useCallback(() => {
    if (uploadState === 'idle' || uploadState === 'error') {
      fileInputRef.current?.click();
    }
  }, [uploadState]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget && uploadState !== 'uploading') {
        onClose();
      }
    },
    [onClose, uploadState],
  );

  const resetToPick = useCallback(() => {
    setFile(null);
    setTitle('');
    setErrorMessage('');
    setUploadState('idle');
  }, []);

  const showDropZone = uploadState === 'idle' || uploadState === 'error';
  const busy = uploadState === 'uploading';
  const sectionsReady = sections !== null;
  const pptx = file !== null && isPptx(file);

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
          ...dims,
          background: 'var(--background)',
          border: '1px solid rgba(174,137,255,0.36)',
          padding: '24px',
          fontFamily: 'inherit',
          color: 'var(--on-surface)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
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
            Import File
          </h2>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              background: 'none',
              border: 'none',
              cursor: busy ? 'not-allowed' : 'pointer',
              padding: '4px',
              borderRadius: '6px',
              color: 'var(--ink-50)',
              opacity: busy ? 0.4 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s ease, background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (busy) return;
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

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleInputChange}
          style={{ display: 'none' }}
        />

        {showDropZone && (
          <div
            onClick={handleZoneClick}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            style={{
              border: `2px dashed ${dragOver ? 'rgba(140,82,255,0.5)' : 'rgba(140,82,255,0.2)'}`,
              borderRadius: '12px',
              padding: '40px 20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              cursor: 'pointer',
              background: dragOver ? 'rgba(140,82,255,0.06)' : 'rgba(140,82,255,0.02)',
              transition: 'border-color 0.2s ease, background 0.2s ease',
              minHeight: '180px',
            }}
          >
            {uploadState === 'idle' ? (
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
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 24, color: '#8c52ff' }}
                    aria-hidden
                  >
                    upload_file
                  </span>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p
                    style={{
                      margin: '0 0 4px 0',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--on-surface)',
                    }}
                  >
                    Drag a file here or click to browse
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '12px',
                      color: 'var(--ink-40)',
                    }}
                  >
                    PDF, DOCX, PPTX, XLSX, TXT, MD — max 10MB
                  </p>
                </div>
              </>
            ) : (
              <>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 28, color: 'var(--error)' }}
                  aria-hidden
                >
                  error
                </span>
                <div style={{ textAlign: 'center' }}>
                  <p
                    style={{
                      margin: '0 0 4px 0',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--error)',
                    }}
                  >
                    {errorMessage}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '12px',
                      color: 'var(--ink-40)',
                    }}
                  >
                    Click to try again
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {!showDropZone && uploadState !== 'success' && file && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Picked file chip */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: '10px',
                background: 'rgba(140,82,255,0.06)',
                border: '1px solid rgba(140,82,255,0.15)',
              }}
            >
              <span
                className="material-symbols-outlined"
                aria-hidden
                style={{ fontSize: 18, color: '#8c52ff', flexShrink: 0 }}
              >
                {file.type === 'application/pdf' ? 'picture_as_pdf' : 'description'}
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
                {file.name}
              </span>
              <button
                type="button"
                aria-label="Choose a different file"
                onClick={resetToPick}
                disabled={busy}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  flexShrink: 0,
                  borderRadius: '999px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--ink-50)',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  transition: 'color 0.15s ease, background 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (busy) return;
                  e.currentTarget.style.color = 'var(--on-surface)';
                  e.currentTarget.style.background = 'rgba(140,82,255,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--ink-50)';
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
                  close
                </span>
              </button>
            </div>

            {/* Page name — PPTX slides title themselves */}
            {pptx ? (
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--ink-40)', lineHeight: 1.5 }}>
                Each slide becomes its own page, titled after the slide.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label
                  htmlFor="file-import-title"
                  style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ink-50)' }}
                >
                  Page name
                </label>
                <input
                  id="file-import-title"
                  type="text"
                  value={title}
                  maxLength={200}
                  placeholder={stripExtension(file.name)}
                  disabled={busy}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '9px 11px',
                    borderRadius: '10px',
                    border: '1px solid rgba(140,82,255,0.2)',
                    background: 'rgba(140,82,255,0.04)',
                    color: 'var(--on-surface)',
                    fontSize: '13px',
                    fontWeight: 600,
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
              </div>
            )}

            {/* Destination section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ink-50)' }}>
                Import into
              </span>
              {sectionsReady ? (
                <ImportSectionPicker
                  sections={sections}
                  drafts={drafts}
                  value={targetSectionId}
                  onChange={setTargetSectionId}
                  onCreateDraft={createDraft}
                  disabled={busy}
                  ariaLabel="Section to import into"
                />
              ) : (
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--ink-40)' }}>
                  Loading sections…
                </p>
              )}
            </div>

            {errorMessage && (
              <p
                role="alert"
                style={{
                  margin: 0,
                  fontSize: '12px',
                  color: 'var(--error)',
                  lineHeight: 1.5,
                }}
              >
                {errorMessage}
              </p>
            )}
          </div>
        )}

        {uploadState === 'success' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              minHeight: '160px',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 28, color: '#4ade80' }}
              aria-hidden
            >
              check_circle
            </span>
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
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            marginTop: '16px',
          }}
        >
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              background: 'rgba(140,82,255,0.08)',
              border: '1px solid rgba(140,82,255,0.15)',
              borderRadius: '8px',
              padding: '8px 20px',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: 'inherit',
              color: 'var(--ink-70)',
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.5 : 1,
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (busy) return;
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
          {(uploadState === 'organize' || uploadState === 'uploading') && (
            <button
              onClick={handleImport}
              disabled={busy || !sectionsReady}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#8c52ff',
                border: '1px solid transparent',
                borderRadius: '8px',
                padding: '8px 20px',
                fontSize: '13px',
                fontWeight: 600,
                fontFamily: 'inherit',
                color: 'var(--on-surface)',
                cursor: busy || !sectionsReady ? 'progress' : 'pointer',
                opacity: busy || !sectionsReady ? 0.7 : 1,
                transition: 'opacity 0.15s ease',
              }}
            >
              {busy ? (
                <>
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 14, animation: 'spin 1s linear infinite' }}
                    aria-hidden
                  >
                    progress_activity
                  </span>
                  Importing…
                </>
              ) : (
                'Import'
              )}
            </button>
          )}
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
