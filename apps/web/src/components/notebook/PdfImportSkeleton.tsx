'use client';

// P6 — placeholder rows shown inside PdfImportProgressModal while the
// worker is still in its `extracting` phase, before per-page counts
// arrive. Solid-colour blocks pulsing on opacity only (no shimmer, no
// gradient) — a quiet preview of the notebook page being assembled.

interface SkeletonRow {
  width: string;
  height: number;
  kind: 'heading' | 'line' | 'figure';
}

const ROWS: SkeletonRow[] = [
  { width: '52%', height: 20, kind: 'heading' },
  { width: '100%', height: 11, kind: 'line' },
  { width: '93%', height: 11, kind: 'line' },
  { width: '78%', height: 11, kind: 'line' },
  { width: '100%', height: 94, kind: 'figure' },
  { width: '88%', height: 11, kind: 'line' },
  { width: '61%', height: 11, kind: 'line' },
];

function rowStyle(row: SkeletonRow, index: number): React.CSSProperties {
  const base: React.CSSProperties = {
    width: row.width,
    height: `${row.height}px`,
    animation: 'nm-pdf-skel-pulse 1.5s ease-in-out infinite',
    animationDelay: `${index * 0.13}s`,
  };
  if (row.kind === 'heading') {
    return {
      ...base,
      background: 'var(--surface-container-highest)',
      borderRadius: 'var(--radius-sm)',
    };
  }
  if (row.kind === 'figure') {
    return {
      ...base,
      background: 'var(--surface-container-high)',
      border: '1px solid var(--outline-variant)',
      borderRadius: 'var(--radius-md)',
    };
  }
  return {
    ...base,
    background: 'var(--surface-container-high)',
    borderRadius: '999px',
  };
}

export default function PdfImportSkeleton() {
  return (
    <div
      aria-hidden="true"
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {ROWS.map((row, index) => (
        <div key={index} style={rowStyle(row, index)} />
      ))}
      <style>{`
        @keyframes nm-pdf-skel-pulse {
          0%, 100% { opacity: 0.9; }
          50% { opacity: 0.38; }
        }
      `}</style>
    </div>
  );
}
