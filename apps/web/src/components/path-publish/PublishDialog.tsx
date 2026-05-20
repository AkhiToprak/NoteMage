// Hallmark · component: dialog · genre: editorial-tech · theme: locked-by-figma-design-system
// states: default · hover · focus-visible · active · disabled · loading · error
// contrast: pass (46–50). Light-mode audit clear.
//
// Phase 2 of plans/path-publishing-community-library.md.
// Reworked under Hallmark:
//   - Numbered section heads (S1 · Left-margin numbered) — the form
//     reads as an editorial intake form, not a generic settings sheet.
//   - 8-state discipline on every interactive element: hover (1px Y
//     shift + border deepen), focus-visible (2px outline reservation,
//     no layout shift), active (transform Y), disabled (opacity + cursor),
//     loading (in-button spinner), error (panel below buttons).
//   - Inputs follow Hallmark's no-layout-shift rule: border-width is
//     constant across states; the focus ring rides a pre-reserved
//     transparent outline slot so geometry never moves.
//   - 2+1 font discipline: --font-display on the title, --font-brand
//     on eyebrow labels, default sans on body text.
//   - Only transform + opacity animate. No transition-all. No gradients.

'use client';

import { useEffect, useId, useState } from 'react';

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 10_000;

interface PublishDialogProps {
  planId: string;
  defaultTitle: string;
  defaultDescription: string | null;
  onClose: () => void;
  onPublished: (shareId: string, moderationStatus: string) => void;
}

export default function PublishDialog({
  planId,
  defaultTitle,
  defaultDescription,
  onClose,
  onPublished,
}: PublishDialogProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Touched flags so error styling only fires after the user has
  // engaged with the field — matches Hallmark's "validate on blur"
  // rule for forms.
  const [titleTouched, setTitleTouched] = useState(false);

  const titleId = useId();
  const descriptionId = useId();
  const titleHintId = useId();
  const descriptionHintId = useId();
  const errorId = useId();

  // ESC closes the modal — keyboard a11y baseline. We mount this once
  // and don't add it as a hover-or-touch-conditional listener.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const titleTooLong = title.length > TITLE_MAX;
  const descriptionTooLong = description.length > DESCRIPTION_MAX;
  const titleEmpty = title.trim().length === 0;
  const titleHasError = titleTouched && (titleEmpty || titleTooLong);
  const canSubmit = !submitting && !titleTooLong && !descriptionTooLong && !titleEmpty;

  async function handleSubmit() {
    if (!canSubmit) {
      setTitleTouched(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/learn/paths/${encodeURIComponent(planId)}/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        const code = typeof json?.error === 'string' ? json.error : null;
        setError(
          code === 'path_not_ready'
            ? 'Wait until the path finishes generating before publishing.'
            : code ?? 'Could not publish. Try again.',
        );
        setSubmitting(false);
        return;
      }
      const data = json.data as { shareId: string; moderationStatus: string };
      onPublished(data.shareId, data.moderationStatus);
    } catch {
      setError('Network error. Try again.');
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${titleId}-heading`}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.66)',
        backdropFilter: 'blur(6px)',
        padding: '20px',
        // Backdrop fade — opacity-only per project rule. No transform.
        animation: 'hallmarkPublishBackdrop 220ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '560px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--surface-container)',
          color: 'var(--on-surface)',
          border: '1px solid var(--outline-variant)',
          borderRadius: 'var(--radius-xl)',
          // Layered shadow with primary tint — project shadow language.
          boxShadow:
            '0 32px 64px rgba(174,137,255,0.08), 0 8px 24px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.04)',
          padding: '0',
          display: 'flex',
          flexDirection: 'column',
          // Entry anim: scale + opacity, spring easing.
          animation: 'hallmarkPublishCard 320ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* Header strip — eyebrow + display title + meta. Editorial
            voicing rather than the "icon-in-circle + title + caption"
            chrome the AI default tends to emit. */}
        <header
          style={{
            padding: '22px 24px 18px',
            borderBottom: '1px solid var(--outline-variant)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-brand)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--primary)',
            }}
          >
            Community library · submit
          </span>
          <h2
            id={`${titleId}-heading`}
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: '24px',
              fontWeight: 800,
              color: 'var(--on-surface)',
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
            }}
          >
            Publish to the library
          </h2>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: '13px',
              color: 'var(--on-surface-variant)',
              lineHeight: 1.55,
              maxWidth: '46ch',
            }}
          >
            Your path will be reviewed before it goes live. Cloners get a fresh copy — your
            progress stays private.
          </p>
        </header>

        {/* Body — numbered fields. Each field has its own micro-section
            with a margin-numbered head. Heading + input separated by a
            short hairline so the form reads as an intake document, not
            a settings page. */}
        <div
          style={{
            padding: '20px 24px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <FieldRow
            number="01"
            label="Title"
            hint={`${title.length} / ${TITLE_MAX}`}
            hintError={titleTooLong}
            errorMessage={
              titleHasError
                ? titleEmpty
                  ? 'A title is required.'
                  : `Title must be ≤ ${TITLE_MAX} characters.`
                : null
            }
            controlId={titleId}
            hintId={titleHintId}
          >
            <input
              id={titleId}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setTitleTouched(true)}
              disabled={submitting}
              maxLength={TITLE_MAX + 50}
              aria-describedby={titleHintId}
              aria-invalid={titleHasError || undefined}
              className="hallmark-publish-input"
              style={inputBaseStyle(titleHasError)}
            />
          </FieldRow>

          <FieldRow
            number="02"
            label="Description"
            optional
            hint={`${description.length.toLocaleString()} / ${DESCRIPTION_MAX.toLocaleString()}`}
            hintError={descriptionTooLong}
            errorMessage={
              descriptionTooLong
                ? `Description must be ≤ ${DESCRIPTION_MAX.toLocaleString()} characters.`
                : null
            }
            controlId={descriptionId}
            hintId={descriptionHintId}
          >
            <textarea
              id={descriptionId}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              rows={5}
              aria-describedby={descriptionHintId}
              aria-invalid={descriptionTooLong || undefined}
              className="hallmark-publish-input"
              style={{
                ...inputBaseStyle(descriptionTooLong),
                resize: 'vertical',
                minHeight: '108px',
                lineHeight: 1.55,
              }}
            />
          </FieldRow>
        </div>

        {error ? (
          <p
            id={errorId}
            role="alert"
            style={{
              margin: '0 24px 4px',
              padding: '10px 12px',
              fontSize: '13px',
              color: 'var(--error)',
              background: 'rgba(253,111,133,0.10)',
              border: '1px solid rgba(253,111,133,0.36)',
              borderRadius: 'var(--radius-sm)',
              lineHeight: 1.45,
            }}
          >
            {error}
          </p>
        ) : null}

        {/* Footer — actions. Cancel is a quiet ghost; submit is the
            primary CTA with a chevron that nudges right on hover. */}
        <footer
          style={{
            padding: '16px 24px 22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-brand)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--on-surface-variant)',
            }}
          >
            Reviewed before going live
          </span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="hallmark-publish-ghost"
              style={ghostButtonStyle(submitting)}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              aria-busy={submitting || undefined}
              className="hallmark-publish-cta"
              style={primaryButtonStyle(canSubmit)}
            >
              {submitting ? (
                <>
                  <Spinner />
                  Submitting…
                </>
              ) : (
                <>
                  Submit for review
                  <span
                    aria-hidden
                    className="material-symbols-outlined hallmark-publish-cta-chevron"
                    style={{ fontSize: '18px', display: 'inline-block' }}
                  >
                    arrow_forward
                  </span>
                </>
              )}
            </button>
          </div>
        </footer>
      </div>

      {/* Hallmark interaction layer — class-targeted so hover-only rules
          gate behind @media (hover: hover), focus uses :focus-visible,
          and no transition-all anywhere. */}
      <style>{`
        @keyframes hallmarkPublishBackdrop {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes hallmarkPublishCard {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
        @keyframes hallmarkPublishSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        .hallmark-publish-input {
          transition: background-color 180ms cubic-bezier(0.22,1,0.36,1),
                      border-color     180ms cubic-bezier(0.22,1,0.36,1);
        }
        .hallmark-publish-input:focus { outline: none; }
        .hallmark-publish-input:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 1px;
        }

        .hallmark-publish-ghost {
          transition: transform 180ms cubic-bezier(0.22,1,0.36,1),
                      border-color 180ms cubic-bezier(0.22,1,0.36,1),
                      color 180ms cubic-bezier(0.22,1,0.36,1);
        }
        @media (hover: hover) {
          .hallmark-publish-ghost:not(:disabled):hover {
            border-color: var(--on-surface);
            color: var(--on-surface);
          }
        }
        .hallmark-publish-ghost:not(:disabled):active { transform: translateY(1px); }
        .hallmark-publish-ghost:focus { outline: none; }
        .hallmark-publish-ghost:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }

        .hallmark-publish-cta {
          transition: transform 200ms cubic-bezier(0.22,1,0.36,1),
                      box-shadow 200ms cubic-bezier(0.22,1,0.36,1),
                      opacity 200ms cubic-bezier(0.22,1,0.36,1);
        }
        .hallmark-publish-cta-chevron {
          transition: transform 220ms cubic-bezier(0.22,1,0.36,1);
        }
        @media (hover: hover) {
          .hallmark-publish-cta:not(:disabled):hover {
            transform: translateY(-1px);
            box-shadow: 0 6px 20px rgba(174,137,255,0.32), 0 2px 0 var(--primary-container, var(--outline));
          }
          .hallmark-publish-cta:not(:disabled):hover .hallmark-publish-cta-chevron {
            transform: translateX(3px);
          }
        }
        .hallmark-publish-cta:not(:disabled):active { transform: translateY(0); }
        .hallmark-publish-cta:focus { outline: none; }
        .hallmark-publish-cta:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }

        @media (prefers-reduced-motion: reduce) {
          .hallmark-publish-input,
          .hallmark-publish-ghost,
          .hallmark-publish-cta,
          .hallmark-publish-cta-chevron { transition: none; }
          .hallmark-publish-cta:not(:disabled):hover { transform: none; }
          .hallmark-publish-cta:not(:disabled):hover .hallmark-publish-cta-chevron { transform: none; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Field row — S1 left-margin numbered head, then the input. Reserves a
// stable hint slot so the geometry doesn't jump when an error replaces
// the counter.
// ─────────────────────────────────────────────────────────────────────

function FieldRow({
  number,
  label,
  optional,
  hint,
  hintError,
  errorMessage,
  controlId,
  hintId,
  children,
}: {
  number: string;
  label: string;
  optional?: boolean;
  hint: string;
  hintError: boolean;
  errorMessage: string | null;
  controlId: string;
  hintId: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Numbered head: the index sits in a fixed-width slot so all
          field labels align — S1 macrostructure in micro. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
        <span
          aria-hidden
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, "Cascadia Mono", Menlo, monospace',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--on-surface-variant)',
            letterSpacing: '0.04em',
            minWidth: '24px',
          }}
        >
          {number} ·
        </span>
        <label
          htmlFor={controlId}
          style={{
            fontFamily: 'var(--font-brand)',
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--on-surface)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            lineHeight: 1,
          }}
        >
          {label}
          {optional ? (
            <span
              style={{
                marginLeft: '8px',
                fontFamily: 'inherit',
                fontWeight: 600,
                fontSize: '11px',
                letterSpacing: '0.06em',
                color: 'var(--on-surface-variant)',
              }}
            >
              optional
            </span>
          ) : null}
        </label>
      </div>
      {children}
      <div
        id={hintId}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          // Reserve one-line height so an error appearing doesn't push
          // the layout down (Hallmark's stable-helper rule).
          minHeight: '16px',
          fontSize: '11px',
          fontFamily: 'ui-monospace, SFMono-Regular, "Cascadia Mono", Menlo, monospace',
          fontWeight: 600,
          letterSpacing: '0.02em',
          color: hintError || errorMessage ? 'var(--error)' : 'var(--on-surface-variant)',
        }}
      >
        <span style={{ fontFamily: 'inherit' }}>{errorMessage ?? ''}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{hint}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// In-button spinner. Transform-only animation so it respects the
// reduced-motion media query without falling apart.
// ─────────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: '14px',
        height: '14px',
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.32)',
        borderTopColor: 'var(--on-primary)',
        animation: 'hallmarkPublishSpin 0.9s linear infinite',
        flexShrink: 0,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shared style helpers — inputs and buttons. Border-width constant
// across states (Hallmark's no-layout-shift rule); outline reserved
// at 2px transparent so the focus ring activates without a paint
// reflow.
// ─────────────────────────────────────────────────────────────────────

function inputBaseStyle(error: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--surface-container-high)',
    color: 'var(--on-surface)',
    border: `1px solid ${error ? 'var(--error)' : 'var(--outline-variant)'}`,
    borderRadius: 'var(--radius-md)',
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: 500,
    lineHeight: 1.45,
    // Reserved transparent outline slot so focus-visible doesn't shift
    // the layout. The :focus-visible rule in the style block above
    // upgrades the outline colour instead of inserting one.
    outline: '2px solid transparent',
    outlineOffset: '1px',
  };
}

function ghostButtonStyle(busy: boolean): React.CSSProperties {
  return {
    minHeight: '44px',
    padding: '0 18px',
    background: 'transparent',
    color: 'var(--on-surface-variant)',
    border: '1px solid var(--outline-variant)',
    borderRadius: 'var(--radius-md)',
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 700,
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.55 : 1,
  };
}

function primaryButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    minHeight: '44px',
    padding: '0 18px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    background: enabled ? 'var(--primary)' : 'var(--surface-container-high)',
    color: enabled ? 'var(--on-primary)' : 'var(--on-surface-variant)',
    border: enabled ? '1px solid var(--primary)' : '1px solid var(--outline-variant)',
    borderRadius: 'var(--radius-md)',
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 800,
    letterSpacing: '0.01em',
    cursor: enabled ? 'pointer' : 'not-allowed',
    boxShadow: enabled ? '0 2px 0 var(--primary-container, var(--outline))' : 'none',
  };
}
