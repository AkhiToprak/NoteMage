'use client';

interface OnboardingOptionCardProps {
  /** Material Symbols Outlined icon name. */
  icon?: string;
  label: string;
  /** Optional secondary line under the label. */
  description?: string;
  selected?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/**
 * Gizmo-style single-select option card — a full-width row used by the
 * one-question-per-screen onboarding steps (e.g. the Context screen).
 */
export default function OnboardingOptionCard({
  icon,
  label,
  description,
  selected = false,
  disabled = false,
  onSelect,
}: OnboardingOptionCardProps) {
  return (
    <button
      type="button"
      className="ob-option-card"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      data-selected={selected ? 'true' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        width: '100%',
        padding: '15px 18px',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--surface-container-high)',
        border: `2px solid ${selected ? '#ae89ff' : '#555578'}`,
        boxShadow: selected ? '0 0 0 4px rgba(174,137,255,0.12)' : 'none',
        color: 'var(--on-surface)',
        fontFamily: 'inherit',
        textAlign: 'left',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition:
          'transform 0.2s cubic-bezier(0.22,1,0.36,1), border-color 0.2s cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      {icon && (
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: '24px',
            color: selected ? '#ae89ff' : 'var(--on-surface-variant)',
            fontVariationSettings: selected ? "'FILL' 1" : "'FILL' 0",
          }}
        >
          {icon}
        </span>
      )}
      <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: '15px', fontWeight: 700 }}>{label}</span>
        {description && (
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--on-surface-variant)' }}>
            {description}
          </span>
        )}
      </span>
      {selected && (
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '22px', color: 'var(--md-h4)', fontVariationSettings: "'FILL' 1" }}
        >
          check_circle
        </span>
      )}
      <style>{`
        .ob-option-card:hover:not(:disabled) { transform: translateY(-1px); border-color: rgba(174,137,255,0.55); }
        .ob-option-card[data-selected="true"]:hover:not(:disabled) { border-color: #ae89ff; }
        .ob-option-card:active:not(:disabled) { transform: scale(0.995); }
        .ob-option-card:focus-visible { outline: 2px solid #ae89ff; outline-offset: 2px; }
      `}</style>
    </button>
  );
}
