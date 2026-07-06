import type { DocModelBlock } from './doc-model';
import type { GroundTruthPage } from './ground-truth';

/**
 * One PDF page handed to a structure engine: a rendered image plus the
 * verbatim text layer from `ground-truth.ts`. A scanned page carries no
 * text layer, so `groundTruthText` is empty and `isScanned` is true — the
 * engine then transcribes from the image instead of anchoring to the text.
 */
export interface DescribePageInput {
  /** Base64-encoded page image, with no `data:` URL prefix. */
  pageImageBase64: string;
  /** MIME type of `pageImageBase64`, e.g. `image/png`. */
  mimeType: string;
  /** Verbatim text layer for this page; empty string when `isScanned`. */
  groundTruthText: string;
  /** True when the page has no extractable text layer. */
  isScanned: boolean;
  /**
   * 1-based page number. Namespaces the `image` block refs the engine
   * emits (`p{n}-fig-{i}`) so they stay unique once the import worker
   * concatenates the per-page block arrays into one document.
   */
  pageNumber: number;
  /**
   * Full geometric ground truth for this page — line geometry, font sizes,
   * column x-positions. Required by structure engines that classify from
   * the text layer alone (no LLM, no rendered image). Vision-backed engines
   * like Gemini ignore this field.
   */
  groundTruthPage?: GroundTruthPage;
  /**
   * Best-effort token-usage sink, invoked once per model round trip a
   * vision engine makes for this page (initial call + any repair retry, and
   * once more if the page escalates to a second engine). The text-layer
   * engine makes no model call, so it never fires. The import worker wires
   * this to `logAiUsage('pdf-import', …)` so vision spend lands in the admin
   * AI-usage ledger; engines that don't surface usage simply never call it.
   */
  onUsage?: PdfUsageSink;
}

/** Token usage from one PDF-structure model round trip. Gemini is the only
 *  structure engine (the Anthropic vision engine was retired). */
export interface PdfPageUsage {
  provider: 'gemini';
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export type PdfUsageSink = (usage: PdfPageUsage) => void;

/**
 * A swappable structure engine: turns one PDF page into a validated
 * `DocModelBlock[]`. `describePage` resolves to already-validated blocks
 * or throws `StructureEngineError`. The import worker falls back to the
 * deterministic heuristic on any throw, so import never hard-fails.
 *
 * The interface keeps a second engine a drop-in, should one ever be needed.
 */
export interface PdfStructureEngine {
  /** Engine identity recorded on `ImportJob.engine`, e.g. `gemini-flash-lite`. */
  readonly name: string;
  /**
   * True when the engine has the credentials it needs to run. When false,
   * every page would fall back to the text-only heuristic — no figures, no
   * rich structure — so the import route refuses the request upfront.
   */
  isConfigured(): boolean;
  describePage(input: DescribePageInput): Promise<DocModelBlock[]>;
}

/** Thrown by a `PdfStructureEngine` when a page cannot be described. */
export class StructureEngineError extends Error {
  /** 1-based page the failure occurred on, when known. */
  readonly pageNumber?: number;

  constructor(message: string, cause?: unknown, pageNumber?: number) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'StructureEngineError';
    this.pageNumber = pageNumber;
  }
}

/**
 * Re-key every `image` block to the canonical `p{n}-fig-{i}` ref, numbered
 * in reading order. The user message asks the model to echo these exact ids,
 * but small models routinely improvise ("fig1", "image-1") — and the ref's
 * only real job is to be CONSISTENT between the block and the crop map the
 * import worker builds from those same blocks. Renumbering keeps every
 * figure; the old policy of dropping non-matching refs silently lost them.
 */
export function canonicalizeImageRefs(
  blocks: DocModelBlock[],
  pageNumber: number,
): DocModelBlock[] {
  let index = 0;
  return blocks.map((block) => {
    if (block.type !== 'image') return block;
    index += 1;
    return { ...block, ref: `p${pageNumber}-fig-${index}` };
  });
}
