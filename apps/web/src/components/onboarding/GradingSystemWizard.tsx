'use client';

import { useMemo, useState } from 'react';
import { GRADING_SYSTEMS, type GradingSystem } from '@/lib/grading-systems';

/* The grading-system flag picker. Shown once after signup (GradingSystemGate)
   and reused in Settings. It renders OUTSIDE the cream AppShell (mounted at the
   DashboardChrome level), so it carries a self-contained palette rather than
   relying on `.shell`-scoped CSS variables. */

/* Colors flow through CSS vars (light defaults + dark overrides declared in the
   scoped <style> below, keyed off [data-theme='dark'] on <html>). The picker
   renders outside `.shell`, so it can't read shell tokens; under /start it's
   pinned data-theme="light" and stays cream. Every C.* usage is unchanged. */
const C = {
  backdrop: 'var(--gw-backdrop)',
  panel: 'var(--gw-panel)',
  ink: 'var(--gw-ink)',
  body: 'var(--gw-body)',
  accent: 'var(--gw-accent)',
  lilacSoft: 'var(--gw-lilac-soft)',
  border: 'var(--gw-border)',
  borderSel: 'var(--gw-border-sel)',
  field: 'var(--gw-field)',
  disabled: 'var(--gw-disabled)',
};

/** Short "range · best" or "best→worst" hint shown under each system label. */
function hint(s: GradingSystem): string {
  if (s.kind === 'numeric') {
    const best = s.bestIsHigh ? s.scaleMax : s.scaleMin;
    // Append the unit only when it's a true suffix (e.g. '%'); '/20'-style
    // units would double the range ("0–20/20"), so skip them in the hint.
    const suffix = s.unit && !s.unit.startsWith('/') ? s.unit : '';
    return `${s.scaleMin}–${s.scaleMax}${suffix} · best ${best}`;
  }
  return s.bands && s.bands.length
    ? `${s.bands[0].label} → ${s.bands[s.bands.length - 1].label}`
    : '';
}

export default function GradingSystemWizard({
  current = null,
  onSave,
  onSkip,
  saving = false,
  skipLabel = 'Skip for now',
}: {
  current?: string | null;
  onSave: (id: string) => void;
  onSkip?: () => void;
  saving?: boolean;
  skipLabel?: string;
}) {
  const [selected, setSelected] = useState<string | null>(current);
  const [q, setQ] = useState('');

  const { countries, global } = useMemo(() => {
    const t = q.trim().toLowerCase();
    const match = (s: GradingSystem) =>
      !t ||
      s.label.toLowerCase().includes(t) ||
      (s.country || '').toLowerCase().includes(t) ||
      s.id.includes(t);
    const countries = GRADING_SYSTEMS.filter((s) => s.country && match(s)).sort((a, b) =>
      (a.country || '').localeCompare(b.country || ''),
    );
    const global = GRADING_SYSTEMS.filter((s) => !s.country && match(s));
    return { countries, global };
  }, [q]);

  const renderCard = (s: GradingSystem) => {
    const sel = selected === s.id;
    return (
      <button
        key={s.id}
        type="button"
        onClick={() => setSelected(s.id)}
        aria-pressed={sel}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          textAlign: 'left',
          padding: '12px 14px',
          borderRadius: 14,
          cursor: 'pointer',
          background: sel ? C.lilacSoft : C.field,
          border: `1.5px solid ${sel ? C.borderSel : C.border}`,
          fontFamily: 'inherit',
          width: '100%',
          // Let the grid track shrink below the card's content width so the
          // label can ellipsize instead of blowing the 2-column grid past the
          // panel (right column was clipping on narrow viewports).
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }} aria-hidden>
          {s.flag}
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span
            style={{
              display: 'block',
              fontSize: 14,
              fontWeight: 600,
              color: C.ink,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {s.label}
          </span>
          <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: C.body }}>{hint(s)}</span>
        </span>
        {sel && (
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: C.accent }} aria-hidden>
            check_circle
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="grading-wizard-title"
      className="gw-root"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: C.backdrop,
        backdropFilter: 'blur(8px)',
        padding: 16,
      }}
    >
      <style>{`
        .gw-root {
          --gw-backdrop: rgba(38,34,58,0.55);
          --gw-panel: #fffdf8;
          --gw-ink: #2c2840;
          --gw-body: #6c6982;
          --gw-accent: #7c5cff;
          --gw-lilac-soft: #f4f1ff;
          --gw-border: #e9e4d8;
          --gw-border-sel: #7c5cff;
          --gw-field: #ffffff;
          --gw-disabled: #c9bdf5;
        }
        [data-theme='dark'] .gw-root {
          --gw-backdrop: rgba(8, 6, 24, 0.6);
          --gw-panel: #21213e;
          --gw-ink: #ffffff;
          --gw-body: #a5a5be;
          --gw-accent: #c4a9ff;
          --gw-lilac-soft: rgb(174 137 255 / 0.08);
          --gw-border: #35355c;
          --gw-border-sel: rgb(174 137 255 / 0.28);
          --gw-field: #272746;
          --gw-disabled: #4a4470;
        }
      `}</style>
      <div
        style={{
          background: C.panel,
          borderRadius: 24,
          width: '100%',
          maxWidth: 560,
          minWidth: 0,
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(38,34,58,0.40)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '24px 28px 16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mascot/holding-wand-v2.png" alt="" style={{ height: 44, width: 44, objectFit: 'contain' }} />
            <div>
              <h2
                id="grading-wizard-title"
                style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.ink, fontFamily: 'var(--font-display, inherit)' }}
              >
                How do you grade?
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: 13.5, color: C.body }}>
                Pick your grading system so we show your marks the way you know them.
              </p>
            </div>
          </div>
          <div style={{ position: 'relative', marginTop: 16 }}>
            <span
              className="material-symbols-outlined"
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: C.body }}
              aria-hidden
            >
              search
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search country or system…"
              aria-label="Search grading systems"
              style={{
                width: '100%',
                padding: '10px 14px 10px 38px',
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: C.field,
                color: C.ink,
                fontSize: 14,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Scrollable system list */}
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflowX: 'hidden', overflowY: 'auto', padding: '4px 28px 8px' }}>
          {countries.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: C.body, textTransform: 'uppercase', margin: '8px 0' }}>
                Countries
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))', gap: 10 }}>{countries.map(renderCard)}</div>
            </>
          )}
          {global.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: C.body, textTransform: 'uppercase', margin: '18px 0 8px' }}>
                Global
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))', gap: 10 }}>{global.map(renderCard)}</div>
            </>
          )}
          {countries.length === 0 && global.length === 0 && (
            <p style={{ textAlign: 'center', color: C.body, fontSize: 14, padding: 24 }}>No systems match your search.</p>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '16px 28px',
            borderTop: `1px solid ${C.border}`,
          }}
        >
          {onSkip ? (
            <button
              type="button"
              onClick={onSkip}
              disabled={saving}
              style={{ background: 'none', border: 'none', color: C.body, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '8px 4px' }}
            >
              {skipLabel}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => selected && onSave(selected)}
            disabled={!selected || saving}
            style={{
              background: !selected || saving ? C.disabled : C.accent,
              color: '#fff',
              border: 'none',
              borderRadius: 999,
              padding: '11px 26px',
              fontSize: 14,
              fontWeight: 700,
              cursor: !selected || saving ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {saving ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
