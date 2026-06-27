/**
 * Smoke test for the GLM-on-OpenRouter path.
 *
 * Run from apps/web with your OpenRouter key available:
 *   npx tsx --env-file=.env.local scripts/test-glm-openrouter.ts
 * or pass it inline:
 *   OPENROUTER_API_KEY=sk-or-v1-... npx tsx scripts/test-glm-openrouter.ts
 *
 * It makes three real calls through OpenRouter and prints tokens + the actual
 * USD cost OpenRouter reports inline (usage.cost), so you can confirm the whole
 * chain — key → OpenRouter → GLM → response → live cost — works before wiring
 * GLM into resolveModel(). It touches NO production routing.
 */

import { callOpenRouter, GLM_HAIKU_MODEL, GLM_SONNET_MODEL } from '../src/lib/openrouter';

interface Row {
  label: string;
  model: string;
  inTok: number;
  outTok: number;
  cached: number;
  cost: number;
  ok: boolean;
  note: string;
}

async function main(): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error(
      '✗ OPENROUTER_API_KEY is not set.\n' +
        '  Run: npx tsx --env-file=.env.local scripts/test-glm-openrouter.ts\n' +
        '  or:  OPENROUTER_API_KEY=sk-or-v1-... npx tsx scripts/test-glm-openrouter.ts',
    );
    process.exit(1);
  }

  const rows: Row[] = [];

  // 1) Plain text on GLM-4.6 (the Haiku-slot replacement).
  try {
    const r = await callOpenRouter({
      model: GLM_HAIKU_MODEL,
      system: 'You are a concise study assistant for NoteMage.',
      user: 'In one sentence, what is spaced repetition?',
      maxTokens: 200,
    });
    console.log(`\n[1] ${GLM_HAIKU_MODEL} — plain text\n${r.text}\n`);
    rows.push({
      label: 'plain text',
      model: GLM_HAIKU_MODEL,
      inTok: r.usage.inputTokens,
      outTok: r.usage.outputTokens,
      cached: r.usage.cachedTokens,
      cost: r.usage.costUsd,
      ok: r.text.length > 0,
      note: '',
    });
  } catch (e) {
    rows.push(failRow('plain text', GLM_HAIKU_MODEL, e));
  }

  // 2) Structured JSON (response_format json_schema) on GLM-4.6 — the quiz-gen shape.
  try {
    const r = await callOpenRouter({
      model: GLM_HAIKU_MODEL,
      system: 'Return a single multiple-choice question as JSON.',
      user: 'Topic: the water cycle. One question, exactly four options, mark the correct index.',
      maxTokens: 400,
      responseFormat: {
        type: 'json_schema',
        json_schema: {
          name: 'quiz_question',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              question: { type: 'string' },
              options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
              correctIndex: { type: 'integer' },
            },
            required: ['question', 'options', 'correctIndex'],
          },
        },
      },
    });
    let ok = false;
    let note = '';
    try {
      const parsed = JSON.parse(r.text) as { options?: unknown[] };
      ok = Array.isArray(parsed.options) && parsed.options.length === 4;
      note = ok ? 'valid JSON' : 'JSON parsed, shape off';
    } catch {
      note = 'INVALID JSON';
    }
    console.log(`\n[2] ${GLM_HAIKU_MODEL} — structured JSON\n${r.text}\n`);
    rows.push({
      label: 'json_schema',
      model: GLM_HAIKU_MODEL,
      inTok: r.usage.inputTokens,
      outTok: r.usage.outputTokens,
      cached: r.usage.cachedTokens,
      cost: r.usage.costUsd,
      ok,
      note,
    });
  } catch (e) {
    rows.push(failRow('json_schema', GLM_HAIKU_MODEL, e));
  }

  // 3) Flagship GLM-5.x (the Sonnet-slot replacement) — plain call.
  try {
    const r = await callOpenRouter({
      model: GLM_SONNET_MODEL,
      system: 'You are a concise study assistant for NoteMage.',
      user: 'Explain, in two sentences, why interleaving topics helps learning.',
      maxTokens: 250,
    });
    console.log(`\n[3] ${GLM_SONNET_MODEL} — plain text\n${r.text}\n`);
    rows.push({
      label: 'plain text',
      model: GLM_SONNET_MODEL,
      inTok: r.usage.inputTokens,
      outTok: r.usage.outputTokens,
      cached: r.usage.cachedTokens,
      cost: r.usage.costUsd,
      ok: r.text.length > 0,
      note: '',
    });
  } catch (e) {
    rows.push(failRow('plain text', GLM_SONNET_MODEL, e));
  }

  // Summary.
  console.log('\n──────── results ────────');
  for (const r of rows) {
    console.log(
      `${r.ok ? '✓' : '✗'}  ${r.model.padEnd(16)}  ${r.label.padEnd(12)}  ` +
        `in=${r.inTok} out=${r.outTok} cached=${r.cached}  $${r.cost.toFixed(6)}  ${r.note}`,
    );
  }
  const total = rows.reduce((s, r) => s + r.cost, 0);
  console.log(`\nTotal cost for this run: $${total.toFixed(6)}`);
  console.log(
    '(usage.cost is what OpenRouter reports inline per call — the same number you would write to the Upstash meter.)',
  );
}

function failRow(label: string, model: string, e: unknown): Row {
  return {
    label,
    model,
    inTok: 0,
    outTok: 0,
    cached: 0,
    cost: 0,
    ok: false,
    note: String(e instanceof Error ? e.message : e).slice(0, 100),
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
