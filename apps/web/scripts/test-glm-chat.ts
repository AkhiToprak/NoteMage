/**
 * Phase 3 group-4 verification: exercise the GLM chat/Mage adapter
 * (`streamChatGLM`) end-to-end with the REAL chat tools, and confirm its
 * Anthropic-shaped output feeds `extractToolUses` exactly like the Anthropic
 * path. Validates: tool conversion, message conversion, streaming prose,
 * tool_use reassembly, and the auto-tool (Mage annotate) + forced-tool
 * (generation) tool_choice modes.
 *
 *   npx tsx --env-file=.env.local scripts/test-glm-chat.ts
 *
 * Touches NO production routing. Exits 1 if a critical assertion fails.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { streamChatGLM } from '../src/lib/chat-stream-openrouter';
import { GLM_HAIKU_MODEL } from '../src/lib/openrouter';
import {
  extractToolUses,
  FLASHCARD_TOOL_WITH_FIGURES,
  QUIZ_TOOL_V2_WITH_FIGURES,
  MINDMAP_TOOL,
  CHAT_STUDY_PLAN_TOOL,
  PRESENTATION_TOOL,
  YOUTUBE_VIDEOS_TOOL,
  ANNOTATE_ANSWER_TOOL,
} from '../src/lib/ai-tools';

// Same array chat-stream.ts sends on every turn.
const CHAT_TOOLS: Anthropic.Messages.Tool[] = [
  FLASHCARD_TOOL_WITH_FIGURES,
  QUIZ_TOOL_V2_WITH_FIGURES,
  MINDMAP_TOOL,
  CHAT_STUDY_PLAN_TOOL,
  PRESENTATION_TOOL,
  YOUTUBE_VIDEOS_TOOL,
  ANNOTATE_ANSWER_TOOL,
];

const sys = (text: string): Anthropic.Messages.TextBlockParam[] => [{ type: 'text', text }];
let failures = 0;

// ── Test A — Mage answer shape: tool_choice 'auto' → prose + annotate_answer ─
async function testMageAuto(): Promise<void> {
  let deltas = 0;
  const response = await streamChatGLM({
    model: GLM_HAIKU_MODEL,
    system: sys(
      'You are a study assistant. Sources:\n[S1] Mitochondria produce ATP via oxidative phosphorylation.\n' +
        '[S2] Chloroplasts perform photosynthesis in plants.\n' +
        'Answer using the sources, cite inline like [S1], then call annotate_answer with the source ids you used.',
    ),
    messages: [{ role: 'user', content: 'What is the main job of the mitochondria? Cite your source.' }],
    tools: CHAT_TOOLS,
    toolChoice: { type: 'auto' },
    onText: () => {
      deltas += 1;
    },
  });
  const { text, annotate } = extractToolUses(response.content);
  const textOk = text.trim().length > 0 && deltas > 0;
  console.log(`\n[Mage auto] deltas=${deltas}\ntext: ${text.slice(0, 160)}\nannotate: ${JSON.stringify(annotate?.input ?? null)}`);
  if (!textOk) {
    console.error('✗ [Mage auto] CRITICAL: no streamed prose');
    failures += 1;
  } else {
    console.log(`✓ [Mage auto] streamed prose (${deltas} deltas)${annotate ? ' + called annotate_answer' : ' (no annotate — allowed on auto)'}`);
  }
}

// ── Test B — generation shape: tool_choice forced → create_flashcards ───────
async function testForcedGeneration(): Promise<void> {
  const response = await streamChatGLM({
    model: GLM_HAIKU_MODEL,
    system: sys('You create study flashcards by calling the create_flashcards tool.'),
    messages: [{ role: 'user', content: 'Make 3 flashcards about photosynthesis.' }],
    tools: CHAT_TOOLS,
    toolChoice: { type: 'tool', name: 'create_flashcards' },
    onText: () => {},
  });
  const { flashcard } = extractToolUses(response.content);
  const cards = Array.isArray(flashcard?.input?.flashcards) ? flashcard!.input.flashcards.length : 0;
  console.log(`\n[Forced gen] create_flashcards → ${cards} flashcards`);
  console.log(JSON.stringify(flashcard?.input ?? null, null, 2).slice(0, 600));
  if (!flashcard || cards === 0) {
    console.error('✗ [Forced gen] CRITICAL: create_flashcards not extracted from GLM tool_use');
    failures += 1;
  } else {
    console.log(`✓ [Forced gen] extractToolUses pulled ${cards} flashcards from the GLM tool call`);
  }
}

async function main(): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('✗ OPENROUTER_API_KEY is not set. Run with --env-file=.env.local');
    process.exit(1);
  }
  await testMageAuto();
  await testForcedGeneration();

  if (failures > 0) {
    console.error(`\n✗ ${failures} critical chat-adapter failure(s).`);
    process.exit(1);
  }
  console.log('\n✓ streamChatGLM adapter works — Anthropic-shaped output feeds extractToolUses for both auto + forced tool modes.');
}

main().catch((e) => {
  console.error('✗ threw:', e instanceof Error ? e.message : e);
  process.exit(1);
});
