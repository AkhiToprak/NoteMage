import type Anthropic from '@anthropic-ai/sdk';

// ── Typed interfaces for tool inputs ──

export interface FlashcardToolInput {
  title: string;
  flashcards: { question: string; answer: string }[];
}

export interface QuizToolInput {
  title: string;
  questions: {
    question: string;
    options: string[];
    correctIndex: number;
    hint?: string;
    correctExplanation?: string;
    wrongExplanation?: string;
  }[];
}

// QUIZ_TOOL_V2 — kind-aware AI tool. Phase 2 ships all 8 kinds.
interface QuizToolV2Common {
  prompt: string;
  hint?: string;
  correctExplanation?: string;
  wrongExplanation?: string;
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
  | QuizToolV2EquationQuestion;

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
// The new "Duolingo-style" path generator produces a path in two stages:
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
export interface TheorySectionToolInput {
  title: string;
  introduction: string;
  keyPoints: string[];
  examples: { label: string; explanation: string }[];
  summary?: string;
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
    'Create a set of study flashcards. Use this tool when the user asks you to create, generate, or make flashcards from their notes or on a topic. Each flashcard has a question on the front and an answer on the back.',
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

export const QUIZ_TOOL: Anthropic.Messages.Tool = {
  name: 'create_quiz',
  description:
    'Create a multiple-choice quiz. Use this tool when the user asks you to create, generate, or make a quiz, test, or multiple-choice questions from their notes or on a topic. Each question has 4 options with one correct answer.',
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
            question: {
              type: 'string',
              description: 'The question text',
            },
            options: {
              type: 'array',
              items: { type: 'string' },
              description: 'Exactly 4 answer choices',
              minItems: 4,
              maxItems: 4,
            },
            correctIndex: {
              type: 'number',
              description: 'The 0-based index of the correct answer (0-3)',
            },
            hint: {
              type: 'string',
              description: 'An optional hint to help the student',
            },
            correctExplanation: {
              type: 'string',
              description: 'Explanation shown when the student answers correctly',
            },
            wrongExplanation: {
              type: 'string',
              description: 'Explanation shown when the student answers incorrectly',
            },
          },
          required: ['question', 'options', 'correctIndex'],
        },
        description: 'Array of quiz question objects',
        minItems: 1,
      },
    },
    required: ['title', 'questions'],
  },
};

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
    'Supported kinds and exact payload shapes:',
    '- mc: { options: string[4]; correctIndex: 0|1|2|3 }. For factual recall. Example payload: {"options":["Lima","Bogotá","Quito","Caracas"],"correctIndex":0}',
    '- true_false: { correct: boolean }. The question `prompt` IS the statement to judge; payload only carries the answer key. Example prompt: "The mitochondria produces ATP." with payload {"correct":true}.',
    '- fill_blank: { blank: { acceptableAnswers: string[]; caseSensitive?: boolean; fuzzyThreshold?: number } }. Typed text answer; provide 2–4 acceptable spellings/variants. Default fuzzyThreshold 0.85. In the `prompt`, mark the blank with a run of plain underscores (e.g. "The powerhouse of the cell is the ____"). NEVER use placeholder syntax like "{{BLANK}}", "{BLANK}", or "[BLANK]" — those render literally. Example: {"blank":{"acceptableAnswers":["mitochondria","mitochondrion"]}}',
    '- word_bank: { template: string with {{0}}, {{1}} markers; slots: [{ correctAnswer: string }]; wordBank: string[] }. Drag tokens from the bank into the template slots. Word bank should include 2–4 distractor tokens beyond the correct ones. Example: {"template":"The {{0}} is the powerhouse of the {{1}}.","slots":[{"correctAnswer":"mitochondria"},{"correctAnswer":"cell"}],"wordBank":["mitochondria","cell","nucleus","ribosome"]}',
    '- match_pairs: { pairs: [{ left: string; right: string }] }. Two columns, render the right side shuffled; the user draws connections. 2–8 pairs. Example: {"pairs":[{"left":"H2O","right":"Water"},{"left":"NaCl","right":"Salt"}]}',
    '- translation: { targetLanguage: string; blank: { acceptableAnswers: string[]; caseSensitive?: boolean; fuzzyThreshold?: number } }. Like fill_blank but with a target-language tag; default fuzzyThreshold 0.75 (looser, for accents/diacritics).',
    '- sentence_reorder: { correctOrder: string[] }. Tokens shown shuffled; the user drags them into the correct order. 2–12 tokens. Example: {"correctOrder":["I","want","to","learn","Spanish"]}',
    '- equation: { expectedExpression: string; tolerance?: number; variables?: string[] }. Math input (e.g. "2*x + 3"). Set variables when the expression contains variables so the grader can test multiple sample points.',
    '',
    'Mix kinds intentionally — use mc for factual recall with 4 options, true_false for crisp single-claim checks, fill_blank for definitions/short answers, word_bank for ordered grammar/syntax fills, match_pairs for terms/definitions, translation for language learning, sentence_reorder for syntax/sequencing, equation for math. Avoid all-MC unless the material is purely factual.',
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
    'Create an interactive mind map. Use this tool when the user asks you to create, generate, or make a mind map, concept map, or topic overview from their notes or on a topic. The mindmap is defined as Markdown with heading hierarchy (# for root, ## for branches, ### for sub-branches, etc.).',
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

export const PRESENTATION_TOOL: Anthropic.Messages.Tool = {
  name: 'create_presentation',
  description:
    'Create a visually rich presentation / PowerPoint deck. Use this tool when the user asks you to create, generate, or make a presentation, slides, PowerPoint, PPT, or deck from their notes or on a topic. Produce well-structured slides with varied types, fitting colors, and descriptions of graphics/diagrams where appropriate.',
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
    'Recommend relevant YouTube videos for a topic. Use this tool when the user explicitly asks for video recommendations, tutorials, or visual explanations. You may also use it autonomously when a complex topic would benefit from a video explanation (e.g. visual processes, step-by-step procedures, or concepts that are easier to understand through demonstration). Do NOT use this for every question — only when a video would genuinely add value beyond your text explanation.',
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
// These are intentionally NOT included in `ALL_TOOLS` (the chat surface).
// They're driven by `path-generator.ts` with `tool_choice: { type: 'tool',
// name }` so the AI is forced into a single structured output.

export const PATH_STRUCTURE_TOOL: Anthropic.Messages.Tool = {
  name: 'create_path_structure',
  description: [
    'Design the section / slot skeleton for a Duolingo-style learning path.',
    'Output the curriculum spine ONLY — title, description, and a list of phases ("sections") where each phase contains 4–6 slots ("checkpoints").',
    'Each slot has a short title, a "kind" (learning | review | assessment), and a "topicHint" that briefly describes what the slot should teach.',
    'Rules for slot kinds:',
    '- Early phases: mostly "learning" slots.',
    '- Middle phases: mix "learning" with one "review" slot per phase.',
    '- The LAST slot of every phase MUST be "assessment" (it becomes the checkpoint quiz).',
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
                      'Slot kind. The LAST slot of every section MUST be "assessment".',
                  },
                  topicHint: {
                    type: 'string',
                    description:
                      'Short hint (1–2 sentences) telling the content generator what to teach. Becomes the slot description.',
                  },
                },
                required: ['title', 'kind', 'topicHint'],
              },
              description: '4–6 slots per section. Last slot kind MUST be "assessment".',
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
    'Target ~300–500 words total. Keep the language warm, plain, and example-driven (Duolingo-style).',
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
    },
    required: ['title', 'introduction', 'keyPoints', 'examples'],
  },
};

export const FLASHCARDS_FOR_SLOT_TOOL: Anthropic.Messages.Tool = {
  name: 'create_flashcards_for_slot',
  description: [
    'Create 8–12 flashcards covering one checkpoint slot\'s topic.',
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
              description: 'Front of the card. A direct question, prompt, or fill-in.',
            },
            answer: {
              type: 'string',
              description:
                'Back of the card. Keep it focused — 1–3 sentences or a short list.',
            },
          },
          required: ['question', 'answer'],
        },
        minItems: 6,
        maxItems: 16,
      },
    },
    required: ['title', 'flashcards'],
  },
};

export const QUIZ_FOR_SLOT_TOOL: Anthropic.Messages.Tool = {
  name: 'create_quiz_for_slot',
  description: [
    'Create a 5–8 question quiz that tests one checkpoint slot (12–20 for the final exam).',
    'Use AT LEAST 3 different question kinds across the set — an all-MC quiz is never acceptable.',
    'Pick the kind that fits each item: mc for factual recall, true_false for crisp single-claim checks, fill_blank for short typed answers, word_bank for ordered grammar/sequence fills, match_pairs for term↔definition pairs, translation for language items, sentence_reorder for syntax/ordering, equation for math.',
    'See `create_quiz_v2` for the exact payload shape per kind — same rules apply here and the server rejects drift.',
  ].join('\n'),
  // The schema mirrors QUIZ_TOOL_V2; the inputs are validated post-hoc
  // with `QuizSetV2Schema` exactly like the chat-driven quiz tool.
  input_schema: QUIZ_TOOL_V2.input_schema,
};

export const ALL_TOOLS = [
  FLASHCARD_TOOL,
  QUIZ_TOOL,
  QUIZ_TOOL_V2,
  MINDMAP_TOOL,
  STUDY_PLAN_TOOL,
  PRESENTATION_TOOL,
  YOUTUBE_VIDEOS_TOOL,
];

// ── Helper to extract tool uses from Anthropic response ──

export function extractToolUses(content: Anthropic.Messages.ContentBlock[]) {
  let text = '';
  let flashcard: { id: string; input: FlashcardToolInput } | null = null;
  let quiz: { id: string; input: QuizToolInput } | null = null;
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
      } else if (block.name === 'create_quiz') {
        quiz = { id: block.id, input: block.input as QuizToolInput };
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

  return { text, flashcard, quiz, quizV2, mindmap, studyPlan, presentation, youtubeVideos };
}
