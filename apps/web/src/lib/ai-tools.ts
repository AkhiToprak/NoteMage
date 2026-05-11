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

// QUIZ_TOOL_V2 — kind-aware AI tool. Phase 2 ships all 7 kinds.
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
    'Supported kinds and their payload shapes:',
    '- mc: { options: string[4]; correctIndex: 0|1|2|3 }. For factual recall.',
    '- fill_blank: { blank: { acceptableAnswers: string[]; caseSensitive?: boolean; fuzzyThreshold?: number } }. Typed text answer; provide 2–4 acceptable spellings/variants. Default fuzzyThreshold 0.85.',
    '- word_bank: { template: string with {{0}}, {{1}} markers; slots: [{ correctAnswer: string }]; wordBank: string[] }. Drag tokens from the bank into the template slots. Word bank should include 2–4 distractor tokens beyond the correct ones.',
    '- match_pairs: { pairs: [{ left: string; right: string }] }. Two columns, render the right side shuffled; the user draws connections. 2–8 pairs.',
    '- translation: { targetLanguage: string; blank: { acceptableAnswers: string[]; caseSensitive?: boolean; fuzzyThreshold?: number } }. Like fill_blank but with a target-language tag; default fuzzyThreshold 0.75 (looser, for accents/diacritics).',
    '- sentence_reorder: { correctOrder: string[] }. Tokens shown shuffled; the user drags them into the correct order. 2–12 tokens.',
    '- equation: { expectedExpression: string; tolerance?: number; variables?: string[] }. Math input (e.g. "2*x + 3"). Set variables when the expression contains variables so the grader can test multiple sample points.',
    'Mix kinds intentionally — use mc for factual recall, fill_blank for definitions/short answers, word_bank for ordered grammar/syntax fills, match_pairs for terms/definitions, translation for language learning, sentence_reorder for syntax/sequencing, equation for math. Avoid all-MC unless the material is purely factual.',
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
