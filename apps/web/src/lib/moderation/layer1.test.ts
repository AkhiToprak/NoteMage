// Unit tests for the L1 judgement function. These cover the pure
// decision-making path (no DB). The full runLayer1 path with state
// writes is covered by manual verification against the seed fixture
// (`seedshpsharedpathl1reject`) and the integration P3V gate.

import { describe, it, expect } from 'vitest';
import { judgeL1 } from './layer1';

describe('judgeL1: verdict path', () => {
  it('passes clean content', () => {
    const j = judgeL1({
      language: 'en',
      fields: [
        { field: 'title', text: 'Algorithms warm-up' },
        { field: 'description', text: 'A gentle intro to recursion and big-O.' },
      ],
    });
    expect(j.verdict).toBe('pass');
    expect(j.reasonCode).toBeNull();
    expect(j.rejectionReason).toBeNull();
  });

  it('rejects on a single English block hit and composes the canonical reasonCode', () => {
    const j = judgeL1({
      language: 'en',
      fields: [
        { field: 'title', text: 'fuck this exam' },
        { field: 'description', text: 'study tips' },
      ],
    });
    expect(j.verdict).toBe('reject');
    expect(j.reasonCode).toBe('wordlist.en.adult');
    expect(j.rejectionReason).toContain('explicit');
    expect(j.rejectionReason).toContain('in: title');
  });

  it('records flag hits in reasoning even on pass — soft signal for L2', () => {
    const j = judgeL1({
      language: 'en',
      fields: [{ field: 'description', text: 'this damn exam was tough' }],
    });
    expect(j.verdict).toBe('pass');
    expect(j.reasoning).toContain('flag');
    expect(j.reasoning).toContain('damn');
  });
});

describe('judgeL1: multi-language routing', () => {
  it('catches German block term on a German path', () => {
    const j = judgeL1({
      language: 'de',
      fields: [{ field: 'title', text: 'wir lernen heute ficken' }],
    });
    expect(j.verdict).toBe('reject');
    expect(j.reasonCode).toBe('wordlist.de.adult');
  });

  it('catches English profanity on a French path via baseline scan', () => {
    const j = judgeL1({
      language: 'fr',
      fields: [{ field: 'description', text: 'french lesson with fuck in the middle' }],
    });
    expect(j.verdict).toBe('reject');
    expect(j.reasonCode).toBe('wordlist.en.adult');
  });

  it('unknown language falls through to English-only scan', () => {
    const j = judgeL1({
      language: 'xx',
      fields: [{ field: 'title', text: 'fuck the rules' }],
    });
    expect(j.verdict).toBe('reject');
    expect(j.reasonCode).toBe('wordlist.en.adult');
  });
});

describe('judgeL1: category priority on multi-hit content', () => {
  it('adult outranks spam when both fire on the same path', () => {
    const j = judgeL1({
      language: 'en',
      fields: [
        { field: 'title', text: 'casino offer' },
        { field: 'description', text: 'and also fuck this' },
      ],
    });
    expect(j.verdict).toBe('reject');
    // hateful > adult > copyright > spam > offtopic in CATEGORY_PRIORITY
    expect(j.reasonCode).toBe('wordlist.en.adult');
  });

  it('uses the field list in the rejection reason when multiple fields are hit', () => {
    const j = judgeL1({
      language: 'en',
      fields: [
        { field: 'title', text: 'fuck title' },
        { field: 'description', text: 'shit description' },
        { field: 'phase 1 / slot 2 title', text: 'pussy chapter' },
      ],
    });
    expect(j.verdict).toBe('reject');
    expect(j.rejectionReason).toContain('title');
    expect(j.rejectionReason).toContain('description');
    expect(j.rejectionReason).toContain('phase 1 / slot 2 title');
  });
});

describe('judgeL1: Scunthorpe + allowlist invariants flow through to judgement', () => {
  it('"Scunthorpe" alone does not trigger a reject', () => {
    const j = judgeL1({
      language: 'en',
      fields: [
        { field: 'title', text: 'A history of Scunthorpe' },
        { field: 'description', text: 'studying classmate dynamics in mass cultures' },
      ],
    });
    expect(j.verdict).toBe('pass');
    expect(j.reasonCode).toBeNull();
  });
});
