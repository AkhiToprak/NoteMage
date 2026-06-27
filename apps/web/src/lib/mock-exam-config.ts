/**
 * Exam Mode (Phase 3) — mock-exam config (client-safe).
 *
 * The pure config model + presets + validation, with NO server imports (no `db`,
 * no practice-generator) so the setup screen + results screen can import the
 * presets/labels/types directly. The server assembly lives in `mock-exam.ts`,
 * which imports from here. All pure → unit-testable.
 */

import type { QuestionKind } from '@notemage/shared';

export type MockType = 'quick' | 'full' | 'weakness' | 'final';
export type MockDifficulty = 'easy' | 'medium' | 'hard' | 'mixed';

export interface MockExamConfig {
  type: MockType;
  questionCount: number;
  /** Countdown length in seconds; 0 = untimed (the clock is hidden). */
  durationSec: number;
  questionKinds: QuestionKind[];
  difficulty: MockDifficulty;
  hints: boolean;
  topics: string[];
}

/** The four gradable practice kinds a mock may use (mirrors PRACTICE_QUIZ_KINDS;
 *  duplicated here so this module stays free of the server practice-generator). */
export const MOCK_SAFE_KINDS: QuestionKind[] = ['mc', 'true_false', 'fill_blank', 'match_pairs'];

/** Default kinds — the three that restore their selection perfectly on revisit
 *  (match_pairs grades fine but can visually reset, so it's opt-in). */
export const DEFAULT_MOCK_KINDS: QuestionKind[] = ['mc', 'true_false', 'fill_blank'];

export const MOCK_TYPES: MockType[] = ['quick', 'full', 'weakness', 'final'];
export const MOCK_DIFFICULTIES: MockDifficulty[] = ['easy', 'medium', 'hard', 'mixed'];

export const MIN_QUESTIONS = 5;
/** One generation call assembles the set, so cap the count (cost + latency). */
export const MAX_QUESTIONS = 30;
export const MIN_DURATION_SEC = 60;
export const MAX_DURATION_SEC = 4 * 3600;
export const MAX_TOPICS = 8;

export const MOCK_KIND_LABEL: Record<string, string> = {
  mc: 'Multiple choice',
  true_false: 'True / false',
  fill_blank: 'Fill in the blank',
  match_pairs: 'Match pairs',
};

export const MOCK_DIFFICULTY_LABEL: Record<MockDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  mixed: 'Mixed',
};

export interface MockPreset {
  label: string;
  blurb: string;
  icon: string;
  questionCount: number;
  durationSec: number;
  difficulty: MockDifficulty;
  hints: boolean;
  /** Bias the focus toward the exam's weak topics (vs. even coverage). */
  weaknessFocused: boolean;
}

export const MOCK_TYPE_PRESETS: Record<MockType, MockPreset> = {
  quick: {
    label: 'Quick check',
    blurb: 'A short, low-pressure rehearsal to warm up.',
    icon: 'bolt',
    questionCount: 8,
    durationSec: 10 * 60,
    difficulty: 'mixed',
    hints: true,
    weaknessFocused: false,
  },
  full: {
    label: 'Full mock',
    blurb: 'An exam-length run across everything you’ve scoped.',
    icon: 'history_edu',
    questionCount: 20,
    durationSec: 45 * 60,
    difficulty: 'mixed',
    hints: false,
    weaknessFocused: false,
  },
  weakness: {
    label: 'Weak spots',
    blurb: 'Concentrated on the topics you’re slipping on.',
    icon: 'target',
    questionCount: 12,
    durationSec: 15 * 60,
    difficulty: 'mixed',
    hints: true,
    weaknessFocused: true,
  },
  final: {
    label: 'Final rehearsal',
    blurb: 'Full length, harder, no hints — the real thing.',
    icon: 'workspace_premium',
    questionCount: 25,
    durationSec: 60 * 60,
    difficulty: 'hard',
    hints: false,
    weaknessFocused: false,
  },
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Dedup + cap a topic list (case-insensitive, order-preserving). Pure. */
function dedupTopics(raw: readonly string[], max = MAX_TOPICS): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    const trimmed = typeof t === 'string' ? t.trim() : '';
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed.length > 160 ? `${trimmed.slice(0, 159)}…` : trimmed);
    if (out.length >= max) break;
  }
  return out;
}

export function defaultMockConfig(type: MockType): MockExamConfig {
  const preset = MOCK_TYPE_PRESETS[type] ?? MOCK_TYPE_PRESETS.quick;
  return {
    type: MOCK_TYPES.includes(type) ? type : 'quick',
    questionCount: preset.questionCount,
    durationSec: preset.durationSec,
    questionKinds: [...DEFAULT_MOCK_KINDS],
    difficulty: preset.difficulty,
    hints: preset.hints,
    topics: [],
  };
}

/**
 * Validate + clamp a raw config payload. Unknown/missing fields fall back to the
 * type's preset; numeric fields are clamped; kinds are intersected with the safe
 * set (empty → all defaults). Pure — no I/O. Shared by the route + the screen.
 */
export function parseMockConfig(raw: unknown): MockExamConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  const type: MockType = MOCK_TYPES.includes(r.type as MockType) ? (r.type as MockType) : 'quick';
  const base = defaultMockConfig(type);

  const questionCount =
    typeof r.questionCount === 'number' && Number.isFinite(r.questionCount)
      ? clamp(Math.round(r.questionCount), MIN_QUESTIONS, MAX_QUESTIONS)
      : base.questionCount;

  let durationSec = base.durationSec;
  if (typeof r.durationSec === 'number' && Number.isFinite(r.durationSec)) {
    durationSec = r.durationSec <= 0 ? 0 : clamp(Math.round(r.durationSec), MIN_DURATION_SEC, MAX_DURATION_SEC);
  }

  const safe = new Set<QuestionKind>(MOCK_SAFE_KINDS);
  const rawKinds = Array.isArray(r.questionKinds) ? r.questionKinds : [];
  const picked = rawKinds.filter((k): k is QuestionKind => typeof k === 'string' && safe.has(k as QuestionKind));
  const questionKinds = picked.length > 0 ? Array.from(new Set(picked)) : [...DEFAULT_MOCK_KINDS];

  const difficulty: MockDifficulty = MOCK_DIFFICULTIES.includes(r.difficulty as MockDifficulty)
    ? (r.difficulty as MockDifficulty)
    : base.difficulty;

  const hints = typeof r.hints === 'boolean' ? r.hints : base.hints;

  const rawTopics = Array.isArray(r.topics) ? (r.topics as unknown[]) : [];
  const topics = dedupTopics(rawTopics.filter((t): t is string => typeof t === 'string'));

  return { type, questionCount, durationSec, questionKinds, difficulty, hints, topics };
}

/** The difficulty steer appended to the generation prompt. Pure. */
export function difficultyInstruction(difficulty: MockDifficulty): string {
  switch (difficulty) {
    case 'easy':
      return 'Keep the questions on the easier side — test recall and core definitions.';
    case 'hard':
      return 'Make the questions challenging — test application, multi-step reasoning, and edge cases, not just recall.';
    case 'mixed':
      return 'Mix easy recall questions with harder application questions.';
    case 'medium':
    default:
      return 'Aim for exam-typical difficulty — mostly application over rote recall.';
  }
}

/** Friendly one-liner for a stored duration (the setup chips + results meta). */
export function durationLabel(durationSec: number): string {
  if (durationSec <= 0) return 'No time limit';
  const m = Math.round(durationSec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h} h` : `${h} h ${rem} min`;
}
