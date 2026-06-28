/**
 * Comprehensive smoke test for the GLM-on-OpenRouter path.
 *
 * Run from apps/web with your OpenRouter key available:
 *   npx tsx --env-file=.env.local scripts/test-glm-openrouter.ts
 * or pass it inline:
 *   OPENROUTER_API_KEY=sk-or-v1-... npx tsx scripts/test-glm-openrouter.ts
 *
 * It exercises the make-or-break capabilities the migration depends on, on BOTH
 * GLM-4.7 (the Haiku-slot replacement) and GLM-5.2 (the Sonnet-slot replacement),
 * and prints tokens + the actual USD cost OpenRouter reports inline (usage.cost):
 *
 *   [plain]       free-form text                         → chat / inline slots
 *   [json_schema] response_format json_schema (INFO)     → flaky on 4.7; prod uses forced tools
 *   [forced-tool] tool_choice:'required' + disableReason → forced-tool path gen + page-generate
 *   [auto-tool]   tool_choice:'auto'                     → Mage answer (prose + annotate_answer)
 *   [stream-text] streamOpenRouterText prose deltas      → chat / Mage streaming UX
 *   [stream-tool] streamed forced tool (frag reassembly) → Mage annotate / streamed gen
 *   [caching]     implicit prefix cache (cachedTokens)   → bonus, inconsistent (see below)
 *
 * CRITICAL capabilities (plain, forced-tool, stream-text, stream-tool) gate the
 * run: if any fails on either model the process exits 1. json_schema, auto-tool
 * and caching are informational — json_schema is flaky on GLM-4.7 so prod routes
 * structured output through forced tools; implicit caching is best-effort and
 * load-balanced across upstreams (98% one run, 0% the next). Touches NO routing.
 */

import {
  callOpenRouter,
  streamOpenRouterText,
  GLM_HAIKU_MODEL,
  GLM_SONNET_MODEL,
  type OpenRouterResult,
} from '../src/lib/openrouter';

interface Row {
  model: string;
  cap: string;
  /** Whether this capability is a hard gate (failure → exit 1). */
  crit: boolean;
  ok: boolean;
  inTok: number;
  outTok: number;
  cached: number;
  cost: number;
  note: string;
}

const rows: Row[] = [];

function record(
  model: string,
  cap: string,
  crit: boolean,
  ok: boolean,
  r: OpenRouterResult | null,
  note: string,
): void {
  rows.push({
    model,
    cap,
    crit,
    ok,
    inTok: r?.usage.inputTokens ?? 0,
    outTok: r?.usage.outputTokens ?? 0,
    cached: r?.usage.cachedTokens ?? 0,
    cost: r?.usage.costUsd ?? 0,
    note,
  });
}

function fail(model: string, cap: string, crit: boolean, e: unknown): void {
  record(model, cap, crit, false, null, String(e instanceof Error ? e.message : e).slice(0, 120));
}

// ── [plain] free-form text ──────────────────────────────────────────────────
async function capPlain(model: string): Promise<void> {
  try {
    const r = await callOpenRouter({
      model,
      system: 'You are a concise study assistant for NoteMage.',
      user: 'In one sentence, what is spaced repetition?',
      maxTokens: 300,
      // GLM-4.7 / GLM-5.2 are reasoning models: with reasoning ON, the thinking
      // tokens consume the output budget and `content` comes back empty. These
      // slots replace NON-reasoning Haiku/Sonnet, so disable reasoning for parity
      // + lower cost. (Leave it ON only where we deliberately want deep thinking.)
      disableReasoning: true,
    });
    console.log(`\n[plain] ${model}\n${r.text}\n`);
    record(model, 'plain', true, r.text.trim().length > 0, r, r.text.trim().length > 0 ? '' : 'empty text');
  } catch (e) {
    fail(model, 'plain', true, e);
  }
}

// ── [json_schema] structured output via response_format (INFORMATIONAL) ─────
// GLM-4.7's strict response_format adherence is intermittent (passes some runs,
// returns empty/invalid others) even with reasoning off. Production structured
// output on GLM therefore goes through FORCED TOOL CALLS (see capForcedTool /
// capStreamTool — 100% reliable on both models), mirroring the Anthropic path.
// Kept here as a non-gating signal to track GLM's response_format maturity.
async function capJsonSchema(model: string): Promise<void> {
  try {
    const r = await callOpenRouter({
      model,
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
      // Structured output is deterministic — disable reasoning (same as forced
      // tools) so the JSON lands in `content` instead of being eaten by thinking.
      disableReasoning: true,
    });
    let ok = false;
    let note = '';
    try {
      const parsed = JSON.parse(r.text) as { options?: unknown[]; correctIndex?: unknown };
      ok =
        Array.isArray(parsed.options) &&
        parsed.options.length === 4 &&
        typeof parsed.correctIndex === 'number';
      note = ok ? 'valid 4-option JSON' : 'JSON parsed but shape off';
    } catch {
      note = 'INVALID JSON';
    }
    console.log(`\n[json_schema] ${model}\n${r.text}\n`);
    record(model, 'json_schema', false, ok, r, `${note} — use forced-tool in prod`);
  } catch (e) {
    fail(model, 'json_schema', false, e);
  }
}

// ── [forced-tool] tool_choice:'required' + disableReasoning ─────────────────
// Mirrors the path-generation / page-generate forced-tool pattern: the model
// MUST return a tool call with arguments matching the schema (no prose).
async function capForcedTool(model: string): Promise<void> {
  const tool = {
    type: 'function',
    function: {
      name: 'emit_flashcard',
      description: 'Emit a single study flashcard for the given topic.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          front: { type: 'string', description: 'The prompt side.' },
          back: { type: 'string', description: 'The answer side.' },
        },
        required: ['front', 'back'],
      },
    },
  };
  try {
    const r = await callOpenRouter({
      model,
      system: 'You generate study flashcards by calling the provided tool.',
      user: 'Make one flashcard about the mitochondria.',
      maxTokens: 400,
      tools: [tool],
      toolChoice: 'required',
      // GLM-4.x reasoning mode interferes with reliable forced tool calls.
      disableReasoning: true,
    });
    let ok = false;
    let note = '';
    const call = r.toolCalls[0];
    if (!call) {
      note = 'NO tool call returned';
    } else if (call.name !== 'emit_flashcard') {
      note = `wrong tool: ${call.name}`;
    } else {
      try {
        const args = JSON.parse(call.arguments) as { front?: unknown; back?: unknown };
        ok = typeof args.front === 'string' && typeof args.back === 'string';
        note = ok ? `tool args valid (front="${String(args.front).slice(0, 32)}…")` : 'args shape off';
      } catch {
        note = 'tool args INVALID JSON';
      }
    }
    console.log(`\n[forced-tool] ${model}\n${call ? JSON.stringify(call) : '(none)'}\n`);
    record(model, 'forced-tool', true, ok, r, note);
  } catch (e) {
    fail(model, 'forced-tool', true, e);
  }
}

// ── [auto-tool] tool_choice:'auto' — the Mage answer shape ──────────────────
// The model is free to answer in prose AND/OR call annotate_answer. We just
// confirm the OpenAI-shape tool path works; not calling the tool is allowed.
async function capAutoTool(model: string): Promise<void> {
  const tool = {
    type: 'function',
    function: {
      name: 'annotate_answer',
      description: 'Record which bracketed source ids (e.g. [S1], [S2]) supported the answer.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sourceIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['sourceIds'],
      },
    },
  };
  try {
    const r = await callOpenRouter({
      model,
      system:
        'You are a study assistant. Answer using the sources, then call annotate_answer ' +
        'with the ids of the sources you used.',
      user:
        'Sources:\n[S1] Mitochondria produce ATP via oxidative phosphorylation.\n' +
        '[S2] Chloroplasts perform photosynthesis in plants.\n\n' +
        'Question: what is the main job of the mitochondria? Cite your source.',
      maxTokens: 400,
      tools: [tool],
      toolChoice: 'auto',
    });
    const called = r.toolCalls.some((c) => c.name === 'annotate_answer');
    const hasText = r.text.trim().length > 0;
    // ok if the auto-tool path produced ANY usable output (prose and/or a call).
    const ok = called || hasText;
    const note = called
      ? `called annotate_answer (${r.toolCalls[0]?.arguments?.slice(0, 40) ?? ''})`
      : hasText
        ? 'answered in prose, no tool call'
        : 'no output';
    console.log(`\n[auto-tool] ${model}\ntext=${r.text.slice(0, 120)}\ncalls=${JSON.stringify(r.toolCalls)}\n`);
    record(model, 'auto-tool', false, ok, r, note);
  } catch (e) {
    fail(model, 'auto-tool', false, e);
  }
}

// ── [caching] implicit prefix caching ───────────────────────────────────────
// Two sequential calls share a large, byte-identical system prefix; only the
// user tail differs. GLM/OpenRouter should serve the shared prefix of the 2nd
// call from cache (usage.prompt_tokens_details.cached_tokens > 0). This is the
// load-bearing "keep the prefix stable, dynamic last" behavior the migration
// relies on, since GLM has no explicit cache_control breakpoints.
async function capCaching(model: string): Promise<void> {
  const bigPrefix = Array.from(
    { length: 60 },
    (_, i) =>
      `Source note ${i + 1}: Spaced repetition schedules each review at an expanding ` +
      `interval, timed just before the point of forgetting, which strengthens long-term ` +
      `retention far more efficiently than massed cramming in a single session.`,
  ).join('\n');
  const system = `You are a study assistant. Use ONLY these notes:\n${bigPrefix}`;
  try {
    // Call 1 — writes the prefix into the implicit cache.
    const r1 = await callOpenRouter({
      model,
      system,
      user: 'Summarize source note 3 in one short sentence.',
      maxTokens: 120,
    });
    record(model, 'cache-warm', false, true, r1, `wrote prefix (in=${r1.usage.inputTokens})`);
    // Call 2 — identical prefix, different tail; should read from cache.
    const r2 = await callOpenRouter({
      model,
      system,
      user: 'Summarize source note 7 in one short sentence.',
      maxTokens: 120,
    });
    const hit = r2.usage.cachedTokens > 0;
    const note = hit
      ? `cache HIT: ${r2.usage.cachedTokens}/${r2.usage.inputTokens} input tokens cached`
      : 'no cache hit (implicit caching is best-effort — threshold/TTL/region dependent)';
    console.log(`\n[caching] ${model} — call2 cachedTokens=${r2.usage.cachedTokens} of in=${r2.usage.inputTokens}\n`);
    record(model, 'cache-read', false, hit, r2, note);
  } catch (e) {
    fail(model, 'caching', false, e);
  }
}

// ── [stream-text] streaming plain text (chat / Mage prose) ──────────────────
async function capStreamText(model: string): Promise<void> {
  try {
    let deltas = 0;
    const r = await streamOpenRouterText(
      {
        model,
        system: 'You are a concise study assistant for NoteMage.',
        user: 'List three benefits of active recall, one short line each.',
        maxTokens: 300,
        disableReasoning: true,
      },
      {
        onText: () => {
          deltas += 1;
        },
      },
    );
    const ok = deltas > 0 && r.text.trim().length > 0;
    console.log(`\n[stream-text] ${model} — ${deltas} deltas\n${r.text}\n`);
    record(model, 'stream-text', true, ok, r, ok ? `${deltas} text deltas streamed` : 'no streamed text');
  } catch (e) {
    fail(model, 'stream-text', true, e);
  }
}

// ── [stream-tool] streaming forced tool call (Mage annotate / forced gen) ───
async function capStreamTool(model: string): Promise<void> {
  const tool = {
    type: 'function',
    function: {
      name: 'emit_flashcard',
      description: 'Emit a single study flashcard for the given topic.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          front: { type: 'string' },
          back: { type: 'string' },
        },
        required: ['front', 'back'],
      },
    },
  };
  try {
    const r = await streamOpenRouterText({
      model,
      system: 'You generate study flashcards by calling the provided tool.',
      user: 'Make one flashcard about photosynthesis.',
      maxTokens: 400,
      tools: [tool],
      toolChoice: 'required',
      disableReasoning: true,
    });
    let ok = false;
    let note = '';
    const call = r.toolCalls[0];
    if (!call) {
      note = 'NO tool call streamed';
    } else {
      try {
        const args = JSON.parse(call.arguments) as { front?: unknown; back?: unknown };
        ok = typeof args.front === 'string' && typeof args.back === 'string';
        note = ok ? 'streamed tool args reassembled + valid' : 'args shape off';
      } catch {
        note = 'streamed tool args INVALID JSON';
      }
    }
    console.log(`\n[stream-tool] ${model}\n${call ? JSON.stringify(call) : '(none)'}\n`);
    record(model, 'stream-tool', true, ok, r, note);
  } catch (e) {
    fail(model, 'stream-tool', true, e);
  }
}

async function runModel(model: string): Promise<void> {
  console.log(`\n════════════ ${model} ════════════`);
  await capPlain(model);
  await capJsonSchema(model);
  await capForcedTool(model);
  await capAutoTool(model);
  await capStreamText(model);
  await capStreamTool(model);
  await capCaching(model);
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

  await runModel(GLM_HAIKU_MODEL);
  await runModel(GLM_SONNET_MODEL);

  console.log('\n──────────────────────── results ────────────────────────');
  for (const r of rows) {
    const gate = r.crit ? '' : ' (info)';
    console.log(
      `${r.ok ? '✓' : '✗'}  ${r.model.padEnd(14)}  ${r.cap.padEnd(12)}  ` +
        `in=${String(r.inTok).padStart(5)} out=${String(r.outTok).padStart(4)} ` +
        `cached=${String(r.cached).padStart(5)}  $${r.cost.toFixed(6)}  ${r.note}${gate}`,
    );
  }

  const total = rows.reduce((s, r) => s + r.cost, 0);
  console.log(`\nTotal cost for this run: $${total.toFixed(6)}`);
  console.log(
    '(usage.cost is what OpenRouter bills inline per call — the same number a meter would record.)',
  );

  const criticalFailures = rows.filter((r) => r.crit && !r.ok);
  if (criticalFailures.length > 0) {
    console.error(
      `\n✗ ${criticalFailures.length} CRITICAL capability failure(s): ` +
        criticalFailures.map((r) => `${r.model}/${r.cap}`).join(', '),
    );
    console.error('  These gate the migration — do not wire GLM into resolveModel() until green.');
    process.exit(1);
  }
  console.log('\n✓ All critical capabilities passed — safe to proceed with the resolveModel() wiring.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
