/**
 * Two-sample probe of the path-gen stages through the REAL production
 * dispatcher (`forcedStructuredCall` → resolveModel → provider wrapper). For
 * two representative stages it runs the SAME call twice and prints model,
 * cost, latency, and output-token counts per sample. No DB writes; this
 * exercises routing + dispatch + cost + the real tool schemas only.
 *
 * Historical name: this began as a GLM-vs-Claude A/B toggled via
 * GLM_COMPOSITION, but since the 2026-06-28 migration resolveModel routes all
 * path stages to GLM-5.2 regardless of that flag, so both legs measured GLM.
 * It now measures GLM only — the second sample is for run-to-run variance
 * (and shows the implicit prefix-cache hit via cacheRead on sample #2).
 *
 * Env toggles worth measuring per run: PATH_STRUCTURE_REASONING=high (the
 * Phase 7 structure-reasoning experiment; read at call time in the dispatcher).
 *
 *   npx tsx --env-file=.env.local scripts/test-glm-ab.ts
 *
 * Needs OPENROUTER_API_KEY.
 */

import { forcedStructuredCall, type NormalizedUsage } from '../src/lib/path-generator-routing';
import { costForCall } from '../src/lib/path-generator-cost';
import { PATH_STRUCTURE_TOOL, QUIZ_FOR_SLOT_TOOL } from '../src/lib/ai-tools';

const CORPUS = [
  'The water cycle describes how water moves through Earth\'s systems.',
  'Evaporation: the sun heats water in oceans, lakes and rivers, turning it into vapor that rises into the air.',
  'Condensation: as vapor rises and cools, it forms tiny droplets that gather into clouds.',
  'Precipitation: when droplets grow heavy enough they fall as rain, snow, sleet or hail.',
  'Collection: precipitation gathers in oceans, lakes, rivers and groundwater, and the cycle repeats.',
  'Transpiration: plants release water vapor from their leaves, adding moisture to the air.',
].join('\n');

interface Outcome {
  label: string;
  provider: string;
  model: string;
  ms: number;
  costUsd: number;
  realCostUsd: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  ok: boolean;
  detail: string;
}

async function runStage(
  label: string,
  stage: 'structure' | 'quiz',
  ultra: boolean,
  tool: Parameters<typeof forcedStructuredCall>[0]['anthropicTool'],
  staticInstructions: string,
  dynamicInstructions: string,
  checkTopKey: string,
): Promise<Outcome | null> {
  let usage: NormalizedUsage | undefined;
  const t0 = Date.now();
  try {
    const result = (await forcedStructuredCall<Record<string, unknown>>({
      stage,
      ultra,
      corpus: CORPUS,
      staticInstructions,
      dynamicInstructions,
      anthropicTool: tool,
      anthropicTools: [tool],
      userMessage: 'Generate now.',
      maxAttempts: 2,
      onUsage: (u) => {
        usage = u;
      },
    })) as Record<string, unknown>;
    const ms = Date.now() - t0;
    const arr = result?.[checkTopKey];
    const count = Array.isArray(arr) ? arr.length : 0;
    const ok = !!result && typeof result === 'object' && count > 0;
    const costUsd = usage
      ? costForCall(usage.model, {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: usage.cacheReadTokens,
          cacheWriteTokens: usage.cacheWriteTokens,
        })
      : 0;
    console.log(`\n── ${label} (${usage?.provider}/${usage?.model}) ──`);
    console.log(JSON.stringify(result, null, 2).slice(0, 700));
    return {
      label,
      provider: usage?.provider ?? '?',
      model: usage?.model ?? '?',
      ms,
      costUsd,
      realCostUsd: usage?.costUsd ?? null,
      outputTokens: usage?.outputTokens ?? null,
      cacheReadTokens: usage?.cacheReadTokens ?? null,
      ok,
      detail: `${count} ${checkTopKey}`,
    };
  } catch (e) {
    console.error(`\n✗ ${label} threw: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

const QUIZ_RULES = [
  'Create a 5-question quiz for one learning slot from the source material.',
  'Use at least 3 different question kinds (e.g. mc, true_false, fill_blank, short_answer).',
  'Each question must test understanding of the water cycle and be answerable from the material.',
].join('\n');

const STRUCTURE_RULES = [
  'Design a short learning-path structure from the source material.',
  'Produce 3 sections, each with 1-2 slots, covering the water cycle from basics to application.',
  'Titles concise; descriptions one sentence.',
].join('\n');

async function twoSamples(
  label: string,
  stage: 'structure' | 'quiz',
  ultra: boolean,
  tool: Parameters<typeof forcedStructuredCall>[0]['anthropicTool'],
  rules: string,
  dyn: string,
  topKey: string,
): Promise<Outcome[]> {
  const out: Outcome[] = [];
  // Sample twice: #2 typically lands on the same upstream and shows the
  // implicit prefix-cache hit (cacheRead > 0), so cold and warm cost both show.
  const first = await runStage(`${label} #1`, stage, ultra, tool, rules, dyn, topKey);
  if (first) out.push(first);
  const second = await runStage(`${label} #2`, stage, ultra, tool, rules, dyn, topKey);
  if (second) out.push(second);
  return out;
}

async function main(): Promise<void> {
  const results: Outcome[] = [];
  results.push(
    ...(await twoSamples(
      'QUIZ',
      'quiz',
      false,
      QUIZ_FOR_SLOT_TOOL,
      QUIZ_RULES,
      'Generate the quiz for the slot "The Water Cycle".',
      'questions',
    )),
  );
  results.push(
    ...(await twoSamples(
      'STRUCTURE',
      'structure',
      true,
      PATH_STRUCTURE_TOOL,
      STRUCTURE_RULES,
      'Build the path structure for "Introduction to the Water Cycle" (beginner).',
      'phases',
    )),
  );

  console.log('\n════════════════════ SUMMARY ════════════════════');
  for (const r of results) {
    const real = r.realCostUsd !== null ? ` (real $${r.realCostUsd.toFixed(6)})` : '';
    const outTok = r.outputTokens !== null ? `${r.outputTokens}` : '?';
    const cacheTok = r.cacheReadTokens !== null ? `${r.cacheReadTokens}` : '?';
    console.log(
      `${r.ok ? '✓' : '✗'} ${r.label.padEnd(26)} ${r.model.padEnd(26)} ` +
        `${String(r.ms).padStart(6)}ms  est $${r.costUsd.toFixed(6)}${real}  ` +
        `outTok=${outTok} cacheRead=${cacheTok}  ${r.detail}`,
    );
  }
  console.log(
    '\n(est cost = token-derived via costForCall for comparability; real = OpenRouter inline cost;' +
      ' outTok/cacheRead = usage.outputTokens/cacheReadTokens from the same call, for measuring the' +
      ' PATH_STRUCTURE_REASONING experiment\'s effect on structure-call output size.)',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
