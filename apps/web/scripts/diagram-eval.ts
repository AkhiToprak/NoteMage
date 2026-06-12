/**
 * Phase 4 diagram-revival eval — the Flash-Lite structured-diagram gate.
 *
 *   pnpm --filter web diagram:eval
 *
 * Builds the REAL theory prompt (`buildTheoryPrompt`) for one diagram-friendly
 * slot per subject, calls Gemini Flash-Lite directly (replicating the Gemini
 * leg of `path-generator-routing.ts`: GEMINI_JSON_PREAMBLE + system prefix,
 * user suffix, responseMimeType 'application/json', thinkingBudget 0), then
 * runs the live result through the same `normalizeTheoryInput` +
 * `resolveDiagrams` pipeline production uses. It measures how often Flash-Lite
 * emits a VALID structured diagram per subject — the acceptance gate for the
 * Phase 1-2 prompt fixes.
 *
 * Env:
 *   GEMINI_API_KEY        required — without it the harness prints one line and
 *                         exits 0 (no key in env → nothing to measure)
 *   GEMINI_PATH_MODEL_LITE  overrides the Flash-Lite model id
 *   DIAGRAM_EVAL_RUNS     runs per subject (default 3 → 18 calls)
 *
 * CLI:
 *   --subject <id>        restrict to one subject id
 *
 * Report-only: always exits 0, prints PASS/FAIL per acceptance threshold.
 */

import type { Content, GenerateContentConfig } from '@google/genai';
import { getGeminiClient, GEMINI_PATH_MODEL_LITE } from '../src/lib/gemini';
import { buildTheoryPrompt, GEMINI_JSON_PREAMBLE, type SlotContentContext } from '../src/lib/path-prompts';
import { normalizeTheoryInput } from '../src/lib/path-generator-normalize';
import { resolveDiagrams } from '../src/lib/path-generator';
import { SUBJECT_IDS, type SubjectId } from '../src/lib/path-subjects';
import type { PathDiagram } from '@notemage/shared';

/** A diagram-friendly slot topic per subject — the eval probe. */
const SUBJECT_PROBES: Record<SubjectId, { pathTitle: string; topic: string; objective: string }> = {
  coding: {
    pathTitle: 'Algorithms & Data Structures',
    topic: 'How a binary search works',
    objective: 'trace a binary search step by step over a sorted array',
  },
  math: {
    pathTitle: 'Algebra Foundations',
    topic: 'Solving quadratic equations',
    objective: 'solve a quadratic equation using factoring and the quadratic formula',
  },
  science_natural: {
    pathTitle: 'Earth Systems & Biology',
    topic: 'The carbon cycle',
    objective: 'describe each stage carbon moves through in the carbon cycle',
  },
  history_humanities: {
    pathTitle: 'Ancient Rome',
    topic: 'The fall of the Roman Republic',
    objective: 'order the key events that ended the Roman Republic',
  },
  language: {
    pathTitle: 'German Grammar',
    topic: 'German past tenses: Perfekt vs Präteritum',
    objective: 'choose between Perfekt and Präteritum in written and spoken German',
  },
  social_studies: {
    pathTitle: 'Political Systems',
    topic: 'Direct vs representative democracy',
    objective: 'compare direct and representative democracy across key dimensions',
  },
  general: {
    pathTitle: 'General Studies',
    topic: 'How a bill becomes a law',
    objective: 'outline the stages a bill passes through to become law',
  },
};

/** The six subjects under test (the diagram-revival acceptance targets). */
const EVAL_SUBJECTS: SubjectId[] = [
  'coding',
  'math',
  'science_natural',
  'history_humanities',
  'language',
  'social_studies',
];

/** Build a realistic theory SlotContentContext for one subject probe. */
function makeContext(subject: SubjectId): SlotContentContext {
  const probe = SUBJECT_PROBES[subject];
  return {
    pathTitle: probe.pathTitle,
    pathDescription: `A guided path covering ${probe.pathTitle.toLowerCase()} for a motivated beginner.`,
    phaseTitle: 'Core Concepts',
    phaseDescription: `The foundational ideas of ${probe.pathTitle.toLowerCase()}.`,
    slotTitle: probe.topic,
    slotKind: 'learning',
    slotTopicHint: probe.topic,
    slotObjective: probe.objective,
    hasSourceMaterials: false,
    subjects: [subject],
    subjectWeights: [1],
    language: 'en',
    diagramsEnabled: true,
  };
}

const RUNS_PER_SUBJECT = Math.max(1, Number(process.env.DIAGRAM_EVAL_RUNS) || 3);

interface CallResult {
  subject: SubjectId;
  run: number;
  status: 'ok' | 'parse_fail' | 'call_fail';
  kinds: string[];
  rawCount: number;
  dropped: number;
  excerpt: string;
}

/** One live Flash-Lite theory call for a subject probe, run through the pipeline. */
async function runOne(subject: SubjectId, run: number): Promise<CallResult> {
  const ctx = makeContext(subject);
  const { system, tail } = buildTheoryPrompt(ctx);

  // Replicate the Gemini leg of path-generator-routing.ts for a non-structure
  // stage (theory): GEMINI_JSON_PREAMBLE leads the cacheable prefix, then the
  // stage rules; no corpus here. The dynamic tail + user message go in the
  // user turn (mirrors the inline, non-cached Gemini branch in the wrapper).
  const cacheablePrefix = [GEMINI_JSON_PREAMBLE, system]
    .filter((part) => part.length > 0)
    .join('\n\n');
  const userText = [tail, 'Generate now.'].filter((p) => p.length > 0).join('\n\n');

  const result: CallResult = {
    subject,
    run,
    status: 'ok',
    kinds: [],
    rawCount: 0,
    dropped: 0,
    excerpt: '',
  };

  const config: GenerateContentConfig = {
    responseMimeType: 'application/json',
    thinkingConfig: { thinkingBudget: 0 },
    systemInstruction: cacheablePrefix,
  };
  const contents: Content[] = [{ role: 'user', parts: [{ text: userText }] }];

  let text: string | undefined;
  try {
    const response = await getGeminiClient().models.generateContent({
      model: GEMINI_PATH_MODEL_LITE,
      contents,
      config,
    });
    text = response.text;
  } catch (err) {
    result.status = 'call_fail';
    result.excerpt = err instanceof Error ? err.message : String(err);
    return result;
  }

  if (!text || text.trim().length === 0) {
    result.status = 'parse_fail';
    result.excerpt = '(empty response)';
    return result;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    result.status = 'parse_fail';
    result.excerpt = (err instanceof Error ? err.message : String(err)).slice(0, 80);
    return result;
  }

  const normalized = normalizeTheoryInput(parsed);
  const rawDiagrams = Array.isArray(normalized.diagrams) ? normalized.diagrams : [];
  const resolved: PathDiagram[] = resolveDiagrams(normalized.diagrams);

  result.rawCount = rawDiagrams.length;
  result.kinds = resolved.map((d) => d.kind);
  // Drops = entries the model emitted that the strict schema rejected. Cap the
  // resolver at 2, so only count drops within what the resolver inspected.
  result.dropped = rawDiagrams.length > 0 ? Math.max(0, rawDiagrams.length - resolved.length) : 0;
  result.excerpt =
    resolved.length > 0
      ? resolved.map((d) => d.kind).join(',')
      : rawDiagrams.length > 0
        ? `raw:${rawDiagrams.length} all-dropped`
        : 'none';
  return result;
}

interface SubjectSummary {
  subject: SubjectId;
  runs: number;
  emitted: number;
  emissionRate: number;
  validRate: number;
  preferredHits: number;
  preferredRate: number;
  totalRaw: number;
  totalDropped: number;
}

/** The preferred kind per subject (mirrors the Phase 2 catalog targets). */
const PREFERRED_KIND: Partial<Record<SubjectId, PathDiagram['kind']>> = {
  coding: 'steps',
  science_natural: 'cycle',
  history_humanities: 'timeline',
  language: 'comparison',
  social_studies: 'comparison',
};

function summarize(subject: SubjectId, rows: CallResult[]): SubjectSummary {
  const runs = rows.length;
  const emitted = rows.filter((r) => r.kinds.length > 0).length;
  const totalRaw = rows.reduce((sum, r) => sum + r.rawCount, 0);
  const totalDropped = rows.reduce((sum, r) => sum + r.dropped, 0);
  const want = PREFERRED_KIND[subject];
  const preferredHits = want
    ? rows.filter((r) => r.kinds.includes(want)).length
    : emitted; // no preferred kind → "any valid" counts
  return {
    subject,
    runs,
    emitted,
    emissionRate: runs > 0 ? emitted / runs : 0,
    validRate: totalRaw > 0 ? (totalRaw - totalDropped) / totalRaw : emitted > 0 ? 1 : 0,
    preferredHits,
    preferredRate: runs > 0 ? preferredHits / runs : 0,
    totalRaw,
    totalDropped,
  };
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** Render a fixed-width table (matches pdf-import-eval's printSummary shape). */
function printTable(head: string[], data: string[][]): void {
  const widths = head.map((h, c) => Math.max(h.length, ...data.map((d) => d[c].length)));
  const line = (cells: string[]): string =>
    cells.map((cell, c) => cell.padEnd(widths[c])).join('  ');
  console.log('');
  console.log(line(head));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const d of data) console.log(line(d));
}

interface Threshold {
  label: string;
  pass: boolean;
  detail: string;
}

function evalThresholds(summaries: Map<SubjectId, SubjectSummary>, dropRate: number): Threshold[] {
  const out: Threshold[] = [];
  const check = (
    subject: SubjectId,
    label: string,
    floor: number,
    pick: (s: SubjectSummary) => number,
  ): void => {
    const s = summaries.get(subject);
    if (!s) return;
    const value = pick(s);
    out.push({
      label,
      pass: value >= floor,
      detail: `${pct(value)} (need ≥${pct(floor)}, n=${s.runs})`,
    });
  };
  check('history_humanities', 'history ≥70% timeline', 0.7, (s) => s.preferredRate);
  check('coding', 'coding ≥60% steps', 0.6, (s) => s.preferredRate);
  check('science_natural', 'science ≥50% cycle', 0.5, (s) => s.preferredRate);
  check('math', 'math ≥20% any', 0.2, (s) => s.emissionRate);
  check('language', 'language ≥20% any', 0.2, (s) => s.emissionRate);
  out.push({
    label: 'overall drop rate <15%',
    pass: dropRate < 0.15,
    detail: `${pct(dropRate)} (need <15%)`,
  });
  return out;
}

function parseSubjectArg(): SubjectId | null {
  const idx = process.argv.indexOf('--subject');
  if (idx === -1) return null;
  const value = process.argv[idx + 1];
  if (!value) return null;
  if (!(SUBJECT_IDS as readonly string[]).includes(value)) {
    console.error(`Unknown subject "${value}". Valid: ${SUBJECT_IDS.join(', ')}`);
    process.exit(0);
  }
  return value as SubjectId;
}

async function main(): Promise<void> {
  if (!process.env.GEMINI_API_KEY) {
    console.error(
      'GEMINI_API_KEY is not set — nothing to measure. Set it in the shell ' +
        'env (matching pdf-import:eval) and re-run.',
    );
    process.exit(0);
  }

  const only = parseSubjectArg();
  const subjects = only ? [only] : EVAL_SUBJECTS;

  console.log(
    `Model: ${GEMINI_PATH_MODEL_LITE} · ${RUNS_PER_SUBJECT} run(s)/subject · ` +
      `${subjects.length * RUNS_PER_SUBJECT} call(s) total`,
  );

  const allRows: CallResult[] = [];
  const bySubject = new Map<SubjectId, CallResult[]>();
  for (const subject of subjects) {
    const rows: CallResult[] = [];
    for (let run = 1; run <= RUNS_PER_SUBJECT; run += 1) {
      process.stdout.write(`  ${subject} run ${run}/${RUNS_PER_SUBJECT}… `);
      const row = await runOne(subject, run);
      console.log(row.status === 'ok' ? row.excerpt : `[${row.status}] ${row.excerpt}`);
      rows.push(row);
      allRows.push(row);
    }
    bySubject.set(subject, rows);
  }

  printTable(
    ['Subject', 'Run', 'Status', 'Kinds', 'Raw', 'Dropped'],
    allRows.map((r) => [
      r.subject,
      String(r.run),
      r.status,
      r.kinds.length > 0 ? r.kinds.join(',') : '—',
      String(r.rawCount),
      String(r.dropped),
    ]),
  );

  const summaries = new Map<SubjectId, SubjectSummary>();
  for (const [subject, rows] of bySubject) summaries.set(subject, summarize(subject, rows));

  printTable(
    ['Subject', 'Emission', 'Valid', 'Preferred'],
    Array.from(summaries.values()).map((s) => [
      s.subject,
      `${pct(s.emissionRate)} (${s.emitted}/${s.runs})`,
      pct(s.validRate),
      `${pct(s.preferredRate)} (${s.preferredHits}/${s.runs})`,
    ]),
  );

  const totalRaw = allRows.reduce((sum, r) => sum + r.rawCount, 0);
  const totalDropped = allRows.reduce((sum, r) => sum + r.dropped, 0);
  const dropRate = totalRaw > 0 ? totalDropped / totalRaw : 0;

  const thresholds = evalThresholds(summaries, dropRate);
  console.log('\nAcceptance thresholds:');
  for (const t of thresholds) {
    console.log(`  ${t.pass ? 'PASS' : 'FAIL'}  ${t.label.padEnd(28)} ${t.detail}`);
  }

  // Report-only: never fail CI on a measurement.
  process.exit(0);
}

main().catch((err) => {
  console.error('diagram eval failed:', err);
  process.exit(0);
});
