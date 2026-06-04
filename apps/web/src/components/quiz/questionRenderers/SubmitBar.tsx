'use client';

// Shared submit button for the input-style question renderers (fill-blank, translation,
// equation, code-output, word-bank, sentence-reorder, timeline). On phones it becomes a
// full-width, ≥48px, thumb-reachable bar; on desktop it keeps the original compact
// right-aligned button, so the desktop layout is unchanged. Replaces ~7 inline copies and
// the latent contrast bug they shared: a `#8c52ff` fill with `var(--on-surface)` text
// (which flips dark in light mode → dark-on-purple). Here the fill is the fixed
// `--accent-strong` token and the label is fixed-white `--on-primary-container`.
export default function SubmitBar({
  onClick,
  disabled,
  label = 'Submit answer',
  isPhone,
}: {
  onClick: () => void;
  disabled: boolean;
  label?: string;
  isPhone: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: isPhone ? '100%' : undefined,
        alignSelf: isPhone ? 'stretch' : 'flex-end',
        minHeight: isPhone ? '48px' : undefined,
        padding: isPhone ? '13px 18px' : '10px 18px',
        borderRadius: '10px',
        border: 'none',
        background: disabled ? 'rgba(140,82,255,0.18)' : 'var(--accent-strong)',
        color: disabled ? 'var(--on-surface-variant)' : 'var(--on-primary-container)',
        fontSize: isPhone ? '15px' : '13px',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        boxShadow: disabled ? 'none' : '0 4px 16px rgba(140,82,255,0.25)',
        transition: 'background 0.15s, box-shadow 0.15s',
      }}
    >
      {label}
    </button>
  );
}
