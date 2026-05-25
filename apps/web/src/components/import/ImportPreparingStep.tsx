'use client';

import { Mascot } from '@/components/mascot';
import type { PrepareProgress } from '@/hooks/useMultiImport';

// Sub-step B of the multi-PDF import flow — the "preparing" wait while the
// PDFs upload and Gemini detects their subjects. A calm animated moment;
// it has no controls.

interface ImportPreparingStepProps {
  progress: PrepareProgress;
}

export default function ImportPreparingStep({ progress }: ImportPreparingStepProps) {
  const percent =
    progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '14px',
        padding: '12px 0 4px',
        textAlign: 'center',
      }}
    >
      <Mascot pose="holding-wand" size="lg" idle="sway" wandSparkle />

      <h2
        style={{
          margin: 0,
          fontFamily: 'var(--font-display)',
          fontSize: '22px',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          color: 'var(--on-surface)',
          maxWidth: '20ch',
        }}
      >
        Preparing your personalized study environment
      </h2>

      <p
        aria-live="polite"
        style={{ margin: 0, fontSize: '13.5px', color: 'var(--on-surface-variant)', minHeight: '20px' }}
      >
        {progress.label || 'Setting things up…'}
      </p>

      <div
        role="progressbar"
        aria-label="Preparing your import"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{
          width: '100%',
          maxWidth: '320px',
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
            transform: `scaleX(${Math.max(percent, 6) / 100})`,
            transformOrigin: 'left',
            background: 'var(--primary)',
            borderRadius: 'var(--radius-full)',
            transition: 'transform 0.4s cubic-bezier(0.22,1,0.36,1)',
          }}
        />
      </div>
    </div>
  );
}
