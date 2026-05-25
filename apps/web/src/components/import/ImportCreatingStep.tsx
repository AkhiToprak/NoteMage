'use client';

import type { ReactNode } from 'react';
import { Mascot } from '@/components/mascot';
import type { CommitResult, ImportStatus } from '@/hooks/useMultiImport';

// Sub-step D of the multi-PDF import flow — notebooks have been created and
// the per-PDF import workers are running. Shows aggregate progress and a
// completion CTA. The CTA stays available throughout: the workers run
// server-side, so the user is never forced to wait.

interface ImportCreatingStepProps {
  status: ImportStatus | null;
  result: CommitResult | null;
  done: boolean;
  onDone: () => void;
  doneLabel: string;
  doneBusy: boolean;
}

function statusIcon(jobStatus: string): { icon: string; color: string } {
  if (jobStatus === 'ready') return { icon: 'check_circle', color: '#4dff91' };
  if (jobStatus === 'failed') return { icon: 'error', color: 'var(--error)' };
  return { icon: 'pending', color: 'var(--on-surface-variant)' };
}

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

export default function ImportCreatingStep({
  status,
  result,
  done,
  onDone,
  doneLabel,
  doneBusy,
}: ImportCreatingStepProps) {
  const total = status?.total ?? result?.jobIds.length ?? 0;
  const finished = (status?.ready ?? 0) + (status?.failed ?? 0);
  const percent = total > 0 ? Math.round((finished / total) * 100) : done ? 100 : 0;
  const jobs = status?.jobs ?? [];
  const failed = status?.failed ?? 0;
  const skipped = result?.skippedFiles ?? [];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '14px',
        textAlign: 'center',
      }}
    >
      <Mascot
        pose={done ? 'graduation' : 'holding-wand'}
        size="lg"
        idle={done ? 'float' : 'sway'}
        wandSparkle={!done}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: '22px',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: 'var(--on-surface)',
          }}
        >
          {done ? 'Your notebooks are ready' : 'Creating your notebooks'}
        </h2>
        <p
          aria-live="polite"
          style={{ margin: 0, fontSize: '13.5px', color: 'var(--on-surface-variant)', lineHeight: 1.5 }}
        >
          {done
            ? 'Your study material has been imported and organized.'
            : 'Hang tight — NoteMage is building each notebook from your PDFs.'}
        </p>
      </div>

      {total > 0 && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div
            role="progressbar"
            aria-label="Import progress"
            aria-valuenow={finished}
            aria-valuemin={0}
            aria-valuemax={total}
            style={{
              width: '100%',
              height: '8px',
              background: 'var(--surface-container-high)',
              borderRadius: 'var(--radius-full)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                transform: `scaleX(${Math.max(percent, 4) / 100})`,
                transformOrigin: 'left',
                background: 'var(--primary)',
                borderRadius: 'var(--radius-full)',
                transition: 'transform 0.4s cubic-bezier(0.22,1,0.36,1)',
              }}
            />
          </div>
          <p
            style={{
              margin: 0,
              fontSize: '12px',
              color: 'var(--on-surface-variant)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {finished} of {total} PDFs imported
          </p>
        </div>
      )}

      {jobs.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            maxHeight: '28vh',
            overflowY: 'auto',
            textAlign: 'left',
          }}
        >
          {jobs.map((job) => {
            const { icon, color } = statusIcon(job.status);
            return (
              <li
                key={job.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-container-high)',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  aria-hidden="true"
                  style={{ fontSize: '18px', color, flexShrink: 0 }}
                >
                  {icon}
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
                  {job.fileName}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {done && failed > 0 && (
        <NoticeBox icon="error">
          {failed === total
            ? "We couldn't import your PDFs. Your notebooks were still created — try importing again from inside one."
            : `${failed} of ${total} PDFs couldn't be imported. The rest are ready.`}
        </NoticeBox>
      )}

      {skipped.length > 0 && (
        <NoticeBox icon="info">
          {skipped.length} PDF{skipped.length === 1 ? '' : 's'} went past your PDF import allowance,
          so {skipped.length === 1 ? 'its notebook was' : 'their notebooks were'} created empty.
        </NoticeBox>
      )}

      <button
        type="button"
        onClick={onDone}
        disabled={doneBusy}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '13px 20px',
          borderRadius: 'var(--radius-full)',
          border: 'none',
          background: 'var(--primary)',
          color: 'var(--on-primary)',
          fontSize: '14.5px',
          fontWeight: 700,
          fontFamily: 'inherit',
          cursor: doneBusy ? 'progress' : 'pointer',
          opacity: doneBusy ? 0.6 : 1,
          marginTop: '2px',
          transition: 'transform 0.16s cubic-bezier(0.22,1,0.36,1)',
        }}
        onMouseEnter={(e) => {
          if (!doneBusy) e.currentTarget.style.transform = 'scale(1.02)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
        onMouseDown={(e) => {
          if (!doneBusy) e.currentTarget.style.transform = 'scale(0.97)';
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        {doneBusy ? 'Finishing…' : doneLabel}
        {!doneBusy && (
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '19px' }}>
            arrow_forward
          </span>
        )}
      </button>
    </div>
  );
}
