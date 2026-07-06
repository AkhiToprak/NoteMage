import { beforeEach, describe, expect, it, vi } from 'vitest';

// gemini-batch.ts wraps the SDK's `ai.batches.*` surface. Mock getGeminiClient
// to a fake client exposing batches.create/get so the transport + state-machine
// logic (running → reschedule, succeeded → dispatch, failed → fallback) is
// exercised without a real API call.

const mocks = vi.hoisted(() => ({
  batchesCreate: vi.fn(),
  batchesGet: vi.fn(),
  getGeminiClient: vi.fn(),
}));

vi.mock('@/lib/gemini', () => ({ getGeminiClient: mocks.getGeminiClient }));

import {
  isGeminiBatchAvailable,
  pollGeminiBatch,
  submitGeminiBatch,
  type GeminiBatchRequest,
} from './gemini-batch';

function fakeClient() {
  return { batches: { create: mocks.batchesCreate, get: mocks.batchesGet } };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.AI_BATCH_DISABLED;
  mocks.getGeminiClient.mockReturnValue(fakeClient());
});

// ─── isGeminiBatchAvailable ─────────────────────────────────────────────────

describe('isGeminiBatchAvailable', () => {
  it('true when the client exposes batches.create + batches.get', () => {
    expect(isGeminiBatchAvailable()).toBe(true);
  });

  it('false when AI_BATCH_DISABLED=1', () => {
    process.env.AI_BATCH_DISABLED = '1';
    expect(isGeminiBatchAvailable()).toBe(false);
  });

  it('false when the SDK surface lacks batches', () => {
    mocks.getGeminiClient.mockReturnValue({ batches: undefined } as unknown as ReturnType<typeof fakeClient>);
    expect(isGeminiBatchAvailable()).toBe(false);
  });

  it('false (never throws) when getGeminiClient throws (no API key)', () => {
    mocks.getGeminiClient.mockImplementation(() => {
      throw new Error('GEMINI_API_KEY is not set');
    });
    expect(isGeminiBatchAvailable()).toBe(false);
  });
});

// ─── submitGeminiBatch ──────────────────────────────────────────────────────

const REQS: GeminiBatchRequest[] = [
  { key: 'k1', contents: { role: 'user', parts: [{ text: 'a' }] } },
  { key: 'k2', contents: { role: 'user', parts: [{ text: 'b' }] } },
];

describe('submitGeminiBatch', () => {
  it('creates an inlined batch and returns the server job name', async () => {
    mocks.batchesCreate.mockResolvedValue({ name: 'batches/xyz', state: 'JOB_STATE_QUEUED' });

    const { batchName } = await submitGeminiBatch('gemini-2.5-flash-lite', REQS);

    expect(batchName).toBe('batches/xyz');
    const [params] = mocks.batchesCreate.mock.calls[0] as [{ model: string; src: { inlinedRequests: unknown[] } }];
    expect(params.model).toBe('gemini-2.5-flash-lite');
    expect(params.src.inlinedRequests).toHaveLength(2);
    // key rides in per-request metadata for defensive cross-checks.
    expect((params.src.inlinedRequests[0] as { metadata: { key: string } }).metadata.key).toBe('k1');
  });

  it('throws when the create response has no job name', async () => {
    mocks.batchesCreate.mockResolvedValue({ state: 'JOB_STATE_QUEUED' });
    await expect(submitGeminiBatch('m', REQS)).rejects.toThrow('no job name');
  });
});

// ─── pollGeminiBatch state machine ──────────────────────────────────────────

describe('pollGeminiBatch', () => {
  it('RUNNING → state "running", no results (caller reschedules)', async () => {
    mocks.batchesGet.mockResolvedValue({ state: 'JOB_STATE_RUNNING' });

    const result = await pollGeminiBatch('batches/xyz');

    expect(result.state).toBe('running');
    expect(result.results).toBeUndefined();
  });

  it.each(['JOB_STATE_QUEUED', 'JOB_STATE_PENDING', 'JOB_STATE_PAUSED'])(
    'treats %s as running',
    async (state) => {
      mocks.batchesGet.mockResolvedValue({ state });
      expect((await pollGeminiBatch('b')).state).toBe('running');
    },
  );

  it('SUCCEEDED → state "succeeded" with index-aligned results (key + tokens from usageMetadata)', async () => {
    mocks.batchesGet.mockResolvedValue({
      state: 'JOB_STATE_SUCCEEDED',
      dest: {
        inlinedResponses: [
          {
            metadata: { key: 'k1' },
            response: { text: '{"captions":[]}', usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 5 } },
          },
          {
            metadata: { key: 'k2' },
            error: { code: 500, message: 'boom' }, // one row errored
          },
        ],
      },
    });

    const result = await pollGeminiBatch('batches/xyz');

    expect(result.state).toBe('succeeded');
    expect(result.results).toHaveLength(2);
    expect(result.results![0]).toEqual({ key: 'k1', text: '{"captions":[]}', promptTokens: 40, candidatesTokens: 5 });
    // Errored row → null text, zero tokens, key preserved.
    expect(result.results![1]).toEqual({ key: 'k2', text: null, promptTokens: 0, candidatesTokens: 0 });
  });

  it.each(['JOB_STATE_FAILED', 'JOB_STATE_CANCELLED', 'JOB_STATE_EXPIRED', 'SOMETHING_UNKNOWN'])(
    'terminal non-success state %s → "failed" (caller falls back)',
    async (state) => {
      mocks.batchesGet.mockResolvedValue({ state });
      const result = await pollGeminiBatch('b');
      expect(result.state).toBe('failed');
      expect(result.results).toBeUndefined();
    },
  );

  it('propagates a transport error (caller retries, distinct from a failed state)', async () => {
    mocks.batchesGet.mockRejectedValue(new Error('network reset'));
    await expect(pollGeminiBatch('b')).rejects.toThrow('network reset');
  });
});
