/* Sample-run state for the onboarding quiz (Figma W08–W11).
 *
 * The sample run is a short, scripted 2-question check: "Database basics" (rows)
 * then "Table relationships" — the one designed to surface as the first weak
 * point. The three screens live on separate routes (quiz → feedback → weak-point),
 * so the questions + the run's answers are shared here:
 *   · SAMPLE_QUESTIONS — single source of truth for prompt / options / feedback.
 *   · the run answers ride sessionStorage so the weak-point summary reflects what
 *     the user ACTUALLY did, instead of hard-coded "3 answered / 2 correct" stats.
 *
 * Metadata only (which question, right or wrong) — no PII, never in the URL. */

export type SampleQuestion = {
  id: string;
  /** topic chip used by the +1 pill, e.g. "Database basics" */
  topic: string;
  prompt: string;
  options: { id: string; text: string }[];
  /** option id that is correct */
  correct: string;
  /** citation line shown under the prompt + in feedback */
  source: string;
  okBubble: string;
  okWhy: string;
  noBubble: string;
  noWhy: string;
  hint: string;
  /** present on the question that is the run's scripted weak point (when missed) */
  weakPoint?: { title: string; desc: string };
};

export const SAMPLE_QUESTIONS: SampleQuestion[] = [
  {
    id: 'rows',
    topic: 'Database basics',
    prompt: 'What does a row usually represent in a database table?',
    options: [
      { id: 'A', text: 'A single record' },
      { id: 'B', text: 'A column name' },
      { id: 'C', text: 'A database password' },
      { id: 'D', text: 'A relationship between tables' },
    ],
    correct: 'A',
    source: 'Sample SQL Notes · page 2',
    okBubble: 'Exactly. In a table, one row usually represents one record.',
    okWhy: 'In a student table, one row could represent one student. The columns describe that student, such as name, age, or class.',
    noBubble: 'Good attempt. You mixed up rows and columns.',
    noWhy: 'A row is one record. A column is one type of information, like name or date.',
    hint: 'Think of one row as one item in the table.',
  },
  {
    id: 'relationships',
    topic: 'Table relationships',
    prompt: 'How are two tables usually linked in a relational database?',
    options: [
      { id: 'A', text: 'By copying all the data into both tables' },
      { id: 'B', text: 'By a shared key that connects their rows' },
      { id: 'C', text: 'By saving both tables in the same file' },
      { id: 'D', text: 'By giving both tables the same name' },
    ],
    correct: 'B',
    source: 'Sample SQL Notes · page 3',
    okBubble: 'Nice — that is exactly how tables connect.',
    okWhy: 'Tables link through a shared key. A student_id in a grades table points back to one student in the students table.',
    noBubble: 'Close, but that is not how tables connect.',
    noWhy: 'Tables link through a shared key — like a student_id that appears in both tables — not by duplicating data or names.',
    hint: 'Look for a value that two tables have in common.',
    weakPoint: {
      title: 'Table relationships',
      desc: 'You understood tables, but struggled with how records connect across tables.',
    },
  },
];

export const SAMPLE_COUNT = SAMPLE_QUESTIONS.length;

/** The question whose miss becomes the run's first weak point. */
export const WEAK_QUESTION = SAMPLE_QUESTIONS.find((q) => q.weakPoint);

export type SampleAnswer = { id: string; correct: boolean };
export type SampleRun = { answers: SampleAnswer[] };

const KEY = 'nm:sampleRun';

function parse(raw: string): SampleRun {
  try {
    const p = JSON.parse(raw) as Partial<SampleRun>;
    if (!Array.isArray(p?.answers)) return { answers: [] };
    const answers = p.answers.filter(
      (a): a is SampleAnswer => !!a && typeof a.id === 'string' && typeof a.correct === 'boolean',
    );
    return { answers };
  } catch {
    return { answers: [] };
  }
}

/** Clear the run — called when a fresh sample run begins (W08 "Start quiz"). */
export function resetSampleRun(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* sessionStorage unavailable (private mode / quota) — the weak-point screen
       falls back to its scripted demo stats, which is harmless. */
  }
}

/** Record (upsert by question id) the answer the user submitted. Upsert keeps a
 *  retry / re-answer honest — the final answer for a question wins. */
export function recordSampleAnswer(id: string, correct: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    const run = parse(window.sessionStorage.getItem(KEY) ?? '');
    const answers = run.answers.filter((a) => a.id !== id);
    answers.push({ id, correct });
    window.sessionStorage.setItem(KEY, JSON.stringify({ answers }));
  } catch {
    /* see resetSampleRun */
  }
}

// useSyncExternalStore plumbing — the SSR-safe way to read client-only state.
// The snapshot is cached by the raw string so it returns a STABLE reference
// across renders (re-parsing each call hands back a new object every time and
// spins React into an infinite render loop).
let snapRaw: string | null | undefined;
let snapValue: SampleRun = { answers: [] };

export function getSampleRunSnapshot(): SampleRun {
  if (typeof window === 'undefined') return snapValue;
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(KEY);
  } catch {
    return snapValue;
  }
  if (raw === snapRaw) return snapValue;
  snapRaw = raw;
  snapValue = raw ? parse(raw) : { answers: [] };
  return snapValue;
}

/** Written once before navigation, never mutated while a screen is mounted, so
 *  there is nothing to subscribe to. */
export function subscribeSampleRun(): () => void {
  return () => {};
}

export function getSampleRunServerSnapshot(): SampleRun {
  return { answers: [] };
}
