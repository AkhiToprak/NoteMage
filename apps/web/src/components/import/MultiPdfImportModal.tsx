'use client';

import type { ReactNode } from 'react';
import { useModalDimensions } from '@/hooks/useModalDimensions';
import { useMultiImport } from '@/hooks/useMultiImport';
import ImportSourceStep from './ImportSourceStep';
import ImportPreparingStep from './ImportPreparingStep';
import ImportOrganizeStep from './ImportOrganizeStep';
import ImportCreatingStep from './ImportCreatingStep';

// The /notebooks-page container for the multi-PDF import flow — a
// fixed-overlay dialog. Drives the shared `useMultiImport` state machine;
// the onboarding finale drives the same hook inside `OnboardingImportStep`.

interface MultiPdfImportModalProps {
  /** Folder the created notebooks land in; null = root level. */
  folderId: string | null;
  /** Close the modal — the caller refreshes the notebooks list. */
  onClose: () => void;
}

export default function MultiPdfImportModal({ folderId, onClose }: MultiPdfImportModalProps) {
  const mi = useMultiImport({ folderId });
  const dims = useModalDimensions(600);

  // Uploads hold the picked File objects in memory — block dismiss while
  // the "preparing" step is running so the work is not lost mid-upload.
  const canDismiss = mi.phase !== 'preparing';

  let body: ReactNode;
  if (mi.phase === 'source') {
    body = (
      <ImportSourceStep
        files={mi.files}
        maxFiles={mi.maxFiles}
        error={mi.error}
        busy={false}
        onAddFiles={mi.addFiles}
        onRemoveFile={mi.removeFile}
        onContinue={mi.prepare}
        mode={mi.mode}
        onModeChange={mi.setMode}
      />
    );
  } else if (mi.phase === 'preparing') {
    body = <ImportPreparingStep progress={mi.prepareProgress} />;
  } else if (mi.phase === 'organize') {
    body = (
      <ImportOrganizeStep
        groups={mi.groups}
        files={mi.files}
        palette={mi.palette}
        notebookCount={mi.notebookCount}
        error={mi.error}
        committing={false}
        onRename={mi.renameGroup}
        onSetSubject={mi.setGroupSubject}
        onSetColor={mi.setGroupColor}
        onMoveFile={mi.moveFile}
        onAddGroup={mi.addGroup}
        onRemoveGroup={mi.removeGroup}
        onBack={mi.backToSource}
        onCommit={mi.commit}
      />
    );
  } else {
    body = (
      <ImportCreatingStep
        status={mi.status}
        result={mi.result}
        done={mi.phase === 'done'}
        onDone={onClose}
        doneLabel="Done"
        doneBusy={false}
      />
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import PDFs"
      onClick={canDismiss ? onClose : undefined}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
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
          padding: '16px 24px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={!canDismiss}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '30px',
              height: '30px',
              borderRadius: 'var(--radius-full)',
              border: 'none',
              background: 'transparent',
              color: 'var(--on-surface-variant)',
              cursor: canDismiss ? 'pointer' : 'not-allowed',
              opacity: canDismiss ? 1 : 0.4,
              transition: 'background 0.16s ease, color 0.16s ease',
            }}
            onMouseEnter={(e) => {
              if (canDismiss) {
                e.currentTarget.style.background = 'var(--surface-container-high)';
                e.currentTarget.style.color = 'var(--on-surface)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--on-surface-variant)';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
              close
            </span>
          </button>
        </div>

        {/* Re-key on the sub-step so each one fades in as the flow advances. */}
        <div key={mi.phase} className="import-step-fade">
          {body}
        </div>
      </div>

      <style>{`
        .import-step-fade { animation: importStepFade 0.3s cubic-bezier(0.22,1,0.36,1); }
        @keyframes importStepFade {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .import-step-fade { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
