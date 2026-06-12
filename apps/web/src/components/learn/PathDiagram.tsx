'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { PathDiagram as PathDiagramData } from '@notemage/shared';

// Renders an AI-generated structured diagram inside path theory (theory-visuals
// feature). Purely presentational — it takes a diagram already validated by
// PathDiagramSchema and draws it with the project's design tokens. No gradients,
// solid theme-aware colors only, Material Symbols for markers, and vertical
// layouts so every kind stays readable on a phone without horizontal scroll.
//
// Diagram cloze (Phase 5): when `maskMarker` is set, any label equal to it is
// the masked element of a "what's missing?" question — drawn as a distinct "?"
// chip instead of the literal marker glyph. Backward-compatible: theory and the
// Phase 3 reference panel never pass `maskMarker`, so the chip never appears.

// Renders a label string, swapping the mask marker for a "?" chip. Used by every
// kind so the masked element reads the same everywhere it can appear.
function Label({ value, maskMarker }: { value: string; maskMarker?: string }): ReactNode {
  if (maskMarker && value === maskMarker) {
    return (
      <span
        aria-label="missing label"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '28px',
          height: '24px',
          padding: '0 8px',
          borderRadius: 'var(--radius-sm)',
          border: '1px dashed var(--primary)',
          background: 'var(--surface-container-high)',
          color: 'var(--primary)',
          fontWeight: 800,
          fontSize: '14px',
          lineHeight: 1,
          verticalAlign: 'middle',
        }}
      >
        ?
      </span>
    );
  }
  return value;
}

const KIND_ICON: Record<PathDiagramData['kind'], string> = {
  timeline: 'timeline',
  steps: 'format_list_numbered',
  comparison: 'compare_arrows',
  cycle: 'cached',
};

const figureStyle: CSSProperties = {
  margin: '1em 0',
  padding: '16px 18px',
  background: 'var(--surface-container)',
  border: '1px solid var(--outline-variant)',
  borderRadius: 'var(--radius-lg)',
};

const titleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  margin: '0 0 14px',
  fontFamily: 'var(--font-display)',
  fontSize: '14px',
  fontWeight: 800,
  letterSpacing: '0.02em',
  textTransform: 'uppercase',
  color: 'var(--on-surface-variant)',
};

function Frame({
  kind,
  title,
  children,
}: {
  kind: PathDiagramData['kind'];
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <figure role="group" aria-label={title ?? `${kind} diagram`} style={figureStyle}>
      <figcaption style={titleStyle}>
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden>
          {KIND_ICON[kind]}
        </span>
        {title ?? kind}
      </figcaption>
      {children}
    </figure>
  );
}

function Timeline({
  diagram,
  maskMarker,
}: {
  diagram: Extract<PathDiagramData, { kind: 'timeline' }>;
  maskMarker?: string;
}) {
  return (
    <Frame kind="timeline" title={diagram.title}>
      <ol
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          position: 'relative',
          borderLeft: '2px solid var(--outline-variant)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {diagram.events.map((ev, i) => (
          <li key={i} style={{ position: 'relative', paddingLeft: '20px' }}>
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: '-7px',
                top: '4px',
                width: '12px',
                height: '12px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--primary)',
                border: '2px solid var(--surface-container)',
              }}
            />
            <div
              style={{
                fontWeight: 800,
                fontSize: '13px',
                color: 'var(--primary)',
                letterSpacing: '0.01em',
              }}
            >
              {ev.date}
            </div>
            <div style={{ color: 'var(--on-surface)', fontSize: '14px', lineHeight: 1.5 }}>
              <Label value={ev.label} maskMarker={maskMarker} />
            </div>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

function Steps({
  diagram,
  maskMarker,
}: {
  diagram: Extract<PathDiagramData, { kind: 'steps' }>;
  maskMarker?: string;
}) {
  return (
    <Frame kind="steps" title={diagram.title}>
      <ol
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {diagram.steps.map((step, i) => (
          <li key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <span
              aria-hidden
              style={{
                flexShrink: 0,
                width: '26px',
                height: '26px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--primary)',
                color: 'var(--on-primary)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 800,
              }}
            >
              {i + 1}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: 'var(--on-surface)', fontSize: '14px', fontWeight: 700 }}>
                <Label value={step.title} maskMarker={maskMarker} />
              </div>
              {step.detail ? (
                <div
                  style={{
                    color: 'var(--on-surface-variant)',
                    fontSize: '13px',
                    lineHeight: 1.5,
                    marginTop: '2px',
                  }}
                >
                  {step.detail}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

function Comparison({
  diagram,
  maskMarker,
}: {
  diagram: Extract<PathDiagramData, { kind: 'comparison' }>;
  maskMarker?: string;
}) {
  const cellStyle: CSSProperties = {
    padding: '8px 12px',
    borderBottom: '1px solid var(--outline-variant)',
    textAlign: 'left',
    fontSize: '13px',
    color: 'var(--on-surface)',
    verticalAlign: 'top',
  };
  return (
    <Frame kind="comparison" title={diagram.title}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 'min(100%, 360px)' }}>
          <thead>
            <tr style={{ background: 'var(--surface-container-high)' }}>
              <th style={{ ...cellStyle, fontWeight: 800 }} />
              {diagram.columns.map((col, i) => (
                <th key={i} style={{ ...cellStyle, fontWeight: 800, color: 'var(--on-surface)' }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {diagram.rows.map((row, ri) => (
              <tr key={ri}>
                <th
                  scope="row"
                  style={{
                    ...cellStyle,
                    fontWeight: 700,
                    color: 'var(--on-surface-variant)',
                  }}
                >
                  {row.label}
                </th>
                {diagram.columns.map((_, ci) => (
                  <td key={ci} style={cellStyle}>
                    <Label value={row.cells[ci] ?? ''} maskMarker={maskMarker} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Frame>
  );
}

function Cycle({
  diagram,
  maskMarker,
}: {
  diagram: Extract<PathDiagramData, { kind: 'cycle' }>;
  maskMarker?: string;
}) {
  return (
    <Frame kind="cycle" title={diagram.title}>
      <ol
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        {diagram.nodes.map((node, i) => (
          <li key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span
              style={{
                display: 'inline-block',
                padding: '8px 14px',
                background: 'var(--surface-container-high)',
                border: '1px solid var(--outline-variant)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--on-surface)',
                fontSize: '14px',
                fontWeight: 600,
              }}
            >
              <Label value={node} maskMarker={maskMarker} />
            </span>
            {i < diagram.nodes.length - 1 ? (
              <span
                className="material-symbols-outlined"
                aria-hidden
                style={{ color: 'var(--primary)', fontSize: '20px', marginLeft: '12px' }}
              >
                arrow_downward
              </span>
            ) : (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginLeft: '12px',
                  marginTop: '4px',
                  color: 'var(--on-surface-variant)',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                <span
                  className="material-symbols-outlined"
                  aria-hidden
                  style={{ fontSize: '16px' }}
                >
                  cached
                </span>
                <Label value={diagram.nodes[0]} maskMarker={maskMarker} />
              </span>
            )}
          </li>
        ))}
      </ol>
    </Frame>
  );
}

export default function PathDiagram({
  diagram,
  maskMarker,
}: {
  diagram: PathDiagramData;
  // Diagram cloze (Phase 5): when set, any label equal to this marker renders as
  // a "?" chip. Omit for theory + the Phase 3 reference panel (no masking).
  maskMarker?: string;
}) {
  switch (diagram.kind) {
    case 'timeline':
      return <Timeline diagram={diagram} maskMarker={maskMarker} />;
    case 'steps':
      return <Steps diagram={diagram} maskMarker={maskMarker} />;
    case 'comparison':
      return <Comparison diagram={diagram} maskMarker={maskMarker} />;
    case 'cycle':
      return <Cycle diagram={diagram} maskMarker={maskMarker} />;
    default:
      return null;
  }
}
