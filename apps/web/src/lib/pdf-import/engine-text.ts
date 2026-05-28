import type { DocModelBlock } from './doc-model';
import { type DescribePageInput, type PdfStructureEngine, StructureEngineError } from './engine';
import { groundTruthToBlocks } from './heuristic-fallback';

/** Engine identity recorded on `ImportJob.engine`. */
const ENGINE_NAME = 'text-layer';

/**
 * Block types fast mode silently drops. The text-layer classifier never
 * emits these today, but listing them as the exclusion set makes the
 * "Headings / lists / tables preserved; figures, callouts, blockquotes,
 * code blocks dropped" contract from the cost-reduction plan explicit at
 * the engine boundary — a future heuristic change that starts emitting
 * one of them won't accidentally leak through fast mode.
 */
const DROPPED_TYPES: ReadonlySet<DocModelBlock['type']> = new Set([
  'image',
  'callout',
  'blockquote',
  'codeBlock',
]);

/**
 * P4 — heuristic, text-layer-only structure engine.
 *
 * Reuses the deterministic `groundTruthToBlocks` classifier as its core:
 * no LLM call, no rendered page image needed. Fast mode trades figure /
 * callout fidelity for ≈$0.001/page saved on a digital PDF.
 *
 * Throws `StructureEngineError` — which the import worker treats as a
 * signal to promote the page to the Gemini engine — when:
 *
 *   - the page has no text layer (`isScanned`); fast mode is text-only,
 *     a scanned page must run through vision.
 *   - `groundTruthPage` isn't wired through (programming error in the
 *     worker; surfaced loudly rather than silently producing empty pages).
 *   - the classifier produces zero preserved blocks on a page pdfjs
 *     reported as having text — the "tiny corrupted text layer" risk
 *     called out in the plan's P5 risk note.
 *
 * Ships internal-only behind the upcoming `ImportJob.mode` field (P5) —
 * no call site reaches it yet.
 */
export const textLayerEngine: PdfStructureEngine = {
  name: ENGINE_NAME,
  isConfigured: () => true,
  async describePage(input: DescribePageInput): Promise<DocModelBlock[]> {
    if (input.isScanned) {
      throw new StructureEngineError(
        `fast mode requires a text layer; page ${input.pageNumber} is scanned`,
        undefined,
        input.pageNumber,
      );
    }
    if (!input.groundTruthPage) {
      throw new StructureEngineError(
        `fast mode requires groundTruthPage on the engine input (page ${input.pageNumber})`,
        undefined,
        input.pageNumber,
      );
    }

    const blocks = groundTruthToBlocks(input.groundTruthPage).filter(
      (block) => !DROPPED_TYPES.has(block.type),
    );

    if (blocks.length === 0) {
      throw new StructureEngineError(
        `fast mode produced no usable blocks for page ${input.pageNumber}; promote to vision`,
        undefined,
        input.pageNumber,
      );
    }

    return blocks;
  },
};
