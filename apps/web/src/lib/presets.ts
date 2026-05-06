export interface Preset {
  id: string;
  label: string;
  color: string;
  keywords: string[];
  scaffold: string[];
}

export const PRESETS: Preset[] = [
  {
    id: 'biology',
    label: 'Biology',
    color: '#4ade80',
    keywords: [
      'bio',
      'biology',
      'anatomy',
      'genetics',
      'ecology',
      'organism',
      'cell',
      'botany',
      'zoology',
    ],
    scaffold: ['Key Concepts', 'Diagrams & Definitions', 'Practice Questions'],
  },
  {
    id: 'chemistry',
    label: 'Chemistry',
    color: '#ff7043',
    keywords: [
      'chem',
      'chemistry',
      'organic',
      'reactions',
      'elements',
      'periodic',
      'molecule',
      'compound',
      'acid',
      'base',
    ],
    scaffold: ['Element Reference', 'Reaction Notes', 'Lab Notes', 'Practice Problems'],
  },
  {
    id: 'physics',
    label: 'Physics',
    color: '#38bdf8',
    keywords: [
      'phys',
      'physics',
      'mechanics',
      'thermodynamics',
      'quantum',
      'electro',
      'optics',
      'waves',
      'relativity',
    ],
    scaffold: ['Formulas & Laws', 'Concept Notes', 'Problem Sets'],
  },
  {
    id: 'mathematics',
    label: 'Mathematics',
    color: '#ffde59',
    keywords: [
      'math',
      'calc',
      'algebra',
      'geometry',
      'statistics',
      'trigonometry',
      'calculus',
      'linear',
      'probability',
    ],
    scaffold: ['Formulas', 'Worked Examples', 'Practice Problems'],
  },
  {
    id: 'language-learning',
    label: 'Language Learning',
    color: '#5170ff',
    keywords: [
      'lang',
      'language',
      'spanish',
      'french',
      'german',
      'japanese',
      'chinese',
      'italian',
      'korean',
      'portuguese',
      'arabic',
      'vocab',
      'vocabulary',
      'grammar',
      'mandarin',
      'russian',
      'dutch',
      'swedish',
      'turkish',
      'hindi',
    ],
    scaffold: ['Vocabulary List', 'Grammar Notes', 'Phrases & Expressions', 'Reading Exercises'],
  },
  {
    id: 'history',
    label: 'History',
    color: '#a78bfa',
    keywords: [
      'hist',
      'history',
      'ancient',
      'medieval',
      'modern',
      'civilization',
      'war',
      'empire',
      'revolution',
      'era',
    ],
    scaffold: ['Timeline', 'Key Figures', 'Event Summaries', 'Study Notes'],
  },
  {
    id: 'literature',
    label: 'Literature',
    color: '#f472b6',
    keywords: [
      'lit',
      'literature',
      'english',
      'writing',
      'fiction',
      'poetry',
      'novel',
      'reading',
      'essay',
      'rhetoric',
    ],
    scaffold: ['Reading Notes', 'Character Analysis', 'Themes & Motifs', 'Essay Drafts'],
  },
  {
    id: 'cs',
    label: 'Computer Science',
    color: '#8c52ff',
    keywords: [
      'cs',
      'programming',
      'code',
      'algorithm',
      'computer',
      'software',
      'coding',
      'data structure',
      'javascript',
      'python',
      'typescript',
      'react',
      'backend',
      'frontend',
      'database',
    ],
    scaffold: ['Concepts & Definitions', 'Code Snippets', 'Algorithm Notes', 'Project Ideas'],
  },
];

/** Returns up to 3 presets whose keywords overlap with the query string. */
export function matchPresets(query: string): Preset[] {
  const q = query.toLowerCase().trim();
  if (q.length < 1) return [];
  return PRESETS.filter((preset) =>
    preset.keywords.some((kw) => kw.includes(q) || q.includes(kw))
  ).slice(0, 3);
}

export function getPresetById(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/**
 * Finds which preset best matches a notebook's subject string.
 * Used for filter pill matching on the notebooks screen.
 */
export function getPresetForSubject(subject: string | null | undefined): Preset | null {
  if (!subject) return null;
  const s = subject.toLowerCase().trim();
  return (
    PRESETS.find(
      (preset) =>
        preset.label.toLowerCase() === s ||
        preset.keywords.some((kw) => s === kw || s.includes(kw) || kw.includes(s))
    ) ?? null
  );
}
