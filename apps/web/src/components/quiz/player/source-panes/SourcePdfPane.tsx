'use client';

// Source-highlighting feature — PDF pane (Phase 2). Shows the grounding quote,
// then renders the original PDF at the cited page with the quoted passage
// highlighted (PdfHighlightViewer, pdf.js — lazily loaded). The viewer degrades
// to the browser's native PDF viewer on any pdf.js failure, and the quote block
// above is the guaranteed fallback when no file is available at all.

import type { ResolvedSource } from '@/lib/source-anchor';
import SourceQuote from './SourceQuote';
import PdfHighlightViewer from './PdfHighlightViewer';

export default function SourcePdfPane({ source }: { source: ResolvedSource }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <SourceQuote quote={source.quote} />
      {source.fileUrl ? (
        <PdfHighlightViewer fileUrl={source.fileUrl} page={source.page ?? 1} quote={source.quote} />
      ) : null}
    </div>
  );
}
