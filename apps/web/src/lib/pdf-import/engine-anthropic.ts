// Anthropic Sonnet vision structure engine — the escalation target for
// table-dense PDF pages (see pdf-table-escalate.ts). Mirrors engine-gemini.ts:
// same shared system prompt, same `parseDocModelBlocks` validation (with the G3
// normalizer), same one-repair-retry loop. Only the model call differs (Claude
// vision instead of Gemini). Dormant unless `PDF_TABLE_ESCALATE=1`.

import Anthropic from '@anthropic-ai/sdk';
import type { DocModelBlock } from './doc-model';
import {
  canonicalizeImageRefs,
  type DescribePageInput,
  type PdfStructureEngine,
  type PdfUsageSink,
  StructureEngineError,
} from './engine';
import { anthropic, AI_GENERATION_MODEL, MAX_OUTPUT_TOKENS } from '../anthropic';
import { buildPageUserText, buildRepairSuffix, STRUCTURE_SYSTEM_PROMPT } from './prompt';
import { parseDocModelBlocks } from './validate';

// PA-09: STRUCTURE_SYSTEM_PROMPT is ~2.1–2.5K tokens — just above Sonnet 4.6's
// 2048-token minimum. Sequential per-page calls make this cacheable from page 2
// onward, so we send a block array with cache_control instead of a plain string.
// `system: Array<TextBlockParam>` is accepted by the SDK (SDK 0.80+).
const CACHED_SYSTEM: Anthropic.Messages.TextBlockParam[] = [
  {
    type: 'text',
    text: STRUCTURE_SYSTEM_PROMPT,
    cache_control: { type: 'ephemeral' },
  },
];

const ENGINE_NAME = 'anthropic-sonnet';

/** One raw Claude vision round trip (optionally a repair turn). */
export type ModelCall = (
  input: DescribePageInput,
  repair?: { priorAssistant: string; instruction: string },
  onUsage?: PdfUsageSink,
) => Promise<string>;

const anthropicVisionCall: ModelCall = async (input, repair, onUsage) => {
  const userContent: Anthropic.Messages.ContentBlockParam[] = [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: input.mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
        data: input.pageImageBase64,
      },
    },
    { type: 'text', text: buildPageUserText(input) },
  ];

  const messages: Anthropic.Messages.MessageParam[] = repair
    ? [
        { role: 'user', content: userContent },
        { role: 'assistant', content: repair.priorAssistant },
        { role: 'user', content: repair.instruction },
      ]
    : [{ role: 'user', content: userContent }];

  try {
    const response = await anthropic.messages.create({
      model: AI_GENERATION_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      // PA-09: block-array system with cache_control so the shared prompt is
      // cached from page 2 onward (sequential per-page calls within one import).
      system: CACHED_SYSTEM,
      messages,
    });

    // PA-09: table-dense pages can hit MAX_OUTPUT_TOKENS (16K). Re-sending the
    // full image on a repair retry will truncate again at the same point — burn
    // 2× for zero gain. Throw so the caller keeps the Gemini result instead.
    if (response.stop_reason === 'max_tokens') {
      throw new StructureEngineError(
        `Anthropic vision response truncated at max_tokens (${MAX_OUTPUT_TOKENS}) on page ${input.pageNumber} — keeping Gemini result`,
        undefined,
        input.pageNumber,
      );
    }

    if (onUsage) {
      onUsage({
        provider: 'anthropic',
        model: AI_GENERATION_MODEL,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      });
    }
    return response.content
      .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
  } catch (err) {
    if (err instanceof StructureEngineError) throw err;
    throw new StructureEngineError(
      `Anthropic vision request failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
      input.pageNumber,
    );
  }
};

/** Build a Sonnet vision engine over a raw model call (seam for tests). */
export function createAnthropicEngine(call: ModelCall): PdfStructureEngine {
  return {
    name: ENGINE_NAME,
    isConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY),
    async describePage(input: DescribePageInput): Promise<DocModelBlock[]> {
      const firstRaw = await call(input, undefined, input.onUsage);
      const first = parseDocModelBlocks(firstRaw);
      if (first.ok && first.blocks) return canonicalizeImageRefs(first.blocks, input.pageNumber);

      const repairRaw = await call(
        input,
        {
          priorAssistant: firstRaw,
          instruction: buildRepairSuffix(first.error ?? 'unknown validation error'),
        },
        input.onUsage,
      );
      const second = parseDocModelBlocks(repairRaw);
      if (second.ok && second.blocks)
        return canonicalizeImageRefs(second.blocks, input.pageNumber);

      throw new StructureEngineError(
        `structure parse failed after one repair retry (page ${input.pageNumber}): ${second.error}`,
        undefined,
        input.pageNumber,
      );
    },
  };
}

/** The default Sonnet vision engine — the real Anthropic call. */
export const anthropicVisionEngine: PdfStructureEngine = createAnthropicEngine(anthropicVisionCall);
