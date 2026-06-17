'use client';

import { useState } from 'react';
import {
  PATH_LANGUAGES,
  pathLanguageName,
  isPathLanguage,
  type PathLanguageCode,
} from '@/lib/path-languages';

// Self-contained target-language picker + POST /api/learn/paths/[id]/translate.
// Translates theory/flashcards/quizzes in place (progress kept); picking the
// path's current language re-checks it. onTranslated() lets the caller refresh
// so the in-flight "Translating…" card takes over. Mirrors the inline dialog
// formerly on /learn/paths.

export function TranslatePathDialog({
  planId,
  planTitle,
  currentLanguage,
  onClose,
  onTranslated,
}: {
  planId: string;
  planTitle: string;
  currentLanguage: string;
  onClose: () => void;
  onTranslated: () => void;
}) {
  const current = currentLanguage || 'en';
  const [language, setLanguage] = useState<PathLanguageCode>(() =>
    isPathLanguage(current) ? current : 'en',
  );
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isReclean = language === current;

  const confirm = async () => {
    if (translating) return;
    setTranslating(true);
    setError(null);
    try {
      const res = await fetch(`/api/learn/paths/${encodeURIComponent(planId)}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language }),
      });
      const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (json?.success) {
        onTranslated();
      } else {
        setError(json?.error ?? 'Could not start translation.');
        setTranslating(false);
      }
    } catch {
      setError('Network error. Try again.');
      setTranslating(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Translate path"
      onClick={translating ? undefined : onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '460px',
          maxWidth: '95vw',
          background: 'var(--surface-container)',
          color: 'var(--on-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--outline-variant)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <span
            aria-hidden
            className="material-symbols-outlined"
            style={{
              fontSize: '22px',
              width: '40px',
              height: '40px',
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-full)',
              background: 'var(--surface-container-highest)',
              color: 'var(--md-h4)',
            }}
          >
            translate
          </span>
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: '18px',
                fontWeight: 800,
                color: 'var(--on-surface)',
                letterSpacing: '-0.01em',
              }}
            >
              Translate this path
            </h2>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '13px',
                color: 'var(--on-surface-variant)',
                lineHeight: 1.5,
              }}
            >
              All of <strong style={{ color: 'var(--on-surface)' }}>{planTitle}</strong> — theory,
              flashcards, and quizzes — is translated in place and your progress is kept. It&apos;s
              currently in {pathLanguageName(current as PathLanguageCode)}; pick that same language
              to re-check it and fix anything still in another language.
            </p>
          </div>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--on-surface-variant)' }}>
            Translate to
          </span>
          <select
            aria-label="Target language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as PathLanguageCode)}
            disabled={translating}
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--outline-variant)',
              background: 'var(--surface-container-high)',
              color: 'var(--on-surface)',
              fontSize: '14px',
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: translating ? 'not-allowed' : 'pointer',
            }}
          >
            {PATH_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.endonym} — {l.label}
                {l.code === current ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </label>

        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: '13px', color: 'var(--error)' }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={translating}
            style={{
              padding: '10px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--outline-variant)',
              background: 'var(--surface-container-high)',
              color: 'var(--on-surface)',
              fontFamily: 'inherit',
              fontSize: '14px',
              fontWeight: 700,
              cursor: translating ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={translating}
            style={{
              padding: '10px 16px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'var(--primary)',
              color: 'var(--on-primary)',
              fontFamily: 'inherit',
              fontSize: '14px',
              fontWeight: 700,
              cursor: translating ? 'not-allowed' : 'pointer',
              opacity: translating ? 0.7 : 1,
            }}
          >
            {translating ? 'Starting…' : isReclean ? 'Re-translate' : 'Translate'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TranslatePathDialog;
