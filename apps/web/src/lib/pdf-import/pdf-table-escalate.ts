// Phase 5 (optional) — table-dense page escalation for PDF import.
//
// Flash-Lite handles most pages well, but dense tables are where the cheap
// vision model drifts most (the G3 normalizer in validate.ts already rescues
// shape drift; this handles content quality). When `PDF_TABLE_ESCALATE=1`, a
// page whose extracted structure is table-heavy is re-run through a stronger
// vision engine (Sonnet) and that result is used instead.
//
// Off by default: the wrapper is a pure pass-through (one extra cheap predicate
// call, no second model request) unless the flag is set, so wiring it in never
// changes default behavior or cost.

import type { DocModelBlock } from './doc-model';
import type { PdfStructureEngine } from './engine';
import { logTelemetry } from '../telemetry-server';

export function pdfTableEscalateEnabled(): boolean {
  const v = process.env.PDF_TABLE_ESCALATE;
  return v === '1' || v === 'true';
}

/**
 * A page is "table-dense" when its extracted blocks contain a substantial
 * amount of tabular content (≥ 4 total table rows across all table blocks) —
 * the case where Flash-Lite is most likely to mangle cell content and a
 * stronger model earns its cost.
 */
export function isTableDensePage(blocks: DocModelBlock[]): boolean {
  let tableRows = 0;
  for (const block of blocks) {
    if (block.type === 'table') tableRows += block.rows.length;
  }
  return tableRows >= 4;
}

/**
 * Wrap a primary structure engine so table-dense pages escalate to a stronger
 * `escalate` engine when `PDF_TABLE_ESCALATE` is set. The wrapper keeps the
 * primary engine's identity (so `ImportJob.engine` stays accurate) and falls
 * back to the primary result if escalation fails. Pure pass-through when the
 * flag is off or the escalation engine isn't configured.
 */
export function withTableEscalation(
  primary: PdfStructureEngine,
  escalate: PdfStructureEngine,
): PdfStructureEngine {
  return {
    name: primary.name,
    isConfigured: () => primary.isConfigured(),
    async describePage(input) {
      const blocks = await primary.describePage(input);
      if (!pdfTableEscalateEnabled() || !escalate.isConfigured() || !isTableDensePage(blocks)) {
        return blocks;
      }
      try {
        const escalated = await escalate.describePage(input);
        logTelemetry(null, 'pdf.table_escalated', {
          page: input.pageNumber,
          primary: primary.name,
          escalate: escalate.name,
        });
        return escalated;
      } catch (err) {
        console.error(
          `[pdf-import] table escalation failed (page ${input.pageNumber}); keeping primary`,
          err,
        );
        return blocks;
      }
    },
  };
}
