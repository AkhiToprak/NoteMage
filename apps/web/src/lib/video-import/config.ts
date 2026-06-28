// Shared config readers + constants for native video ingestion (Lane 2, plan
// §P2/§P3). The model token is resolved separately via resolveModel('video-ingest')
// in model-routing.ts (VIDEO_INGEST_MODEL); everything else a P3 worker/route
// needs is read here so the env surface lives in one place.
//
// All readers are getters (not constants) so a Coolify container restart flips
// them without a rebuild — the kill switch in particular must be instant.

/** Per-job input-cost ceiling (USD). Pre-flight aborts before the model call if
 *  the estimated spend exceeds this, so a long video can't blow the budget.
 *  Mirrors getPretranslationCostCeilingUsd's read shape. Default $0.50. */
const DEFAULT_VIDEO_INGEST_COST_CEILING_USD = 0.5;

/** Hard upper bound on video length (seconds). Pre-flight rejects longer videos
 *  before any meter charge. Default 3600s (60 min at low res). */
const DEFAULT_VIDEO_INGEST_MAX_DURATION_SEC = 3600;

/** Token-rate control for the Gemini call: "low" (~100 tok/s) vs "default"
 *  (~300 tok/s). Default "low" to keep COGS bounded. */
const DEFAULT_VIDEO_INGEST_MEDIA_RESOLUTION = 'low';

/** Per-call timeout (ms) for the Gemini generateContent request. Native YouTube
 *  ingestion fetches+analyses the whole video server-side and can stall
 *  indefinitely; without a bound the worker hangs until its 30-min lease. Default
 *  8 min — under the client's ~12-min poll window so the user gets a real
 *  failure (and a refund) instead of a silent hang. */
const DEFAULT_VIDEO_INGEST_TIMEOUT_MS = 8 * 60_000;

export type VideoMediaResolution = 'low' | 'default';

/** Master kill switch for Lane 2. When set, the video-import route/worker must
 *  refuse the feature (feature-off). Off-in-prod-until-tested per the plan. */
export function videoImportDisabled(): boolean {
  const v = process.env.VIDEO_IMPORT_DISABLED;
  return v === '1' || v === 'true';
}

export function getVideoIngestCostCeilingUsd(): number {
  const raw = process.env.VIDEO_INGEST_COST_CEILING_USD;
  if (raw === undefined || raw === '') return DEFAULT_VIDEO_INGEST_COST_CEILING_USD;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_VIDEO_INGEST_COST_CEILING_USD;
}

export function getVideoIngestMaxDurationSec(): number {
  const raw = process.env.VIDEO_INGEST_MAX_DURATION_SEC;
  if (raw === undefined || raw === '') return DEFAULT_VIDEO_INGEST_MAX_DURATION_SEC;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_VIDEO_INGEST_MAX_DURATION_SEC;
}

export function getVideoIngestMediaResolution(): VideoMediaResolution {
  const raw = process.env.VIDEO_INGEST_MEDIA_RESOLUTION?.trim().toLowerCase();
  return raw === 'default' ? 'default' : DEFAULT_VIDEO_INGEST_MEDIA_RESOLUTION;
}

export function getVideoIngestTimeoutMs(): number {
  const raw = process.env.VIDEO_INGEST_TIMEOUT_MS;
  if (raw === undefined || raw === '') return DEFAULT_VIDEO_INGEST_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_VIDEO_INGEST_TIMEOUT_MS;
}
