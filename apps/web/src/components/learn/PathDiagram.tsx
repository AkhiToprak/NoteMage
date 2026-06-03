'use client';

import type { CSSProperties } from 'react';
import type { PathDiagram as PathDiagramData } from '@notemage/shared';

// Renders an AI-generated structured diagram inside path theory (theory-visuals
// feature). Purely presentational — it takes a diagram already validated by
// PathDiagramSchema and draws it with the project's design tokens. No gradients,
// solid theme-aware colors only, Material Symbols for markers, and vertical
// layouts so every kind stays readable on a phone without horizontal scroll.

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

function Timeline({ diagram }: { diagram: Extract<PathDiagramData, { kind: 'timeline' }> }) {
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
              {ev.label}
            </div>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

function Steps({ diagram }: { diagram: Extract<PathDiagramData, { kind: 'steps' }> }) {
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
                {step.title}
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

function Comparison({ diagram }: { diagram: Extract<PathDiagramData, { kind: 'comparison' }> }) {
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
                    {row.cells[ci] ?? ''}
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

function Cycle({ diagram }: { diagram: Extract<PathDiagramData, { kind: 'cycle' }> }) {
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
              {node}
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
                {diagram.nodes[0]}
              </span>
            )}
          </li>
        ))}
      </ol>
    </Frame>
  );
}

export default function PathDiagram({ diagram }: { diagram: PathDiagramData }) {
  switch (diagram.kind) {
    case 'timeline':
      return <Timeline diagram={diagram} />;
    case 'steps':
      return <Steps diagram={diagram} />;
    case 'comparison':
      return <Comparison diagram={diagram} />;
    case 'cycle':
      return <Cycle diagram={diagram} />;
    default:
      return null;
  }
}
