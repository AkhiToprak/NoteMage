// Phase 4 cost pass — unit tests for the per-slot corpus slicer. Pure: no
// network, no db, no process.env mutation (PATH_SLICE_BUDGET_CHARS is read at
// module load; these tests exercise the default 120k budget and the fixed
// 150k min-corpus / 0-score floors, none of which need env overrides).

import { describe, it, expect } from 'vitest';
import { sliceCorpusForSlot } from './path-corpus-slice';

/** Build one corpus section in the real `renderMaterialCorpus` shape:
 *  `### <label>: "<title>"` header + a padded body of ~`bodyChars` chars. The
 *  body repeats the title terms so a matching slot scores it. */
function section(label: string, title: string, terms: string, bodyChars: number): string {
  const sentence = `${terms} `;
  const body = sentence.repeat(Math.ceil(bodyChars / sentence.length)).slice(0, bodyChars);
  return `### ${label}: "${title}"\n${body}`;
}

/** Join sections the way renderMaterialCorpus does. */
function corpusOf(...sections: string[]): string {
  return sections.join('\n\n');
}

describe('sliceCorpusForSlot', () => {
  it('keeps only the sections that match the slot, splitting on the ### header', () => {
    // 3 big sections so the corpus clears the 150k min. Each ~60k chars.
    const photosynthesis = section('Page', 'Photosynthesis', 'photosynthesis chlorophyll light', 60_000);
    const mitosis = section('Page', 'Mitosis', 'mitosis chromosome division', 60_000);
    const respiration = section('Page', 'Cellular Respiration', 'respiration mitochondria atp', 60_000);
    const corpus = corpusOf(photosynthesis, mitosis, respiration);
    expect(corpus.length).toBeGreaterThan(150_000);

    const slice = sliceCorpusForSlot(corpus, {
      title: 'Photosynthesis basics',
      topicHint: 'how chlorophyll captures light',
    });

    expect(slice).not.toBeNull();
    // The matching section is kept; the two unrelated ones are dropped.
    expect(slice).toContain('### Page: "Photosynthesis"');
    expect(slice).not.toContain('### Page: "Mitosis"');
    expect(slice).not.toContain('### Page: "Cellular Respiration"');
  });

  it('enforces the char budget — never returns more than PATH_SLICE_BUDGET_CHARS', () => {
    // Six sections all matching the slot; each ~40k, so all six (~240k) exceed
    // the 120k budget and only whole sections that fit are kept.
    const secs = Array.from({ length: 6 }, (_, i) =>
      section('Page', `Algebra ${i}`, 'algebra equation variable polynomial', 40_000),
    );
    const corpus = corpusOf(...secs);

    const slice = sliceCorpusForSlot(corpus, { title: 'Algebra', topicHint: 'equations and polynomials' });

    expect(slice).not.toBeNull();
    expect(slice!.length).toBeLessThanOrEqual(120_000);
    // At least one section fit, but not all six.
    expect(slice!.length).toBeGreaterThan(0);
    expect(slice!.length).toBeLessThan(corpus.length);
  });

  it('preserves the original relative order of kept sections', () => {
    // Section A (first) scores lower than section C (last) but both are kept
    // (each ~40k, so both fit the 120k budget) — the output must still list A
    // before C, in original order, not by score.
    const a = section('Page', 'Intro', 'calculus limit', 50_000); // weaker (2 terms)
    const filler = section('Page', 'Unrelated', 'cooking recipe kitchen', 60_000);
    const c = section('Page', 'Deep Dive', 'calculus limit derivative integral continuity', 50_000); // stronger
    const corpus = corpusOf(a, filler, c); // ~160k total; a+c (~100k) fit the 120k budget
    expect(corpus.length).toBeGreaterThan(150_000);

    const slice = sliceCorpusForSlot(corpus, {
      title: 'Calculus',
      topicHint: 'limit derivative integral continuity',
    });

    expect(slice).not.toBeNull();
    const introAt = slice!.indexOf('### Page: "Intro"');
    const deepAt = slice!.indexOf('### Page: "Deep Dive"');
    expect(introAt).toBeGreaterThanOrEqual(0);
    expect(deepAt).toBeGreaterThanOrEqual(0);
    // Original order (Intro before Deep Dive) despite Deep Dive scoring higher.
    expect(introAt).toBeLessThan(deepAt);
  });

  it('returns null (→ full corpus) when the corpus is small', () => {
    const corpus = corpusOf(
      section('Page', 'A', 'alpha beta', 1_000),
      section('Page', 'B', 'gamma delta', 1_000),
    );
    expect(corpus.length).toBeLessThanOrEqual(150_000);
    expect(sliceCorpusForSlot(corpus, { title: 'A', topicHint: 'alpha' })).toBeNull();
  });

  it('returns null when fewer than 2 sections parse (nothing to choose)', () => {
    // One giant section, over the min-corpus threshold but a single block.
    const corpus = section('Document', 'Everything', 'topic content material', 200_000);
    expect(corpus.length).toBeGreaterThan(150_000);
    expect(sliceCorpusForSlot(corpus, { title: 'Everything', topicHint: 'topic' })).toBeNull();
  });

  it('returns null when no query term hits any section (weak match / score 0)', () => {
    const corpus = corpusOf(
      section('Page', 'Biology', 'cell membrane organelle', 80_000),
      section('Page', 'Chemistry', 'atom molecule bond', 80_000),
    );
    expect(corpus.length).toBeGreaterThan(150_000);
    // Slot terms overlap nothing in either section body/header.
    const slice = sliceCorpusForSlot(corpus, {
      title: 'Napoleonic Wars',
      topicHint: 'nineteenth century european battles',
    });
    expect(slice).toBeNull();
  });

  it('handles a null topicHint (scores on title alone)', () => {
    const corpus = corpusOf(
      section('Page', 'Genetics', 'genetics dna heredity gene', 80_000),
      section('Page', 'Ecology', 'ecosystem biome population', 80_000),
    );
    const slice = sliceCorpusForSlot(corpus, { title: 'Genetics and DNA', topicHint: null });
    expect(slice).not.toBeNull();
    expect(slice).toContain('### Page: "Genetics"');
    expect(slice).not.toContain('### Page: "Ecology"');
  });
});
