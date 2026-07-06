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

  it('sends systemInstruction inline (no cachedContent) when no cache name is present', async () => {
    generateContent.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: VALID,
    });
    await geminiEngine.describePage(PAGE);
    const config = generateContent.mock.calls[0][0].config;
    expect(typeof config.systemInstruction).toBe('string');
    expect(config.systemInstruction.length).toBeGreaterThan(0);
    expect(config.cachedContent).toBeUndefined();
  });

  it('references cachedContent and omits systemInstruction when a cache name is present', async () => {
    generateContent.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: VALID,
    });
    await geminiEngine.describePage({ ...PAGE, cachedSystemPrompt: 'cachedContents/abc123' });
    const config = generateContent.mock.calls[0][0].config;
    expect(config.cachedContent).toBe('cachedContents/abc123');
    expect(config.systemInstruction).toBeUndefined();
  });

  it('reuses the same cachedContent choice on the repair turn', async () => {
    // First call returns invalid JSON → forces one repair retry; both turns
    // must carry the cachedContent (and omit systemInstruction).
    generateContent
      .mockResolvedValueOnce({ candidates: [{ finishReason: 'STOP' }], text: 'not json' })
      .mockResolvedValueOnce({ candidates: [{ finishReason: 'STOP' }], text: VALID });
    await geminiEngine.describePage({ ...PAGE, cachedSystemPrompt: 'cachedContents/xyz' });
    expect(generateContent).toHaveBeenCalledTimes(2);
    for (const call of generateContent.mock.calls) {
      expect(call[0].config.cachedContent).toBe('cachedContents/xyz');
      expect(call[0].config.systemInstruction).toBeUndefined();
    }
  });
});
