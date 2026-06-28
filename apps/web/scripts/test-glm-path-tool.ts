/**
 * Phase 3 group-1 verification: drive the GLM forced-tool path-generation
 * wrapper (`forcedStructuredCallOpenRouter`) with the REAL, complex
 * `create_quiz_for_slot` tool — the hardest path tool (per-question-kind
 * payloads + optional figure/source). Confirms the Anthropic→OpenAI tool-shape
 * conversion survives a nested schema and GLM returns a parseable tool call.
 *
 *   npx tsx --env-file=.env.local scripts/test-glm-path-tool.ts
 *
 * Touches NO production routing. Asserts a parsed object with a non-empty
 * `questions` array (downstream Zod would enforce the strict shape in prod).
 */

import { forcedStructuredCallOpenRouter } from '../src/lib/path-generator-openrouter';
import { QUIZ_FOR_SLOT_TOOL } from '../src/lib/ai-tools';
import { GLM_HAIKU_MODEL, type OpenRouterUsage } from '../src/lib/openrouter';

async function main(): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('✗ OPENROUTER_API_KEY is not set. Run with --env-file=.env.local');
    process.exit(1);
  }

  const system = [
    'You generate quizzes for a study app by calling the create_quiz_for_slot tool.',
    'Topic: "The water cycle" (evaporation, condensation, precipitation, collection).',
    'Produce 5 questions using a mix of kinds: multiple_choice, true_false, and short_answer.',
    'For multiple_choice give exactly 4 options and the correct index; for true_false give the boolean answer;',
    'for short_answer give an acceptable answer string. Keep each question concise.',
  ].join('\n');

  let usage: OpenRouterUsage | undefined;
  const t0 = Date.now();
  const result = await forcedStructuredCallOpenRouter<{ questions?: unknown[] }>({
    system,
    tool: QUIZ_FOR_SLOT_TOOL,
    userMessage: 'Generate now.',
    model: GLM_HAIKU_MODEL,
    onUsage: (u) => {
      usage = u;
    },
  });
  const ms = Date.now() - t0;

  const qCount = Array.isArray(result?.questions) ? result.questions.length : 0;
  console.log(JSON.stringify(result, null, 2).slice(0, 1400));
  console.log(`\n──────── result ────────`);
  console.log(`model:      ${GLM_HAIKU_MODEL}`);
  console.log(`parsed:     ${result && typeof result === 'object' ? 'YES (valid JSON object)' : 'NO'}`);
  console.log(`questions:  ${qCount}`);
  console.log(
    `usage:      in=${usage?.inputTokens} out=${usage?.outputTokens} cached=${usage?.cachedTokens} ` +
      `$${(usage?.costUsd ?? 0).toFixed(6)}  (${ms}ms)`,
  );

  if (!result || typeof result !== 'object' || qCount === 0) {
    console.error('\n✗ FAIL — GLM did not return a usable quiz payload through the forced-tool wrapper.');
    process.exit(1);
  }
  console.log('\n✓ GLM forced-tool path-gen wrapper works with the real complex quiz tool.');
}

main().catch((e) => {
  console.error('✗ threw:', e instanceof Error ? e.message : e);
  process.exit(1);
});
