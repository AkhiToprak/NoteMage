import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StructureEngineError } from './engine';

// Mock the shared Gemini client so the REAL geminiModelCall (config + finishReason
// handling) runs against a fake generateContent — no network, no key needed.
const generateContent = vi.fn();
vi.mock('../gemini', () => ({
  getGeminiClient: () => ({ models: { generateContent } }),
}));

// Import AFTER the mock is registered (vi.mock is hoisted, but keep it explicit).
const { geminiEngine } = await import('./engine-gemini');

const PAGE = {
  pageImageBase64: 'aGVsbG8=',
  mimeType: 'image/png',
  groundTruthText: 'Title',
  isScanned: false,
  pageNumber: 4,
};

const VALID = JSON.stringify({
  blocks: [{ type: 'paragraph', runs: [{ text: 'Body.' }] }],
});

beforeEach(() => {
  generateContent.mockReset();
});

describe('geminiModelCall — config + MAX_TOKENS handling', () => {
  it('disables thinking (thinkingBudget 0) in the generate config', async () => {
    generateContent.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: VALID,
    });
    await geminiEngine.describePage(PAGE);
    expect(generateContent).toHaveBeenCalledTimes(1);
    const config = generateContent.mock.calls[0][0].config;
    expect(config.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('throws without a repair retry when the response is truncated at MAX_TOKENS', async () => {
    generateContent.mockResolvedValue({
      candidates: [{ finishReason: 'MAX_TOKENS' }],
      text: '{"blocks":[{"type":"paragraph","runs":[{"text":"half a p', // truncated JSON
    });
    await expect(geminiEngine.describePage(PAGE)).rejects.toBeInstanceOf(StructureEngineError);
    // The whole point: no second (repair) model call on a truncation.
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
