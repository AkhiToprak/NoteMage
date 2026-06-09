'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDirectUpload } from '@/hooks/useDirectUpload';
import { useImportJobStream } from '@/hooks/useImportJobStream';
import { validateFile } from '@/lib/file-validation';
import { renderPdfToPngs, type RenderedPdfPage } from '@/lib/pdf-client-render';
import ImportSectionPicker, {
  type DraftSection,
  type SectionOption,
} from './ImportSectionPicker';
import PdfImportProgressModal from './PdfImportProgressModal';

// PDF tab of ImportNotebookDialog — pick one or more PDFs, then organize the
// import before it starts: name each resulting page and choose (or create)
// the section it lands in. Each file becomes one job/page, so one import can
// fan out across different sections.
//
// Flow: pick → organize → preparing (client render + upload, dialog locked)
// → tracking. A single job reuses PdfImportProgressModal; multiple jobs get
// a per-row progress list, each row streaming its own job over SSE.

/** Matches the pdf-import rate limit (10 jobs / minute). */
const MAX_FILES = 10;

interface ImportItem {
  key: string;
  file: File;
  title: string;
  /** Section id or draft id; '' until the section list has loaded. */
  sectionId: string;
}

interface StartedJob {
  key: string;
  /** Null when the job never queued (render/upload/POST failed client-side). */
  jobId: string | null;
  error: string | null;
  fileName: string;
  title: string;
}

type Phase = 'pick' | 'organize' | 'preparing' | 'tracking';

/** pdfjs raises a `PasswordException` for encrypted PDFs. */
function isPasswordError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /password/i.test(`${err.name} ${err.message}`);
}

/** Page title from the file name, extension stripped. */
function stripExtension(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^./\\]+$/, '').trim();
  return withoutExt.length > 0 ? withoutExt : 'Imported PDF';
}

interface PdfImportTabProps {
  notebookId: string;
  onImported: () => void;
  onClose: () => void;
  /** Locks the parent dialog's dismiss controls while client-side
   *  render/upload work would be lost by closing. */
  onLockChange: (locked: boolean) => void;
}

export default function PdfImportTab({
  notebookId,
  onImported,
  onClose,
  onLockChange,
}: PdfImportTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload } = useDirectUpload();

  const [phase, setPhase] = useState<Phase>('pick');
  const [items, setItems] = useState<ImportItem[]>([]);
  const [mode, setMode] = useState<'rich' | 'fast'>('rich');
  const [error, setError] = useState('');

  // null = still loading. Drafts are sections the user named in the picker;
  // they are created for real only when the import starts.
  const [sections, setSections] = useState<SectionOption[] | null>(null);
  const [sectionsError, setSectionsError] = useState('');
  const [drafts, setDrafts] = useState<DraftSection[]>([]);
  const idCounter = useRef(0);

  const [prepLabel, setPrepLabel] = useState('');
  const [jobs, setJobs] = useState<StartedJob[]>([]);
  const [settled, setSettled] = useState<Record<string, 'ready' | 'failed'>>({});
  const [singleJob, setSingleJob] = useState<{ jobId: string; fileName: string } | null>(null);
  const [modalGeneration, setModalGeneration] = useState(0);

  // Closing the dialog mid-prep would abandon files that are still rendering
  // or uploading in this tab. Queued jobs run server-side, so every other
  // phase is safe to dismiss.
  useEffect(() => {
    onLockChange(phase === 'preparing');
    return () => onLockChange(false);
  }, [phase, onLockChange]);

  const [sectionsAttempt, setSectionsAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setSectionsError('');
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
          setSectionsError('Could not load this notebook’s sections.');
        }
      } catch {
        if (!cancelled) setSectionsError('Could not load this notebook’s sections.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notebookId, sectionsAttempt]);

  // A notebook with no sections still needs a destination — seed a draft.
  useEffect(() => {
    if (sections && sections.length === 0) {
      setDrafts((prev) => (prev.length > 0 ? prev : [{ id: 'draft:imports', title: 'Imports' }]));
    }
  }, [sections]);

  const defaultSectionId =
    sections && sections.length > 0 ? sections[0].id : (drafts[0]?.id ?? '');

  // Items picked before the section list arrived get the default once known.
  useEffect(() => {
    if (!defaultSectionId) return;
    setItems((prev) =>
      prev.some((it) => !it.sectionId)
        ? prev.map((it) => (it.sectionId ? it : { ...it, sectionId: defaultSectionId }))
        : prev,
    );
  }, [defaultSectionId]);

  const addFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      const problems: string[] = [];
      const added: ImportItem[] = [];
      for (const file of Array.from(list)) {
        const validationError = validateFile(file, 'pdf-import');
        if (validationError) {
          problems.push(`${file.name}: ${validationError}`);
          continue;
        }
        idCounter.current += 1;
        added.push({
          key: `item-${idCounter.current}`,
          file,
          title: stripExtension(file.name),
          sectionId: defaultSectionId,
        });
      }
      setItems((prev) => {
        const room = MAX_FILES - prev.length;
        if (added.length > room) {
          problems.push(`Only ${MAX_FILES} PDFs per import — the extra files were skipped.`);
        }
        return [...prev, ...added.slice(0, Math.max(0, room))];
      });
      setError(problems.join(' '));
      if (added.length > 0) setPhase('organize');
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [defaultSectionId],
  );

  const createDraft = useCallback((title: string): string => {
    idCounter.current += 1;
    const id = `draft:${idCounter.current}`;
    setDrafts((prev) => [...prev, { id, title }]);
    return id;
  }, []);

  const updateItem = useCallback((key: string, patch: Partial<ImportItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((prev) => {
      const next = prev.filter((it) => it.key !== key);
      if (next.length === 0) setPhase('pick');
      return next;
    });
  }, []);

  const startImport = useCallback(async () => {
    if (items.length === 0) return;
    setPhase('preparing');
    setError('');
    try {
      // Create each draft section that is actually used, then swap the
      // draft ids for real ones in local state so a later failure leaves
      // the organize step consistent.
      const usedDraftIds = new Set(
        items.map((it) => it.sectionId || defaultSectionId).filter((id) => id.startsWith('draft:')),
      );
      const draftMap = new Map<string, string>();
      for (const draft of drafts) {
        if (!usedDraftIds.has(draft.id)) continue;
        setPrepLabel(`Creating section “${draft.title}”…`);
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
        draftMap.set(draft.id, realId);
        setSections((prev) => [...(prev ?? []), { id: realId, title: draft.title, parentId: null }]);
        setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
        setItems((prev) =>
          prev.map((it) => (it.sectionId === draft.id ? { ...it, sectionId: realId } : it)),
        );
      }

      const started: StartedJob[] = [];
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        const fileLabel =
          items.length > 1 ? `File ${i + 1} of ${items.length}` : 'Preparing your PDF';
        const title = item.title.trim() || stripExtension(item.file.name);
        try {
          setPrepLabel(`${fileLabel} — reading PDF…`);
          let pages: RenderedPdfPage[];
          try {
            pages = await renderPdfToPngs(item.file, {
              onProgress: ({ current, total }) =>
                setPrepLabel(`${fileLabel} — rendering page ${current} / ${total}`),
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

          const totalUploads = pages.length + 1;
          setPrepLabel(`${fileLabel} — uploading 1 / ${totalUploads}`);
          const { storagePath: pdfPath } = await upload(item.file, 'pdf-import', { notebookId });
          const pageImagePaths: string[] = [];
          for (let p = 0; p < pages.length; p += 1) {
            const page = pages[p];
            const pngFile = new File([page.blob], `page-${page.pageNumber}.png`, {
              type: 'image/png',
            });
            const { storagePath } = await upload(pngFile, 'pdf-import', { notebookId });
            pageImagePaths.push(storagePath);
            setPrepLabel(`${fileLabel} — uploading ${p + 2} / ${totalUploads}`);
          }

          const rawSectionId = item.sectionId || defaultSectionId;
          const sectionId = rawSectionId.startsWith('draft:')
            ? draftMap.get(rawSectionId)
            : rawSectionId;
          if (!sectionId) throw new Error('Pick a section for this PDF and try again.');

          setPrepLabel(`${fileLabel} — starting import…`);
          const res = await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/pdf-import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sectionId,
              fileName: item.file.name,
              pdfPath,
              pageImagePaths,
              mode,
              pageTitle: title,
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
          started.push({
            key: item.key,
            jobId: json.data.jobId,
            error: null,
            fileName: item.file.name,
            title,
          });
        } catch (err) {
          started.push({
            key: item.key,
            jobId: null,
            error: err instanceof Error ? err.message : 'Import failed. Please try again.',
            fileName: item.file.name,
            title,
          });
        }
      }

      const queued = started.filter((j) => j.jobId !== null);
      if (queued.length === 0) {
        setPhase('organize');
        setError(started[0]?.error ?? 'Import failed. Please try again.');
        return;
      }
      if (started.length === 1 && queued.length === 1) {
        // Single file — reuse the full-screen progress modal (mascot, retry,
        // truncation notices). It overlays this tab until close.
        setSingleJob({ jobId: queued[0].jobId as string, fileName: queued[0].fileName });
        setModalGeneration(0);
        setPhase('organize');
        return;
      }
      setJobs(started);
      setSettled({});
      setPhase('tracking');
    } catch (err) {
      setPhase('organize');
      setError(err instanceof Error ? err.message : 'Import failed. Please try again.');
    } finally {
      setPrepLabel('');
    }
  }, [items, drafts, defaultSectionId, mode, notebookId, upload]);

  const handleRowSettled = useCallback((key: string, status: 'ready' | 'failed' | null) => {
    setSettled((prev) => {
      if (status === null) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      if (prev[key] === status) return prev;
      return { ...prev, [key]: status };
    });
  }, []);

  // ── Render ──

  if (sectionsError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '32px 0' }}>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--error)', textAlign: 'center' }}>
          {sectionsError}
        </p>
        <button
          type="button"
          onClick={() => setSectionsAttempt((n) => n + 1)}
          className="nm-pdftab-btn nm-pdftab-btn--ghost"
        >
          Retry
        </button>
        <PdfTabButtonStyles />
      </div>
    );
  }

  if (phase === 'preparing') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          padding: '40px 0',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 26, color: 'var(--primary)', animation: 'spin 1s linear infinite' }}
          aria-hidden
        >
          progress_activity
        </span>
        <p
          aria-live="polite"
          style={{ margin: 0, fontSize: '13.5px', color: 'var(--on-surface-variant)', textAlign: 'center' }}
        >
          {prepLabel || 'Preparing your import…'}
        </p>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--outline)', textAlign: 'center' }}>
          Keep this dialog open while your files upload.
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (phase === 'tracking') {
    const allSettled = jobs.every((job) => job.jobId === null || settled[job.key] !== undefined);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '4px 0' }}>
        <header style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--on-surface)' }}>
            Importing {jobs.length} PDFs
          </h3>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
            Imports keep running in the background if you close this dialog.
          </p>
        </header>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {jobs.map((job) => (
            <ImportJobRow
              key={job.key}
              notebookId={notebookId}
              job={job}
              onImported={onImported}
              onSettled={handleRowSettled}
            />
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            className="nm-pdftab-btn nm-pdftab-btn--primary"
          >
            {allSettled ? 'Done' : 'Close'}
          </button>
        </div>
        <PdfTabButtonStyles />
      </div>
    );
  }

  if (phase === 'organize') {
    const sectionsReady = sections !== null && defaultSectionId !== '';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '4px 0' }}>
        <header style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--on-surface)' }}>
            Organize your import
          </h3>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
            Name each page and choose the section it goes into.
          </p>
        </header>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            maxHeight: '40vh',
            overflowY: 'auto',
            paddingRight: '2px',
          }}
        >
          {items.map((item) => (
            <div
              key={item.key}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '12px',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--surface-container-high)',
                border: '1px solid var(--outline-variant)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                    fontSize: '12px',
                    color: 'var(--on-surface-variant)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.file.name}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${item.file.name}`}
                  onClick={() => removeItem(item.key)}
                  className="nm-pdftab-remove"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '24px',
                    height: '24px',
                    flexShrink: 0,
                    borderRadius: 'var(--radius-full)',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--on-surface-variant)',
                    cursor: 'pointer',
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
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }} aria-hidden>
                    close
                  </span>
                </button>
              </div>

              <input
                type="text"
                value={item.title}
                maxLength={200}
                placeholder={stripExtension(item.file.name)}
                aria-label={`Page name for ${item.file.name}`}
                onChange={(e) => updateItem(item.key, { title: e.target.value })}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--outline-variant)',
                  background: 'var(--surface-container)',
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

              {sectionsReady ? (
                <ImportSectionPicker
                  sections={sections}
                  drafts={drafts}
                  value={item.sectionId || defaultSectionId}
                  onChange={(id) => updateItem(item.key, { sectionId: id })}
                  onCreateDraft={createDraft}
                  ariaLabel={`Section for ${item.file.name}`}
                />
              ) : (
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--on-surface-variant)' }}>
                  Loading sections…
                </p>
              )}
            </div>
          ))}

          {items.length < MAX_FILES && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="nm-pdftab-add"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '7px',
                padding: '10px',
                borderRadius: 'var(--radius-lg)',
                border: '1.5px dashed var(--outline-variant)',
                background: 'transparent',
                color: 'var(--on-surface-variant)',
                fontSize: '12.5px',
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
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
              <span className="material-symbols-outlined" style={{ fontSize: '17px' }} aria-hidden>
                add
              </span>
              Add more PDFs
            </button>
          )}
        </div>

        <FastModeToggle mode={mode} onChange={setMode} disabled={false} />

        {error && (
          <p
            role="alert"
            style={{
              margin: 0,
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(253,111,133,0.12)',
              color: 'var(--error)',
              fontSize: '12.5px',
              lineHeight: 1.5,
            }}
          >
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={() => {
              setItems([]);
              setError('');
              setPhase('pick');
            }}
            className="nm-pdftab-btn nm-pdftab-btn--ghost"
          >
            Back
          </button>
          <button
            type="button"
            onClick={startImport}
            disabled={!sectionsReady || items.length === 0}
            className="nm-pdftab-btn nm-pdftab-btn--primary"
            style={{ flex: 1 }}
          >
            Import {items.length} {items.length === 1 ? 'page' : 'pages'}
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => addFiles(e.target.files)}
        />
        <PdfTabButtonStyles />

        {singleJob && (
          <PdfImportProgressModal
            key={`${singleJob.jobId}:${modalGeneration}`}
            notebookId={notebookId}
            jobId={singleJob.jobId}
            fileName={singleJob.fileName}
            onClose={onClose}
            onRetried={() => setModalGeneration((g) => g + 1)}
            onImported={onImported}
          />
        )}
      </div>
    );
  }

  // phase === 'pick'
  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
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
        <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--on-surface)', margin: 0 }}>
          Import PDFs
        </p>
      </div>

      <p style={{ fontSize: '12px', color: 'var(--ink-40)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Coming from GoodNotes, Apple Notes, or OneNote? Export your notes as PDF, then import the
        files here. Each PDF becomes one page — you’ll name it and pick its section next.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => addFiles(e.target.files)}
      />

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="nm-pdftab-btn nm-pdftab-btn--primary"
        style={{ width: '100%', padding: '12px' }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
          upload_file
        </span>
        Choose PDF files
      </button>

      {error && (
        <p style={{ fontSize: '12px', color: 'var(--error)', margin: '8px 0 0', textAlign: 'center' }}>
          {error}
        </p>
      )}
      <PdfTabButtonStyles />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Fast-mode toggle (P6) — same semantics as before: rich (vision) vs
// fast (text-layer); applies to every file in this import.
// ─────────────────────────────────────────────────────────────────────

function FastModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: 'rich' | 'fast';
  onChange: (mode: 'rich' | 'fast') => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={mode === 'fast'}
      onClick={() => onChange(mode === 'fast' ? 'rich' : 'fast')}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
        padding: '10px 12px',
        borderRadius: '10px',
        border: `1px solid ${mode === 'fast' ? 'rgba(174,137,255,0.5)' : 'rgba(174,137,255,0.20)'}`,
        background: mode === 'fast' ? 'rgba(174,137,255,0.12)' : 'rgba(140,82,255,0.06)',
        color: 'var(--on-surface)',
        textAlign: 'left',
        fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'border-color 0.2s ease, background 0.2s ease',
      }}
    >
      <span
        className="material-symbols-outlined"
        aria-hidden="true"
        style={{
          fontSize: '18px',
          color: mode === 'fast' ? '#c4a9ff' : 'rgba(196,169,255,0.6)',
          flexShrink: 0,
        }}
      >
        bolt
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ fontSize: '12.5px', fontWeight: 600 }}>Fast mode (only text)</span>
      </span>
      <span
        aria-hidden="true"
        style={{
          position: 'relative',
          width: '30px',
          height: '18px',
          borderRadius: '999px',
          background: mode === 'fast' ? '#8c52ff' : 'rgba(196,169,255,0.18)',
          flexShrink: 0,
          transition: 'background 0.2s ease',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '2px',
            left: '2px',
            width: '14px',
            height: '14px',
            borderRadius: '999px',
            background: 'var(--on-surface)',
            transform: mode === 'fast' ? 'translateX(12px)' : 'translateX(0)',
            transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
          }}
        />
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Per-job progress rows for multi-file imports. Each row streams its own
// job; retry re-queues the same job and remounts the stream.
// ─────────────────────────────────────────────────────────────────────

function ImportJobRow({
  notebookId,
  job,
  onImported,
  onSettled,
}: {
  notebookId: string;
  job: StartedJob;
  onImported: () => void;
  onSettled: (key: string, status: 'ready' | 'failed' | null) => void;
}) {
  const [generation, setGeneration] = useState(0);

  if (job.jobId === null) {
    return (
      <JobRowShell icon="error" iconColor="var(--error)" title={job.title} fileName={job.fileName}>
        <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--error)', lineHeight: 1.45 }}>
          {job.error ?? 'This file could not be imported.'}
        </p>
      </JobRowShell>
    );
  }

  return (
    <ImportJobRowStream
      key={generation}
      notebookId={notebookId}
      jobKey={job.key}
      jobId={job.jobId}
      title={job.title}
      fileName={job.fileName}
      onImported={onImported}
      onSettled={onSettled}
      onRetried={() => {
        onSettled(job.key, null);
        setGeneration((g) => g + 1);
      }}
    />
  );
}

function ImportJobRowStream({
  notebookId,
  jobKey,
  jobId,
  title,
  fileName,
  onImported,
  onSettled,
  onRetried,
}: {
  notebookId: string;
  jobKey: string;
  jobId: string;
  title: string;
  fileName: string;
  onImported: () => void;
  onSettled: (key: string, status: 'ready' | 'failed' | null) => void;
  onRetried: () => void;
}) {
  const stream = useImportJobStream(notebookId, jobId, true);
  const [retrying, setRetrying] = useState(false);
  const importedFiredRef = useRef(false);

  const isReady = stream.status === 'ready';
  const isFailed = stream.status === 'failed';

  useEffect(() => {
    if (isReady && !importedFiredRef.current) {
      importedFiredRef.current = true;
      onImported();
    }
  }, [isReady, onImported]);

  useEffect(() => {
    if (isReady) onSettled(jobKey, 'ready');
    else if (isFailed) onSettled(jobKey, 'failed');
  }, [isReady, isFailed, jobKey, onSettled]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const res = await fetch(
        `/api/notebooks/${encodeURIComponent(notebookId)}/pdf-import/${encodeURIComponent(jobId)}/retry`,
        { method: 'POST' },
      );
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        onRetried();
        return;
      }
    } catch {
      /* fall through — keep the failed row */
    }
    setRetrying(false);
  };

  const totalPages = stream.progress?.totalPages ?? 0;
  const processedPages = stream.progress?.processedPages ?? 0;
  const percent = totalPages > 0 ? Math.min(100, Math.round((processedPages / totalPages) * 100)) : 0;

  const icon = isReady ? 'check_circle' : isFailed ? 'error' : 'progress_activity';
  const iconColor = isReady ? '#4ade80' : isFailed ? 'var(--error)' : 'var(--primary)';

  return (
    <JobRowShell icon={icon} iconColor={iconColor} title={title} fileName={fileName} spinning={!isReady && !isFailed}>
      {!isReady && !isFailed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            role="progressbar"
            aria-valuenow={processedPages}
            aria-valuemin={0}
            aria-valuemax={totalPages}
            aria-label={`Import progress for ${title}`}
            style={{
              flex: 1,
              height: '5px',
              background: 'var(--surface-container-highest)',
              borderRadius: '999px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                transform: `scaleX(${percent / 100})`,
                transformOrigin: 'left',
                background: 'var(--primary)',
                borderRadius: '999px',
                transition: 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          </div>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--on-surface-variant)',
              fontVariantNumeric: 'tabular-nums',
              flexShrink: 0,
            }}
          >
            {totalPages > 0 ? `${processedPages}/${totalPages}` : '…'}
          </span>
        </div>
      )}

      {isFailed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <p style={{ margin: 0, flex: 1, minWidth: 0, fontSize: '11.5px', color: 'var(--error)', lineHeight: 1.45 }}>
            {stream.errorMessage ?? 'Import failed.'}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="nm-pdftab-btn nm-pdftab-btn--ghost"
            style={{ padding: '5px 12px', fontSize: '11.5px' }}
          >
            {retrying ? 'Retrying…' : 'Try again'}
          </button>
        </div>
      )}

      {isReady && stream.resultPageId && (
        <Link
          href={`/notebooks/${encodeURIComponent(notebookId)}/pages/${encodeURIComponent(stream.resultPageId)}`}
          className="nm-pdftab-openlink"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            alignSelf: 'flex-start',
            fontSize: '11.5px',
            fontWeight: 700,
            color: 'var(--primary)',
            textDecoration: 'none',
          }}
        >
          Open page
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '14px' }}>
            arrow_forward
          </span>
        </Link>
      )}
    </JobRowShell>
  );
}

function JobRowShell({
  icon,
  iconColor,
  title,
  fileName,
  spinning = false,
  children,
}: {
  icon: string;
  iconColor: string;
  title: string;
  fileName: string;
  spinning?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '7px',
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-container-high)',
        border: '1px solid var(--outline-variant)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          className="material-symbols-outlined"
          aria-hidden="true"
          style={{
            fontSize: '17px',
            color: iconColor,
            flexShrink: 0,
            animation: spinning ? 'spin 1s linear infinite' : undefined,
          }}
        >
          {icon}
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: '12.5px',
            fontWeight: 600,
            color: 'var(--on-surface)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        <span
          style={{
            maxWidth: '40%',
            fontSize: '11px',
            color: 'var(--on-surface-variant)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {fileName}
        </span>
      </div>
      {children}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Shared CTA styling for this tab — hover / focus-visible / active states
// can't live in inline styles, so a scoped class block carries them.
function PdfTabButtonStyles() {
  return (
    <style>{`
      .nm-pdftab-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        padding: 10px 18px;
        border-radius: var(--radius-full);
        font-size: 13px;
        font-weight: 700;
        font-family: inherit;
        line-height: 1;
        cursor: pointer;
        border: 1px solid transparent;
        transition: transform 0.16s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.16s ease;
      }
      .nm-pdftab-btn:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
      .nm-pdftab-btn:active:not(:disabled) {
        transform: scale(0.97);
      }
      .nm-pdftab-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .nm-pdftab-btn--primary {
        background: var(--primary);
        color: var(--on-primary);
      }
      .nm-pdftab-btn--primary:hover:not(:disabled) {
        background: var(--primary-dim);
      }
      .nm-pdftab-btn--ghost {
        background: transparent;
        color: var(--on-surface-variant);
        border-color: var(--outline-variant);
      }
      .nm-pdftab-btn--ghost:hover:not(:disabled) {
        background: var(--surface-container-high);
        color: var(--on-surface);
      }
      .nm-pdftab-remove:focus-visible,
      .nm-pdftab-add:focus-visible,
      .nm-pdftab-openlink:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
      .nm-pdftab-openlink:hover {
        text-decoration: underline;
      }
    `}</style>
  );
}
