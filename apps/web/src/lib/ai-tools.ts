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
    materials: {
      type: 'page' | 'flashcard_set' | 'quiz_set' | 'document';
      referenceId: string;
      title: string;
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
    'Create a structured study plan with phases and materials. Use this tool when the user asks you to create, generate, or make a study plan, study schedule, or revision plan from their notebook materials. Each phase has a title, description, duration, and a list of materials to study.',
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
                },
                required: ['type', 'referenceId', 'title'],
              },
              description: 'Materials to study in this phase',
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

  return { text, flashcard, quiz, mindmap, studyPlan, presentation, youtubeVideos };
}
