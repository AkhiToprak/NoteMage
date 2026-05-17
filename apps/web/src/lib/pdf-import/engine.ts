import type { DocModelBlock } from './doc-model';

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
}

/**
 * A swappable structure engine: turns one PDF page into a validated
 * `DocModelBlock[]`. `describePage` resolves to already-validated blocks
 * or throws `StructureEngineError`. The import worker falls back to the
 * deterministic heuristic on any throw, so import never hard-fails.
 *
 * The interface is the seam that makes a second engine a drop-in.
 */
export interface PdfStructureEngine {
  /** Engine identity recorded on `ImportJob.engine`, e.g. `gemini-flash-lite`. */
  readonly name: string;
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
