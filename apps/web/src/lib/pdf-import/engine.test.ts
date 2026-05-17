import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { docModelSchema } from './doc-model';
import { type DescribePageInput, StructureEngineError } from './engine';
import { createGeminiEngine, geminiEngine, type ModelCall, type ModelRequest } from './engine-gemini';

const VALID_RESPONSE = JSON.stringify({
  blocks: [
    { type: 'heading', level: 1, runs: [{ text: 'Title' }] },
    { type: 'paragraph', runs: [{ text: 'Body text.' }] },
  ],
});
const MALFORMED_RESPONSE = '{"blocks":[{"type":"spaceship"}]}';

const PAGE: DescribePageInput = {
  pageImageBase64: 'aGVsbG8=',
  mimeType: 'image/png',
  groundTruthText: 'Title\nBody text.',
  isScanned: false,
  pageNumber: 1,
};

/** A scripted ModelCall — yields `responses` in order and records each request. */
function scriptedCall(responses: (string | Error)[]): {
  call: ModelCall;
  requests: ModelRequest[];
} {
  const requests: ModelRequest[] = [];
  const call: ModelCall = async (req) => {
    requests.push(req);
    const next = responses[requests.length - 1];
    if (next instanceof Error) throw next;
    return next ?? '';
  };
  return { call, requests };
}

describe('createGeminiEngine — parse / repair / throw loop', () => {
  it('returns blocks when the first response is valid', async () => {
    const { call, requests } = scriptedCall([VALID_RESPONSE]);
    const blocks = await createGeminiEngine(call).describePage(PAGE);
    expect(docModelSchema.safeParse({ blocks }).success).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0].repair).toBeUndefined();
  });

  it('runs exactly one repair retry when the first response is malformed', async () => {
    const { call, requests } = scriptedCall([MALFORMED_RESPONSE, VALID_RESPONSE]);
    const blocks = await createGeminiEngine(call).describePage(PAGE);
    expect(blocks).toHaveLength(2);
    expect(requests).toHaveLength(2);
    expect(requests[1].repair?.priorAssistant).toBe(MALFORMED_RESPONSE);
    expect(requests[1].repair?.instruction).toBeTruthy();
  });

  it('throws StructureEngineError when the repair retry also fails', async () => {
    const { call, requests } = scriptedCall([MALFORMED_RESPONSE, MALFORMED_RESPONSE]);
    await expect(createGeminiEngine(call).describePage(PAGE)).rejects.toBeInstanceOf(
      StructureEngineError,
    );
    expect(requests).toHaveLength(2);
  });

  it('does not retry when the model call itself throws', async () => {
    const { call, requests } = scriptedCall([new Error('network down')]);
    await expect(createGeminiEngine(call).describePage(PAGE)).rejects.toThrow('network down');
    expect(requests).toHaveLength(1);
  });

  it('drops image blocks whose ref is not page-namespaced', async () => {
    const response = JSON.stringify({
      blocks: [
        { type: 'image', ref: 'p1-fig-1', bbox: [0, 0, 1, 1] },
        { type: 'image', ref: 'bogus', bbox: [0, 0, 1, 1] },
      ],
    });
    const { call } = scriptedCall([response]);
    const blocks = await createGeminiEngine(call).describePage(PAGE);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: 'image', ref: 'p1-fig-1' });
  });
});

// Live Gemini calls — opt-in only. Needs GEMINI_API_KEY and an explicit
// RUN_PDF_ENGINE_TESTS=1 so a routine `vitest run` never bills the API.
//   RUN_PDF_ENGINE_TESTS=1 GEMINI_API_KEY=... pnpm --filter web test
const RUN_LIVE = !!process.env.GEMINI_API_KEY && process.env.RUN_PDF_ENGINE_TESTS === '1';
const liveSuite = RUN_LIVE ? describe : describe.skip;

liveSuite('geminiEngine.describePage — live Gemini call', () => {
  it('returns schema-valid blocks for a rendered page image', async () => {
    const pngPath = fileURLToPath(new URL('./__fixtures__/sample-page.png', import.meta.url));
    const blocks = await geminiEngine.describePage({
      pageImageBase64: readFileSync(pngPath).toString('base64'),
      mimeType: 'image/png',
      groundTruthText: '',
      isScanned: true,
      pageNumber: 1,
    });
    expect(docModelSchema.safeParse({ blocks }).success).toBe(true);
  }, 120_000);
});
