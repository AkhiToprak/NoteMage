'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Mascot } from '@/components/mascot/Mascot';
import type { MascotPose } from '@/components/mascot/poses';
import { useImportJobStream, type ImportJobStatus } from '@/hooks/useImportJobStream';
import { useModalDimensions } from '@/hooks/useModalDimensions';

// Phase 3 of the OneNote-import plan — the user-facing progress surface, a thin
// sibling of PdfImportProgressModal. It reuses useImportJobStream (pointed at
// the neutral route `/api/import/jobs/[jobId]/progress`) and the same CTA CSS.
//
// Lifecycle:
//   1. The OneNote tab of ImportNotebookDialog picks sections, POSTs the
//      trigger (Phase 4), gets `{ jobId }`, and mounts this modal.
//   2. The modal opens an SSE connection and renders the worker's phase: an
//      indeterminate "listing" bar until a page total arrives, then a per-page
//      bar once `importing` reports totals.
//   3. CTAs appear only once the job settles:
//        • "Open notebook" → on `ready`; deep-links into the first imported
//          section's first page (not a single page like the PDF flow — a
//          OneNote import lands many pages across many sections).
//        • "Try again" → on `failed`; asks the parent to fire a fresh job
//          (OneNote has no in-place retry) and remount the modal.
//      While the job is still working the modal cannot be dismissed.
//   4. onImported fires once when the job reaches `ready` so the sidebar can
//      refresh and show the new sections.

interface OneNoteImportProgressModalProps {
  /** Target NoteMage notebook — the imported sections land here, and the
   *  "ready" CTA deep-links into it. */
  notebookId: string;
  jobId: string;
  /** How many OneNote sections the user picked — labels the modal before the
   *  stream replies. */
  sectionCount: number;
  /** Close the modal — only reachable once the job is `ready` or `failed`;
   *  while it is still working there is no dismiss control. */
  onClose: () => void;
  /** Failed-state "Try again": fire a fresh import job (OneNote has no in-place
   *  retry — a new job re-creates the sections) and remount this modal with the
   *  new jobId so a fresh SSE re-attaches. */
  onRetry: () => void;
  /** Fired once when the job reaches `ready` — lets the sidebar refresh. */
  onImported: () => void;
}

function statusToPose(status: ImportJobStatus): MascotPose {
  if (status === 'ready') return 'graduation';
  if (status === 'failed') return 'thinking';
  return 'holding-scroll';
}

export default function OneNoteImportProgressModal({
  notebookId,
  jobId,
  sectionCount,
  onClose,
  onRetry,
  onImported,
}: OneNoteImportProgressModalProps) {
  const stream = useImportJobStream(
    notebookId,
    jobId,
    true,
    `/api/import/jobs/${encodeURIComponent(jobId)}/progress`,
  );
  const dims = useModalDimensions(480);
  const [retrying, setRetrying] = useState(false);

  const status = stream.status;
  const isReady = status === 'ready';
  const isFailed = status === 'failed';
  const isWorking = !isReady && !isFailed;

  const totalPages = stream.progress?.totalPages ?? 0;
  const processedPages = stream.progress?.processedPages ?? 0;
  const showProgressBar = isWorking && totalPages > 0;
  // OneNote has no per-page thumbnail to skeleton-ize; show an indeterminate
  // sweep while the worker is still listing pages (no total yet).
  const showListing = isWorking && totalPages === 0;

  const summary = stream.summary;
  const errorCount = summary?.errors.length ?? 0;

  // Refresh the sidebar exactly once when the import lands.
  const importedFiredRef = useRef(false);
  useEffect(() => {
    if (status === 'ready' && !importedFiredRef.current) {
      importedFiredRef.current = true;
      onImported();
    }
  }, [status, onImported]);

  // The parent remounts with a fresh jobId on retry; if it instead reuses this
  // instance with a new jobId, clear the local retry flag. Render-phase
  // adjustment on prop change — see react.dev "You Might Not Need an Effect".
  const [retryJobId, setRetryJobId] = useState(jobId);
  if (retryJobId !== jobId) {
    setRetryJobId(jobId);
    setRetrying(false);
  }

  const handleRetry = () => {
    setRetrying(true);
    onRetry();
  };

  const sectionLabel =
    sectionCount > 0 ? `${sectionCount} section${sectionCount === 1 ? '' : 's'}` : 'OneNote';

  const heading = isReady
    ? 'Your OneNote pages are ready'
    : isFailed
      ? 'Import hit a snag'
      : 'Importing from OneNote';

  const subtext = isReady
    ? summary
      ? `Imported ${summary.pagesImported} page${
          summary.pagesImported === 1 ? '' : 's'
        } across ${summary.sectionsImported} section${summary.sectionsImported === 1 ? '' : 's'}.`
      : 'Your OneNote pages are now in your notebook.'
    : isFailed
      ? stream.errorMessage ?? 'Something went wrong. Please try again.'
      : stream.progress?.message ?? 'Connecting to OneNote…';

  // "Ready" CTA target — the first imported section's first page (sections are
  // entered via a page). Falls back to the notebook root if no page landed.
  const openHref = summary?.firstPageId
    ? `/notebooks/${encodeURIComponent(notebookId)}/pages/${encodeURIComponent(
        summary.firstPageId,
      )}`
    : `/notebooks/${encodeURIComponent(notebookId)}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="OneNote import"
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
              menu_book
            </span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {sectionLabel}
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

        {showListing && <ListingBar />}

        {showProgressBar && (
          <ProgressBar processedPages={processedPages} totalPages={totalPages} />
        )}

        {isReady && stream.truncated && (
          <NoticeBox icon="info">
            Some pages weren’t imported — this import hit the page limit. Re-run it to bring in the
            rest.
          </NoticeBox>
        )}

        {isReady && errorCount > 0 && (
          <NoticeBox icon="error_outline">
            {errorCount} item{errorCount === 1 ? '' : 's'} couldn’t be imported.
          </NoticeBox>
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
                <Link
                  href={openHref}
                  className="nm-onenote-cta nm-onenote-cta--primary"
                  onClick={onClose}
                >
                  Open notebook
                  <span
                    className="material-symbols-outlined"
                    aria-hidden="true"
                    style={{ fontSize: '18px' }}
                  >
                    arrow_forward
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={onClose}
                  className="nm-onenote-cta nm-onenote-cta--ghost"
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={retrying}
                  className="nm-onenote-cta nm-onenote-cta--primary"
                >
                  {retrying ? 'Starting over…' : 'Try again'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="nm-onenote-cta nm-onenote-cta--ghost"
                >
                  Close
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        .nm-onenote-cta {
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
        .nm-onenote-cta:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }
        .nm-onenote-cta:active {
          transform: scale(0.97);
        }
        .nm-onenote-cta:disabled {
          opacity: 0.6;
          cursor: progress;
        }
        .nm-onenote-cta--primary {
          background: var(--primary);
          color: var(--on-primary);
        }
        .nm-onenote-cta--primary:hover {
          background: var(--primary-dim);
        }
        .nm-onenote-cta--ghost {
          background: transparent;
          color: var(--on-surface-variant);
          border-color: var(--outline-variant);
        }
        .nm-onenote-cta--ghost:hover {
          background: var(--surface-container-high);
          color: var(--on-surface);
        }
        .nm-onenote-indeterminate {
          width: 40%;
          height: 100%;
          border-radius: 999px;
          background: var(--primary);
          transform: translateX(-100%);
          animation: nm-onenote-sweep 1.3s cubic-bezier(0.65, 0, 0.35, 1) infinite;
        }
        @keyframes nm-onenote-sweep {
          0% { transform: translateX(-110%); }
          100% { transform: translateX(255%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .nm-onenote-indeterminate {
            width: 100%;
            transform: none;
            opacity: 0.45;
            animation: none;
          }
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

/** Indeterminate bar shown while the worker is still listing pages (no total). */
function ListingBar() {
  return (
    <div
      role="progressbar"
      aria-label="Loading OneNote sections"
      style={{
        width: '100%',
        height: '8px',
        background: 'var(--surface-container-high)',
        borderRadius: '999px',
        overflow: 'hidden',
      }}
    >
      <div className="nm-onenote-indeterminate" />
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
