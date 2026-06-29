'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Source-highlighting feature, Phase 2 — render the cited PDF page with pdf.js
// and paint highlight rectangles over the quoted passage. pdf.js (and its worker)
// load lazily inside the effect, so this never enters the quiz-player bundle until
// a PDF source is actually opened. Highlight geometry is computed directly from
// the page's text items (no text layer) so positioning is deterministic; whole
// text-items overlapping the quote get a translucent box over the rendered glyphs.
//
// Graceful degradation: if the quote can't be located we still show the page
// (page-only); if pdf.js fails entirely (CORS, decode error, blocked worker) we
// fall back to the browser's native PDF viewer via an iframe (#page=N).

import { useEffect, useRef, useState } from 'react';
import { locateQuote } from '@/lib/source-highlight';

const MAX_SCALE = 3;
const MAX_DPR = 2;

export default function PdfHighlightViewer({
  fileUrl,
  page = 1,
  quote,
}: {
  fileUrl: string;
  page?: number;
  quote: string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: any = null;
    let renderTask: any = null;
    const overlayEl = overlayRef.current;

    (async () => {
      try {
        const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
        // The worker is copied to /public by next.config at build time.
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs-worker.mjs';
        }

        pdfDoc = await pdfjs.getDocument({ url: fileUrl }).promise;
        if (cancelled) return;

        const pageNum = Math.min(Math.max(1, page), pdfDoc.numPages);
        const pdfPage = await pdfDoc.getPage(pageNum);
        if (cancelled) return;

        const scroll = scrollRef.current;
        const canvas = canvasRef.current;
        const overlay = overlayRef.current;
        if (!scroll || !canvas || !overlay) return;

        const base = pdfPage.getViewport({ scale: 1 });
        const containerWidth = scroll.clientWidth || 420;
        const scale = Math.min(containerWidth / base.width, MAX_SCALE);
        const viewport = pdfPage.getViewport({ scale });
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

        const cssW = Math.floor(viewport.width);
        const cssH = Math.floor(viewport.height);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        overlay.style.width = `${cssW}px`;
        overlay.style.height = `${cssH}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d context');

        renderTask = pdfPage.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        await renderTask.promise;
        if (cancelled) return;

        // ── Highlight ── concatenate the page's text items, fuzzy-locate the
        // quote, then box every item that overlaps the matched range.
        const textContent = await pdfPage.getTextContent();
        if (cancelled) return;
        const items = (textContent.items as any[]).filter((it) => typeof it?.str === 'string');

        let full = '';
        const ranges: { item: any; start: number; end: number }[] = [];
        for (const it of items) {
          const start = full.length;
          full += it.str;
          ranges.push({ item: it, start, end: full.length });
          full += ' '; // joiner — locateQuote collapses whitespace
        }

        const match = quote ? locateQuote(full, quote) : null;
        if (match) {
          const covering = ranges.filter((r) => r.start < match.end && r.end > match.start);
          let firstTop = Infinity;
          for (const { item } of covering) {
            const tx = pdfjs.Util.transform(viewport.transform, item.transform);
            const fontHeight = Math.hypot(tx[2], tx[3]);
            if (!Number.isFinite(fontHeight) || fontHeight <= 0) continue;
            const left = tx[4];
            const top = tx[5] - fontHeight;
            const width = Math.max((item.width ?? 0) * scale, 2);
            const mark = document.createElement('div');
            mark.className = 'pdfhl-mark';
            mark.style.left = `${left}px`;
            mark.style.top = `${top}px`;
            mark.style.width = `${width}px`;
            mark.style.height = `${fontHeight * 1.15}px`;
            overlay.appendChild(mark);
            if (top < firstTop) firstTop = top;
          }
          if (Number.isFinite(firstTop)) {
            const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            scroll.scrollTo({
              top: Math.max(0, firstTop - scroll.clientHeight / 3),
              behavior: reduce ? 'auto' : 'smooth',
            });
          }
        }

        pdfPage.cleanup?.();
        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('failed');
      }
    })();

    return () => {
      cancelled = true;
      try {
        renderTask?.cancel?.();
      } catch {
        /* render already settled */
      }
      pdfDoc?.destroy?.();
      if (overlayEl) overlayEl.innerHTML = '';
    };
  }, [fileUrl, page, quote]);

  // Hard failure → the browser's native PDF viewer (no CORS / worker needed).
  if (status === 'failed') {
    return (
      <div
        style={{
          height: 'min(72vh, 760px)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          border: '1px solid var(--quiz-card-border)',
          background: 'var(--quiz-card)',
        }}
      >
        <iframe
          title={`Source PDF — page ${page}`}
          src={`${fileUrl}#page=${page}&view=FitH`}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        />
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      style={{
        position: 'relative',
        height: 'min(72vh, 760px)',
        overflow: 'auto',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--quiz-card-border)',
        background: 'var(--quiz-card)',
      }}
    >
      <style>{`
        .pdfhl-mark {
          position: absolute;
          background: var(--nm-primary);
          opacity: 0.26;
          border-radius: 2px;
          pointer-events: none;
        }
        .pdfhl-page canvas { display: block; }
      `}</style>

      <div className="pdfhl-page" style={{ position: 'relative', width: 'fit-content', margin: '0 auto' }}>
        <canvas ref={canvasRef} />
        <div ref={overlayRef} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} />
      </div>

      {status === 'loading' ? (
        <div
          aria-busy="true"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            color: 'var(--on-surface-variant)',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          <span className="material-symbols-outlined pdfhl-spin" style={{ fontSize: 20 }} aria-hidden>
            progress_activity
          </span>
          Loading page…
          <style>{`
            .pdfhl-spin { animation: pdfhlSpin 0.9s linear infinite; }
            @keyframes pdfhlSpin { to { transform: rotate(360deg); } }
            @media (prefers-reduced-motion: reduce) { .pdfhl-spin { animation: none; } }
          `}</style>
        </div>
      ) : null}
    </div>
  );
}
