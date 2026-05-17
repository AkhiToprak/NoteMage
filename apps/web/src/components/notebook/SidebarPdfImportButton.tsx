'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDirectUpload } from '@/hooks/useDirectUpload';
import { renderPdfToPngs, type RenderedPdfPage } from '@/lib/pdf-client-render';
import { validateFile } from '@/lib/file-validation';
import PdfImportProgressModal from './PdfImportProgressModal';

interface SidebarPdfImportButtonProps {
  notebookId: string;
  onImported: () => void;
}

/** Pre-job client work — rendering pages and uploading them — before the
 *  server worker (tracked by `jobId`) takes over. */
type ClientPhase = 'idle' | 'rendering' | 'uploading' | 'starting';

interface ClientProgress {
  current: number;
  total: number;
}

/** A failure carrying a message that is safe to show the user verbatim. */
class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

/** pdfjs raises a `PasswordException` for encrypted PDFs. */
function isPasswordError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /password/i.test(`${err.name} ${err.message}`);
}

function busyLabel(phase: ClientPhase, progress: ClientProgress | null): string {
  if (phase === 'rendering') {
    return progress ? `Rendering page ${progress.current} / ${progress.total}` : 'Rendering PDF…';
  }
  if (phase === 'uploading') {
    return progress ? `Uploading ${progress.current} / ${progress.total}` : 'Uploading…';
  }
  if (phase === 'starting') return 'Starting import…';
  return 'Importing PDF…';
}

/**
 * Top-level "Import PDF" button shown in the notebook sidebar.
 *
 * The PDF is rendered to one PNG per page in the browser, the raw PDF and
 * those PNGs are uploaded to `temp-imports/`, and a structured import job
 * is started server-side. A vision engine + deterministic assembler then
 * build ONE fully-editable notebook page — headings, callouts, tables,
 * lists, and inline figures — rather than flat page screenshots.
 *
 * `PdfImportProgressModal` tracks the job over SSE. If the notebook has
 * no sections, an "Imports" section is created on the fly.
 */
export default function SidebarPdfImportButton({
  notebookId,
  onImported,
}: SidebarPdfImportButtonProps) {
  const { upload } = useDirectUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [clientPhase, setClientPhase] = useState<ClientPhase>('idle');
  const [clientProgress, setClientProgress] = useState<ClientProgress | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [modalGeneration, setModalGeneration] = useState(0);
  const [pendingFileName, setPendingFileName] = useState('');
  const [hovered, setHovered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = clientPhase !== 'idle';

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const showError = useCallback((message: string) => {
    setError(message);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(null), 5000);
  }, []);

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

  const handleFile = useCallback(
    async (file: File) => {
      const validationError = validateFile(file, 'pdf-import');
      if (validationError) {
        showError(validationError);
        return;
      }

      setError(null);
      setPendingFileName(file.name);
      setClientPhase('rendering');
      setClientProgress(null);

      try {
        let sectionId: string;
        try {
          sectionId = await ensureSectionId();
        } catch {
          throw new ImportError('We couldn’t prepare a section for this import. Please try again.');
        }

        // 1) Render each PDF page to a PNG — the image source the vision
        //    engine reads, and the source figure crops are taken from.
        let pages: RenderedPdfPage[];
        try {
          pages = await renderPdfToPngs(file, {
            onProgress: ({ current, total }) => setClientProgress({ current, total }),
          });
        } catch (err) {
          throw new ImportError(
            isPasswordError(err)
              ? 'This PDF is password-protected. Remove the password and try the import again.'
              : 'We couldn’t read this PDF — it may be damaged or in an unsupported format.',
          );
        }
        if (pages.length === 0) {
          throw new ImportError('We couldn’t find any pages in this PDF.');
        }

        // 2) Upload the raw PDF + page PNGs to temp-imports/.
        setClientPhase('uploading');
        const totalUploads = pages.length + 1;
        setClientProgress({ current: 0, total: totalUploads });

        let pdfPath: string;
        const pageImagePaths: string[] = [];
        try {
          pdfPath = (await upload(file, 'pdf-import', { notebookId })).storagePath;
          setClientProgress({ current: 1, total: totalUploads });
          for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            const pngFile = new File([page.blob], `page-${page.pageNumber}.png`, {
              type: 'image/png',
            });
            const { storagePath } = await upload(pngFile, 'pdf-import', { notebookId });
            pageImagePaths.push(storagePath);
            setClientProgress({ current: i + 2, total: totalUploads });
          }
        } catch {
          throw new ImportError(
            'Upload failed — check your connection and try the import again.',
          );
        }

        // 3) Start the server-side import job.
        setClientPhase('starting');
        const res = await fetch(`/api/notebooks/${notebookId}/pdf-import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sectionId, fileName: file.name, pdfPath, pageImagePaths }),
        });
        const json = (await res.json().catch(() => null)) as
          | { success?: boolean; error?: string; data?: { jobId?: string } }
          | null;
        if (!res.ok || !json?.success || !json.data?.jobId) {
          throw new ImportError(
            json?.error ?? 'We couldn’t start the import. Please try again.',
          );
        }

        // 4) Hand off to the progress modal, which streams the job.
        setJobId(json.data.jobId);
        setModalGeneration(0);
      } catch (err) {
        showError(err instanceof ImportError ? err.message : 'Import failed. Please try again.');
      } finally {
        setClientPhase('idle');
        setClientProgress(null);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [notebookId, upload, ensureSectionId, showError],
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        style={{ display: 'none' }}
      />
      <button
        onClick={() => !busy && !jobId && inputRef.current?.click()}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        disabled={busy}
        title="Import a PDF as a structured, editable page"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          padding: '7px 0',
          marginBottom: '6px',
          borderRadius: '6px',
          border: '1px solid rgba(140,82,255,0.25)',
          background: hovered ? 'rgba(140,82,255,0.14)' : 'rgba(140,82,255,0.06)',
          color: hovered ? 'var(--on-surface)' : 'var(--ink-70)',
          fontFamily: 'inherit',
          fontSize: '12px',
          fontWeight: 600,
          cursor: busy ? 'progress' : 'pointer',
          transition: 'background 0.12s ease, color 0.12s ease',
        }}
      >
        <span
          className="material-symbols-outlined"
          aria-hidden="true"
          style={{
            fontSize: '16px',
            animation: busy ? 'nm-pdf-btn-spin 1s linear infinite' : undefined,
          }}
        >
          {busy ? 'progress_activity' : 'upload_file'}
        </span>
        {busy ? busyLabel(clientPhase, clientProgress) : 'Import PDF'}
      </button>
      {error && (
        <div
          role="alert"
          style={{
            marginBottom: '6px',
            padding: '6px 8px',
            fontSize: '11px',
            lineHeight: 1.4,
            color: 'var(--error)',
            background: 'var(--surface-container-high)',
            border: '1px solid var(--outline-variant)',
            borderRadius: '6px',
            textAlign: 'center',
          }}
        >
          {error}
        </div>
      )}

      {jobId && (
        <PdfImportProgressModal
          key={`${jobId}:${modalGeneration}`}
          notebookId={notebookId}
          jobId={jobId}
          fileName={pendingFileName}
          onClose={() => setJobId(null)}
          onRetried={() => setModalGeneration((g) => g + 1)}
          onImported={onImported}
        />
      )}

      <style>{`@keyframes nm-pdf-btn-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
