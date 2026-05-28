'use client';

import { useEffect, type ReactNode } from 'react';
import { useMultiImport, type ImportPhase } from '@/hooks/useMultiImport';
import ImportSourceStep from '@/components/import/ImportSourceStep';
import ImportPreparingStep from '@/components/import/ImportPreparingStep';
import ImportOrganizeStep from '@/components/import/ImportOrganizeStep';
import ImportCreatingStep from '@/components/import/ImportCreatingStep';

// The onboarding-finale container for the multi-PDF import flow (screen
// 11). Renders the shared import steps inside the `OnboardingScreen` shell
// and hands completion back to the wizard. The /notebooks-page modal
// (`MultiPdfImportModal`) drives the same `useMultiImport` hook.

interface OnboardingImportStepProps {
  /** Finish onboarding — redirects to the first new notebook when one exists. */
  onComplete: (firstNotebookId: string | null) => void;
  /** Finish onboarding without importing anything. */
  onSkip: () => void;
  /** Reports the active sub-step so the wizard can scope its back chevron. */
  onPhaseChange?: (phase: ImportPhase) => void;
  /** True while the onboarding completion request is in flight. */
  completing: boolean;
}

export default function OnboardingImportStep({
  onComplete,
  onSkip,
  onPhaseChange,
  completing,
}: OnboardingImportStepProps) {
  const mi = useMultiImport({ folderId: null });

  // Lift the sub-step up so the shell chevron stays in sync (see the wizard).
  useEffect(() => {
    onPhaseChange?.(mi.phase);
  }, [mi.phase, onPhaseChange]);

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
        onSkip={onSkip}
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
        onDone={() => onComplete(mi.result?.firstNotebookId ?? null)}
        doneLabel="Continue"
        doneBusy={completing}
      />
    );
  }

  // Re-key on the sub-step so each one fades in as the flow advances.
  return (
    <>
      <div key={mi.phase} className="import-step-fade">
        {body}
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
    </>
  );
}
