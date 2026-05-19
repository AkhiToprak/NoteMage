import type { Content, GoogleGenAI } from '@google/genai';
import type { DocModelBlock } from './doc-model';
import { type DescribePageInput, type PdfStructureEngine, StructureEngineError } from './engine';
import { getGeminiClient } from '../gemini';
import { buildPageUserText, buildRepairSuffix, STRUCTURE_SYSTEM_PROMPT } from './prompt';
import { parseDocModelBlocks } from './validate';

/**
 * Gemini model id. Override with `GEMINI_PDF_MODEL` — Google rotates ids,
 * so the constant is env-overridable rather than hard-coded.
 */
export const GEMINI_PDF_MODEL = process.env.GEMINI_PDF_MODEL ?? 'gemini-2.5-flash-lite';

/** Hard ceiling on one model round trip. */
const PAGE_TIMEOUT_MS = 60_000;

/**
 * Output budget — a dense page's block JSON is large, and on a no-text-layer
 * page the model transcribes the whole page, which is larger still. Too low a
 * cap truncates the JSON and fails the parse, forcing a heuristic fallback.
 */
const MAX_OUTPUT_TOKENS = 32768;

/** Engine identity recorded on `ImportJob.engine`. */
const ENGINE_NAME = 'gemini-flash-lite';

/** A figure ref the import worker can match to a cropped image. */
const VALID_IMAGE_REF = /^p\d+-fig-\d+$/;

/**
 * One raw model round trip. This is the seam that makes the engine
 * testable: production wires in `geminiModelCall`; tests wire in a fake to
 * exercise the parse / repair / throw loop without a network call.
 */
export interface ModelRequest {
  systemPrompt: string;
  userText: string;
  imageBase64: string;
  mimeType: string;
  /** Present on the repair turn — carries the prior, rejected output. */
  repair?: { priorAssistant: string; instruction: string };
}

export type ModelCall = (req: ModelRequest) => Promise<string>;

/** Resolve the shared Gemini client, translating a missing-key error into
 *  this engine's error type so the import worker's catch-all sees the
 *  expected shape. */
function getClient(): GoogleGenAI {
  try {
    return getGeminiClient();
  } catch (err) {
    throw new StructureEngineError(
      err instanceof Error ? err.message : String(err),
      err,
    );
  }
}

/** The real Gemini-backed model call. */
const geminiModelCall: ModelCall = async (req) => {
  const client = getClient();

  const userParts = [
    { inlineData: { mimeType: req.mimeType, data: req.imageBase64 } },
    { text: req.userText },
  ];
  const contents: Content[] = req.repair
    ? [
        { role: 'user', parts: userParts },
        { role: 'model', parts: [{ text: req.repair.priorAssistant }] },
        { role: 'user', parts: [{ text: req.repair.instruction }] },
      ]
    : [{ role: 'user', parts: userParts }];

  try {
    const response = await client.models.generateContent({
      model: GEMINI_PDF_MODEL,
      contents,
      config: {
        systemInstruction: req.systemPrompt,
        temperature: 0,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        responseMimeType: 'application/json',
        abortSignal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      },
    });
    return response.text ?? '';
  } catch (err) {
    const aborted =
      err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    const message = aborted
      ? `Gemini request timed out after ${PAGE_TIMEOUT_MS}ms`
      : `Gemini request failed: ${err instanceof Error ? err.message : String(err)}`;
    throw new StructureEngineError(message, err);
  }
};

/** Drop `image` blocks whose ref cannot be matched to a cropped figure. */
function cleanImageRefs(blocks: DocModelBlock[]): DocModelBlock[] {
  return blocks.filter((block) => block.type !== 'image' || VALID_IMAGE_REF.test(block.ref));
}

/**
 * Build a structure engine over a raw model call.
 *
 * `describePage`: call the model, parse + validate the response, and on a
 * schema failure run exactly ONE repair retry (re-prompting with the zod
 * error and the prior output). If the retry also fails — or the model call
 * itself throws (network, timeout, rate limit) — it throws. The import
 * worker catches every throw and falls back to the heuristic extractor.
 */
export function createGeminiEngine(call: ModelCall): PdfStructureEngine {
  return {
    name: ENGINE_NAME,
    isConfigured: () => Boolean(process.env.GEMINI_API_KEY),
    async describePage(input: DescribePageInput): Promise<DocModelBlock[]> {
      const base: ModelRequest = {
        systemPrompt: STRUCTURE_SYSTEM_PROMPT,
        userText: buildPageUserText(input),
        imageBase64: input.pageImageBase64,
        mimeType: input.mimeType,
      };

      const firstRaw = await call(base);
      const first = parseDocModelBlocks(firstRaw);
      if (first.ok && first.blocks) return cleanImageRefs(first.blocks);

      const repairRaw = await call({
        ...base,
        repair: {
          priorAssistant: firstRaw,
          instruction: buildRepairSuffix(first.error ?? 'unknown validation error'),
        },
      });
      const second = parseDocModelBlocks(repairRaw);
      if (second.ok && second.blocks) return cleanImageRefs(second.blocks);

      throw new StructureEngineError(
        `structure parse failed after one repair retry (page ${input.pageNumber}): ${second.error}`,
        undefined,
        input.pageNumber,
      );
    },
  };
}

/** The default engine — the real Gemini call. */
export const geminiEngine: PdfStructureEngine = createGeminiEngine(geminiModelCall);
