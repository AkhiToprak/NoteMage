import type Anthropic from '@anthropic-ai/sdk';
import type { QuestionKind } from '@notemage/shared';

// ── Typed interfaces for tool inputs ──

export interface FlashcardToolInput {
  title: string;
  // Figure-reuse (P5): optional per-card figure, present only when the chat
  // turn's attached context carried captioned images and the figure-enabled
  // tool variant was used. Mirrors the path FlashcardFigure shape.
  flashcards: {
    question: string;
    answer: string;
    figure?: { imageRef: string; side?: 'front' | 'back'; caption: string };
  }[];
}


// QUIZ_TOOL_V2 — kind-aware AI tool. Phase 2 ships all 8 kinds.
interface QuizToolV2Common {
  prompt: string;
  hint?: string;
  correctExplanation?: string;
  wrongExplanation?: string;
  // Figure-reuse (P4): one optional exhibit image, only offered to the model
  // when a source-image catalog accompanies the prompt (path quiz slots).
  // Lives at the question level — outside `payload` — so grading is untouched.
  figure?: { imageRef: string; caption: string };
}

export interface QuizToolV2McQuestion extends QuizToolV2Common {
  kind: 'mc';
  payload: {
    options: string[];
    correctIndex: number;
  };
}

export interface QuizToolV2TrueFalseQuestion extends QuizToolV2Common {
  kind: 'true_false';
  payload: {
    correct: boolean;
  };
}

export interface QuizToolV2FillBlankQuestion extends QuizToolV2Common {
  kind: 'fill_blank';
  payload: {
    blank: {
      acceptableAnswers: string[];
      caseSensitive?: boolean;
      fuzzyThreshold?: number;
    };
  };
}

export interface QuizToolV2TranslationQuestion extends QuizToolV2Common {
  kind: 'translation';
  payload: {
    targetLanguage: string;
    blank: {
      acceptableAnswers: string[];
      caseSensitive?: boolean;
      fuzzyThreshold?: number;
    };
  };
}

export interface QuizToolV2WordBankQuestion extends QuizToolV2Common {
  kind: 'word_bank';
  payload: {
    template: string;
    slots: { correctAnswer: string }[];
    wordBank: string[];
  };
}

export interface QuizToolV2MatchPairsQuestion extends QuizToolV2Common {
  kind: 'match_pairs';
  payload: {
    pairs: { left: string; right: string }[];
  };
}

export interface QuizToolV2SentenceReorderQuestion extends QuizToolV2Common {
  kind: 'sentence_reorder';
  payload: {
    correctOrder: string[];
  };
}

export interface QuizToolV2EquationQuestion extends QuizToolV2Common {
  kind: 'equation';
  payload: {
    expectedExpression: string;
    tolerance?: number;
    variables?: string[];
    acceptedExpressions?: string[];
  };
}

export interface QuizToolV2CodeOutputQuestion extends QuizToolV2Common {
  kind: 'code_output';
  payload: {
    language: 'python' | 'javascript' | 'typescript' | 'java' | 'cpp' | 'sql' | 'plaintext';
    code: string;
    blank: {
      acceptableAnswers: string[];
      caseSensitive?: boolean;
      fuzzyThreshold?: number;
    };
  };
}

export interface QuizToolV2TimelineQuestion extends QuizToolV2Common {
  kind: 'timeline';
  payload: {
    events: { year: string; label: string }[];
  };
}

export interface QuizToolV2CodeWriteQuestion extends QuizToolV2Common {
  kind: 'code_write';
  payload: {
    language: 'python' | 'javascript' | 'typescript' | 'java' | 'cpp' | 'sql' | 'go' | 'rust';
    starterCode: string;
    tests: { name?: string; stdin?: string; expectedStdout: string }[];
    runTimeoutMs?: number;
  };
}

export type QuizToolV2Question =
  | QuizToolV2McQuestion
  | QuizToolV2TrueFalseQuestion
  | QuizToolV2FillBlankQuestion
  | QuizToolV2TranslationQuestion
  | QuizToolV2WordBankQuestion
  | QuizToolV2MatchPairsQuestion
  | QuizToolV2SentenceReorderQuestion
  | QuizToolV2EquationQuestion
  | QuizToolV2CodeOutputQuestion
  | QuizToolV2TimelineQuestion
  | QuizToolV2CodeWriteQuestion;

export interface QuizToolV2Input {
  title: string;
  questions: QuizToolV2Question[];
}

export interface MindmapToolInput {
  title: string;
  markdown: string;
}

export interface PresentationToolInput {
  title: string;
  themeColor: string;
  slides: {
    slideType: 'title' | 'content' | 'section_divider' | 'two_column' | 'conclusion';
    title: string;
    subtitle?: string;
    bullets?: string[];
    leftColumn?: { heading?: string; bullets: string[] };
    rightColumn?: { heading?: string; bullets: string[] };
    graphicDescription?: string;
    notes?: string;
  }[];
}

export interface YouTubeVideosToolInput {
  search_query: string;
  max_results?: number;
}

export interface StudyPlanToolInput {
  title: string;
  description: string;
  phases: {
    title: string;
    description: string;
    durationDays: number;
    // Phase 5 — Learn Path gating. Optional for back-compat. AI is asked to
    // emit 'checkpoint' for new plans; legacy plans without this field land
    // on the schema default of 'open'.
    gateStrategy?: 'open' | 'sequential' | 'checkpoint';
    materials: {
      type: 'page' | 'flashcard_set' | 'quiz_set' | 'document';
      referenceId: string;
      title: string;
      prerequisiteMaterialIds?: string[];
    }[];
  }[];
}

// ── Phase 10.2 — Path generation tool inputs ────────────────────────
//
// The new "guided" path generator produces a path in two stages:
//   Stage A (`create_path_structure`): one AI call returns the section /
//     slot skeleton. Slots specify kind + topicHint but no content.
//   Stage B (three tools): per-slot calls fill the activities. Content is
//     written directly to TheoryContent / FlashcardSet / QuizSet rows by
//     the orchestrator (`apps/web/src/lib/path-generator.ts`).

export type PathSlotKind = 'learning' | 'review' | 'assessment' | 'final_exam';

export interface PathStructureSlot {
  title: string;
  kind: PathSlotKind;
  // Short hint describing what the slot should teach. The orchestrator
  // passes this back to the Stage B AI calls so each activity has clear
  // focus. Persisted on `CheckpointSlot.description`.
  topicHint: string;
  // Measurable outcome the learner reaches after this slot — the concrete,
  // testable thing they can DO ("conjugate regular -ar verbs in the present
  // tense"). The slot's quiz targets this. Optional: the model may omit it
  // and the normalizer falls back to the topicHint. Persisted on
  // `CheckpointSlot.objective`.
  objective?: string;
  // Section-local 0-based indices of the EARLIER slots this checkpoint
  // consolidates/tests. Computed by `enforceSpacedReviews`; NOT emitted by the
  // model. The persist step resolves these to `CheckpointSlot.coversSlotIds`.
  covers?: number[];
}

export interface PathStructurePhase {
  title: string;
  description: string;
  slots: PathStructureSlot[];
}

export interface PathStructureToolInput {
  title: string;
  description: string;
  phases: PathStructurePhase[];
}

// Stage B: theory. Output is a small structured shape that the
// orchestrator converts to a TipTap document JSON before persisting.
// Keeping the AI surface declarative rather than free-form JSON avoids
// malformed TipTap docs that the read-only viewer can't render.
// Loose shape for one generated diagram. Deliberately permissive (all kind-
// specific fields optional) so Gemini's schemaless JSON mode and the derived
// Gemini schema both stay reliable; the strict `PathDiagramSchema` (Zod) in
// `@notemage/shared` enforces the per-kind shape after the call and the
// generator drops anything that fails.
export interface TheoryDiagramToolInput {
  kind: 'timeline' | 'steps' | 'comparison' | 'cycle';
  title?: string;
  events?: { date: string; label: string }[];
  steps?: { title: string; detail?: string }[];
  columns?: string[];
  rows?: { label: string; cells: string[] }[];
  nodes?: string[];
}

export interface TheorySectionToolInput {
  title: string;
  introduction: string;
  keyPoints: string[];
  examples: { label: string; explanation: string }[];
  summary?: string;
  // Optional theory visuals. `figures` reference source images by catalog id
  // (only offered to the model when a source-image catalog accompanies the
  // prompt); `diagrams` are structured, component-rendered graphics.
  figures?: { imageRef: string; caption: string }[];
  diagrams?: TheoryDiagramToolInput[];
}

// Stage B: flashcards for a slot. Identical shape to FLASHCARD_TOOL — the
// distinction is the descriptive prompt + name so the AI knows to keep
// the cards tightly scoped to the slot's topic.
export interface FlashcardsForSlotToolInput {
  title: string;
  flashcards: { question: string; answer: string }[];
}

// Stage B: quiz for a slot. Reuses the kind-aware v2 shape — the
// orchestrator passes the v2 question types through `buildLegacyColumns`
// when persisting.
export interface QuizForSlotToolInput {
  title: string;
  questions: QuizToolV2Question[];
}

// ── Tool definitions ──

export const FLASHCARD_TOOL: Anthropic.Messages.Tool = {
  name: 'create_flashcards',
  description:
    'Create a set of study flashcards. Each flashcard has a question on the front and a concise answer on the back.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description:
          'A short, descriptive title for the flashcard set (e.g. "Cell Biology Key Terms")',
      },
      flashcards: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'The question or prompt on the front of the card',
            },
            answer: {
              type: 'string',
              description:
                'The answer on the back of the card. Can use bullet points or numbered lists for complex answers.',
            },
          },
          required: ['question', 'answer'],
        },
        description: 'Array of flashcard objects with question and answer',
        minItems: 1,
      },
    },
    required: ['title', 'flashcards'],
  },
};


// The canonical per-kind quiz payload catalog (Quiz v2). SINGLE SOURCE OF
// TRUTH shared by the chat quiz tool (`QUIZ_TOOL_V2`, below) and the path
// quiz system prompt (`buildQuizPrompt` in `path-prompts.ts`) so the two can
// never silently drift. It describes the exact `payload` shape the server
// validates per kind (`QuizQuestionV2Schema` in `@notemage/shared`).
// Pedagogical "which kind to use when" guidance is intentionally NOT here —
// that lives in each caller's surrounding prose.
const QUIZ_PAYLOAD_CATALOG_LINES = [
  'Payload shapes — the server rejects drift, so match these exactly:',
  '- mc → {"options":["A","B","C","D"],"correctIndex":0..3}. Plain strings only; no {text,isCorrect} objects.',
  '- true_false → {"correct": true|false}. The prompt itself is the statement to judge; payload only carries the answer key.',
  '- fill_blank → {"blank":{"acceptableAnswers":["answer","alt-spelling"]}}. Provide 2–4 acceptable variants; `caseSensitive` and `fuzzyThreshold` are optional (default fuzzyThreshold 0.85). In the `prompt`, mark the blank with a run of plain underscores (e.g. "In 1894, France and ____ formed an alliance"). NEVER use placeholder syntax like "{{BLANK}}", "{BLANK}", or "[BLANK]" — the learner will see it literally.',
  '- word_bank → {"template":"... {{0}} ... {{1}} ...","slots":[{"correctAnswer":"x"},…],"wordBank":["x","y","distractor"]}. All three keys required. The `prompt` is a SHORT lead-in (e.g. "Complete the statement:") — do NOT paste the template into the prompt; the renderer shows the template separately and you\'ll get "{{0}}" rendered literally. `wordBank` must contain EVERY slot answer including duplicates: if the same word fills two slots, list it twice. Add 2–4 distractor tokens on top of the answer set.',
  '- match_pairs → {"pairs":[{"left":"X","right":"Y"}]}. Keys are exactly `left` and `right`. 2–8 pairs.',
  '- translation → {"targetLanguage":"Spanish","blank":{"acceptableAnswers":["el libro rojo"]}}. Like fill_blank with a target-language tag; default fuzzyThreshold 0.75 (looser, for accents/diacritics).',
  '- sentence_reorder → {"correctOrder":["I","want","to","learn"]}. 2–12 tokens.',
  '- equation → {"expectedExpression":"2*x + 3","variables":["x"],"tolerance":0.001,"acceptedExpressions":["3","-3"]}. `expectedExpression` MUST be the final answer ONLY — never a full equation, never contain `=` (write "5", not "x = 5"). Set `variables` when the expression contains them so the grader can test multiple sample points. Set `acceptedExpressions` when several distinct answers are valid (e.g. the two roots of a quadratic) — a match against any is accepted. Set a sensible `tolerance` when the answer is a non-terminating decimal (e.g. 1/3). Render math expressions inside the `prompt` with `$...$` (inline) or `$$...$$` (block) — the renderer parses these as LaTeX.',
  '- code_output → {"language":"python","code":"print(2 + 2)","blank":{"acceptableAnswers":["4"]}}. `code` may contain newlines. The `prompt` is a short lead-in like "What does this print?" — never paste the code into the prompt; the renderer displays it as a syntax-highlighted block. Provide 2–4 `acceptableAnswers` covering common variants (e.g. trailing newline, quoted vs unquoted output). Languages: python, javascript, typescript, java, cpp, sql, plaintext. Reserve for coding subjects.',
  '- code_write → {"language":"python","starterCode":"def reverse_string(s):\\n    # your code here\\n    pass\\n","tests":[{"name":"hello","stdin":"hello","expectedStdout":"olleh"}],"runTimeoutMs":5000}. The learner edits `starterCode` and the server runs the final program once per test case, piping `stdin` (optional) and comparing the program\'s stdout to `expectedStdout` (trailing whitespace and trailing newlines are ignored, so a `print`/`println` newline does not need to be encoded). 1–6 tests. Always set `starterCode` so the learner has a scaffold — a function signature with a `# your code here` body for Python, an empty `function ...` for JS, etc. The `prompt` describes the task in plain English ("Write a function that returns the reverse of a string."). Languages: python, javascript, typescript, java, cpp, sql, go, rust. Reserve for coding subjects.',
  '- timeline → {"events":[{"year":"1914","label":"Outbreak of WWI"}, …]}. 3–8 distinct events with their canonical year. Years are plain strings (e.g. "1914" or "300 BCE"). The renderer fixes the years on an axis and shuffles the labels — the learner drags each label onto the matching year. The `prompt` is a short framing line like "Place each event on the timeline." — do NOT list the events in the prompt. Reserve for history/humanities subjects.',
];

// Full catalog (every kind) — byte-identical to before; still used by
// QUIZ_TOOL_V2 (the chat-driven quiz tool, which isn't subject-constrained).
export const QUIZ_PAYLOAD_CATALOG = QUIZ_PAYLOAD_CATALOG_LINES.join('\n');

/**
 * Payload catalog restricted to `kinds` (the header is always kept). Path
 * generation passes the subject's allowed kinds so the model never sees shapes
 * for kinds it isn't permitted to use — offering forbidden kinds is what drives
 * the kind-filter regeneration on weaker models. Empty input → full catalog.
 * See plans/path-generation-reliability.md (Phase 7).
 */
export function quizPayloadCatalogFor(kinds: QuestionKind[]): string {
  if (kinds.length === 0) return QUIZ_PAYLOAD_CATALOG;
  const allow = new Set<string>(kinds);
  return QUIZ_PAYLOAD_CATALOG_LINES.filter((line) => {
    const m = /^- (\w+) →/.exec(line);
    return m ? allow.has(m[1]) : true;
  }).join('\n');
}

// QUIZ_TOOL_V2 is the kind-aware quiz-generation tool. Each question
// carries an explicit `kind` discriminator and a kind-specific `payload`.
// Anthropic tool inputs don't support discriminated unions cleanly, so the
// schema accepts a generic `payload: object` and the server validates the
// concrete shape with Zod (`QuizQuestionV2Schema` in `@notemage/shared`).
export const QUIZ_TOOL_V2: Anthropic.Messages.Tool = {
  name: 'create_quiz_v2',
  description: [
    'Create a quiz where each question carries an explicit `kind` discriminator and a kind-specific `payload`.',
    '',
    'STRICT SHAPE RULES — read carefully, the server rejects questions that violate these:',
    '1. `options` (for `mc`) is an ARRAY OF PLAIN STRINGS. NEVER an array of objects like `{ text, isCorrect }` or `{ label, value }`. Just bare strings.',
    '2. Mark the correct answer on `mc` questions with the top-level `correctIndex` (0–3). NEVER attach a `correct`/`isCorrect` flag to an option.',
    '3. `fill_blank` and `translation` payloads MUST wrap the answers inside `blank: { acceptableAnswers: [...] }`. NEVER put `acceptableAnswers` at the payload root.',
    '4. `word_bank` payloads MUST include all three of `template`, `slots`, and `wordBank` — none are optional.',
    '5. `match_pairs` uses keys `left` and `right` on each pair object. NEVER `term`/`definition` or `key`/`value`.',
    '',
    QUIZ_PAYLOAD_CATALOG,
    '',
    'Mix kinds intentionally — use mc for factual recall with 4 options, true_false for crisp single-claim checks, fill_blank for definitions/short answers, word_bank for ordered grammar/syntax fills, match_pairs for terms/definitions, translation for language learning, sentence_reorder for syntax/sequencing, equation for math, code_output for coding output prediction, timeline for chronology. Avoid all-MC unless the material is purely factual.',
  ].join('\n'),
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: 'A short, descriptive title for the quiz (e.g. "Cell Biology Quiz")',
      },
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: [
                'mc',
                'true_false',
                'fill_blank',
                'word_bank',
                'match_pairs',
                'translation',
                'sentence_reorder',
                'equation',
                'code_output',
                'timeline',
                'code_write',
              ],
              description:
                'The question kind. Picks which payload shape to validate against and which renderer the client uses.',
            },
            prompt: {
              type: 'string',
              description: 'The question prompt shown to the student.',
            },
            hint: {
              type: 'string',
              description: 'Optional hint shown on demand.',
            },
            correctExplanation: {
              type: 'string',
              description: 'Explanation shown when the student answers correctly.',
            },
            wrongExplanation: {
              type: 'string',
              description: 'Explanation shown when the student answers incorrectly.',
            },
            payload: {
              type: 'object',
              description:
                'Kind-specific answer data. Shape MUST match the chosen `kind` exactly — see the tool description for each kind\'s payload.',
            },
          },
          required: ['kind', 'prompt', 'payload'],
        },
        description: 'Array of quiz question objects. Mix at least 2 kinds when content allows.',
        minItems: 1,
      },
    },
    required: ['title', 'questions'],
  },
};

export const MINDMAP_TOOL: Anthropic.Messages.Tool = {
  name: 'create_mindmap',
  description:
    'Create an interactive mind map defined as Markdown with heading hierarchy (# for root, ## for branches, ### for sub-branches, etc.).',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: 'A short title for the mind map',
      },
      markdown: {
        type: 'string',
        description:
          'The mind map content as Markdown using heading levels (# root, ## branches, ### sub-branches, #### details). Use only headings (# ## ### ####) to define the hierarchy. Keep node text concise. Example:\n# Biology\n## Cells\n### Prokaryotic\n### Eukaryotic\n## Genetics\n### DNA\n### RNA',
      },
    },
    required: ['title', 'markdown'],
  },
};

export const STUDY_PLAN_TOOL: Anthropic.Messages.Tool = {
  name: 'create_study_plan',
  description:
    'Create a structured study plan with phases and materials. Use this tool when the user asks you to create, generate, or make a study plan, study schedule, or revision plan from their notebook materials. Each phase has a title, description, duration, and a list of materials to study. For the Learn Path experience (Phase 5), prefer gateStrategy="checkpoint" on every phase and place a quiz_set material as the LAST material of each phase — that quiz becomes the checkpoint that gates the next phase.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: 'A short, descriptive title for the study plan (e.g. "Biology Midterm Prep")',
      },
      description: {
        type: 'string',
        description: 'A brief description of the study plan goals and approach',
      },
      phases: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Phase title (e.g. "Week 1: Foundations")',
            },
            description: {
              type: 'string',
              description: 'What the student should focus on in this phase',
            },
            durationDays: {
              type: 'number',
              description: 'How many days this phase should last',
            },
            gateStrategy: {
              type: 'string',
              enum: ['open', 'sequential', 'checkpoint'],
              description:
                'How materials in this phase unlock and whether the phase gates the next one. "open" = everything unlocked from the start. "sequential" = materials unlock in order as previous ones are completed. "checkpoint" = sequential AND the LAST material gates the next phase (must be a quiz_set). Default to "checkpoint" for new learn-path plans.',
            },
            materials: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['page', 'flashcard_set', 'quiz_set', 'document'],
                    description: 'The type of study material',
                  },
                  referenceId: {
                    type: 'string',
                    description: 'The exact ID of the resource from the notebook inventory',
                  },
                  title: {
                    type: 'string',
                    description: 'The title of the resource',
                  },
                  prerequisiteMaterialIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                      'Optional. Material referenceIds within this same phase that must be completed before this material unlocks. Use only when sequential ordering is insufficient. Empty array or omitted = no explicit prerequisites.',
                  },
                },
                required: ['type', 'referenceId', 'title'],
              },
              description:
                'Materials to study in this phase. When gateStrategy is "checkpoint", the LAST material MUST have type="quiz_set" — it is the checkpoint quiz the student must pass to unlock the next phase.',
            },
          },
          required: ['title', 'description', 'durationDays', 'materials'],
        },
        description: 'Sequential phases of the study plan',
        minItems: 1,
      },
    },
    required: ['title', 'description', 'phases'],
  },
};

// Slim chat variant — only persisted fields; avoids forcing the model to
// hallucinate referenceIds (no inventory is injected in chat turns).
export const CHAT_STUDY_PLAN_TOOL: Anthropic.Messages.Tool = {
  name: 'create_study_plan',
  description: 'Create a structured study plan with phases.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: 'A short, descriptive title for the study plan (e.g. "Biology Midterm Prep")',
      },
      description: {
        type: 'string',
        description: 'A brief description of the study plan goals and approach',
      },
      phases: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Phase title (e.g. "Week 1: Foundations")' },
            description: { type: 'string', description: 'What the student should focus on in this phase' },
            durationDays: { type: 'number', description: 'How many days this phase should last' },
          },
          required: ['title', 'description', 'durationDays'],
        },
        description: 'Sequential phases of the study plan',
        minItems: 1,
      },
    },
    required: ['title', 'description', 'phases'],
  },
};

export const PRESENTATION_TOOL: Anthropic.Messages.Tool = {
  name: 'create_presentation',
  description:
    'Create a visually rich presentation / PowerPoint deck with well-structured slides, varied types, fitting colors, and descriptions of graphics/diagrams where appropriate.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: 'The presentation title',
      },
      themeColor: {
        type: 'string',
        description:
          'A hex color (without #) that fits the topic, used as the accent color throughout the deck. E.g. "2E75B6" for science, "2D8653" for biology, "C0392B" for history.',
      },
      slides: {
        type: 'array',
        description:
          'Array of slides. Use varied slideTypes for visual interest. Aim for 8-15 slides.',
        items: {
          type: 'object',
          properties: {
            slideType: {
              type: 'string',
              enum: ['title', 'content', 'section_divider', 'two_column', 'conclusion'],
              description:
                'title: opening slide with title+subtitle. content: main slide with action title and bullets. section_divider: dark background with section name. two_column: side-by-side content. conclusion: dark background with key takeaways.',
            },
            title: {
              type: 'string',
              description:
                'For content slides, use an ACTION TITLE — a complete sentence stating the takeaway (e.g. "Early interventions reduce dropout rates by 40%"), NOT a topic label.',
            },
            subtitle: {
              type: 'string',
              description: 'Subtitle text (used on title and section_divider slides)',
            },
            bullets: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Bullet points for content/conclusion slides. 3-5 bullets, max ~15 words each.',
            },
            leftColumn: {
              type: 'object',
              properties: {
                heading: { type: 'string', description: 'Column heading' },
                bullets: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Column bullet points',
                },
              },
              required: ['bullets'],
              description: 'Left column content (for two_column slides)',
            },
            rightColumn: {
              type: 'object',
              properties: {
                heading: { type: 'string', description: 'Column heading' },
                bullets: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Column bullet points',
                },
              },
              required: ['bullets'],
              description: 'Right column content (for two_column slides)',
            },
            graphicDescription: {
              type: 'string',
              description:
                'Description of a visual element for this slide (e.g. "Bar chart showing growth from 2020-2024", "Diagram of cell mitosis stages"). Will be rendered as a labeled placeholder.',
            },
            notes: {
              type: 'string',
              description: 'Speaker notes for this slide',
            },
          },
          required: ['slideType', 'title'],
        },
        minItems: 3,
      },
    },
    required: ['title', 'themeColor', 'slides'],
  },
};

export const YOUTUBE_VIDEOS_TOOL: Anthropic.Messages.Tool = {
  name: 'recommend_videos',
  description:
    'Search for and recommend relevant YouTube videos for a topic.',
  input_schema: {
    type: 'object' as const,
    properties: {
      search_query: {
        type: 'string',
        description:
          'A focused search query for YouTube (e.g. "mitosis cell division explained", "integration by parts calculus tutorial"). Make it specific and educational.',
      },
      max_results: {
        type: 'number',
        description: 'Number of videos to recommend (1-5). Default is 3.',
      },
    },
    required: ['search_query'],
  },
};

// ── Phase 10.2 — Path generator tools ──────────────────────────────────
//
// These are intentionally NOT part of the chat tool set (CHAT_TOOLS in chat-stream.ts).
// They're driven by `path-generator.ts` with `tool_choice: { type: 'tool',
// name }` so the AI is forced into a single structured output.

export const PATH_STRUCTURE_TOOL: Anthropic.Messages.Tool = {
  name: 'create_path_structure',
  description: [
    'Design the section / slot skeleton for a guided learning path.',
    'Output the curriculum spine ONLY — title, description, and a list of phases ("sections"), each containing an ordered list of slots ("checkpoints").',
    'Each slot has: a short title; a "kind" (learning | review | assessment); a "topicHint" (what to TEACH); and an "objective" (the concrete, testable thing the learner can DO after it).',
    'Scale to the material: produce as many sections and slots as the source material and available days genuinely support — never pad. Thin material → fewer, tighter slots. A focused 3-section path beats a bloated 6-section one.',
    'No two slots may overlap — each teaches a DISTINCT concept. Order slots so each builds on the ones before it (prerequisites first).',
    'Rules for slot kinds — build in spaced repetition:',
    '- "learning" teaches one new concept; "review" consolidates + quizzes earlier slots (no new theory); "assessment" is the graded gate.',
    '- Add a "review" slot after roughly every 2 "learning" slots. NEVER output a section that is only learning slots followed by one assessment.',
    '- The LAST slot of every phase MUST be "assessment" (the checkpoint quiz that gates the next section).',
    'Do not generate any actual lesson text, flashcards, or quiz questions here — the orchestrator fills those in per-slot via separate tools.',
  ].join('\n'),
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: 'A short, descriptive title for the path (e.g. "Intro to Spanish Verbs").',
      },
      description: {
        type: 'string',
        description: 'A brief description (1–2 sentences) of the path goals.',
      },
      phases: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Section title (e.g. "Section 1: Present Tense").',
            },
            description: {
              type: 'string',
              description: 'What the learner masters in this section.',
            },
            slots: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: {
                    type: 'string',
                    description:
                      'One-line slot title shown on the path node (e.g. "Regular -ar verbs").',
                  },
                  kind: {
                    type: 'string',
                    enum: ['learning', 'review', 'assessment'],
                    description:
                      'Slot kind. Interleave a "review" after ~every 2 "learning" slots; the LAST slot of every section MUST be "assessment".',
                  },
                  topicHint: {
                    type: 'string',
                    description:
                      'Short hint (1–2 sentences) naming the SPECIFIC concepts/skills to teach in this slot — not a vague label. Becomes the slot description and drives the theory + flashcards.',
                  },
                  objective: {
                    type: 'string',
                    description:
                      'One line: the concrete, testable thing the learner can DO after this slot, phrased verb-first (e.g. "Conjugate regular -ar verbs in the present tense"). The slot quiz is written to test THIS.',
                  },
                },
                required: ['title', 'kind', 'topicHint'],
              },
              description:
                'Ordered slots: learning slots with a "review" interleaved after ~every 2 of them; the last slot kind MUST be "assessment".',
              minItems: 2,
              maxItems: 8,
            },
          },
          required: ['title', 'description', 'slots'],
        },
        description: '3–6 sequential phases ("sections") of the path.',
        minItems: 1,
        maxItems: 10,
      },
    },
    required: ['title', 'description', 'phases'],
  },
};

export const THEORY_SECTION_TOOL: Anthropic.Messages.Tool = {
  name: 'create_theory_section',
  description: [
    'Generate a compact theory section for one checkpoint slot.',
    'Target ~300–500 words total. Keep the language warm, plain, and example-driven.',
    'Output:',
    '- title: the heading shown above the section.',
    '- introduction: 1–2 paragraphs that set up the concept.',
    '- keyPoints: 3–6 short bullets the learner should remember.',
    '- examples: 2–3 concrete examples, each with a 1-phrase label and a 1–2 sentence explanation.',
    '- summary (optional): a 1-paragraph wrap-up.',
    '',
    'STRICT SHAPE RULES:',
    '- `keyPoints` MUST be a real JSON array of plain strings, e.g. ["First point","Second point"]. NEVER a stringified JSON, an object keyed by index ({"0":"...","1":"..."}), or a single comma-separated string.',
    '- `examples` MUST be a real JSON array of objects, each with `label` (plain string) and `explanation` (plain string). NEVER stringified, NEVER keyed by index.',
  ].join('\n'),
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: 'Heading for the theory section. Reuse or refine the slot title.',
      },
      introduction: {
        type: 'string',
        description: '1–2 paragraphs introducing the concept. Plain prose, no markdown.',
      },
      keyPoints: {
        type: 'array',
        items: { type: 'string' },
        description: '3–6 short bullet points capturing the must-remember ideas.',
        minItems: 2,
        maxItems: 8,
      },
      examples: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Short label for the example (e.g. "Example: -ar verbs").' },
            explanation: {
              type: 'string',
              description: '1–2 sentence explanation that demonstrates the concept.',
            },
          },
          required: ['label', 'explanation'],
        },
        description: '1–3 worked examples.',
        minItems: 1,
        maxItems: 4,
      },
      summary: {
        type: 'string',
        description: 'Optional closing paragraph. Skip if the section is already self-contained.',
      },
      figures: {
        type: 'array',
        maxItems: 3,
        description:
          'OPTIONAL. Only when a "Available source figures" list accompanies this prompt: 0–3 figures to embed. Each `imageRef` MUST be copied verbatim from that list — never invent one. Include a figure only when it genuinely illustrates THIS slot. Omit entirely if none fit.',
        items: {
          type: 'object',
          properties: {
            imageRef: {
              type: 'string',
              description: 'An id copied verbatim from the supplied source-figure list.',
            },
            caption: {
              type: 'string',
              description: 'A short caption tying this figure to the current lesson.',
            },
          },
          required: ['imageRef', 'caption'],
        },
      },
      diagrams: {
        type: 'array',
        maxItems: 2,
        description:
          'OPTIONAL. 0–2 structured diagrams that materially clarify the topic. Use the right kind: "timeline" for dated/historical sequences, "steps" for a process or how-to, "comparison" for contrasting things, "cycle" for a repeating loop. Fill ONLY the fields for the chosen kind. Omit entirely if no diagram helps.',
        items: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: ['timeline', 'steps', 'comparison', 'cycle'],
              description: 'Which diagram to render.',
            },
            title: { type: 'string', description: 'Optional short heading for the diagram.' },
            events: {
              type: 'array',
              description:
                'kind="timeline" only: 3–8 dated events in chronological order.',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string', description: 'Year or date label, e.g. "1789".' },
                  label: { type: 'string', description: 'What happened (short).' },
                },
                required: ['date', 'label'],
              },
            },
            steps: {
              type: 'array',
              description: 'kind="steps" only: 3–8 ordered steps.',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Short step title.' },
                  detail: { type: 'string', description: 'Optional one-line elaboration.' },
                },
                required: ['title'],
              },
            },
            columns: {
              type: 'array',
              description:
                'kind="comparison" only: the 2–4 things being compared (column headers).',
              items: { type: 'string' },
            },
            rows: {
              type: 'array',
              description:
                'kind="comparison" only: each row is one aspect — a `label` plus one `cells` entry per column, in column order.',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string', description: 'The aspect being compared.' },
                  cells: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'One value per column, in the same order as `columns`.',
                  },
                },
                required: ['label', 'cells'],
              },
            },
            nodes: {
              type: 'array',
              description: 'kind="cycle" only: 3–6 stage labels in cyclic order.',
              items: { type: 'string' },
            },
          },
          required: ['kind'],
        },
      },
    },
    required: ['title', 'introduction', 'keyPoints', 'examples'],
  },
};

export const FLASHCARDS_FOR_SLOT_TOOL: Anthropic.Messages.Tool = {
  name: 'create_flashcards_for_slot',
  description: [
    'Create only as many flashcards as the slot\'s material genuinely supports — usually 3–6, sometimes as few as 2. NEVER pad to reach a number and NEVER repeat the same idea across cards.',
    'Each card is a tight question/answer pair. Vary the angles: definitions, recall prompts, comparisons, and one or two "explain why" cards.',
    'Do NOT write fill-in-the-blank style cards (no "___" on the front) and do NOT phrase cards as fake quiz questions — flashcards are flat Q→A only. Interactive question types belong to `create_quiz_for_slot`, not here.',
    'Stay strictly within the slot\'s topicHint — do NOT drift into adjacent topics.',
  ].join('\n'),
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: 'Title for the set (use the slot title).',
      },
      flashcards: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'Front of the card. A direct question or recall prompt — no fill-in-the-blank.',
            },
            answer: {
              type: 'string',
              description:
                'Back of the card. Keep it focused — 1–3 sentences or a short list.',
            },
            figure: {
              type: 'object',
              description:
                'OPTIONAL. Only when a source-figure list accompanies this prompt: embed ONE image on this card. Add a figure ONLY when it genuinely illustrates this card; most cards omit it; at most 4 cards per set may carry one.',
              properties: {
                imageRef: {
                  type: 'string',
                  description: 'An id copied verbatim from the supplied source-figure list.',
                },
                side: {
                  type: 'string',
                  enum: ['front', 'back'],
                  description: 'Which side shows the image. Defaults to "front" (the question side).',
                },
                caption: {
                  type: 'string',
                  description: 'A short caption tying this figure to the card.',
                },
              },
              required: ['imageRef', 'caption'],
            },
          },
          required: ['question', 'answer'],
        },
        minItems: 2,
        maxItems: 10,
      },
    },
    required: ['title', 'flashcards'],
  },
};

// Figure-reuse: per-item figure properties injected into the figure-enabled
// tool variants. The per-question exhibit (P4, quiz) shows above the prompt; the
// per-card figure (P3, flashcards) embeds on one side. Both are advertised ONLY
// when a source-figure catalog accompanies the prompt — the base chat tools
// stay figure-less so a turn/path without imported images never offers a
// capability that can't validate.
const QUIZ_FIGURE_PROPERTY = {
  type: 'object' as const,
  description:
    "OPTIONAL. Only when a source-figure list accompanies this prompt: attach ONE image as this question's exhibit, shown above the prompt. Add a figure ONLY when it genuinely illustrates the question; most questions omit it; at most 3 questions per quiz may carry one.",
  properties: {
    imageRef: {
      type: 'string' as const,
      description: 'An id copied verbatim from the supplied source-figure list.',
    },
    caption: {
      type: 'string' as const,
      description: 'A short caption tying this figure to the question.',
    },
  },
  required: ['imageRef', 'caption'],
};

const FLASHCARD_FIGURE_PROPERTY = {
  type: 'object' as const,
  description:
    'OPTIONAL. Only when a source-figure list accompanies this prompt: embed ONE image on this card. Add a figure ONLY when it genuinely illustrates this card; most cards omit it; at most 4 cards per set may carry one.',
  properties: {
    imageRef: {
      type: 'string' as const,
      description: 'An id copied verbatim from the supplied source-figure list.',
    },
    side: {
      type: 'string' as const,
      enum: ['front', 'back'],
      description: 'Which side shows the image. Defaults to "front" (the question side).',
    },
    caption: {
      type: 'string' as const,
      description: 'A short caption tying this figure to the card.',
    },
  },
  required: ['imageRef', 'caption'],
};

/**
 * Clone a tool's `input_schema` and inject an optional `figure` property into
 * the items of its `arrayKey` array (e.g. `questions` / `flashcards`). Lets the
 * figure-enabled variants single-source their base schema so the two can never
 * drift, while keeping the base tool figure-less.
 */
function withFigureProperty(
  inputSchema: Anthropic.Messages.Tool['input_schema'],
  arrayKey: string,
  figureProperty: object,
): Anthropic.Messages.Tool['input_schema'] {
  const base = inputSchema as unknown as {
    properties: Record<
      string,
      { items?: { properties?: Record<string, unknown>; [k: string]: unknown }; [k: string]: unknown }
    >;
    required?: string[];
    [k: string]: unknown;
  };
  const arr = base.properties[arrayKey];
  return {
    ...base,
    type: 'object',
    properties: {
      ...base.properties,
      [arrayKey]: {
        ...arr,
        items: {
          ...arr.items,
          properties: { ...(arr.items?.properties ?? {}), figure: figureProperty },
        },
      },
    },
  } as unknown as Anthropic.Messages.Tool['input_schema'];
}

export const QUIZ_FOR_SLOT_TOOL: Anthropic.Messages.Tool = {
  name: 'create_quiz_for_slot',
  description: [
    'Create a 5–8 question quiz that tests one checkpoint slot (12–20 for the final exam).',
    'Use AT LEAST 3 different question kinds across the set — an all-MC quiz is never acceptable.',
    'Use the kinds listed in the system prompt menu for this slot; the server rejects kinds outside that list.',
    'Use the exact payload shapes given in the system prompt; the server rejects drift.',
  ].join('\n'),
  // Mirrors QUIZ_TOOL_V2 (single-sourced) plus an optional per-question `figure`
  // exhibit; inputs are validated post-hoc with `QuizSetV2Schema` exactly like
  // the chat-driven quiz tool.
  input_schema: withFigureProperty(QUIZ_TOOL_V2.input_schema, 'questions', QUIZ_FIGURE_PROPERTY),
};

// Figure-reuse (P5): chat-conditional figure-enabled variants of the chat
// flashcard / quiz tools. `chat-stream.ts` swaps these in for FLASHCARD_TOOL /
// QUIZ_TOOL_V2 ONLY when the turn's attached context carries captioned images
// (it builds + injects the catalog). The base tools stay figure-less so a turn
// without imported images never advertises figures.
export const FLASHCARD_TOOL_WITH_FIGURES: Anthropic.Messages.Tool = {
  ...FLASHCARD_TOOL,
  input_schema: withFigureProperty(FLASHCARD_TOOL.input_schema, 'flashcards', FLASHCARD_FIGURE_PROPERTY),
};

export const QUIZ_TOOL_V2_WITH_FIGURES: Anthropic.Messages.Tool = {
  ...QUIZ_TOOL_V2,
  input_schema: withFigureProperty(QUIZ_TOOL_V2.input_schema, 'questions', QUIZ_FIGURE_PROPERTY),
};

// ── Subject classifier (path generation pre-step) ──────────────────────
//
// One-shot Haiku call that routes the path generator. Returns up to three
// subject buckets ranked by weight. The server normalizes the weights,
// drops anything under the floor, and falls back to `general` if the AI
// produces nothing usable. Subjects are a closed enum mirrored from
// `src/lib/path-subjects.ts` — drift between the two is a bug.

export interface ClassifySubjectsToolInput {
  subjects: {
    id:
      | 'coding'
      | 'math'
      | 'science_natural'
      | 'history_humanities'
      | 'language'
      | 'social_studies'
      | 'general';
    weight: number;
  }[];
}

export const CLASSIFY_SUBJECTS_TOOL: Anthropic.Messages.Tool = {
  name: 'classify_path_subjects',
  description: [
    'Classify the subject area(s) of a learning path so the generator can choose appropriate question types and pedagogy.',
    'Return UP TO 3 subjects, ranked by weight (highest first). Weights should sum to ~1.0. Single-subject paths return one entry with weight 1.',
    'Use a fallback `general` ONLY when the topic genuinely does not fit any specific subject.',
    'Multi-subject inputs (e.g. engineering = math + science_natural, history of mathematics = history_humanities + math) MUST return more than one subject with realistic relative weights.',
    'Subjects (closed enum — never invent new ones):',
    '- coding: programming, software engineering, algorithms, CS theory.',
    '- math: algebra, calculus, statistics, discrete math, geometry.',
    '- science_natural: physics, chemistry, biology, anatomy, geology, astronomy.',
    '- history_humanities: history, geography, art history, philosophy, religion, classics.',
    '- language: learning a foreign language (vocab, grammar, translation). NOT linguistics or programming languages.',
    '- social_studies: law, economics, business, finance, psychology, sociology, political science, medicine, public health.',
    '- general: doesn\'t fit any specific bucket.',
  ].join('\n'),
  input_schema: {
    type: 'object' as const,
    properties: {
      subjects: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              enum: [
                'coding',
                'math',
                'science_natural',
                'history_humanities',
                'language',
                'social_studies',
                'general',
              ],
              description: 'Subject bucket.',
            },
            weight: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Relative weight 0–1. Weights across the array should sum to ~1.',
            },
          },
          required: ['id', 'weight'],
        },
        description: '1–3 subject entries, ranked by weight (highest first).',
        minItems: 1,
        maxItems: 3,
      },
    },
    required: ['subjects'],
  },
};

// ── Chat intent classifier (chat pre-step) ─────────────────────────────
//
// One-shot cheap call that routes a chat turn. The chat surface no longer
// ships all 7 generation tools on every turn; instead a heuristic + this
// classifier pick the turn's intent, and only the matching tool (if any)
// is loaded for the actual call. `chat` means plain Q&A — no tool.

export interface ClassifyChatIntentToolInput {
  intent:
    | 'chat'
    | 'flashcards'
    | 'quiz'
    | 'mindmap'
    | 'study_plan'
    | 'presentation'
    | 'videos';
}

export const CLASSIFY_CHAT_INTENT_TOOL: Anthropic.Messages.Tool = {
  name: 'classify_chat_intent',
  description: [
    'Decide what the user wants in THIS chat turn so the assistant can load only the relevant tool.',
    'Choose a generation intent ONLY when the user is clearly asking to CREATE that artifact; otherwise choose "chat".',
    '- chat: explanation, Q&A, discussion, summarising, or anything that is not an explicit request to generate a study artifact.',
    '- flashcards / quiz / mindmap / study_plan / presentation / videos: the user is asking to make that specific artifact.',
    'When in doubt, choose "chat".',
  ].join('\n'),
  input_schema: {
    type: 'object' as const,
    properties: {
      intent: {
        type: 'string',
        enum: [
          'chat',
          'flashcards',
          'quiz',
          'mindmap',
          'study_plan',
          'presentation',
          'videos',
        ],
        description: 'The single best intent for this turn.',
      },
    },
    required: ['intent'],
  },
};

// ── Helper to extract tool uses from Anthropic response ──

export function extractToolUses(content: Anthropic.Messages.ContentBlock[]) {
  let text = '';
  let flashcard: { id: string; input: FlashcardToolInput } | null = null;
  let quizV2: { id: string; input: QuizToolV2Input } | null = null;
  let mindmap: { id: string; input: MindmapToolInput } | null = null;
  let studyPlan: { id: string; input: StudyPlanToolInput } | null = null;
  let presentation: { id: string; input: PresentationToolInput } | null = null;
  let youtubeVideos: { id: string; input: YouTubeVideosToolInput } | null = null;

  for (const block of content) {
    if (block.type === 'text') {
      text += block.text;
    } else if (block.type === 'tool_use') {
      if (block.name === 'create_flashcards') {
        flashcard = { id: block.id, input: block.input as FlashcardToolInput };
      } else if (block.name === 'create_quiz_v2') {
        quizV2 = { id: block.id, input: block.input as QuizToolV2Input };
      } else if (block.name === 'create_mindmap') {
        mindmap = { id: block.id, input: block.input as MindmapToolInput };
      } else if (block.name === 'create_study_plan') {
        studyPlan = { id: block.id, input: block.input as StudyPlanToolInput };
      } else if (block.name === 'create_presentation') {
        presentation = { id: block.id, input: block.input as PresentationToolInput };
      } else if (block.name === 'recommend_videos') {
        youtubeVideos = { id: block.id, input: block.input as YouTubeVideosToolInput };
      }
    }
  }

  return { text, flashcard, quizV2, mindmap, studyPlan, presentation, youtubeVideos };
}
