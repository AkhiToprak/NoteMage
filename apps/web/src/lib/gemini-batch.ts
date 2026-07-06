/**
 * Thin wrapper over the Gemini Batch API (audit M1) — the SDK-native surface.
 *
 * The installed `@google/genai` (v2.3.0) DOES expose `ai.batches.*`
 * (`create` with inlined requests, `get` to poll) returning a `BatchJob` with
 * a `JobState` and, on success, `dest.inlinedResponses[]` aligned to the input
 * requests. So M1 ships against the SDK, not a blind REST call — see
 * `isGeminiBatchAvailable`.
 *
 * Batch jobs are asynchronous and long-running (Google's SLA is ~24h; jobs
 * usually finish far sooner). The DB-lease worker model can't hold a process
 * that long, so callers submit here, stash the returned `batchName`, and poll
 * from a self-rescheduling `ai.batch.poll` background job (see
 * `background-job-runner.ts`) rather than awaiting inline.
 *
 * This module is transport only: it knows nothing about captions or any other
 * domain. Result dispatch lives in the poll handler.
 */

import { getGeminiClient } from '@/lib/gemini';
import type { GenerateContentConfig, JobState, Part } from '@google/genai';

/** One inlined request in a batch submission. `key` is the caller's own id
 *  (e.g. a PageImage id) echoed back via response ordering — the Batch API
 *  preserves input order, so we align by index, and carry `key` as request
 *  metadata for defensive cross-checks. */
export interface GeminiBatchRequest {
  key: string;
  contents: { role: 'user'; parts: Part[] };
  config?: GenerateContentConfig;
}

/** One result row after a batch completes. `text` is the model's response text
 *  (null when that request errored); token counts feed the aggregated ledger
 *  entry the caller writes. */
export interface GeminiBatchResult {
  key: string;
  text: string | null;
  promptTokens: number;
  candidatesTokens: number;
}

/** Normalised batch state — collapses the SDK's `JobState` enum to the three
 *  outcomes the poll handler branches on. */
export type GeminiBatchState = 'running' | 'succeeded' | 'failed';

export interface GeminiBatchPollResult {
  state: GeminiBatchState;
  /** Present only when `state === 'succeeded'`, index-aligned to the submitted
   *  requests (the Batch API guarantees response order matches input order). */
  results?: GeminiBatchResult[];
}

/**
 * True when the installed SDK surface exposes the batch API. Guards every wire
 * into the async path so callers fall back to the inline caption path when the
 * surface is missing (a future SDK downgrade) rather than throwing. Also honours
 * the `AI_BATCH_DISABLED` kill switch.
 */
export function isGeminiBatchAvailable(): boolean {
  if (process.env.AI_BATCH_DISABLED === '1') return false;
  try {
    const client = getGeminiClient();
    return typeof client.batches?.create === 'function' && typeof client.batches?.get === 'function';
  } catch {
    // getGeminiClient throws when GEMINI_API_KEY is unset — no key, no batch.
    return false;
  }
}

/**
 * Submit an inlined batch job. Returns the server-generated `batchName` the
 * caller persists and polls with {@link pollGeminiBatch}. Throws on submit
 * failure (caller falls back to the inline path).
 */
export async function submitGeminiBatch(
  model: string,
  requests: GeminiBatchRequest[],
): Promise<{ batchName: string }> {
  const client = getGeminiClient();
  const job = await client.batches.create({
    model,
    src: {
      inlinedRequests: requests.map((r) => ({
        model,
        contents: r.contents,
        config: r.config,
        metadata: { key: r.key },
      })),
    },
  });
  const batchName = job.name;
  if (!batchName) throw new Error('batches.create returned no job name');
  return { batchName };
}

/** SDK `JobState` values that mean "keep waiting". */
const RUNNING_STATES = new Set<string>([
  'JOB_STATE_UNSPECIFIED',
  'JOB_STATE_QUEUED',
  'JOB_STATE_PENDING',
  'JOB_STATE_RUNNING',
  'JOB_STATE_PAUSED',
  'JOB_STATE_CANCELLING',
]);

function normaliseState(state: JobState | string | undefined): GeminiBatchState {
  const s = String(state ?? '');
  if (s === 'JOB_STATE_SUCCEEDED') return 'succeeded';
  if (RUNNING_STATES.has(s)) return 'running';
  // FAILED / CANCELLED / EXPIRED / anything unrecognised → terminal failure.
  return 'failed';
}

/**
 * Poll one batch job. Returns `running` (caller reschedules), `succeeded` with
 * index-aligned `results`, or `failed` (caller falls back). Throws only on a
 * transport error talking to the API — the poll handler treats a throw as a
 * transient retry (it does NOT fall back), distinct from a `failed` state.
 */
export async function pollGeminiBatch(batchName: string): Promise<GeminiBatchPollResult> {
  const client = getGeminiClient();
  const job = await client.batches.get({ name: batchName });
  const state = normaliseState(job.state);

  if (state !== 'succeeded') return { state };

  const inlined = job.dest?.inlinedResponses ?? [];
  const results: GeminiBatchResult[] = inlined.map((r) => {
    const key = (r.metadata?.key as string | undefined) ?? '';
    if (r.error || !r.response) {
      return { key, text: null, promptTokens: 0, candidatesTokens: 0 };
    }
    return {
      key,
      text: r.response.text ?? null,
      promptTokens: r.response.usageMetadata?.promptTokenCount ?? 0,
      candidatesTokens: r.response.usageMetadata?.candidatesTokenCount ?? 0,
    };
  });

  return { state, results };
}
