'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface FirstPathPromptProps {
  notebookId: string;
  notebookName: string;
  onClose: () => void;
}

const DISMISS_KEY = 'notemage_path_onboarding_dismissed';

export default function FirstPathPrompt({
  notebookId,
  notebookName,
  onClose,
}: FirstPathPromptProps) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSkip = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore
    }
    onClose();
  };

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/study-plans/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error || `Could not generate a path (status ${res.status}).`);
        setGenerating(false);
        return;
      }
      try {
        localStorage.setItem(DISMISS_KEY, '1');
      } catch {
        // ignore
      }
      router.push('/learn');
    } catch {
      setError('Something went wrong generating your path. Please try again.');
      setGenerating(false);
    }
  };

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
        padding: '20px',
      }}
      onClick={generating ? undefined : handleSkip}
    >
      <div
        style={{
          width: '480px',
          maxWidth: '90vw',
          background: 'var(--surface-container)',
          borderRadius: '16px',
          border: '1px solid rgba(174,137,255,0.40)',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'inherit',
        }}
        onClick={(e) => e.stopPropagation()}
      >
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
            Build your learn path
          </span>
          <button
            type="button"
            onClick={handleSkip}
            disabled={generating}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(196,169,255,0.5)',
              cursor: generating ? 'not-allowed' : 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              close
            </span>
          </button>
        </div>

        <div
          style={{
            padding: '24px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div
              aria-hidden
              style={{
                flexShrink: 0,
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'rgba(174,137,255,0.14)',
                border: '1px solid rgba(174,137,255,0.28)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>
                school
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
              <h2
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-display)',
                  fontSize: '20px',
                  fontWeight: 700,
                  color: 'var(--on-surface)',
                  letterSpacing: '-0.01em',
                }}
              >
                Turn this notebook into a learn path
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: '14px',
                  lineHeight: 1.55,
                  color: 'var(--on-surface-variant)',
                  wordBreak: 'break-word',
                }}
              >
                <strong style={{ color: 'var(--on-surface)' }}>{notebookName}</strong> is ready.
                NoteMage can build a guided study path with checkpoints from what you just added.
              </p>
            </div>
          </div>

          {error ? (
            <div
              role="alert"
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: 'rgba(248,113,113,0.10)',
                border: '1px solid rgba(248,113,113,0.30)',
                color: '#f87171',
                fontSize: '13px',
                lineHeight: 1.4,
              }}
            >
              {error}
            </div>
          ) : null}
        </div>

        <div
          style={{
            padding: '12px 20px 20px',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={handleSkip}
            disabled={generating}
            style={{
              padding: '10px 18px',
              background: 'transparent',
              border: '1px solid var(--outline-variant)',
              borderRadius: 'var(--radius-full)',
              color: 'var(--on-surface-variant)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: generating ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
              opacity: generating ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!generating) {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
            }}
          >
            Maybe later
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              background: 'var(--primary)',
              border: 'none',
              borderRadius: 'var(--radius-full)',
              color: 'var(--on-primary)',
              fontSize: '14px',
              fontWeight: 700,
              cursor: generating ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
              opacity: generating ? 0.85 : 1,
            }}
            onMouseEnter={(e) => {
              if (!generating) {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: '18px',
                animation: generating ? 'firstPathSpin 0.9s linear infinite' : undefined,
              }}
            >
              {generating ? 'progress_activity' : 'auto_fix_high'}
            </span>
            {generating ? 'Generating…' : 'Generate path'}
            <style>{`
              @keyframes firstPathSpin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>
          </button>
        </div>
      </div>
    </div>
  );
}
