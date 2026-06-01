// Anthropic Sonnet vision structure engine — the escalation target for
// table-dense PDF pages (see pdf-table-escalate.ts). Mirrors engine-gemini.ts:
// same shared system prompt, same `parseDocModelBlocks` validation (with the G3
// normalizer), same one-repair-retry loop. Only the model call differs (Claude
// vision instead of Gemini). Dormant unless `PDF_TABLE_ESCALATE=1`.

import type Anthropic from '@anthropic-ai/sdk';
import type { DocModelBlock } from './doc-model';
import { type DescribePageInput, type PdfStructureEngine, StructureEngineError } from './engine';
import { anthropic, AI_GENERATION_MODEL, MAX_OUTPUT_TOKENS } from '../anthropic';
import { buildPageUserText, buildRepairSuffix, STRUCTURE_SYSTEM_PROMPT } from './prompt';
import { parseDocModelBlocks } from './validate';

const ENGINE_NAME = 'anthropic-sonnet';

/** A figure ref the import worker can match to a cropped image. */
const VALID_IMAGE_REF = /^p\d+-fig-\d+$/;

/** One raw Claude vision round trip (optionally a repair turn). */
export type ModelCall = (
  input: DescribePageInput,
  repair?: { priorAssistant: string; instruction: string },
) => Promise<string>;

const anthropicVisionCall: ModelCall = async (input, repair) => {
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
      system: STRUCTURE_SYSTEM_PROMPT,
      messages,
    });
    return response.content
      .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
  } catch (err) {
    throw new StructureEngineError(
      `Anthropic vision request failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
      input.pageNumber,
    );
  }
};

/** Drop `image` blocks whose ref cannot be matched to a cropped figure. */
function cleanImageRefs(blocks: DocModelBlock[]): DocModelBlock[] {
  return blocks.filter((block) => block.type !== 'image' || VALID_IMAGE_REF.test(block.ref));
}

/** Build a Sonnet vision engine over a raw model call (seam for tests). */
export function createAnthropicEngine(call: ModelCall): PdfStructureEngine {
  return {
    name: ENGINE_NAME,
    isConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY),
    async describePage(input: DescribePageInput): Promise<DocModelBlock[]> {
      const firstRaw = await call(input);
      const first = parseDocModelBlocks(firstRaw);
      if (first.ok && first.blocks) return cleanImageRefs(first.blocks);

      const repairRaw = await call(input, {
        priorAssistant: firstRaw,
        instruction: buildRepairSuffix(first.error ?? 'unknown validation error'),
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

/** The default Sonnet vision engine — the real Anthropic call. */
export const anthropicVisionEngine: PdfStructureEngine = createAnthropicEngine(anthropicVisionCall);
