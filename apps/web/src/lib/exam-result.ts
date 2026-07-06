/**
 * Exam Mode (Phase 5) — post-exam loop SERVER lib. Records the learner's exam
 * result, assembles the learning report (deterministic + an optional cached AI
 * narrative), and stores post-exam feedback topics. Wires the client-safe core
 * (`exam-result-core.ts`) to Prisma, the grading catalog, the readiness/weak/mock
 * rollups, and the AI client.
 *
 * Cost-aware (plan decision #2): the whole report is built from REAL recorded
 * data with zero AI; the only AI touchpoint is the short report prose, routed
 * through `resolveModel('exam-report-summary')` (Gemini Flash-Lite), PRO-gated at
 * the route, metered on `ai_study_plan`, and CACHED onto `ExamResult.reflection`
 * so it generates at most once per exam. Free tier always gets the deterministic
 * narrative. The reflection's "Mage's take" is fully deterministic (core lib).
 */

import { z } from 'zod';
import { db } from './db';
import { loadExamReadiness, loadExamWeakAreas } from './exam-scope';
import { loadPathForUser, serializePath } from './path-loader';
import { resolveModel } from './model-routing';
import { geminiStructured } from './gemini-structured';
import { logAiUsage } from './ai-usage';
import {
  getGradingSystem,
  toNeutral,
  formatGrade,
  DEFAULT_GRADING_SYSTEM_ID,
  type GradingSystem,
} from './grading-systems';
import {
  buildReflectionTake,
  normalizeReasonKeys,
  suggestOutcome,
  isOutcome,
  isDifficulty,
  type ExamOutcome,
  type DifficultyFelt,
  type ExamReportView,
  type ReportPrediction,
  type ScoreBar,
  type ReportWeakRow,
  type NextStep,
  type ExamWrapStats,
} from './exam-result-core';

const READINESS_PASS = 70;
const MAX_FEEDBACK_TOPICS = 24;
const TOPIC_MAX_LEN = 80;

// ─── Stored reflection JSON shape (ExamResult.reflection) ─────────────────────

interface StoredReflection {
  reasons?: string[];
  take?: string;
  feedbackTopics?: string[];
  feedbackNote?: string;
  narrative?: { keyTopicsNote: string; focusInsight: string | null };
}

function readReflection(raw: unknown): StoredReflection {
  return raw && typeof raw === 'object' ? (raw as StoredReflection) : {};
}

// ─── Grading helpers ──────────────────────────────────────────────────────────

async function userGradingSystem(userId: string): Promise<GradingSystem> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { gradingSystem: true } });
  return getGradingSystem(user?.gradingSystem ?? DEFAULT_GRADING_SYSTEM_ID) ?? getGradingSystem(DEFAULT_GRADING_SYSTEM_ID)!;
}

/** Pass threshold on the 0–100 neutral scale, derived from the system's passMark. */
function passNeutralFor(sys: GradingSystem): number {
  return toNeutral(sys.passMark, sys);
}

// ─── Result-entry context ──────────────────────────────────────────────────────

export interface ResultEntryContext {
  exam: { id: string; title: string; subject: string | null; examDate: string; notebookId: string };
  grading: {
    id: string;
    label: string;
    kind: 'numeric' | 'letter';
    scaleMin: number | null;
    scaleMax: number | null;
    bestIsHigh: boolean;
    decimals: number;
    unit: string;
    bands: { label: string; neutral: number }[] | null;
    passMark: number | string;
    passNeutral: number;
  };
  targetNeutral: number | null;
  targetDisplay: string | null;
  /** The existing recorded result, when re-opening the screen. */
  existing: {
    gradeNeutral: number;
    gradeValue: number | string;
    outcome: ExamOutcome;
    difficultyFelt: DifficultyFelt | null;
    notes: string | null;
  } | null;
}

/**
 * Load everything the result-entry screen needs to render its grade stepper in
 * the learner's own grading system. Returns null for an unowned/unknown exam.
 */
export async function loadResultEntryContext(userId: string, examId: string): Promise<ResultEntryContext | null> {
  const exam = await db.exam.findFirst({
    where: { id: examId, userId },
    select: {
      id: true,
      title: true,
      examDate: true,
      notebookId: true,
      targetGradeNeutral: true,
      notebook: { select: { name: true } },
      result: { select: { gradeNeutral: true, outcome: true, difficultyFelt: true, notes: true } },
    },
  });
  if (!exam) return null;

  const sys = await userGradingSystem(userId);
  const passNeutral = passNeutralFor(sys);

  const existing = exam.result
    ? {
        gradeNeutral: exam.result.gradeNeutral,
        gradeValue: gradeValueOf(exam.result.gradeNeutral, sys),
        outcome: isOutcome(exam.result.outcome) ? exam.result.outcome : 'pending',
        difficultyFelt: isDifficulty(exam.result.difficultyFelt) ? exam.result.difficultyFelt : null,
        notes: exam.result.notes ?? null,
      }
    : null;

  return {
    exam: {
      id: exam.id,
      title: exam.title,
      subject: exam.notebook?.name ?? null,
      examDate: exam.examDate.toISOString(),
      notebookId: exam.notebookId,
    },
    grading: {
      id: sys.id,
      label: sys.label,
      kind: sys.kind,
      scaleMin: sys.scaleMin ?? null,
      scaleMax: sys.scaleMax ?? null,
      bestIsHigh: sys.bestIsHigh ?? true,
      decimals: sys.decimals ?? (sys.kind === 'numeric' ? 1 : 0),
      unit: sys.unit ?? '',
      bands: sys.bands ? sys.bands.map((b) => ({ label: b.label, neutral: b.neutral })) : null,
      passMark: sys.passMark,
      passNeutral,
    },
    targetNeutral: exam.targetGradeNeutral ?? null,
    targetDisplay: exam.targetGradeNeutral != null ? formatGrade(exam.targetGradeNeutral, sys) : null,
    existing,
  };
}

/** Raw display value (number for numeric, label for letter) for a neutral score. */
function gradeValueOf(neutral: number, sys: GradingSystem): number | string {
  const { value } = fromNeutralValue(neutral, sys);
  return value;
}
function fromNeutralValue(neutral: number, sys: GradingSystem): { value: number | string } {
  // Mirror fromNeutral but only the raw value (display formatting lives in core).
  if (sys.kind === 'numeric') {
    const min = sys.scaleMin ?? 0;
    const max = sys.scaleMax ?? 100;
    const range = max - min;
    const raw = sys.bestIsHigh ? min + (neutral / 100) * range : max - (neutral / 100) * range;
    return { value: parseFloat(raw.toFixed(sys.decimals ?? 1)) };
  }
  const bands = sys.bands ?? [];
  let nearest = bands[0]?.label ?? '';
  let best = Infinity;
  for (const b of bands) {
    const d = Math.abs(b.neutral - neutral);
    if (d < best) { best = d; nearest = b.label; }
  }
  return { value: nearest };
}

// ─── Record the result ──────────────────────────────────────────────────────────

export interface RecordResultInput {
  /** Display value the stepper/band picker produced (number or letter label). */
  gradeValue: number | string;
  outcome?: ExamOutcome;
  difficultyFelt?: DifficultyFelt | null;
  notes?: string | null;
}

export interface RecordResultOutput {
  gradeNeutral: number;
  gradeDisplay: string;
  outcome: ExamOutcome;
  targetNeutral: number | null;
  passNeutral: number;
}

/**
 * Upsert the learner's exam result. Converts the entered grade to the 0–100
 * neutral scale via their grading system, defaults the outcome from the pass
 * threshold when not supplied, and preserves any existing reflection JSON.
 * Returns null for an unowned/unknown exam.
 */
export async function recordExamResult(
  userId: string,
  examId: string,
  input: RecordResultInput,
): Promise<RecordResultOutput | null> {
  const exam = await db.exam.findFirst({
    where: { id: examId, userId },
    select: { id: true, targetGradeNeutral: true },
  });
  if (!exam) return null;

  const sys = await userGradingSystem(userId);
  const passNeutral = passNeutralFor(sys);
  const gradeNeutral = clamp01(toNeutral(input.gradeValue, sys));
  const outcome: ExamOutcome = input.outcome ?? suggestOutcome(gradeNeutral, passNeutral);
  const notes = (input.notes ?? '').trim().slice(0, 2000) || null;
  const difficultyFelt = input.difficultyFelt && isDifficulty(input.difficultyFelt) ? input.difficultyFelt : null;

  await db.examResult.upsert({
    where: { examId },
    create: { examId, gradeNeutral, outcome, difficultyFelt, notes },
    // Recording a fresh grade should not silently wipe a prior reflection.
    update: { gradeNeutral, outcome, difficultyFelt, notes },
  });

  return {
    gradeNeutral,
    gradeDisplay: formatGrade(gradeNeutral, sys),
    outcome,
    targetNeutral: exam.targetGradeNeutral ?? null,
    passNeutral,
  };
}

// ─── Reflection ("what went wrong") ──────────────────────────────────────────

/**
 * Persist the reflection reasons + Mage's deterministic take onto the result's
 * reflection JSON. Requires a recorded result (the reflection screen only opens
 * after one). Returns the take string, or null if no result exists yet.
 */
export async function saveExamReflection(
  userId: string,
  examId: string,
  reasonKeys: string[],
): Promise<{ take: string } | null> {
  const exam = await db.exam.findFirst({ where: { id: examId, userId }, select: { id: true } });
  if (!exam) return null;
  const result = await db.examResult.findUnique({ where: { examId }, select: { reflection: true } });
  if (!result) return null;

  const reasons = normalizeReasonKeys(reasonKeys);
  const take = buildReflectionTake(reasons);
  const prev = readReflection(result.reflection);
  await db.examResult.update({
    where: { examId },
    data: { reflection: { ...prev, reasons, take } as object },
  });
  return { take };
}

// ─── Feedback (surprise topics) ──────────────────────────────────────────────

/**
 * Store the topics the learner flagged as exam-day surprises (+ an optional
 * note) onto the result's reflection JSON. Surfaced back on the report's "key
 * feedback topics" card and available when they prepare the next exam. Bumps the
 * cached narrative so the report re-summarizes with the new topics next view.
 */
export async function saveExamFeedback(
  userId: string,
  examId: string,
  topics: string[],
  note?: string,
): Promise<{ topics: string[] } | null> {
  const exam = await db.exam.findFirst({ where: { id: examId, userId }, select: { id: true } });
  if (!exam) return null;
  const result = await db.examResult.findUnique({ where: { examId }, select: { reflection: true } });
  if (!result) return null;

  const clean = [...new Set(
    (Array.isArray(topics) ? topics : [])
      .map((t) => (typeof t === 'string' ? t.trim() : ''))
      .filter((t) => t.length > 0)
      .map((t) => t.slice(0, TOPIC_MAX_LEN)),
  )].slice(0, MAX_FEEDBACK_TOPICS);

  const prev = readReflection(result.reflection);
  await db.examResult.update({
    where: { examId },
    data: {
      // Drop the cached narrative so the next report view re-summarizes with the
      // new feedback topics in scope.
      reflection: { ...prev, feedbackTopics: clean, feedbackNote: (note ?? '').trim().slice(0, 600) || undefined, narrative: undefined } as object,
    },
  });
  return { topics: clean };
}

// ─── Report assembly ─────────────────────────────────────────────────────────

/**
 * Assemble the post-exam learning report. Everything except the prose is derived
 * deterministically from recorded data; the narrative is taken from the cached
 * value, generated via AI when `useAi` (PRO) + nothing cached, else a
 * deterministic fallback. Returns null when there's no recorded result yet (the
 * report needs a grade) or the exam is unowned.
 */
export async function loadExamReport(
  userId: string,
  examId: string,
  opts: { useAi: boolean },
): Promise<ExamReportView | null> {
  const [readinessRes, weakRes, examRow] = await Promise.all([
    loadExamReadiness(userId, examId),
    loadExamWeakAreas(userId, examId),
    db.exam.findFirst({
      where: { id: examId, userId },
      select: {
        id: true,
        title: true,
        examDate: true,
        targetGradeNeutral: true,
        notebook: { select: { name: true } },
        result: true,
      },
    }),
  ]);
  if (!readinessRes || !weakRes || !examRow || !examRow.result) return null;

  const sys = await userGradingSystem(userId);
  const result = examRow.result;
  const reflection = readReflection(result.reflection);
  const r = readinessRes.readiness;
  const weak = weakRes.weakAreas;
  const gradeNeutral = result.gradeNeutral;
  const scorePct = Math.round(gradeNeutral);

  // Primary path → mission counts.
  let missionsDone = 0;
  let missionsTotal = 0;
  if (weakRes.primaryPathId) {
    const plan = await loadPathForUser(userId, weakRes.primaryPathId);
    if (plan) {
      const slots = serializePath(plan).phases.flatMap((ph) => ph.slots);
      missionsTotal = slots.length;
      missionsDone = slots.filter((s) => s.completed).length;
    }
  }

  const mocksTaken = await db.mockExam.count({ where: { examId, userId, status: 'completed' } });

  // Graded, attempted items → score bars (honest per-topic mastery).
  const gradedItems = r.items.filter((it) => !it.passive && it.attempted);
  const scoreBreakdown: ScoreBar[] = gradedItems
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((it) => ({ title: it.title, pct: it.score }));
  const whatWorked: ScoreBar[] = gradedItems
    .filter((it) => it.score >= READINESS_PASS)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((it) => ({ title: it.title, pct: it.score }));
  const masteredCount = gradedItems.filter((it) => it.score >= READINESS_PASS).length;

  const whatNeedsWork: ReportWeakRow[] = weak.areas.slice(0, 4).map((a) => ({
    key: a.key,
    title: a.title,
    mastery: a.mastery,
    band: a.band,
    sourceType: a.sourceType,
    sourceId: a.sourceId,
  }));
  const recommendedNext: NextStep[] = weak.areas.slice(0, 3).map((a) => ({
    key: a.key,
    title: a.title,
    detail: a.sourceType === 'path' ? 'Path topic' : 'Quiz set',
    estMinutes: a.band === 'urgent' ? 30 : a.band === 'needs_practice' ? 20 : 15,
  }));

  const predictedReadiness = r.hasGradedMaterial ? r.readiness : 0;
  const prediction = buildPrediction(predictedReadiness, gradeNeutral, r.hasGradedMaterial);

  const targetDisplay = examRow.targetGradeNeutral != null ? formatGrade(examRow.targetGradeNeutral, sys) : null;
  const feedbackTopics = (reflection.feedbackTopics ?? []).slice(0, MAX_FEEDBACK_TOPICS);

  // Narrative — cached → AI (PRO) → deterministic.
  let narrative = reflection.narrative ?? null;
  if (!narrative) {
    const det = deterministicNarrative({ feedbackTopics, weak, gradeNeutral, targetNeutral: examRow.targetGradeNeutral ?? null, sys });
    if (opts.useAi) {
      const ai = await generateReportNarrative(userId, {
        examTitle: examRow.title,
        feedbackTopics,
        weakTitles: weak.areas.slice(0, 5).map((a) => ({ title: a.title, mastery: a.mastery })),
        gradeDisplay: formatGrade(gradeNeutral, sys),
        targetDisplay,
        recoverablePoints: Math.round(weak.recoverablePoints),
      }).catch(() => null);
      narrative = ai ?? det;
      // Cache whatever we settled on so the next view doesn't re-generate.
      await db.examResult
        .update({ where: { examId }, data: { reflection: { ...reflection, narrative } as object } })
        .catch(() => {});
    } else {
      narrative = det;
    }
  }

  const stats: ExamWrapStats = {
    targetDisplay,
    gradeDisplay: formatGrade(gradeNeutral, sys),
    finalReadiness: predictedReadiness,
    hasReadiness: r.hasGradedMaterial,
    missionsDone,
    missionsTotal,
    weakClosed: masteredCount,
    weakTotal: gradedItems.length,
    mocksTaken,
  };

  return {
    exam: {
      id: examRow.id,
      title: examRow.title,
      subject: examRow.notebook?.name ?? null,
      examDate: examRow.examDate.toISOString(),
    },
    gradingLabel: sys.label,
    result: {
      gradeDisplay: formatGrade(gradeNeutral, sys),
      gradeNeutral,
      outcome: isOutcome(result.outcome) ? result.outcome : 'pending',
      difficultyFelt: isDifficulty(result.difficultyFelt) ? result.difficultyFelt : null,
      recordedAt: result.recordedAt.toISOString(),
    },
    targetDisplay,
    scorePct,
    prediction,
    whatWorked,
    whatNeedsWork,
    scoreBreakdown,
    recommendedNext,
    feedbackTopics,
    stats,
    narrative,
  };
}

function buildPrediction(predicted: number, actualNeutral: number, hasGraded: boolean): ReportPrediction {
  const actual = Math.round(actualNeutral);
  if (!hasGraded) {
    return {
      predictedReadiness: 0,
      actualScore: actual,
      verdict: 'on_track',
      note: 'No graded material was scoped, so there was no readiness prediction to compare against.',
    };
  }
  const gap = predicted - actual;
  if (Math.abs(gap) <= 10) {
    return { predictedReadiness: predicted, actualScore: actual, verdict: 'on_track', note: 'Readiness was on point — your prediction matched the result.' };
  }
  if (gap > 10) {
    return { predictedReadiness: predicted, actualScore: actual, verdict: 'over', note: `Readiness ran ${gap} points ahead of the result — worth grounding it with more timed mocks next time.` };
  }
  return { predictedReadiness: predicted, actualScore: actual, verdict: 'under', note: `You scored ${Math.abs(gap)} points above your readiness — you knew more than the rollup gave you credit for.` };
}

// ─── Narrative: deterministic + AI ───────────────────────────────────────────

function deterministicNarrative(opts: {
  feedbackTopics: string[];
  weak: { areas: { title: string; mastery: number }[]; recoverablePoints: number };
  gradeNeutral: number;
  targetNeutral: number | null;
  sys: GradingSystem;
}): { keyTopicsNote: string; focusInsight: string | null } {
  const { feedbackTopics, weak } = opts;
  const top = weak.areas.slice(0, 2).map((a) => a.title);
  const recoverable = Math.round(weak.recoverablePoints);

  let keyTopicsNote: string;
  if (feedbackTopics.length > 0) {
    const list = feedbackTopics.slice(0, 4).join(', ');
    keyTopicsNote = `You flagged ${list} as exam-day surprises. Add them to this exam's scope so Mage can build them into your next plan and they don't catch you out twice.`;
  } else if (top.length > 0) {
    keyTopicsNote = `Your lowest-scoring topics were ${top.join(' and ')}. Closing them is the fastest way to lift your next score — they're already in your weak-areas board.`;
  } else {
    keyTopicsNote = 'Your scored topics all landed above the pass mark — keep them warm with light review and you stay exam-ready.';
  }

  let focusInsight: string | null = null;
  if (top.length > 0 && recoverable > 0) {
    focusInsight = `Focus on ${top.join(' and ')} first — clearing your weak areas could recover about ${recoverable} readiness points before the next exam.`;
  }
  return { keyTopicsNote, focusInsight };
}

const NARRATIVE_SYSTEM = [
  'You are Mage, a study coach writing a short post-exam debrief. You receive an exam title, the learner\'s grade vs target, their lowest-scoring topics (with mastery %), and any topics they flagged as exam-day surprises.',
  'Write exactly two fields:',
  '- keyTopicsNote: 1–2 sentences (≤45 words) analysing the surprise/weak topics and what to do about them. Warm, concrete, first person.',
  '- focusInsight: ONE sentence (≤30 words) naming the 1–2 topics to fix first and the readiness they would recover. Use the provided recoverablePoints number. Return null if there are no weak topics.',
  'Do NOT invent topics, percentages, or facts beyond the provided data. Reference only the given topics and numbers.',
  'Return ONLY JSON of the shape {"keyTopicsNote": "…", "focusInsight": "…" | null}.',
].join('\n');

const NarrativeSchema = z.object({
  keyTopicsNote: z.string().max(500),
  focusInsight: z.string().max(400).nullable(),
});

/**
 * AI report prose via `resolveModel('exam-report-summary')` (Gemini Flash-Lite).
 * The static system prompt is cache-friendly; dynamic data rides the user turn.
 * Metered by the route on `ai_study_plan`. Returns null on any failure so the
 * caller falls back to the deterministic narrative.
 */
async function generateReportNarrative(
  userId: string,
  data: {
    examTitle: string;
    feedbackTopics: string[];
    weakTitles: { title: string; mastery: number }[];
    gradeDisplay: string;
    targetDisplay: string | null;
    recoverablePoints: number;
  },
): Promise<{ keyTopicsNote: string; focusInsight: string | null } | null> {
  // Gemini-structured only (EXAM_REPORT_MODEL pins flash/flash-lite; a
  // non-Gemini pin is warned + coerced to flash-lite in the resolver).
  const resolved = resolveModel('exam-report-summary');
  const userText = JSON.stringify(data);

  try {
    const res = await geminiStructured({
      schema: NarrativeSchema,
      system: NARRATIVE_SYSTEM,
      userText,
      model: resolved.model,
      maxOutputTokens: 400,
      temperature: 0.4,
      onUsage: (u) =>
        logAiUsage({
          userId,
          feature: 'exam-report-summary',
          provider: 'gemini',
          model: resolved.model,
          inputTokens: u.promptTokens,
          outputTokens: u.candidatesTokens,
          cacheReadTokens: u.cachedTokens,
        }),
    });
    return res;
  } catch (err) {
    console.error('[exam-report] narrative failed', err);
    return null;
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}
