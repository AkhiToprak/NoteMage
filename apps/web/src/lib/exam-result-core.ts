/**
 * Exam Mode (Phase 5) — post-exam loop CORE (client-safe, no db / no AI client).
 *
 * Holds the pure pieces the result-entry / reflection / celebration / report /
 * feedback screens and the server lib both need: the reflection-reason catalog,
 * the difficulty catalog, outcome + branch derivation, the deterministic "Mage's
 * take" synthesizer (free + instant — no AI call on every reflection), and the
 * report/celebration view shapes. Grade ↔ neutral conversion stays in
 * `grading-systems.ts`; this file only decides flow + assembles view data.
 *
 * Honest-copy discipline (see redesign_figma_gutted_screens): every number a
 * screen shows comes from real recorded data — the recorded grade, the exam's
 * target, the readiness rollup, mock counts, slot progress. Nothing is invented.
 */

// ─── Difficulty ("How hard was it?") ─────────────────────────────────────────

export type DifficultyFelt = 'easy' | 'as_expected' | 'tough' | 'very_hard';

export interface DifficultyOption {
  key: DifficultyFelt;
  label: string;
}

/** The four difficulty pills, exam-day order (easiest → hardest). */
export const DIFFICULTY_OPTIONS: DifficultyOption[] = [
  { key: 'easy', label: 'Easy' },
  { key: 'as_expected', label: 'As expected' },
  { key: 'tough', label: 'Tough' },
  { key: 'very_hard', label: 'Very hard' },
];

export function isDifficulty(v: unknown): v is DifficultyFelt {
  return v === 'easy' || v === 'as_expected' || v === 'tough' || v === 'very_hard';
}

// ─── Outcome ─────────────────────────────────────────────────────────────────

export type ExamOutcome = 'passed' | 'failed' | 'pending';

export function isOutcome(v: unknown): v is ExamOutcome {
  return v === 'passed' || v === 'failed' || v === 'pending';
}

/**
 * Suggest an outcome from the entered grade vs the system's pass threshold (both
 * on the 0–100 neutral scale). The learner can override on the result screen, so
 * this is only the default selection — never a forced verdict.
 */
export function suggestOutcome(gradeNeutral: number, passNeutral: number): ExamOutcome {
  return gradeNeutral >= passNeutral ? 'passed' : 'failed';
}

/**
 * Which post-result screen to send the learner to. Beating the target (or
 * passing when no target is set) celebrates; failing OR landing below a set
 * target opens reflection; a pending/unknown result skips straight to the report.
 */
export type PostResultRoute = 'celebration' | 'reflection' | 'report';

export function routeAfterResult(opts: {
  outcome: ExamOutcome;
  gradeNeutral: number;
  targetNeutral: number | null;
}): PostResultRoute {
  const { outcome, gradeNeutral, targetNeutral } = opts;
  if (outcome === 'pending') return 'report';
  const metTarget = targetNeutral == null || gradeNeutral >= targetNeutral;
  if (outcome === 'passed' && metTarget) return 'celebration';
  return 'reflection';
}

// ─── Reflection ("What went wrong?") ─────────────────────────────────────────

export interface ReflectionReason {
  key: string;
  label: string;
  /**
   * True when this is a study/technique gap Mage can act on (vs. a one-off like
   * "distracted"). Fixable reasons get the "Needs practice" tag and drive the
   * deterministic Mage take + remediation framing.
   */
  fixable: boolean;
  /** Short clause used to build the deterministic "Mage's take" sentence. */
  theme?: string;
  /** What clearing this reason looks like — folded into the remedy sentence. */
  remedy?: string;
}

/** The reflection checklist, in the Figma order. */
export const REFLECTION_REASONS: ReflectionReason[] = [
  { key: 'ran_out_of_time', label: 'I ran out of time during the exam', fixable: true, theme: 'time pressure', remedy: 'timed practice' },
  { key: 'unfamiliar_material', label: 'The material felt unfamiliar on exam day', fixable: true, theme: 'shaky recall', remedy: 'spaced flashcard review' },
  { key: 'under_studied', label: "I didn't study enough overall", fixable: true, theme: 'thin coverage', remedy: 'a front-loaded study plan' },
  { key: 'question_types', label: 'I struggled with specific question types', fixable: true, theme: 'unfamiliar question types', remedy: 'targeted drills' },
  { key: 'misread', label: 'I misread or misunderstood questions', fixable: true, theme: 'misread questions', remedy: 'slower, deliberate practice runs' },
  { key: 'anxious', label: 'I felt anxious or stressed during the exam', fixable: false },
  { key: 'guessed', label: 'I guessed on too many questions', fixable: true, theme: 'gaps you guessed through', remedy: 'a weak-point session' },
  { key: 'topics_not_in_materials', label: "The topics weren't in my study materials", fixable: true, theme: 'missing topics', remedy: 'adding the surprise topics to your scope' },
  { key: 'studied_wrong', label: 'I studied the wrong things', fixable: true, theme: 'misaligned focus', remedy: 'a readiness-weighted plan' },
  { key: 'distracted', label: 'Something else distracted me', fixable: false },
];

const REASON_BY_KEY = new Map(REFLECTION_REASONS.map((r) => [r.key, r]));

/** Keep only known reason keys, deduped, in catalog order. */
export function normalizeReasonKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set(raw.filter((k): k is string => typeof k === 'string' && REASON_BY_KEY.has(k)));
  return REFLECTION_REASONS.filter((r) => set.has(r.key)).map((r) => r.key);
}

/** Join a list of phrases with commas + a final "and". */
function joinAnd(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Deterministic "Mage's take" for the reflection screen — synthesizes the
 * learner's selected reasons into a short, honest, encouraging note pointing at
 * concrete remediation. No AI call: keyed entirely off the catalog's
 * theme/remedy fields, so it's free, instant, and never hallucinates.
 */
export function buildReflectionTake(selectedKeys: string[]): string {
  const reasons = normalizeReasonKeys(selectedKeys).map((k) => REASON_BY_KEY.get(k)!);
  if (reasons.length === 0) {
    return 'Tag what tripped you up and Mage will fold a focused review into your next plan — every exam is data for the next one.';
  }
  const fixable = reasons.filter((r) => r.fixable);
  if (fixable.length === 0) {
    return 'Exam-day nerves happen to everyone and they fade with reps. A couple of timed run-throughs before the next one will help it feel routine.';
  }
  const themes = joinAnd([...new Set(fixable.map((r) => r.theme!).filter(Boolean))].slice(0, 3));
  const remedies = joinAnd([...new Set(fixable.map((r) => r.remedy!).filter(Boolean))].slice(0, 2));
  return `${capitalize(themes)} ${fixable.length === 1 ? 'is' : 'are'} fixable. A focused review built around ${remedies} will move the needle — want Mage to plan it?`;
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

// ─── Report / celebration view shapes ────────────────────────────────────────

/** A graded scope item rendered as a "what worked" / score-breakdown bar. */
export interface ScoreBar {
  title: string;
  /** 0–100 mastery. */
  pct: number;
}

/** One "what needs work" row on the report. */
export interface ReportWeakRow {
  key: string;
  title: string;
  /** 0–100 current mastery. */
  mastery: number;
  band: 'urgent' | 'needs_practice' | 'almost_fixed';
  /** Drill target so the row can deep-link. */
  sourceType: 'path' | 'quiz_set';
  sourceId: string;
}

/** One recommended-next-step card. */
export interface NextStep {
  key: string;
  title: string;
  /** e.g. "3 topics" / "12 questions" — a real count, never invented. */
  detail: string;
  estMinutes: number;
}

export type PredictionVerdict = 'on_track' | 'over' | 'under';

export interface ReportPrediction {
  /** Readiness Mage measured going into the exam (0–100). */
  predictedReadiness: number;
  /** The actual recorded grade on the neutral scale (0–100). */
  actualScore: number;
  verdict: PredictionVerdict;
  /** One honest sentence comparing the two. */
  note: string;
}

/** The celebration / archive headline stats — all real, derived counts. */
export interface ExamWrapStats {
  targetDisplay: string | null;
  gradeDisplay: string;
  /** 0–100 final readiness going into the exam. */
  finalReadiness: number;
  hasReadiness: boolean;
  missionsDone: number;
  missionsTotal: number;
  weakClosed: number;
  weakTotal: number;
  mocksTaken: number;
}

export interface ExamReportView {
  exam: { id: string; title: string; subject: string | null; examDate: string };
  /** The user's grading-system label, e.g. "Switzerland (1–6)". */
  gradingLabel: string;
  result: {
    gradeDisplay: string;
    gradeNeutral: number;
    outcome: ExamOutcome;
    difficultyFelt: DifficultyFelt | null;
    recordedAt: string;
  };
  targetDisplay: string | null;
  scorePct: number;
  prediction: ReportPrediction;
  whatWorked: ScoreBar[];
  whatNeedsWork: ReportWeakRow[];
  scoreBreakdown: ScoreBar[];
  recommendedNext: NextStep[];
  /** Topics the learner flagged in feedback (empty until they submit feedback). */
  feedbackTopics: string[];
  stats: ExamWrapStats;
  /**
   * Mage's prose. AI-written (exam-report-summary, PRO) or a deterministic
   * fallback. `keyTopicsNote` analyses the feedback/weak topics; `focusInsight`
   * is the amber "focus on X first" line.
   */
  narrative: { keyTopicsNote: string; focusInsight: string | null };
}

export function bandLabel(band: ReportWeakRow['band']): string {
  if (band === 'urgent') return 'Missed';
  if (band === 'needs_practice') return 'Practice';
  return 'Review';
}
