/**
 * Phase 8 learning-slot batching measurement: UNBATCHED (theory call then
 * flashcards call, sequential) vs BATCHED (one `learning_slot_content` tool
 * call producing both) for GLM-5.2 and GLM-4.7, called DIRECTLY through
 * `forcedStructuredCallOpenRouter` (bypassing resolveModel so each leg pins
 * its own model slug). Also re-evaluates GLM-4.7 alongside GLM-5.2 now that
 * the production default has moved to 5.2.
 *
 * The UNBATCHED pair shares the SAME system-prefix text (corpus + shared
 * rules first, per-call rules last) across both calls, so the second call
 * can show GLM's implicit prefix-cache hit (cacheReadTokens > 0) the way a
 * real path generation's back-to-back slot calls would.
 *
 * Production gate: PATH_LEARNING_BATCH (not read here — this script measures
 * the raw calls directly, not the gated dispatcher). If that flag or
 * LEARNING_SLOT_BATCH_TOOL hasn't landed yet, this script will fail to
 * typecheck/import until it does.
 *
 *   npx tsx --env-file=.env.local scripts/test-glm-batch.ts
 *
 * Needs OPENROUTER_API_KEY. Spends real API money — do not run in CI.
 */

import { forcedStructuredCallOpenRouter } from '../src/lib/path-generator-openrouter';
import { costForCall } from '../src/lib/path-generator-cost';
import { THEORY_SECTION_TOOL, FLASHCARDS_FOR_SLOT_TOOL, LEARNING_SLOT_BATCH_TOOL } from '../src/lib/ai-tools';
import type { OpenRouterUsage } from '../src/lib/openrouter';

const MODELS = ['z-ai/glm-5.2', 'z-ai/glm-4.7'] as const;

// ── Compact, self-contained corpus (mirrors test-glm-ab.ts's water-cycle style) ──

const CORPUS = [
  'The water cycle describes how water moves through Earth\'s systems.',
  'Evaporation: the sun heats water in oceans, lakes and rivers, turning it into vapor that rises into the air.',
  'Condensation: as vapor rises and cools, it forms tiny droplets that gather into clouds.',
  'Precipitation: when droplets grow heavy enough they fall as rain, snow, sleet or hail.',
  'Collection: precipitation gathers in oceans, lakes, rivers and groundwater, and the cycle repeats.',
  'Transpiration: plants release water vapor from their leaves, adding moisture to the air.',
].join('\n');

const SHARED_RULES = [
  'You are generating learning content for one checkpoint slot titled "The Water Cycle" (beginner level).',
  'Stay strictly grounded in the source material above — do not invent facts beyond it.',
].join('\n');

const THEORY_RULES = [
  'Write ONE short theory section: 2-3 paragraphs total (introduction + optional summary), 3-6 keyPoints, 1-3 examples.',
  'Keep it compact and example-driven — this is a small checkpoint slot, not a full chapter.',
].join('\n');

const FLASHCARDS_RULES = [
  'Create exactly 6 flashcards covering evaporation, condensation, precipitation, collection, and transpiration.',
  'Each card is a tight question/answer pair — no fill-in-the-blank fronts.',
].join('\n');

const BATCH_RULES = [
  THEORY_RULES,
  FLASHCARDS_RULES,
  'Produce BOTH parts in a SINGLE call to the learning_slot_content tool: the `theory` key (theory section) and the',
  '`flashcards` key (flashcards set), each following the rules above for its part.',
].join('\n\n');

// ── Outcome bookkeeping (same shape as test-glm-ab.ts) ──

interface Outcome {
  label: string;
  model: string;
  ms: number;
  costUsd: number;
  realCostUsd: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  ok: boolean;
  detail: string;
}

async function runLeg(
  label: string,
  model: string,
  system: string,
  tool: Parameters<typeof forcedStructuredCallOpenRouter>[0]['tool'],
  checkTopKeys: string[],
): Promise<Outcome | null> {
  let usage: OpenRouterUsage | undefined;
  const t0 = Date.now();
  try {
    const result = await forcedStructuredCallOpenRouter<Record<string, unknown>>({
      system,
      tool,
      userMessage: 'Generate now.',
      model,
      maxAttempts: 2,
      onUsage: (u) => {
        usage = u;
      },
    });
    const ms = Date.now() - t0;
    const counts = checkTopKeys.map((key) => {
      const val = result?.[key];
      if (Array.isArray(val)) return `${key}=${val.length}`;
      if (val && typeof val === 'object') return `${key}=object`;
      return `${key}=missing`;
    });
    const ok =
      !!result &&
      typeof result === 'object' &&
      checkTopKeys.every((key) => {
        const val = result[key];
        return Array.isArray(val) ? val.length > 0 : val !== undefined && val !== null;
      });
    const costUsd = usage
      ? costForCall(model, {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: usage.cachedTokens,
        })
      : 0;
    console.log(`\n── ${label} (${model}) ──`);
    console.log(JSON.stringify(result, null, 2).slice(0, 700));
    return {
      label,
      model,
      ms,
      costUsd,
      realCostUsd: usage?.costUsd ?? null,
      outputTokens: usage?.outputTokens ?? null,
      cacheReadTokens: usage?.cachedTokens ?? null,
      ok,
      detail: counts.join(' '),
    };
  } catch (e) {
    console.error(`\n✗ ${label} threw: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

interface ModelResults {
  model: string;
  unbatched: Outcome[];
  batched: Outcome[];
}

async function runModel(model: string): Promise<ModelResults> {
  // UNBATCHED: theory call then flashcards call, sequential, sharing the same
  // system-PREFIX text (corpus + shared rules first, per-call rules last) so
  // the flashcards call can hit GLM's implicit prefix cache from the theory call.
  const theorySystem = [CORPUS, SHARED_RULES, THEORY_RULES].join('\n\n');
  const flashcardsSystem = [CORPUS, SHARED_RULES, FLASHCARDS_RULES].join('\n\n');

  const unbatched: Outcome[] = [];
  const theoryOut = await runLeg(`${model} UNBATCHED theory`, model, theorySystem, THEORY_SECTION_TOOL, [
    'keyPoints',
    'examples',
  ]);
  if (theoryOut) unbatched.push(theoryOut);
  const flashcardsOut = await runLeg(
    `${model} UNBATCHED flashcards`,
    model,
    flashcardsSystem,
    FLASHCARDS_FOR_SLOT_TOOL,
    ['flashcards'],
  );
  if (flashcardsOut) unbatched.push(flashcardsOut);

  // BATCHED: one learning_slot_content call producing both `theory` and
  // `flashcards` keys.
  const batchSystem = [CORPUS, SHARED_RULES, BATCH_RULES].join('\n\n');
  const batched: Outcome[] = [];
  const batchOut = await runLeg(`${model} BATCHED`, model, batchSystem, LEARNING_SLOT_BATCH_TOOL, [
    'theory',
    'flashcards',
  ]);
  if (batchOut) batched.push(batchOut);

  return { model, unbatched, batched };
}

function sumCost(outs: Outcome[]): { costUsd: number; realCostUsd: number | null; ms: number } {
  const costUsd = outs.reduce((s, o) => s + o.costUsd, 0);
  const realVals = outs.map((o) => o.realCostUsd).filter((v): v is number => v !== null);
  const realCostUsd = outs.length > 0 && realVals.length === outs.length ? realVals.reduce((s, v) => s + v, 0) : null;
  const ms = outs.reduce((s, o) => s + o.ms, 0);
  return { costUsd, realCostUsd, ms };
}

async function main(): Promise<void> {
  const allResults: ModelResults[] = [];
  for (const model of MODELS) {
    allResults.push(await runModel(model));
  }

  console.log('\n════════════════════ PER-LEG DETAIL ════════════════════');
  for (const { unbatched, batched } of allResults) {
    for (const r of [...unbatched, ...batched]) {
      const real = r.realCostUsd !== null ? ` (real $${r.realCostUsd.toFixed(6)})` : '';
      const outTok = r.outputTokens !== null ? `${r.outputTokens}` : '?';
      const cacheTok = r.cacheReadTokens !== null ? `${r.cacheReadTokens}` : '?';
      console.log(
        `${r.ok ? '✓' : '✗'} ${r.label.padEnd(34)} ${r.model.padEnd(16)} ` +
          `${String(r.ms).padStart(6)}ms  est $${r.costUsd.toFixed(6)}${real}  ` +
          `outTok=${outTok} cacheRead=${cacheTok}  ${r.detail}`,
      );
    }
  }

  console.log('\n════════════════════ SUMMARY (UNBATCHED vs BATCHED) ════════════════════');
  for (const { model, unbatched, batched } of allResults) {
    const u = sumCost(unbatched);
    const b = sumCost(batched);
    const deltaReal =
      u.realCostUsd !== null && b.realCostUsd !== null ? b.realCostUsd - u.realCostUsd : null;
    const deltaMs = unbatched.length > 0 && batched.length > 0 ? b.ms - u.ms : null;

    console.log(`\n${model}`);
    console.log(
      `  UNBATCHED (${unbatched.length} call${unbatched.length === 1 ? '' : 's'})  ` +
        `${String(u.ms).padStart(6)}ms  est $${u.costUsd.toFixed(6)}` +
        (u.realCostUsd !== null ? `  real $${u.realCostUsd.toFixed(6)}` : '  real ?'),
    );
    console.log(
      `  BATCHED   (${batched.length} call${batched.length === 1 ? '' : 's'})  ` +
        `${String(b.ms).padStart(6)}ms  est $${b.costUsd.toFixed(6)}` +
        (b.realCostUsd !== null ? `  real $${b.realCostUsd.toFixed(6)}` : '  real ?'),
    );
    console.log(
      `  Δ real cost: ${deltaReal !== null ? `${deltaReal >= 0 ? '+' : ''}$${deltaReal.toFixed(6)}` : '?'}` +
        `   Δ ms: ${deltaMs !== null ? `${deltaMs >= 0 ? '+' : ''}${deltaMs}ms` : '?'}`,
    );
  }

  console.log(
    '\n(est cost = token-derived via costForCall for comparability; real = OpenRouter inline cost summed' +
      ' across the legs in that config; Δ = BATCHED − UNBATCHED, negative means BATCHED is cheaper/faster;' +
      ' cacheRead on the UNBATCHED flashcards leg shows the implicit prefix-cache hit from sharing the' +
      ' corpus+rules prefix with the preceding theory leg.)',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
