// Server-only sample-path content for the guided tutorial. One fixture per
// subject — each a notebook source page + a real StudyPlan graph (1 phase,
// 2 slots) consumed by the shared deep-copy engine (src/lib/path-clone.ts) in
// the materializer. Authored once; materialized instantly into a user's account
// with zero AI cost.
//
// Per-slot activity kinds MUST match expectedActivityKinds (src/lib/
// path-slot-activities.ts) or the slot reads as `incompleteGeneration`:
//   learning   → theory + flashcards   (the "one short section" the user finishes)
//   assessment → quiz                  (the optional checkpoint after it)
//
// Imports are type-only (+ string-literal enum casts) so this stays a pure data
// module; it is imported by the server materializer, not the client.

import type { Prisma, QuestionKind, GateStrategy } from '@prisma/client';
import type { CloneSourceActivity, CloneSourcePhase, CloneSourceSlot } from '@/lib/path-clone';
import type { SampleId } from './catalog';

// ── TipTap body helpers (standard StarterKit nodes TheoryViewer renders) ──────

type TipTapNode = Record<string, unknown>;
const doc = (...content: TipTapNode[]): Prisma.JsonValue =>
  ({ type: 'doc', content }) as unknown as Prisma.JsonValue;
const h = (level: number, text: string): TipTapNode => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text }],
});
const p = (text: string): TipTapNode => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const ul = (...items: string[]): TipTapNode => ({
  type: 'bulletList',
  content: items.map((t) => ({
    type: 'listItem',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }],
  })),
});

// ── Activity / slot builders ──────────────────────────────────────────────────

const GATE = 'sequential' as GateStrategy;

const theoryActivity = (title: string, body: Prisma.JsonValue): CloneSourceActivity => ({
  kind: 'theory',
  title,
  sortOrder: 0,
  theory: { title, body, images: [] },
  flashcardSet: null,
  quizSet: null,
});

const flashcardsActivity = (
  title: string,
  cards: ReadonlyArray<readonly [string, string]>,
): CloneSourceActivity => ({
  kind: 'flashcards',
  title,
  sortOrder: 1,
  theory: null,
  flashcardSet: {
    title,
    source: 'manual',
    diagrams: null,
    flashcards: cards.map(([question, answer], i) => ({
      question,
      answer,
      sortOrder: i,
      images: [],
    })),
  },
  quizSet: null,
});

interface MCInput {
  q: string;
  options: [string, string, string, string];
  correct: number;
  why: string;
}

const quizActivity = (title: string, questions: MCInput[]): CloneSourceActivity => ({
  kind: 'quiz',
  title,
  sortOrder: 0,
  theory: null,
  flashcardSet: null,
  quizSet: {
    title,
    diagrams: null,
    questions: questions.map((qq, i) => ({
      kind: 'mc' as QuestionKind,
      payload: null,
      question: qq.q,
      options: qq.options,
      correctIndex: qq.correct,
      hint: null,
      correctExplanation: qq.why,
      wrongExplanation: null,
      sortOrder: i,
      image: null,
    })),
  },
});

const learningSlot = (
  title: string,
  description: string,
  theory: CloneSourceActivity,
  cards: CloneSourceActivity,
): CloneSourceSlot => ({
  title,
  description,
  kind: 'learning',
  sortOrder: 0,
  activities: [theory, cards],
});

const assessmentSlot = (
  title: string,
  description: string,
  quiz: CloneSourceActivity,
): CloneSourceSlot => ({
  title,
  description,
  kind: 'assessment',
  sortOrder: 1,
  activities: [quiz],
});

const phase = (title: string, description: string, slots: CloneSourceSlot[]): CloneSourcePhase => ({
  title,
  description,
  sortOrder: 0,
  gateStrategy: GATE,
  slots,
});

export interface SampleFixture {
  page: { title: string; body: Prisma.JsonValue };
  plan: {
    title: string;
    description: string;
    language: string;
    subjects: string[];
    phases: CloneSourcePhase[];
  };
}

// ── Biology — cell transport ──────────────────────────────────────────────────

const BIOLOGY: SampleFixture = {
  page: {
    title: 'Cell membranes — study notes',
    body: doc(
      h(2, 'The cell membrane'),
      p(
        'Every cell is wrapped in a thin membrane made of a phospholipid bilayer. It is selectively permeable: it controls what enters and leaves the cell.',
      ),
      ul(
        'Small, nonpolar molecules (O₂, CO₂) slip straight through.',
        'Most ions and large polar molecules need a protein to cross.',
      ),
      h(2, 'Moving things across'),
      p(
        'Transport is either passive (no energy, down the concentration gradient) or active (needs ATP, up the gradient).',
      ),
    ),
  },
  plan: {
    title: 'Cell Transport — Sample Path',
    description: 'A bite-size path on how substances move across the cell membrane.',
    language: 'en',
    subjects: ['Biology'],
    phases: [
      phase('Membranes & Transport', 'How molecules cross the cell membrane.', [
        learningSlot(
          'Passive transport',
          'Diffusion, osmosis, and facilitated diffusion.',
          theoryActivity(
            'Passive transport',
            doc(
              h(2, 'Passive transport'),
              p(
                'Passive transport moves substances down their concentration gradient — from where they are crowded to where they are sparse — without the cell spending any energy.',
              ),
              h(3, 'Diffusion'),
              p(
                'Diffusion is the net movement of particles from a high-concentration region to a low-concentration region until they are evenly spread. A drop of dye spreading through water is diffusion.',
              ),
              h(3, 'Osmosis'),
              p(
                'Osmosis is the diffusion of water across a selectively permeable membrane, moving from a region of low solute concentration toward high solute concentration. A cell in pure water gains water; a cell in salty water loses it.',
              ),
              h(3, 'Facilitated diffusion'),
              p(
                'Some molecules are too large or too charged to cross the lipid bilayer alone. In facilitated diffusion they pass through channel or carrier proteins — still down their gradient, still no ATP.',
              ),
              ul(
                'Passive = down the gradient, no energy.',
                'Active = up the gradient, needs ATP.',
              ),
            ),
          ),
          flashcardsActivity('Passive transport — cards', [
            ['What is diffusion?', 'The net movement of particles from high to low concentration until evenly spread.'],
            ['What is osmosis?', 'The diffusion of water across a selectively permeable membrane toward higher solute concentration.'],
            ['Why is the membrane "selectively permeable"?', 'Its lipid bilayer lets small nonpolar molecules pass freely but blocks most ions and large polar molecules.'],
            ['What is facilitated diffusion?', 'Passive transport of specific molecules through channel or carrier proteins, down their gradient, with no ATP.'],
            ['How does passive differ from active transport?', 'Passive moves down the gradient without energy; active moves up the gradient and requires ATP.'],
          ]),
        ),
        assessmentSlot(
          'Transport checkpoint',
          'Check what you learned about passive transport.',
          quizActivity('Transport checkpoint', [
            {
              q: 'Which process needs NO energy (ATP)?',
              options: ['Active transport', 'Facilitated diffusion', 'Endocytosis', 'The sodium–potassium pump'],
              correct: 1,
              why: 'Facilitated diffusion is passive — molecules move down their gradient through proteins, no ATP.',
            },
            {
              q: 'Osmosis is the movement of ___ across a membrane.',
              options: ['glucose', 'water', 'ions', 'proteins'],
              correct: 1,
              why: 'Osmosis is specifically the diffusion of water.',
            },
            {
              q: 'A cell is placed in pure water. Water will tend to:',
              options: ['move out of the cell', 'move into the cell', 'not move at all', 'turn into solute'],
              correct: 1,
              why: 'Water moves toward higher solute concentration — into the cell.',
            },
            {
              q: 'Which molecule crosses the lipid bilayer most easily?',
              options: ['A sodium ion (Na⁺)', 'Glucose', 'Oxygen gas (O₂)', 'A large protein'],
              correct: 2,
              why: 'Small, nonpolar molecules like O₂ diffuse straight through the bilayer.',
            },
          ]),
        ),
      ]),
    ],
  },
};

// ── History — the French Revolution ──────────────────────────────────────────

const HISTORY: SampleFixture = {
  page: {
    title: 'French Revolution — study notes',
    body: doc(
      h(2, 'France before 1789'),
      p(
        'France was an absolute monarchy under Louis XVI. Society was split into three estates, and the system was straining under debt and inequality.',
      ),
      ul(
        'First Estate — the clergy.',
        'Second Estate — the nobility.',
        'Third Estate — everyone else, ~97% of the population, who paid most of the taxes.',
      ),
    ),
  },
  plan: {
    title: 'The French Revolution — Sample Path',
    description: 'A bite-size path on why France erupted into revolution in 1789.',
    language: 'en',
    subjects: ['History'],
    phases: [
      phase('Road to Revolution', 'What pushed France to the breaking point.', [
        learningSlot(
          'Causes of 1789',
          'The estates, the debt crisis, and Enlightenment ideas.',
          theoryActivity(
            'Causes of 1789',
            doc(
              h(2, 'Causes of the French Revolution'),
              p(
                'By 1789 France was an absolute monarchy in deep crisis. Several pressures combined to topple the old order, the Ancien Régime.',
              ),
              h(3, 'An unfair society'),
              p(
                'The population was divided into three estates. The clergy and nobility (the First and Second Estates) held privileges and paid little tax. The Third Estate — roughly 97% of people — carried the tax burden with almost no political power.',
              ),
              h(3, 'A financial crisis'),
              p(
                'Years of war, lavish court spending, and costly support for the American Revolution left the crown deeply in debt with an empty treasury. Attempts to tax the privileged estates failed.',
              ),
              h(3, 'New ideas'),
              p(
                'Enlightenment thinkers argued that sovereignty belongs to the people and that government should rest on reason and rights — not the divine right of kings. When the Estates-General met, the Third Estate broke away to form a National Assembly, and on 14 July 1789 Parisians stormed the Bastille.',
              ),
            ),
          ),
          flashcardsActivity('Causes of 1789 — cards', [
            ['What were the three estates?', 'The clergy (First), the nobility (Second), and everyone else — the commoners (Third Estate).'],
            ['Why was the Third Estate frustrated?', 'It was ~97% of the population and paid most taxes, yet had little political power and could be outvoted.'],
            ['What financial crisis triggered the Estates-General?', 'Crippling royal debt from wars and court spending, with an empty treasury.'],
            ['What happened on 14 July 1789?', 'Parisians stormed the Bastille, a fortress-prison symbolizing royal tyranny — the spark of the revolution.'],
            ['Which Enlightenment idea fuelled the revolution?', 'That sovereignty belongs to the people and government should rest on reason and rights, not divine-right monarchy.'],
          ]),
        ),
        assessmentSlot(
          'Revolution checkpoint',
          'Check what you learned about the causes of 1789.',
          quizActivity('Revolution checkpoint', [
            {
              q: 'The Third Estate mainly consisted of:',
              options: ['The clergy', 'The nobility', 'The common people', 'Foreign monarchs'],
              correct: 2,
              why: 'The Third Estate was the commoners — about 97% of France.',
            },
            {
              q: 'A major financial cause of the revolution was:',
              options: ['A gold surplus', 'Crippling royal debt', 'No taxes at all', 'Falling bread prices'],
              correct: 1,
              why: 'The crown was deep in debt with an empty treasury.',
            },
            {
              q: 'The storming of the Bastille happened in:',
              options: ['1776', '1789', '1799', '1815'],
              correct: 1,
              why: 'It took place on 14 July 1789.',
            },
            {
              q: 'Enlightenment thinkers argued political power should come from:',
              options: ['The divine right of kings', 'The people and reason', 'The army', 'The Church alone'],
              correct: 1,
              why: 'Popular sovereignty and reason replaced divine-right monarchy as the ideal.',
            },
          ]),
        ),
      ]),
    ],
  },
};

// ── Computer Science — algorithmic complexity ────────────────────────────────

const COMPUTER_SCIENCE: SampleFixture = {
  page: {
    title: 'Algorithmic complexity — study notes',
    body: doc(
      h(2, 'Why complexity matters'),
      p(
        'Two programs can solve the same problem but scale very differently as the input grows. Big-O notation describes that scaling so we can compare algorithms without timing them on a specific machine.',
      ),
      ul(
        'O(1) — constant',
        'O(log n) — logarithmic',
        'O(n) — linear',
        'O(n²) — quadratic',
      ),
    ),
  },
  plan: {
    title: 'Big-O Basics — Sample Path',
    description: 'A bite-size path on measuring how algorithms scale.',
    language: 'en',
    subjects: ['Computer Science'],
    phases: [
      phase('Measuring Algorithms', 'How running time grows with input size.', [
        learningSlot(
          'Big-O basics',
          'Common complexity classes and why we drop constants.',
          theoryActivity(
            'Big-O basics',
            doc(
              h(2, 'Big-O notation'),
              p(
                'Big-O describes how an algorithm’s running time (or memory) grows as the input size n grows. It captures the shape of the growth, not the exact time on any one computer, and usually describes the worst case.',
              ),
              h(3, 'Common classes'),
              ul(
                'O(1) — constant: the work does not depend on n (e.g. reading one array element by index).',
                'O(log n) — logarithmic: each step throws away a fraction of the data (e.g. binary search).',
                'O(n) — linear: work grows in direct proportion to n (e.g. one loop over n items).',
                'O(n log n) — typical of good sorting algorithms.',
                'O(n²) — quadratic: two nested loops over n items.',
              ),
              h(3, 'Dropping constants'),
              p(
                'Big-O looks at growth as n becomes very large, where the fastest-growing term dominates. So we drop constant factors and lower-order terms: 3n + 10 is just O(n), and n² + n is O(n²).',
              ),
            ),
          ),
          flashcardsActivity('Big-O basics — cards', [
            ['What does Big-O notation describe?', 'How an algorithm’s running time or space grows as the input size n grows — its scaling, not exact time.'],
            ['What is O(1)?', 'Constant time — the work does not depend on input size, e.g. array index access.'],
            ['What is O(n)?', 'Linear time — work grows in direct proportion to n, e.g. a single loop over n items.'],
            ['Why is binary search O(log n)?', 'It halves the search space each step, so doubling n adds only one extra step.'],
            ['Why drop constants and lower-order terms?', 'Big-O describes growth as n→∞, where the fastest-growing term dominates; constants don’t change the class.'],
          ]),
        ),
        assessmentSlot(
          'Complexity checkpoint',
          'Check what you learned about Big-O.',
          quizActivity('Complexity checkpoint', [
            {
              q: 'Looking up an element by index in an array is:',
              options: ['O(1)', 'O(n)', 'O(n²)', 'O(log n)'],
              correct: 0,
              why: 'Index access is constant time — it does not depend on the array size.',
            },
            {
              q: 'A single loop over n items is typically:',
              options: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'],
              correct: 2,
              why: 'Linear — the work scales directly with n.',
            },
            {
              q: 'Binary search on a sorted array is:',
              options: ['O(n)', 'O(n log n)', 'O(log n)', 'O(1)'],
              correct: 2,
              why: 'It halves the range each step, which is logarithmic.',
            },
            {
              q: 'Two nested loops over n items are usually:',
              options: ['O(n)', 'O(2n)', 'O(n²)', 'O(log n)'],
              correct: 2,
              why: 'Each of the n outer steps does n inner steps → n×n = quadratic.',
            },
          ]),
        ),
      ]),
    ],
  },
};

export const SAMPLE_FIXTURES: Record<SampleId, SampleFixture> = {
  biology: BIOLOGY,
  history: HISTORY,
  'computer-science': COMPUTER_SCIENCE,
};
