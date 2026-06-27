/**
 * Exam Mode (Phase 4) — study-plan core: PURE, client-safe (no `db`, no I/O).
 *
 * Mirrors the `exam-readiness` split: the db-backed loading + AI refinement +
 * persistence live in `exam-study-plan.ts`; this layer turns a slim
 * {@link PlanGenInput} (scope + readiness + weak areas + days-left) into an
 * ordered, day-scheduled list of study tasks — and is the single source of the
 * view types both the API and the two client screens (`/exam/:id/plan`,
 * `/exam/:id/calendar`) consume.
 *
 * Honest by construction: candidates come from REAL scoped material (path slots,
 * weak topics ranked by `deriveWeakAreas` impact); `readinessDelta` is only set
 * where there's a genuine basis (a weak area's impact points), never invented.
 * The scheduler is deterministic so a free-tier learner gets the same honest
 * plan; the optional AI pass (Flash-Lite) only re-orders priorities + writes the
 * "Why this plan" rationale.
 */

// ─── Kinds, statuses, view types ──────────────────────────────────────────────

export type PlanItemKind =
  | 'theory'
  | 'flashcards'
  | 'quiz'
  | 'mock'
  | 'review'
  | 'final_revision';

export type PlanItemStatus = 'not_started' | 'in_progress' | 'done';

/** Per-kind display metadata — icon (Material Symbol) + short label + tone. */
export const KIND_META: Record<PlanItemKind, { label: string; icon: string; tone: 'study' | 'review' | 'mock' | 'final' }> = {
  theory: { label: 'Theory', icon: 'menu_book', tone: 'study' },
  flashcards: { label: 'Flashcards', icon: 'style', tone: 'review' },
  quiz: { label: 'Quiz', icon: 'quiz', tone: 'study' },
  review: { label: 'Review', icon: 'replay', tone: 'review' },
  mock: { label: 'Mock', icon: 'timer', tone: 'mock' },
  final_revision: { label: 'Final revision', icon: 'verified', tone: 'final' },
};

/** Per-kind default effort in minutes — lightly adjusted by content downstream. */
export const KIND_MINUTES: Record<PlanItemKind, number> = {
  theory: 12,
  flashcards: 8,
  quiz: 10,
  review: 10,
  mock: 25,
  final_revision: 30,
};

/** A single scheduled task, as the API + both screens consume it. */
export interface PlanItemView {
  id: string;
  kind: PlanItemKind;
  title: string;
  reason: string;
  estMinutes: number;
  status: PlanItemStatus;
  weakPoint: boolean;
  /** 3 = urgent · 2 = needs practice · 1 = almost fixed · null = neutral. */
  urgency: number | null;
  /** Estimated readiness gain (0–100 pts) — only set for weak-point tasks. */
  readinessDelta: number | null;
  /** Where the learner goes when they start this task (cream in-app route). */
  href: string;
  scheduledDate: string; // ISO date (YYYY-MM-DD)
}

/** One calendar day, with its tasks rolled up. */
export interface PlanDayView {
  date: string; // ISO date (YYYY-MM-DD)
  dayOffset: number; // 0 = today
  status: 'past' | 'today' | 'upcoming' | 'exam';
  items: PlanItemView[];
  taskCount: number;
  doneCount: number;
  totalMinutes: number;
  /** Dominant kind for the day's headline (the most-represented task kind). */
  headlineKind: PlanItemKind | null;
}

/** A node on the "Your path to exam day" horizontal stepper. */
export interface PlanMilestone {
  key: string;
  label: string;
  sublabel: string;
  icon: string;
  status: 'done' | 'today' | 'upcoming' | 'exam';
}

export interface ExamPlanView {
  planId: string;
  generatedAt: string; // ISO
  horizonDays: number;
  dailyMinutesTarget: number;
  rationale: string;
  /** True when the rationale + ordering came from Mage (AI), not the fallback. */
  byMage: boolean;
  examTitle: string;
  examDate: string; // ISO
  daysUntil: number;
  readiness: number;
  primaryPathTitle: string | null;
  /** All scheduled days, today-first (excludes the exam day itself). */
  days: PlanDayView[];
  /** Today's tasks (= days[0].items when day 0 is today), convenience copy. */
  today: PlanItemView[];
  milestones: PlanMilestone[];
  counts: { total: number; done: number };
}

// ─── Generation input (db-agnostic; built server-side) ────────────────────────

export interface PlanInputActivity {
  id: string;
  kind: string; // theory | flashcards | quiz
  title: string;
  completed: boolean;
  quizSetId: string | null;
  flashcardSetId: string | null;
  theoryId: string | null;
}

export interface PlanInputSlot {
  id: string;
  title: string;
  kind: string; // learning | review | assessment
  completed: boolean;
  unlocked: boolean;
  bestPercentage: number | null;
  activities: PlanInputActivity[];
}

export interface PlanWeakInput {
  title: string;
  mastery: number;
  band: 'urgent' | 'needs_practice' | 'almost_fixed';
  impactPoints: number;
  sourceType: 'path' | 'quiz_set';
  sourceId: string;
}

export interface PlanGenInput {
  examId: string;
  daysUntil: number;
  readiness: number;
  hasGradedMaterial: boolean;
  format: string | null;
  primaryPathId: string | null;
  primaryPathTitle: string | null;
  slots: PlanInputSlot[];
  weakAreas: PlanWeakInput[];
}

/** A pre-scheduling task candidate (the AI re-orders these; never invents new). */
export interface PlanCandidate {
  id: string; // stable within one generation: 'c0', 'c1', …
  kind: PlanItemKind;
  title: string;
  reason: string;
  estMinutes: number;
  weakPoint: boolean;
  urgency: number | null;
  readinessDelta: number | null;
  /** Bare polymorphic pointer at the real material (persisted, drives `href`). */
  refType: string | null; // 'slot' | 'mock' | null
  refId: string | null;
  href: string;
  /** Deterministic priority (higher = sooner). The AI order overrides this. */
  priority: number;
}

// ─── Pure href / reason derivation (generation- AND read-time, no extra cols) ──

/**
 * Where a task sends the learner — derived purely from stored fields so the read
 * model needn't persist a URL. Slot tasks deep-link to their Exam Mission; mock
 * tasks to the setup screen; weak drills without a slot to the weak-areas board;
 * the final sweep back to the hub.
 */
export function itemHref(
  examId: string,
  kind: PlanItemKind,
  refType: string | null,
  refId: string | null,
): string {
  if (refType === 'slot' && refId) return `/exam/${examId}/mission/${refId}`;
  if (kind === 'mock') return `/exam/${examId}/mock`;
  if (kind === 'final_revision') return `/exam/${examId}`;
  return `/exam/${examId}/weak-areas`;
}

/** Honest task description, reconstructable from stored fields (no live %). */
export function itemReason(kind: PlanItemKind, weakPoint: boolean, urgency: number | null): string {
  if (weakPoint) {
    if (urgency === 3) return 'Your lowest-readiness topic — clear this first.';
    if (urgency === 2) return 'Below your pass mark — a focused drill closes the gap.';
    return 'Almost there — one more pass locks it in.';
  }
  switch (kind) {
    case 'theory':
      return 'New material — build the foundation before you drill.';
    case 'flashcards':
      return 'Lock in the key terms with spaced repetition.';
    case 'quiz':
      return 'Test yourself to surface what’s still shaky.';
    case 'review':
      return 'Refresh what you’ve already passed so it sticks.';
    case 'mock':
      return 'A timed run in the real exam shape.';
    case 'final_revision':
      return 'A full, light sweep the day before.';
  }
}

/** Cap how far out we schedule, even for a distant exam. */
export const MAX_HORIZON_DAYS = 14;
/** A plan never schedules more than this many tasks (anti-runaway). */
export const MAX_PLAN_ITEMS = 40;

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ─── Candidate assembly (deterministic, honest) ───────────────────────────────

/**
 * Turn an exam's scoped material into ranked task candidates. Weak topics become
 * urgent-first drills (with a real `readinessDelta` from their impact); fresh
 * path slots become theory/flashcards/quiz tasks pointing at the real activity;
 * a timed mock + a final-revision sweep cap the run when the exam format and the
 * horizon allow. Returns at most {@link MAX_PLAN_ITEMS}.
 */
export function buildPlanCandidates(input: PlanGenInput): PlanCandidate[] {
  const out: PlanCandidate[] = [];
  const slotByTitle = new Map<string, PlanInputSlot>();
  for (const s of input.slots) slotByTitle.set(slug(s.title), s);
  const examId = input.examId;
  const seenSlots = new Set<string>();

  let n = 0;
  const push = (c: Omit<PlanCandidate, 'id' | 'reason' | 'href'>) => {
    out.push({
      ...c,
      id: `c${n++}`,
      reason: itemReason(c.kind, c.weakPoint, c.urgency),
      href: itemHref(examId, c.kind, c.refType, c.refId),
    });
  };

  // ── 1. Weak topics first — ranked by the readiness they're costing. ──
  for (const w of input.weakAreas) {
    if (out.length >= MAX_PLAN_ITEMS) break;
    const urgency = w.band === 'urgent' ? 3 : w.band === 'needs_practice' ? 2 : 1;

    // Path-sourced weak topics deep-link to their Exam Mission when we can match
    // the topic title to a slot; otherwise fall back to the weak-areas board.
    let refType: string | null = null;
    let refId: string | null = null;
    if (w.sourceType === 'path') {
      const refSlot = slotByTitle.get(slug(w.title));
      if (refSlot) {
        refType = 'slot';
        refId = refSlot.id;
        seenSlots.add(refSlot.id);
      }
    }

    push({
      kind: w.band === 'urgent' ? 'quiz' : 'review',
      title: w.title,
      estMinutes: w.band === 'urgent' ? 14 : 10,
      weakPoint: true,
      urgency,
      readinessDelta: Math.max(0, Math.round(w.impactPoints)) || null,
      refType,
      refId,
      priority: 100 + urgency * 10 + Math.min(20, Math.round(w.impactPoints)),
    });
  }

  // ── 2. Fresh path slots — build the foundation that isn't weak yet. ──
  // Prefer unlocked, not-yet-completed nodes the learner can actually start.
  const freshSlots = input.slots
    .filter((s) => !seenSlots.has(s.id) && !s.completed)
    .sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || a.title.localeCompare(b.title));

  for (const s of freshSlots) {
    if (out.length >= MAX_PLAN_ITEMS) break;
    seenSlots.add(s.id);
    const hasTheory = s.activities.some((a) => a.kind === 'theory');
    const hasCards = s.activities.some((a) => a.kind === 'flashcards');
    const kind: PlanItemKind = hasTheory ? 'theory' : hasCards ? 'flashcards' : 'quiz';
    push({
      kind,
      title: s.title,
      estMinutes: KIND_MINUTES[kind],
      weakPoint: false,
      urgency: null,
      readinessDelta: null,
      refType: 'slot',
      refId: s.id,
      priority: (s.unlocked ? 50 : 30) - Math.min(15, out.length),
    });
  }

  // ── 3. Passed nodes worth a light refresh (only if the run is otherwise thin). ──
  if (out.length < 4) {
    const passed = input.slots.filter((s) => s.completed).slice(0, 4 - out.length);
    for (const s of passed) {
      push({
        kind: 'review',
        title: s.title,
        estMinutes: KIND_MINUTES.review,
        weakPoint: false,
        urgency: null,
        readinessDelta: null,
        refType: 'slot',
        refId: s.id,
        priority: 25,
      });
    }
  }

  // ── 4. A timed mock — rehearse in the real exam shape (needs graded material). ──
  if (input.hasGradedMaterial && input.daysUntil >= 2 && out.length < MAX_PLAN_ITEMS) {
    push({
      kind: 'mock',
      title: 'Timed mock exam',
      estMinutes: KIND_MINUTES.mock,
      weakPoint: false,
      urgency: null,
      readinessDelta: null,
      refType: 'mock',
      refId: null,
      priority: 20,
    });
  }

  // ── 5. Final revision the day before — light, confident sweep. ──
  if (input.daysUntil >= 1 && out.length >= 2 && out.length < MAX_PLAN_ITEMS) {
    push({
      kind: 'final_revision',
      title: 'Final revision sweep',
      estMinutes: KIND_MINUTES.final_revision,
      weakPoint: false,
      urgency: null,
      readinessDelta: null,
      refType: null,
      refId: null,
      priority: 10,
    });
  }

  return out.slice(0, MAX_PLAN_ITEMS);
}

// ─── Deterministic scheduler ──────────────────────────────────────────────────

export interface ScheduledItem extends PlanCandidate {
  dayOffset: number; // 0 = today
  sortOrder: number;
}

/**
 * Distribute ordered candidates across the days from today to the exam, honoring
 * a daily-minutes budget. Weak/urgent items lead, so they land on today; a mock
 * is reserved for ~70% of the way out and final revision for the last study day.
 * Nothing is ever dropped — overflow piles onto the least-loaded day. Pure.
 */
export function schedulePlanItems(
  ordered: PlanCandidate[],
  opts: { daysUntil: number; dailyMinutesTarget: number },
): ScheduledItem[] {
  const examOffset = Math.max(0, opts.daysUntil);
  // Study-day offsets are 0..horizon-1; the exam day itself isn't a study day.
  const horizon = Math.max(1, Math.min(examOffset || 1, MAX_HORIZON_DAYS));
  const budget = Math.max(15, opts.dailyMinutesTarget);
  const dayMinutes = new Array(horizon).fill(0) as number[];
  const placed: ScheduledItem[] = [];

  const lastDay = horizon - 1;
  const mockDay = horizon >= 3 ? Math.max(1, Math.min(lastDay - 1, Math.round(horizon * 0.7))) : lastDay;

  const reserved = (kind: PlanItemKind): number | null => {
    if (kind === 'final_revision') return lastDay;
    if (kind === 'mock') return mockDay;
    return null;
  };

  const earliestFit = (minutes: number): number => {
    for (let d = 0; d < horizon; d++) {
      if (dayMinutes[d] + minutes <= budget) return d;
    }
    // All days full — overflow onto the least-loaded day.
    let best = 0;
    for (let d = 1; d < horizon; d++) if (dayMinutes[d] < dayMinutes[best]) best = d;
    return best;
  };

  for (const c of ordered) {
    const forced = reserved(c.kind);
    const day = forced != null ? forced : earliestFit(c.estMinutes);
    dayMinutes[day] += c.estMinutes;
    placed.push({ ...c, dayOffset: day, sortOrder: 0 });
  }

  // Stable per-day ordering: weak/urgent first, then by priority desc.
  const byDay = new Map<number, ScheduledItem[]>();
  for (const it of placed) {
    const arr = byDay.get(it.dayOffset) ?? [];
    arr.push(it);
    byDay.set(it.dayOffset, arr);
  }
  const result: ScheduledItem[] = [];
  for (const [, arr] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    arr.sort((a, b) => (b.urgency ?? 0) - (a.urgency ?? 0) || b.priority - a.priority);
    arr.forEach((it, i) => result.push({ ...it, sortOrder: i }));
  }
  return result;
}

// ─── Date helpers (date-only, local) ──────────────────────────────────────────

/** ISO date (YYYY-MM-DD) for `base` + `offsetDays`, in local time. */
export function isoDateOffset(base: Date, offsetDays: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Milestones (calendar "path to exam day" stepper) ─────────────────────────

/**
 * Reduce a scheduled plan to ≤5 milestones for the horizontal exam-day stepper:
 * today's focus, the next review, the mock, the final revision, and exam day.
 */
export function deriveMilestones(days: PlanDayView[], examDate: string, daysUntil: number): PlanMilestone[] {
  const all = days.flatMap((d) => d.items.map((it) => ({ it, day: d })));
  const ms: PlanMilestone[] = [];

  const todayItem = all.find((x) => x.day.dayOffset === 0);
  if (todayItem) {
    ms.push({
      key: 'today',
      label: KIND_META[todayItem.it.kind].label,
      sublabel: daysUntil <= 0 ? 'Today' : 'Today',
      icon: KIND_META[todayItem.it.kind].icon,
      status: 'today',
    });
  }
  const review = all.find((x) => x.day.dayOffset > 0 && (x.it.kind === 'review' || x.it.kind === 'flashcards'));
  if (review) {
    ms.push({ key: 'review', label: 'Review', sublabel: weekdayShort(review.day.date), icon: 'replay', status: 'upcoming' });
  }
  const mock = all.find((x) => x.it.kind === 'mock');
  if (mock) {
    ms.push({ key: 'mock', label: 'Mock', sublabel: weekdayShort(mock.day.date), icon: 'timer', status: 'upcoming' });
  }
  const final = all.find((x) => x.it.kind === 'final_revision');
  if (final) {
    ms.push({ key: 'final', label: 'Final revision', sublabel: weekdayShort(final.day.date), icon: 'verified', status: 'upcoming' });
  }
  ms.push({ key: 'exam', label: 'Exam day', sublabel: weekdayShort(examDate), icon: 'flag', status: 'exam' });
  return ms.slice(0, 5);
}

function weekdayShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

// ─── Deterministic rationale (the free-tier "Why this plan") ───────────────────

/** A plain, honest "Why this plan" when Mage (AI) isn't used. No fabrication. */
export function deterministicRationale(input: PlanGenInput, candidates: PlanCandidate[]): string {
  const weak = candidates.filter((c) => c.weakPoint).length;
  const mock = candidates.some((c) => c.kind === 'mock');
  const parts: string[] = [];
  if (weak > 0) {
    parts.push(`I front-loaded your ${weak} weakest topic${weak === 1 ? '' : 's'} so the lowest-readiness material gets the most time`);
  } else {
    parts.push('I ordered fresh material first so you build a foundation before drilling');
  }
  if (mock) parts.push('and saved a timed mock for near the end to rehearse the real exam shape');
  const tail = input.daysUntil >= 1 ? ', with a light final-revision sweep the day before.' : '.';
  return `${parts.join(' ')}${tail}`;
}

// ─── View assembly (shared by generate-in-memory + read-from-db) ──────────────

/** Whole days from `fromIso` to `toIso` (both 'YYYY-MM-DD'); negative if before. */
export function isoDayDiff(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** One persisted (or freshly-scheduled) task row, date-stamped. */
export interface PlanItemRow {
  id: string;
  kind: PlanItemKind;
  title: string;
  estMinutes: number;
  status: PlanItemStatus;
  weakPoint: boolean;
  urgency: number | null;
  readinessDelta: number | null;
  refType: string | null;
  refId: string | null;
  scheduledDate: string; // 'YYYY-MM-DD'
  sortOrder: number;
}

export interface AssemblePlanViewArgs {
  examId: string;
  planId: string;
  generatedAt: string;
  horizonDays: number;
  dailyMinutesTarget: number;
  rationale: string;
  byMage: boolean;
  examTitle: string;
  examDate: string; // ISO
  daysUntil: number;
  readiness: number;
  primaryPathTitle: string | null;
  items: PlanItemRow[];
  /** Today as 'YYYY-MM-DD' (caller supplies — keeps this pure). */
  todayIso: string;
}

/** Build the API/screen view from a plan + its date-stamped items. Pure. */
export function assemblePlanView(args: AssemblePlanViewArgs): ExamPlanView {
  const items = [...args.items].sort(
    (a, b) => (a.scheduledDate < b.scheduledDate ? -1 : a.scheduledDate > b.scheduledDate ? 1 : a.sortOrder - b.sortOrder),
  );

  const dayMap = new Map<string, PlanItemView[]>();
  for (const it of items) {
    const view: PlanItemView = {
      id: it.id,
      kind: it.kind,
      title: it.title,
      reason: itemReason(it.kind, it.weakPoint, it.urgency),
      estMinutes: it.estMinutes,
      status: it.status,
      weakPoint: it.weakPoint,
      urgency: it.urgency,
      readinessDelta: it.readinessDelta,
      href: itemHref(args.examId, it.kind, it.refType, it.refId),
      scheduledDate: it.scheduledDate,
    };
    const arr = dayMap.get(it.scheduledDate) ?? [];
    arr.push(view);
    dayMap.set(it.scheduledDate, arr);
  }

  const days: PlanDayView[] = [...dayMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, dayItems]) => {
      const dayOffset = isoDayDiff(args.todayIso, date);
      const status: PlanDayView['status'] = dayOffset < 0 ? 'past' : dayOffset === 0 ? 'today' : 'upcoming';
      const doneCount = dayItems.filter((i) => i.status === 'done').length;
      const totalMinutes = dayItems.reduce((s, i) => s + i.estMinutes, 0);
      // Dominant kind for the day's headline.
      const counts = new Map<PlanItemKind, number>();
      for (const i of dayItems) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
      let headlineKind: PlanItemKind | null = null;
      let best = 0;
      for (const [k, c] of counts) if (c > best) { best = c; headlineKind = k; }
      return { date, dayOffset, status, items: dayItems, taskCount: dayItems.length, doneCount, totalMinutes, headlineKind };
    });

  const today = days.find((d) => d.dayOffset === 0)?.items ?? [];
  const total = items.length;
  const done = items.filter((i) => i.status === 'done').length;

  return {
    planId: args.planId,
    generatedAt: args.generatedAt,
    horizonDays: args.horizonDays,
    dailyMinutesTarget: args.dailyMinutesTarget,
    rationale: args.rationale,
    byMage: args.byMage,
    examTitle: args.examTitle,
    examDate: args.examDate,
    daysUntil: args.daysUntil,
    readiness: args.readiness,
    primaryPathTitle: args.primaryPathTitle,
    days,
    today,
    milestones: deriveMilestones(days, isoDateOnly(args.examDate), args.daysUntil),
    counts: { total, done },
  };
}

/** ISO date-only ('YYYY-MM-DD') from an ISO datetime or date string. */
export function isoDateOnly(iso: string): string {
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}
