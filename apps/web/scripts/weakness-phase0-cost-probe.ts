/**
 * THROWAWAY Phase 0 validation spike — read-only, not production code, safe to delete after Phase 0.
 *
 * Weakness Training (plans/weakness-training.md) §8.D "Cost probe": generate ~5
 * throwaway remediation sessions through the REAL §5.2 one-call forced-tool shape
 * against the `weakness-session-generate` tier (same tier as `exam-mock-questions`
 * → `glm-sonnet` via `resolvePathStage('quiz', ctx)`, per §5.1), and log actual
 * input/output tokens + estimated CHF cost per session to sanity-check the §5.3
 * target (≤ 0.05 CHF/session) BEFORE committing to Phase 1B schema/route work.
 *
 * Fully self-contained: uses hardcoded representative concept fixtures (label +
 * description + a short corpus slice), so it does NOT need the concept-mastery
 * tables from Migration A (which don't exist yet). Touches NO routing, NO Prisma
 * writes — if it ever reads the DB it would be findMany-only, but as authored it
 * makes zero DB calls.
 *
 * Run from apps/web with your OpenRouter key available:
 *   npx tsx --env-file=.env.local scripts/weakness-phase0-cost-probe.ts
 * or pass it inline:
 *   OPENROUTER_API_KEY=sk-or-v1-... npx tsx scripts/weakness-phase0-cost-probe.ts
 */

import { forcedStructuredCallOpenRouter } from '../src/lib/path-generator-openrouter';
import { GLM_SONNET_MODEL, type OpenRouterUsage } from '../src/lib/openrouter';
import { costForCall } from '../src/lib/path-generator-cost';
import type Anthropic from '@anthropic-ai/sdk';

// ── §5.2 output shape: ONE forced-tool call per session, for each of 2-3
// concepts → { reteach, discriminate, retest }. Mirrors the Stage-B per-slot
// quiz tool pattern (QUIZ_FOR_SLOT_TOOL in src/lib/ai-tools.ts): a single tool
// whose input_schema enumerates a fixed-shape array, forced via tool_choice.
const REMEDIATION_SESSION_TOOL: Anthropic.Messages.Tool = {
  name: 'create_remediation_session',
  description: [
    'Create a remediation session for 2-3 weak concepts: for EACH concept, emit a',
    'reteach step (re-explain the concept), a discriminate step (a question that',
    'forces the learner to tell the target concept apart from a commonly-confused',
    'one), and a retest step (a fresh graded question on the same concept).',
    'Ground every step ONLY in the provided corpus slice for that concept.',
  ].join('\n'),
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      concepts: {
        type: 'array',
        minItems: 2,
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            conceptLabel: { type: 'string', description: 'Must match one of the input concept labels.' },
            reteach: {
              type: 'object',
              additionalProperties: false,
              properties: {
                explanation: { type: 'string', description: '2-4 sentence re-teach of the concept.' },
                workedExample: { type: 'string', description: 'One concrete worked example.' },
                sourceAnchor: { type: 'string', description: 'Short quote/paraphrase anchoring to the corpus slice.' },
              },
              required: ['explanation', 'workedExample', 'sourceAnchor'],
            },
            discriminate: {
              type: 'object',
              additionalProperties: false,
              properties: {
                prompt: { type: 'string', description: 'Question forcing target-vs-confused distinction.' },
                correctOption: { type: 'string' },
                confusedOption: { type: 'string', description: 'The commonly-confused distractor concept.' },
                explanation: { type: 'string', description: 'Why correctOption is right and confusedOption is wrong.' },
              },
              required: ['prompt', 'correctOption', 'confusedOption', 'explanation'],
            },
            retest: {
              type: 'object',
              additionalProperties: false,
              properties: {
                question: { type: 'string' },
                kind: { type: 'string', enum: ['mc', 'true_false', 'fill_blank'] },
              },
              required: ['question', 'kind'],
            },
          },
          required: ['conceptLabel', 'reteach', 'discriminate', 'retest'],
        },
      },
    },
    required: ['concepts'],
  },
};

interface ConceptFixture {
  label: string;
  description: string;
  /** Short corpus slice scoped to just this concept's source slot(s) — §5.2
   *  deliberately keeps this small (not the whole path) to bound the cached prefix. */
  corpusSlice: string;
}

// ── representative fixtures (2-3 concepts per session) — stand-ins for the
// real `loadMaterialCorpus(userId, materialIds)` scoped read in Phase 1B.
const FIXTURE_SESSIONS: ConceptFixture[][] = [
  [
    {
      label: 'Mitosis vs. Meiosis — chromosome count',
      description: 'Confuses why meiosis halves chromosome number but mitosis preserves it.',
      corpusSlice:
        'Mitosis produces two diploid daughter cells genetically identical to the parent cell, ' +
        'preserving the chromosome number (2n → 2n). Meiosis produces four haploid daughter cells ' +
        'via two divisions (meiosis I and II), halving the chromosome number (2n → n) to allow ' +
        'fertilization to restore the diploid number.',
    },
    {
      label: 'Crossing over',
      description: 'Mistakes crossing over for random assortment; both occur in meiosis I but are distinct mechanisms.',
      corpusSlice:
        'Crossing over occurs during prophase I when homologous chromosomes pair up (synapsis) and ' +
        'exchange segments of DNA at chiasmata, producing recombinant chromatids. This is distinct from ' +
        'independent assortment, which is the random orientation of homologous pairs at the metaphase plate.',
    },
  ],
  [
    {
      label: "Newton's second law — net force vs. individual force",
      description: 'Plugs a single applied force into F=ma instead of the net force.',
      corpusSlice:
        "Newton's second law states F_net = ma, where F_net is the VECTOR SUM of all forces acting on " +
        'an object, not any single applied force. An object can have a large applied force but zero ' +
        'acceleration if friction or another opposing force cancels it out.',
    },
    {
      label: 'Static vs. kinetic friction',
      description: 'Assumes friction force is constant regardless of whether the object is moving.',
      corpusSlice:
        'Static friction opposes the start of motion and can vary up to a maximum value (mu_s * N) before ' +
        'the object starts moving. Kinetic friction acts once the object is sliding and is typically ' +
        'modeled as constant (mu_k * N), with mu_k usually less than mu_s.',
    },
    {
      label: 'Weight vs. mass',
      description: 'Uses mass and weight interchangeably; weight is force, mass is not.',
      corpusSlice:
        'Mass is the amount of matter in an object, measured in kilograms, and does not change with ' +
        'location. Weight is the gravitational force on that mass (W = mg), measured in newtons, and ' +
        'changes depending on the local gravitational field strength.',
    },
  ],
  [
    {
      label: 'Supply vs. quantity supplied',
      description: 'Conflates a shift of the supply curve with a movement along it.',
      corpusSlice:
        'A change in QUANTITY SUPPLIED is a movement along a fixed supply curve, caused only by a change ' +
        'in the price of the good itself. A change in SUPPLY is a shift of the entire curve, caused by ' +
        'non-price factors like input costs, technology, or the number of sellers.',
    },
    {
      label: 'Opportunity cost',
      description: 'Thinks opportunity cost only means money spent, ignoring the best forgone alternative.',
      corpusSlice:
        'Opportunity cost is the value of the next-best alternative given up when a choice is made — not ' +
        'simply the money spent. Choosing to study for one more hour has an opportunity cost equal to the ' +
        'best other use of that hour, even if no money changes hands.',
    },
  ],
  [
    {
      label: 'For loop off-by-one (range exclusivity)',
      description: 'Assumes range(n) includes n; writes loops that miss or overshoot the last index.',
      corpusSlice:
        'In Python, range(n) generates integers from 0 up to but NOT including n — i.e. 0, 1, ..., n-1. ' +
        'A common off-by-one bug is writing range(n) when the intent was to include n, or using <= len(list) ' +
        'as a loop bound, which causes an IndexError on the final iteration.',
    },
    {
      label: 'Mutable default arguments',
      description: 'Uses a mutable list/dict as a default function argument, expecting a fresh one each call.',
      corpusSlice:
        'Default argument values in Python are evaluated ONCE at function definition time, not on every ' +
        'call. def f(x, acc=[]): reuses the SAME list object across calls, so appending to acc persists ' +
        'and silently accumulates state across unrelated calls — the fix is acc=None then acc = acc or [].',
    },
  ],
  [
    {
      label: 'Correlation vs. causation',
      description: 'Infers a causal claim directly from an observed correlation in a dataset.',
      corpusSlice:
        'Correlation measures how two variables move together but does not establish that one causes the ' +
        'other — a third confounding variable, reverse causation, or pure coincidence can all produce a ' +
        'strong correlation. Causation requires controlled experiments or strong causal-inference design.',
    },
    {
      label: 'p-value misinterpretation',
      description: 'Reads p=0.03 as "3% chance the null hypothesis is true."',
      corpusSlice:
        'A p-value is the probability of observing data at least as extreme as what was measured, ASSUMING ' +
        'the null hypothesis is true — it is NOT the probability that the null hypothesis itself is true. ' +
        'p=0.03 means: if there were truly no effect, results this extreme would occur 3% of the time.',
    },
  ],
];

// ── §5.3: "blended" glm-sonnet rate. path-generator-cost.ts's `glmRates()`
// already encodes this exact blended input/output rate ($0.95/$3.00 per 1M
// for any `z-ai/glm-5*` slug) — reused via `costForCall` below instead of
// duplicating the numbers. OpenRouter's own inline `usage.costUsd` (exact,
// billed) is preferred when present; the rate-table estimate is the fallback
// / cross-check, exactly like the production `logAiUsage` cost precedence.
//
// TODO(weakness-training Phase 0): no USD→CHF constant exists anywhere in the
// repo (checked currency.ts / exchange-rates.ts) — hardcoding a conservative
// rate here. Swap for the real `exchange-rates.ts` lookup if one lands before
// Phase 1B, or move this constant somewhere shared if the cost-logging code
// in §5.3 needs it for real.
const USD_TO_CHF = 0.88;

interface SessionResult {
  index: number;
  concepts: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsdExact: number;
  costUsdEstimated: number;
  costChf: number;
  ms: number;
  ok: boolean;
  note: string;
}

function buildSystemPrompt(concepts: ConceptFixture[]): string {
  // Corpus + static rules first, dynamic tail last — same ordering discipline
  // as buildCachedSystem(corpus, staticInstructions, dynamicTail) in §5.2, so a
  // real implementation could drop this straight into that helper.
  const corpusBlock = concepts
    .map((c, i) => `Concept ${i + 1}: ${c.label}\nWhy it's weak: ${c.description}\nCorpus slice:\n${c.corpusSlice}`)
    .join('\n\n');
  return [
    'You generate a remediation session for a study app by calling create_remediation_session.',
    'Below are 2-3 weak concepts for ONE learner, each with a short corpus slice. Ground every',
    'reteach/discriminate/retest step ONLY in that concept\'s corpus slice — do not invent facts',
    'outside it. Keep each field concise (this is a quick remediation step, not a full lesson).',
    '',
    corpusBlock,
  ].join('\n');
}

async function runSession(index: number, concepts: ConceptFixture[]): Promise<SessionResult> {
  let usage: OpenRouterUsage | undefined;
  const t0 = Date.now();
  try {
    const result = await forcedStructuredCallOpenRouter<{ concepts?: unknown[] }>({
      system: buildSystemPrompt(concepts),
      tool: REMEDIATION_SESSION_TOOL,
      userMessage: 'Generate the remediation session now.',
      model: GLM_SONNET_MODEL,
      onUsage: (u) => {
        usage = u;
      },
    });
    const ms = Date.now() - t0;
    const stepCount = Array.isArray(result?.concepts) ? result.concepts.length : 0;
    const ok = stepCount >= 2;
    const inputTokens = usage?.inputTokens ?? 0;
    const outputTokens = usage?.outputTokens ?? 0;
    const cachedTokens = usage?.cachedTokens ?? 0;
    const costUsdExact = usage?.costUsd ?? 0;
    const costUsdEstimated = costForCall(GLM_SONNET_MODEL, {
      inputTokens,
      outputTokens,
      cacheReadTokens: cachedTokens,
    });
    // Prefer OpenRouter's exact billed cost; fall back to the rate-table estimate
    // (mirrors logAiUsage's costUsd-override-with-fallback precedence).
    const billedUsd = costUsdExact > 0 ? costUsdExact : costUsdEstimated;
    return {
      index,
      concepts: stepCount,
      inputTokens,
      outputTokens,
      cachedTokens,
      costUsdExact,
      costUsdEstimated,
      costChf: billedUsd * USD_TO_CHF,
      ms,
      ok,
      note: ok ? '' : `only ${stepCount} concept(s) returned (expected 2-3)`,
    };
  } catch (e) {
    return {
      index,
      concepts: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      costUsdExact: 0,
      costUsdEstimated: 0,
      costChf: 0,
      ms: Date.now() - t0,
      ok: false,
      note: String(e instanceof Error ? e.message : e).slice(0, 160),
    };
  }
}

async function main(): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error(
      '✗ OPENROUTER_API_KEY is not set.\n' +
        '  Run: npx tsx --env-file=.env.local scripts/weakness-phase0-cost-probe.ts\n' +
        '  or:  OPENROUTER_API_KEY=sk-or-v1-... npx tsx scripts/weakness-phase0-cost-probe.ts',
    );
    process.exit(1);
  }

  console.log(`Phase 0 cost probe — weakness-session-generate tier (model=${GLM_SONNET_MODEL})`);
  console.log(`Target (§5.3): ≤ 0.05 CHF/session, ~3,000 in / ~1,200 out tokens, ONE call/session.\n`);

  const results: SessionResult[] = [];
  for (let i = 0; i < FIXTURE_SESSIONS.length; i++) {
    const r = await runSession(i + 1, FIXTURE_SESSIONS[i]);
    results.push(r);
    console.log(
      `${r.ok ? '✓' : '✗'} session ${r.index}  concepts=${r.concepts}  ` +
        `in=${String(r.inputTokens).padStart(5)} out=${String(r.outputTokens).padStart(4)} ` +
        `cached=${String(r.cachedTokens).padStart(5)}  ` +
        `$${r.costUsdExact > 0 ? r.costUsdExact.toFixed(6) : `~${r.costUsdEstimated.toFixed(6)}`}  ` +
        `CHF≈${r.costChf.toFixed(4)}  (${r.ms}ms)${r.note ? `  — ${r.note}` : ''}`,
    );
  }

  const ok = results.filter((r) => r.ok);
  console.log('\n──────────────────────── summary ────────────────────────');
  console.log(`sessions run:        ${results.length}`);
  console.log(`sessions OK:         ${ok.length}`);
  if (ok.length > 0) {
    const totalChf = ok.reduce((s, r) => s + r.costChf, 0);
    const avgChf = totalChf / ok.length;
    const avgIn = ok.reduce((s, r) => s + r.inputTokens, 0) / ok.length;
    const avgOut = ok.reduce((s, r) => s + r.outputTokens, 0) / ok.length;
    console.log(`avg input tokens:    ${avgIn.toFixed(0)}`);
    console.log(`avg output tokens:   ${avgOut.toFixed(0)}`);
    console.log(`total cost:          CHF ${totalChf.toFixed(4)}  ($${(totalChf / USD_TO_CHF).toFixed(6)})`);
    console.log(`avg cost/session:    CHF ${avgChf.toFixed(4)}`);
    console.log(
      avgChf <= 0.05
        ? `\n✓ avg per-session cost is within the §5.3 target (≤ 0.05 CHF).`
        : `\n✗ avg per-session cost EXCEEDS the §5.3 target (≤ 0.05 CHF) — re-check prompt size / corpus scoping before Phase 1B.`,
    );
  }
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(
      `\n✗ ${failed.length}/${results.length} session(s) failed to produce a usable payload: ` +
        failed.map((r) => `#${r.index} (${r.note})`).join(', '),
    );
    process.exit(1);
  }
  console.log(
    '\n(This is a cost SANITY CHECK on 5 fixture sessions, not the §8.D Phase-0 acceptance bar — ' +
      'that requires ≥20 REAL generated sessions per §5.3/§8.D before broad enablement.)',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
