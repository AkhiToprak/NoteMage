/**
 * Exam Mode (Phase 4) — study-plan server lib: db loaders, AI refinement,
 * persistence, read model, and the cheap deterministic mutations (reschedule /
 * mark done / item status). The pure candidate-assembly + scheduler + view types
 * live in `exam-study-plan-core.ts` (client-safe, unit-tested); this layer wires
 * them to Prisma + the AI client.
 *
 * Cost-aware (plan decision #2): a free-tier learner gets a fully deterministic,
 * honest plan; the optional Mage pass (Flash-Lite via `resolveModel`) only
 * re-orders priorities + writes the "Why this plan" rationale. The route gates
 * the AI pass behind PRO + anti-abuse caps + the `ai_study_plan` meter; this lib
 * takes `useAi` and always degrades gracefully to the deterministic plan.
 */

import { z } from 'zod';
import { db } from './db';
import { loadExamReadiness, loadExamWeakAreas } from './exam-scope';
import { loadPathForUser, serializePath } from './path-loader';
import { resolveModel } from './model-routing';
import { geminiStructured } from './gemini-structured';
import { anthropic } from './anthropic';
import { parseJsonLoose } from './json-util';
import { logAiUsage } from './ai-usage';
import {
  assemblePlanView,
  buildPlanCandidates,
  deterministicRationale,
  schedulePlanItems,
  MAX_HORIZON_DAYS,
  type ExamPlanView,
  type PlanCandidate,
  type PlanGenInput,
  type PlanItemKind,
  type PlanItemRow,
  type PlanItemStatus,
} from './exam-study-plan-core';

// ─── Date helpers (UTC, date-only) ────────────────────────────────────────────

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
function dateAtOffset(base: Date, offsetDays: number): Date {
  return new Date(base.getTime() + offsetDays * 86_400_000);
}
function isoOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const KNOWN_KINDS: PlanItemKind[] = ['theory', 'flashcards', 'quiz', 'mock', 'review', 'final_revision'];
function asKind(raw: string): PlanItemKind {
  return (KNOWN_KINDS as string[]).includes(raw) ? (raw as PlanItemKind) : 'review';
}
function asStatus(raw: string): PlanItemStatus {
  return raw === 'in_progress' || raw === 'done' ? raw : 'not_started';
}

// ─── Generation input loader ──────────────────────────────────────────────────

interface PlanGenContext {
  input: PlanGenInput;
  examTitle: string;
  examDate: string; // ISO
  daysUntil: number;
  readiness: number;
  primaryPathTitle: string | null;
}

/**
 * Resolve an exam's scope + readiness + weak areas + primary-path slots into the
 * slim {@link PlanGenInput} the planner consumes. Returns null for an
 * unowned/unknown exam. Reuses `loadExamWeakAreas` (the same impact-ranked weak
 * set the weak-areas board shows) so the plan and that screen stay consistent.
 */
async function loadPlanGenContext(userId: string, examId: string): Promise<PlanGenContext | null> {
  const wa = await loadExamWeakAreas(userId, examId);
  if (!wa) return null;

  const examRow = await db.exam.findFirst({ where: { id: examId, userId }, select: { format: true } });

  let slots: PlanGenInput['slots'] = [];
  let primaryPathTitle: string | null = null;
  if (wa.primaryPathId) {
    const plan = await loadPathForUser(userId, wa.primaryPathId);
    if (plan) {
      const sp = serializePath(plan);
      primaryPathTitle = sp.title;
      slots = sp.phases.flatMap((ph) => ph.slots).map((s) => ({
        id: s.id,
        title: s.title,
        kind: s.kind,
        completed: s.completed,
        unlocked: s.unlocked,
        bestPercentage: s.bestPercentage,
        activities: s.activities.map((a) => ({
          id: a.id,
          kind: a.kind,
          title: a.title,
          completed: a.completed,
          quizSetId: a.quizSetId,
          flashcardSetId: a.flashcardSetId,
          theoryId: a.theoryId,
        })),
      }));
    }
  }

  const input: PlanGenInput = {
    examId,
    daysUntil: wa.daysUntil,
    readiness: wa.weakAreas.readiness,
    hasGradedMaterial: wa.weakAreas.hasGradedMaterial,
    format: examRow?.format ?? null,
    primaryPathId: wa.primaryPathId,
    primaryPathTitle,
    slots,
    weakAreas: wa.weakAreas.areas.map((a) => ({
      title: a.title,
      mastery: a.mastery,
      band: a.band,
      impactPoints: a.impactPoints,
      sourceType: a.sourceType,
      sourceId: a.sourceId,
    })),
  };

  return { input, examTitle: wa.exam.title, examDate: wa.exam.examDate, daysUntil: wa.daysUntil, readiness: wa.weakAreas.readiness, primaryPathTitle };
}

// ─── AI refinement (Flash-Lite; Mage orders + writes the rationale) ───────────

const REFINE_SYSTEM = [
  'You are Mage, an exam study planner. You receive candidate study tasks for one exam and must order them best-first for a learner with limited days and a daily time budget.',
  'Ordering rules: put the highest-impact WEAK topics first; build foundational theory before drilling it; keep the timed mock near the end; finish with a light final revision.',
  'Then write a short, warm "Why this plan" rationale: first person, 1–2 sentences, at most 55 words, explaining the ordering. You may reference the learner\'s weak points and the exam format.',
  'Do NOT invent facts, percentages, topics, or tasks that are not in the provided list. Use only the given task ids.',
  'Return ONLY JSON of the shape {"order": ["taskId", …], "rationale": "…"} — every provided id appears exactly once in order, best first.',
].join('\n');

const RefineSchema = z.object({
  order: z.array(z.string()).max(64),
  rationale: z.string().max(700),
});

interface Refinement {
  orderedIds: string[];
  rationale: string;
}

/** Coerce a model response into a valid permutation + a clean rationale. */
function normalizeRefinement(raw: { order: string[]; rationale: string }, candidates: PlanCandidate[]): Refinement {
  const valid = new Set(candidates.map((c) => c.id));
  const seen = new Set<string>();
  const orderedIds: string[] = [];
  for (const id of raw.order) {
    if (valid.has(id) && !seen.has(id)) {
      seen.add(id);
      orderedIds.push(id);
    }
  }
  // Append any candidate the model dropped, preserving deterministic priority.
  for (const c of [...candidates].sort((a, b) => b.priority - a.priority)) {
    if (!seen.has(c.id)) orderedIds.push(c.id);
  }
  const rationale = raw.rationale.trim().replace(/\s+/g, ' ').slice(0, 400);
  return { orderedIds, rationale };
}

/**
 * Ask Mage to order the candidates + write the rationale. Routes through
 * `resolveModel('exam-study-plan')` (Flash-Lite default). Returns null on any
 * failure so the caller falls back to the deterministic plan. The static system
 * prompt is cache-friendly (dynamic content rides the user turn).
 */
async function refinePlanWithMage(
  candidates: PlanCandidate[],
  ctx: { daysUntil: number; dailyMinutesTarget: number; readiness: number; format: string | null },
  userId: string,
): Promise<Refinement | null> {
  const resolved = resolveModel('exam-study-plan');
  const userText = JSON.stringify({
    daysUntil: ctx.daysUntil,
    dailyMinutesTarget: ctx.dailyMinutesTarget,
    readiness: ctx.readiness,
    examFormat: ctx.format ?? 'unspecified',
    tasks: candidates.map((c) => ({
      id: c.id,
      kind: c.kind,
      title: c.title,
      weakPoint: c.weakPoint,
      urgency: c.urgency,
      estMinutes: c.estMinutes,
    })),
  });

  try {
    if (resolved.provider === 'gemini') {
      const res = await geminiStructured({
        schema: RefineSchema,
        system: REFINE_SYSTEM,
        userText,
        model: resolved.model,
        maxOutputTokens: 700,
        temperature: 0.4,
        onUsage: (u) =>
          logAiUsage({
            userId,
            feature: 'exam-study-plan',
            provider: 'gemini',
            model: resolved.model,
            inputTokens: u.promptTokens,
            outputTokens: u.candidatesTokens,
            cacheReadTokens: u.cachedTokens,
          }),
      });
      return normalizeRefinement(res, candidates);
    }

    // Non-Gemini override (e.g. EXAM_STUDY_PLAN_MODEL=sonnet) — Anthropic JSON.
    const response = await anthropic.messages.create({
      model: resolved.model,
      max_tokens: 700,
      system: REFINE_SYSTEM,
      messages: [{ role: 'user', content: `${userText}\n\nReturn ONLY the JSON object.` }],
    });
    logAiUsage({
      userId,
      feature: 'exam-study-plan',
      provider: 'anthropic',
      model: resolved.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    });
    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') return null;
    const parsed = RefineSchema.safeParse(parseJsonLoose(block.text));
    if (!parsed.success) return null;
    return normalizeRefinement(parsed.data, candidates);
  } catch (err) {
    console.error('[exam-study-plan] refine failed', err);
    return null;
  }
}

// ─── Generate (+ regenerate) ──────────────────────────────────────────────────

export const DEFAULT_DAILY_MINUTES = 40;
export const MIN_DAILY_MINUTES = 20;
export const MAX_DAILY_MINUTES = 120;

export function clampDailyMinutes(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_DAILY_MINUTES;
  return Math.min(MAX_DAILY_MINUTES, Math.max(MIN_DAILY_MINUTES, Math.round(n)));
}

export type GenerateResult =
  | { ok: true; view: ExamPlanView }
  | { ok: false; code: 'not_found' | 'no_material' };

/**
 * Build + persist a fresh study plan for an exam, superseding the prior active
 * one. `useAi` opts into the Mage ordering/rationale pass (the route gates it on
 * PRO + meter). Always degrades to the deterministic plan. Returns the freshly
 * persisted view (real item ids) so the client can mutate per-task status.
 */
export async function generateExamStudyPlan(opts: {
  userId: string;
  examId: string;
  dailyMinutesTarget: number;
  useAi: boolean;
}): Promise<GenerateResult> {
  const ctx = await loadPlanGenContext(opts.userId, opts.examId);
  if (!ctx) return { ok: false, code: 'not_found' };

  const candidates = buildPlanCandidates(ctx.input);
  if (candidates.length === 0) return { ok: false, code: 'no_material' };

  let ordered: PlanCandidate[] = [...candidates].sort((a, b) => b.priority - a.priority);
  let rationale = deterministicRationale(ctx.input, candidates);

  if (opts.useAi) {
    const refined = await refinePlanWithMage(
      candidates,
      { daysUntil: ctx.daysUntil, dailyMinutesTarget: opts.dailyMinutesTarget, readiness: ctx.readiness, format: ctx.input.format },
      opts.userId,
    );
    if (refined) {
      const byId = new Map(candidates.map((c) => [c.id, c]));
      ordered = refined.orderedIds.map((id) => byId.get(id)).filter((c): c is PlanCandidate => Boolean(c));
      if (refined.rationale) rationale = refined.rationale;
    }
  }

  const scheduled = schedulePlanItems(ordered, { daysUntil: ctx.daysUntil, dailyMinutesTarget: opts.dailyMinutesTarget });
  const horizonDays = Math.max(1, Math.min(Math.max(1, ctx.daysUntil || 1), MAX_HORIZON_DAYS));
  const base = todayUtc();

  await db.$transaction(async (tx) => {
    await tx.examStudyPlan.updateMany({ where: { examId: opts.examId, status: 'active' }, data: { status: 'superseded' } });
    const plan = await tx.examStudyPlan.create({
      data: { examId: opts.examId, horizonDays, dailyMinutesTarget: opts.dailyMinutesTarget, rationale, status: 'active' },
      select: { id: true },
    });
    if (scheduled.length > 0) {
      await tx.examStudyPlanItem.createMany({
        data: scheduled.map((it) => ({
          planId: plan.id,
          scheduledDate: dateAtOffset(base, it.dayOffset),
          sortOrder: it.sortOrder,
          kind: it.kind,
          title: it.title.slice(0, 200),
          estMinutes: it.estMinutes,
          status: 'not_started',
          refType: it.refType,
          refId: it.refId,
          weakPoint: it.weakPoint,
          urgency: it.urgency,
          readinessDelta: it.readinessDelta,
        })),
      });
    }
  });

  const view = await loadActiveExamPlanView(opts.userId, opts.examId);
  if (!view) return { ok: false, code: 'not_found' };
  return { ok: true, view };
}

// ─── Read model ───────────────────────────────────────────────────────────────

/**
 * Load the active study-plan view for an exam, or null if none exists (→ the
 * "No study plan" empty state). Reuses `loadExamReadiness` for the exam meta +
 * live readiness + days-until, and derives the primary path title from the
 * readiness rollup (no extra path fetch).
 */
export async function loadActiveExamPlanView(
  userId: string,
  examId: string,
  pre?: Awaited<ReturnType<typeof loadExamReadiness>>,
): Promise<ExamPlanView | null> {
  const readiness = pre ?? (await loadExamReadiness(userId, examId));
  if (!readiness) return null;

  const plan = await db.examStudyPlan.findFirst({
    where: { exam: { id: examId, userId }, status: 'active' },
    orderBy: { generatedAt: 'desc' },
    include: { items: { orderBy: [{ scheduledDate: 'asc' }, { sortOrder: 'asc' }] } },
  });
  if (!plan) return null;

  const primaryPath = readiness.readiness.items.find((it) => it.type === 'path') ?? null;
  const items: PlanItemRow[] = plan.items.map((it) => ({
    id: it.id,
    kind: asKind(it.kind),
    title: it.title,
    estMinutes: it.estMinutes,
    status: asStatus(it.status),
    weakPoint: it.weakPoint,
    urgency: it.urgency ?? null,
    readinessDelta: it.readinessDelta ?? null,
    refType: it.refType ?? null,
    refId: it.refId ?? null,
    scheduledDate: isoOf(it.scheduledDate),
    sortOrder: it.sortOrder,
  }));

  return assemblePlanView({
    examId,
    planId: plan.id,
    generatedAt: plan.generatedAt.toISOString(),
    horizonDays: plan.horizonDays,
    dailyMinutesTarget: plan.dailyMinutesTarget,
    rationale: plan.rationale,
    byMage: true,
    examTitle: readiness.exam.title,
    examDate: readiness.exam.examDate,
    daysUntil: readiness.daysUntil,
    readiness: readiness.readiness.hasGradedMaterial ? readiness.readiness.readiness : 0,
    primaryPathTitle: primaryPath?.title ?? null,
    items,
    todayIso: isoOf(todayUtc()),
  });
}

// ─── Cheap deterministic mutations (no AI, free) ──────────────────────────────

/** Re-bucket the active plan's existing tasks into days under a new daily-minutes
 *  budget — deterministic, instant, free (the calendar's daily-time slider). */
export async function rescheduleActivePlan(
  userId: string,
  examId: string,
  dailyMinutesTarget: number,
): Promise<ExamPlanView | null> {
  const readiness = await loadExamReadiness(userId, examId);
  if (!readiness) return null;
  const plan = await db.examStudyPlan.findFirst({
    where: { exam: { id: examId, userId }, status: 'active' },
    orderBy: { generatedAt: 'desc' },
    include: { items: { orderBy: [{ scheduledDate: 'asc' }, { sortOrder: 'asc' }] } },
  });
  if (!plan) return null;

  // Rebuild lightweight candidates from the stored rows, preserving their order.
  const candidates: PlanCandidate[] = plan.items.map((it, i) => {
    const kind = asKind(it.kind);
    return {
      id: it.id,
      kind,
      title: it.title,
      reason: '',
      estMinutes: it.estMinutes,
      weakPoint: it.weakPoint,
      urgency: it.urgency ?? null,
      readinessDelta: it.readinessDelta ?? null,
      refType: it.refType ?? null,
      refId: it.refId ?? null,
      href: '',
      priority: (plan.items.length - i) + (it.urgency ?? 0) * 100,
    };
  });

  const scheduled = schedulePlanItems(candidates, { daysUntil: readiness.daysUntil, dailyMinutesTarget });
  const base = todayUtc();

  await db.$transaction([
    db.examStudyPlan.update({ where: { id: plan.id }, data: { dailyMinutesTarget } }),
    ...scheduled.map((it) =>
      db.examStudyPlanItem.update({
        where: { id: it.id },
        data: { scheduledDate: dateAtOffset(base, it.dayOffset), sortOrder: it.sortOrder },
      }),
    ),
  ]);

  return loadActiveExamPlanView(userId, examId);
}

/** Set one task's status (per-task tick + Resume → in_progress). */
export async function setPlanItemStatus(
  userId: string,
  examId: string,
  itemId: string,
  status: PlanItemStatus,
): Promise<ExamPlanView | null> {
  const item = await db.examStudyPlanItem.findFirst({
    where: { id: itemId, plan: { status: 'active', exam: { id: examId, userId } } },
    select: { id: true },
  });
  if (!item) return null;
  await db.examStudyPlanItem.update({ where: { id: itemId }, data: { status } });
  return loadActiveExamPlanView(userId, examId);
}

/** "Mark all done" / "Log today as complete" — flips today's open tasks to done. */
export async function markTodayDone(userId: string, examId: string): Promise<ExamPlanView | null> {
  const plan = await db.examStudyPlan.findFirst({
    where: { exam: { id: examId, userId }, status: 'active' },
    select: { id: true },
  });
  if (!plan) return null;
  await db.examStudyPlanItem.updateMany({
    where: { planId: plan.id, scheduledDate: todayUtc(), status: { not: 'done' } },
    data: { status: 'done' },
  });
  return loadActiveExamPlanView(userId, examId);
}
