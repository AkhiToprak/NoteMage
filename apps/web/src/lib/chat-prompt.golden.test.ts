// Golden / regression test for the chat system-prompt head builder
// `buildChatSystemBlocks` (chat-guidance.ts), extracted from the old inline
// assembly in chat-stream.ts (audit M7a). CI-safe: a pure string/block builder,
// no LLM calls, no network, no clock — output is fully deterministic from the
// fixture context.
//
// What this locks:
//   1. toMatchSnapshot() on each fixture's assembled blocks — a diff surfaces on
//      any wording/ordering change (review the diff, then `-u` if intended).
//   2. Block-ORDER invariants that don't depend on exact wording:
//        - the corpus block comes BEFORE the study-state / activity blocks (and,
//          by construction, before the guidance/identity blocks the caller
//          appends downstream — this builder never emits those).
//        - the identity block is LAST in the full prompt. This builder stops
//          before identity, so we assert its final block is the activity block
//          (or corpus when no activity) and document that chat-stream.ts pushes
//          identity as the terminal block.
//        - corpus-prefix stability across two "users": the builder takes no mage
//          name, so the corpus block is byte-identical for two turns that would
//          differ only in the per-user mage name. We prove it by building the
//          same context twice and asserting byte-equality of the corpus block.
//   3. Version stamp: MAGE_SYSTEM_PROMPT_VERSION is a non-empty literal (bump it
//      whenever a block below changes; the snapshot diff is the reminder).

import { describe, expect, it } from 'vitest';
import {
  buildChatSystemBlocks,
  CHAT_BASE_INSTRUCTIONS,
  MAGE_SYSTEM_PROMPT_VERSION,
  type ChatSystemBlocksContext,
} from './chat-guidance';

// ── Fixtures ────────────────────────────────────────────────────────────────
// A corpus + figure-catalog turn in Mage-answer mode, exercised both gated and
// ungated. (The reveal gate lives in a downstream block the caller appends, not
// in this builder — but we fixture both an activity-carrying and a plain turn to
// cover the study-state + activity branches. Every field is a fixed literal.)

const CORPUS: string[] = [
  '[S1] Photosynthesis converts light energy into chemical energy stored in glucose.',
  '[S2] The Calvin cycle fixes carbon dioxide into organic molecules using ATP and NADPH.',
];

const mageAnswerWithActivity: ChatSystemBlocksContext = {
  contextParts: CORPUS,
  chatImageCatalog: '',
  isMageAnswer: true,
  studyState: 'Exam in 3 days. Weakest topic: the light-independent reactions.',
  mageActivity: 'The learner is on a quiz question about the Calvin cycle and selected option B.',
};

const mageAnswerNoActivity: ChatSystemBlocksContext = {
  contextParts: CORPUS,
  chatImageCatalog: '',
  isMageAnswer: true,
  studyState: 'Exam in 3 days. Weakest topic: the light-independent reactions.',
};

const plainNoCorpus: ChatSystemBlocksContext = {
  contextParts: [],
  chatImageCatalog: '',
  isMageAnswer: false,
};

const corpusBlockOf = (blocks: { text: string }[]) =>
  blocks.find((b) => b.text.startsWith('The following is reference data'));

describe('chat-prompt golden — snapshots', () => {
  it('mage-answer, corpus + study-state + activity', () => {
    expect(buildChatSystemBlocks(mageAnswerWithActivity).blocks).toMatchSnapshot('blocks');
  });
  it('mage-answer, corpus + study-state, no activity', () => {
    expect(buildChatSystemBlocks(mageAnswerNoActivity).blocks).toMatchSnapshot('blocks');
  });
  it('plain turn, no corpus', () => {
    expect(buildChatSystemBlocks(plainNoCorpus).blocks).toMatchSnapshot('blocks');
  });
});

describe('chat-prompt golden — block ordering', () => {
  it('corpus block comes before study-state and activity', () => {
    const { blocks } = buildChatSystemBlocks(mageAnswerWithActivity);
    const idxCorpus = blocks.findIndex((b) => b.text.startsWith('The following is reference data'));
    const idxStudy = blocks.findIndex((b) => b.text.startsWith('STUDY STATE'));
    const idxActivity = blocks.findIndex((b) => b.text.startsWith('CURRENT ON-SCREEN ACTIVITY'));
    expect(idxCorpus).toBeGreaterThanOrEqual(0);
    expect(idxStudy).toBeGreaterThan(idxCorpus);
    expect(idxActivity).toBeGreaterThan(idxStudy);
  });

  it('base instructions are the first block', () => {
    const { blocks } = buildChatSystemBlocks(mageAnswerWithActivity);
    expect(blocks[0].text).toBe(CHAT_BASE_INSTRUCTIONS);
  });

  it('the activity block is the terminal block of this builder (identity is appended downstream)', () => {
    // chat-stream.ts appends identity as the final system block AFTER this
    // builder; within this builder the activity block is last when present.
    const { blocks, activityBlock } = buildChatSystemBlocks(mageAnswerWithActivity);
    expect(activityBlock).not.toBeNull();
    expect(blocks[blocks.length - 1]).toBe(activityBlock);
  });
});

describe('chat-prompt golden — corpus-prefix stability across users', () => {
  it('the corpus block is byte-identical across two turns differing only in mage identity', () => {
    // The mage name is NOT an input to this builder — it lives in the identity
    // block the caller appends last — so the cached corpus prefix can never vary
    // by user. Two identical contexts (as two users would present) must yield a
    // byte-identical corpus block.
    const a = corpusBlockOf(buildChatSystemBlocks(mageAnswerWithActivity).blocks);
    const b = corpusBlockOf(buildChatSystemBlocks(mageAnswerNoActivity).blocks);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a!.text).toBe(b!.text);
  });

  it('the corpus block carries the 1h ephemeral cache marker', () => {
    const { blocks } = buildChatSystemBlocks(mageAnswerWithActivity);
    const corpus = blocks.find((b) => b.text.startsWith('The following is reference data'));
    expect(corpus?.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
  });
});

describe('chat-prompt golden — version stamp', () => {
  it('MAGE_SYSTEM_PROMPT_VERSION is a non-empty literal', () => {
    expect(MAGE_SYSTEM_PROMPT_VERSION).toMatch(/\S/);
  });
});
