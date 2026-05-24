'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Mascot } from '@/components/mascot/Mascot';
import type { MascotPose } from '@/components/mascot/poses';
import { useImportJobStream, type ImportJobStatus } from '@/hooks/useImportJobStream';
import { useModalDimensions } from '@/hooks/useModalDimensions';
import PdfImportSkeleton from './PdfImportSkeleton';

// P6 — the user-facing surface of the structured PDF import pipeline.
//
// Lifecycle:
//   1. The PDF tab of ImportNotebookDialog renders the PDF page images,
//      uploads them, POSTs to /api/notebooks/[id]/pdf-import, gets
//      `{ jobId }`, and mounts <PdfImportProgressModal jobId={jobId} … />.
//   2. The modal opens an SSE connection via useImportJobStream and
//      renders the worker's phase: skeleton rows while it is still
//      `extracting` (no page counts yet), then a per-page progress bar
//      once `structuring` reports totals.
//   3. CTAs appear only once the job settles:
//        • "Open page" → on `ready`; links to the new notebook page.
//        • "Try again" → on `failed`; POSTs the retry route, then asks
//          the parent to remount the modal so a fresh SSE re-attaches.
//      While the job is still working the modal cannot be dismissed.
//   4. onImported fires once when the job reaches `ready` so the notebook
//      can refresh and show the new page.

interface PdfImportProgressModalProps {
  notebookId: string;
  jobId: string;
  /** Original upload file name — labels the modal before the SSE replies. */
  fileName: string;
  /** Close the modal — only reachable once the job is `ready` or
   *  `failed`; while it is still working there is no dismiss control. */
  onClose: () => void;
  /** Ask the parent to remount this modal (after a successful retry) so a
   *  fresh SSE connection re-attaches to the requeued job. */
  onRetried: () => void;
  /** Fired once when the job reaches `ready` — lets the sidebar refresh. */
  onImported: () => void;
}

function statusToPose(status: ImportJobStatus): MascotPose {
  if (status === 'ready') return 'graduation';
  if (status === 'failed') return 'thinking';
  return 'holding-scroll';
}

/** Strip the extension for a friendlier title in the `ready` copy. */
function deriveTitle(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^./\\]+$/, '').trim();
  return withoutExt.length > 0 ? withoutExt : 'Your PDF';
}

export default function PdfImportProgressModal({
  notebookId,
  jobId,
  fileName,
  onClose,
  onRetried,
  onImported,
}: PdfImportProgressModalProps) {
  const stream = useImportJobStream(notebookId, jobId, true);
  const dims = useModalDimensions(480);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const status = stream.status;
  const isReady = status === 'ready';
  const isFailed = status === 'failed';
  const isWorking = !isReady && !isFailed;

  const totalPages = stream.progress?.totalPages ?? 0;
  const processedPages = stream.progress?.processedPages ?? 0;
  const showProgressBar = isWorking && totalPages > 0;
  const showSkeleton = isWorking && totalPages === 0;
  const fallbackPages = stream.fallbackPages;

  // Refresh the sidebar exactly once when the page lands.
  const importedFiredRef = useRef(false);
  useEffect(() => {
    if (status === 'ready' && !importedFiredRef.current) {
      importedFiredRef.current = true;
      onImported();
    }
  }, [status, onImported]);

  const handleRetry = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch(
        `/api/notebooks/${encodeURIComponent(notebookId)}/pdf-import/${encodeURIComponent(
          jobId,
        )}/retry`,
        { method: 'POST' },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setRetryError(json?.error ?? 'Could not retry the import. Please try again.');
        setRetrying(false);
        return;
      }
      // The job is back to `queued` and the worker re-fired — remount so
      // a fresh SSE picks it up. The component unmounts here, so there is
      // no follow-up state to clear.
      onRetried();
    } catch {
      setRetryError('Network error. Please try again.');
      setRetrying(false);
    }
  };

  const heading = isReady
    ? 'Your PDF is ready'
    : isFailed
      ? 'Import hit a snag'
      : 'Importing your PDF';

  const subtext = isReady
    ? `“${deriveTitle(fileName)}” is now a page in your notebook.`
    : isFailed
      ? stream.errorMessage ?? 'Something went wrong. Please try again.'
      : stream.progress?.message ?? 'Reading your PDF…';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="PDF import"
      onClick={isReady || isFailed ? onClose : undefined}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...dims,
          overflowY: 'auto',
          background: 'var(--surface-container)',
          color: 'var(--on-surface)',
          border: '1px solid var(--outline-variant)',
          padding: '32px 28px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '18px',
        }}
      >
        <Mascot pose={statusToPose(status)} size="md" idle={isWorking ? 'sway' : 'none'} />

        <div
          style={{
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: '22px',
              fontWeight: 800,
              color: 'var(--on-surface)',
              letterSpacing: '-0.01em',
            }}
          >
            {heading}
          </h2>

          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              maxWidth: '100%',
              fontSize: '12px',
              color: 'var(--on-surface-variant)',
            }}
          >
            <span
              className="material-symbols-outlined"
              aria-hidden="true"
              style={{ fontSize: '15px', flexShrink: 0 }}
            >
              picture_as_pdf
            </span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {fileName}
            </span>
          </span>

          <p
            aria-live="polite"
            style={{
              margin: 0,
              fontSize: '14px',
              color: isFailed ? 'var(--error)' : 'var(--on-surface-variant)',
              lineHeight: 1.5,
            }}
          >
            {subtext}
          </p>
        </div>

        {showSkeleton && <PdfImportSkeleton />}

        {showProgressBar && (
          <ProgressBar processedPages={processedPages} totalPages={totalPages} />
        )}

        {isReady && stream.truncated && (
          <NoticeBox icon="info">
            This PDF was long, so some content was trimmed to fit one page. A note inside the page
            marks where it stops.
          </NoticeBox>
        )}

        {isReady && fallbackPages > 0 && (
          <NoticeBox icon="image_not_supported">
            {fallbackPages >= totalPages
              ? "This PDF's layout couldn't be analysed, so images and formatting weren't detected — only its text was imported."
              : `${fallbackPages} of ${totalPages} pages couldn't be fully analysed, so images or formatting on those pages may be missing.`}
          </NoticeBox>
        )}

        {isFailed && retryError && (
          <p
            role="alert"
            style={{ margin: 0, fontSize: '13px', color: 'var(--error)', textAlign: 'center' }}
          >
            {retryError}
          </p>
        )}

        {(isReady || isFailed) && (
          <div
            style={{
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap',
              justifyContent: 'center',
              marginTop: '2px',
            }}
          >
            {isReady ? (
              <>
                {stream.resultPageId && (
                  <Link
                    href={`/notebooks/${encodeURIComponent(notebookId)}/pages/${encodeURIComponent(
                      stream.resultPageId,
                    )}`}
                    className="nm-pdf-cta nm-pdf-cta--primary"
                    onClick={onClose}
                  >
                    Open page
                    <span
                      className="material-symbols-outlined"
                      aria-hidden="true"
                      style={{ fontSize: '18px' }}
                    >
                      arrow_forward
                    </span>
                  </Link>
                )}
                <button type="button" onClick={onClose} className="nm-pdf-cta nm-pdf-cta--ghost">
                  Close
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={retrying}
                  className="nm-pdf-cta nm-pdf-cta--primary"
                >
                  {retrying ? 'Retrying…' : 'Try again'}
                </button>
                <button type="button" onClick={onClose} className="nm-pdf-cta nm-pdf-cta--ghost">
                  Close
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        .nm-pdf-cta {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 10px 18px;
          border-radius: var(--radius-full);
          font-size: 14px;
          font-weight: 700;
          font-family: inherit;
          line-height: 1;
          cursor: pointer;
          text-decoration: none;
          border: 1px solid transparent;
          transition: transform 0.16s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.16s ease;
        }
        .nm-pdf-cta:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }
        .nm-pdf-cta:active {
          transform: scale(0.97);
        }
        .nm-pdf-cta:disabled {
          opacity: 0.6;
          cursor: progress;
        }
        .nm-pdf-cta--primary {
          background: var(--primary);
          color: var(--on-primary);
        }
        .nm-pdf-cta--primary:hover {
          background: var(--primary-dim);
        }
        .nm-pdf-cta--ghost {
          background: transparent;
          color: var(--on-surface-variant);
          border-color: var(--outline-variant);
        }
        .nm-pdf-cta--ghost:hover {
          background: var(--surface-container-high);
          color: var(--on-surface);
        }
      `}</style>
    </div>
  );
}

function ProgressBar({
  processedPages,
  totalPages,
}: {
  processedPages: number;
  totalPages: number;
}) {
  const percent =
    totalPages > 0 ? Math.min(100, Math.round((processedPages / totalPages) * 100)) : 0;
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div
        role="progressbar"
        aria-valuenow={processedPages}
        aria-valuemin={0}
        aria-valuemax={totalPages}
        style={{
          width: '100%',
          height: '8px',
          background: 'var(--surface-container-high)',
          borderRadius: '999px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: '100%',
            background: 'var(--primary)',
            borderRadius: '999px',
            transition: 'width 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </div>
      <p
        style={{
          margin: 0,
          fontSize: '12px',
          color: 'var(--on-surface-variant)',
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {processedPages} / {totalPages} pages
      </p>
    </div>
  );
}

/** A compact, theme-safe info row shown beneath the modal heading on `ready`. */
function NoticeBox({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        width: '100%',
        padding: '10px 12px',
        background: 'var(--surface-container-high)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <span
        className="material-symbols-outlined"
        aria-hidden="true"
        style={{ fontSize: '18px', color: 'var(--on-surface-variant)', flexShrink: 0 }}
      >
        {icon}
      </span>
      <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
        {children}
      </span>
    </div>
  );
}
