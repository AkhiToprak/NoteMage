// Client-safe metadata for the guided-tutorial sample subjects. This module
// carries NO path content and NO server-only imports, so the tutorial UI (the
// subject picker) can import it without pulling Prisma / fixture bodies into the
// client bundle. The heavy content lives in ./fixtures.ts (server-only).

export type SampleId = 'biology' | 'history' | 'computer-science';

export const SAMPLE_IDS: readonly SampleId[] = ['biology', 'history', 'computer-science'];

export function isSampleId(value: string): value is SampleId {
  return (SAMPLE_IDS as readonly string[]).includes(value);
}

export interface SampleMeta {
  id: SampleId;
  /** Short subject label, e.g. "Biology". */
  label: string;
  /** One-line description shown on the picker card. */
  blurb: string;
  /** Material Symbols icon name. */
  icon: string;
  /** Custom brand-derived hex (never a default Tailwind colour). */
  color: string;
  /** Notebook name the materialized study pack lands in. */
  notebookName: string;
  /** Notebook.subject value. */
  subject: string;
  /** Topic shown under the subject on the card, e.g. "Cell transport". */
  topic: string;
}

export const SAMPLE_CATALOG: Record<SampleId, SampleMeta> = {
  biology: {
    id: 'biology',
    label: 'Biology',
    blurb: 'How substances cross the cell membrane.',
    icon: 'biotech',
    color: '#2FA37A',
    notebookName: 'Sample · Biology',
    subject: 'Biology',
    topic: 'Cell transport',
  },
  history: {
    id: 'history',
    label: 'History',
    blurb: 'What tipped France into revolution in 1789.',
    icon: 'history_edu',
    color: '#C68A3E',
    notebookName: 'Sample · History',
    subject: 'History',
    topic: 'The French Revolution',
  },
  'computer-science': {
    id: 'computer-science',
    label: 'Computer Science',
    blurb: 'Measure how algorithms scale with Big-O.',
    icon: 'terminal',
    color: '#5B79E6',
    notebookName: 'Sample · Computer Science',
    subject: 'Computer Science',
    topic: 'Algorithmic complexity',
  },
};
