// L2 — heuristicIntent fast-path table. Pure sync classifier, no LLM/network.
// Locks the latency fix: a generation keyword WITHOUT a creation verb resolves
// to plain `chat` synchronously (was null→serial GLM call); only a genuinely
// multi-intent turn (≥2 keywords + creation verb) still defers to the LLM.

import { afterEach, describe, expect, it } from 'vitest';
import { heuristicIntent } from './chat-intent';

afterEach(() => {
  delete process.env.CHAT_INTENT_LLM_AMBIGUOUS;
});

describe('heuristicIntent', () => {
  const cases: Array<[string, ReturnType<typeof heuristicIntent>]> = [
    // No generation keyword — plain chat.
    ['explain the water cycle', 'chat'],
    // Standalone imperative — unambiguous without a creation verb.
    ['quiz me on chapter 3', 'quiz'],
    // Single keyword + creation verb — resolves to the intent.
    ['make flashcards from this', 'flashcards'],
    ['can you generate a mindmap', 'mindmap'],
    // Single keyword, NO creation verb — the L2 change: chat, not null.
    ['what is a mind map?', 'chat'],
    ['tell me about flashcards', 'chat'],
    // Multiple keywords, NO creation verb — still a plain question → chat.
    ['difference between flashcards and a quiz', 'chat'],
    // Multiple keywords + creation verb — genuinely ambiguous → LLM (null).
    ['make flashcards and a quiz', null],
  ];

  for (const [text, expected] of cases) {
    it(`${JSON.stringify(text)} → ${expected}`, () => {
      expect(heuristicIntent(text)).toBe(expected);
    });
  }

  it('CHAT_INTENT_LLM_AMBIGUOUS=1 restores null→LLM for keyword-without-verb', () => {
    process.env.CHAT_INTENT_LLM_AMBIGUOUS = '1';
    expect(heuristicIntent('what is a mind map?')).toBeNull();
    // Non-ambiguous cases are unaffected by the rollback flag.
    expect(heuristicIntent('make flashcards from this')).toBe('flashcards');
    expect(heuristicIntent('explain the water cycle')).toBe('chat');
  });
});
