import type { Content, GoogleGenAI } from '@google/genai';
import type { DocModelBlock } from './doc-model';
import {
  canonicalizeImageRefs,
  type DescribePageInput,
  type PdfStructureEngine,
  type PdfUsageSink,
  StructureEngineError,
} from './engine';
import { getGeminiClient } from '../gemini';
import { DOC_MODEL_JSON_SCHEMA } from './doc-model-json-schema';
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

export type ModelCall = (req: ModelRequest, onUsage?: PdfUsageSink) => Promise<string>;

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

/**
 * Constrained decoding: when enabled (default), the DocModel JSON Schema is
 * passed as `responseJsonSchema`, making trailing junk, duplicated objects
 * and drifted shapes impossible to emit. `PDF_GEMINI_SCHEMA=0` disables it;
 * if the API ever rejects the schema itself (subset drift on Google's side),
 * the call self-heals — it retries bare and remembers for the process.
 */
let schemaRejected = false;
const schemaEnabled = (): boolean =>
  process.env.PDF_GEMINI_SCHEMA !== '0' && !schemaRejected;

function isSchemaRejection(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /INVALID_ARGUMENT|response_json_schema|responseJsonSchema|json.?schema/i.test(message);
}

/** The real Gemini-backed model call. */
const geminiModelCall: ModelCall = async (req, onUsage) => {
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

  const generate = (withSchema: boolean) =>
    client.models.generateContent({
      model: GEMINI_PDF_MODEL,
      contents,
      config: {
        systemInstruction: req.systemPrompt,
        temperature: 0,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        responseMimeType: 'application/json',
        // Flash-Lite enables thinking by default; thinking tokens bill at the
        // output rate. Structured page transcription doesn't need it.
        thinkingConfig: { thinkingBudget: 0 },
        ...(withSchema ? { responseJsonSchema: DOC_MODEL_JSON_SCHEMA } : {}),
        abortSignal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      },
    });

  try {
    let response: Awaited<ReturnType<typeof generate>>;
    try {
      response = await generate(schemaEnabled());
    } catch (err) {
      if (!schemaEnabled() || !isSchemaRejection(err)) throw err;
      console.warn(
        '[pdf-import] Gemini rejected responseJsonSchema — retrying without it',
        err instanceof Error ? err.message : err,
      );
      schemaRejected = true;
      response = await generate(false);
    }
    // `promptTokenCount` is the total input (cached subset included), matching
    // the convention the chat/path Gemini call sites pass to logAiUsage().
    const u = response.usageMetadata;
    if (onUsage && u) {
      onUsage({
        provider: 'gemini',
        model: GEMINI_PDF_MODEL,
        inputTokens: u.promptTokenCount ?? 0,
        outputTokens: u.candidatesTokenCount ?? 0,
        cacheReadTokens: u.cachedContentTokenCount ?? 0,
        cacheWriteTokens: 0,
      });
    }
    // A dense page can hit MAX_OUTPUT_TOKENS. The repair retry re-sends the full
    // page image and truncates at the same point — burn 2× for zero gain. Throw
    // (AFTER metering the spend above) so describePage skips the repair and the
    // worker keeps the heuristic result (same MAX_TOKENS guard pattern the
    // retired Anthropic engine used).
    if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
      throw new StructureEngineError(
        `Gemini vision response truncated at maxOutputTokens (${MAX_OUTPUT_TOKENS})`,
      );
    }
    return response.text ?? '';
  } catch (err) {
    if (err instanceof StructureEngineError) throw err; // e.g. the MAX_TOKENS guard
    const aborted =
      err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    const message = aborted
      ? `Gemini request timed out after ${PAGE_TIMEOUT_MS}ms`
      : `Gemini request failed: ${err instanceof Error ? err.message : String(err)}`;
    throw new StructureEngineError(message, err);
  }
};


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

      const firstRaw = await call(base, input.onUsage);
      const first = parseDocModelBlocks(firstRaw);
      if (first.ok && first.blocks) return canonicalizeImageRefs(first.blocks, input.pageNumber);

      const repairRaw = await call(
        {
          ...base,
          repair: {
            priorAssistant: firstRaw,
            instruction: buildRepairSuffix(first.error ?? 'unknown validation error'),
          },
        },
        input.onUsage,
      );
      const second = parseDocModelBlocks(repairRaw);
      if (second.ok && second.blocks) return canonicalizeImageRefs(second.blocks, input.pageNumber);

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
