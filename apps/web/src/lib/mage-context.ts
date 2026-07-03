/**
 * Mage Revolution — server-side context expansion (Phase 1).
 *
 * Takes the thin context the client sends, RE-AUTHORIZES every id against the
 * requesting `userId` (dropping any the user doesn't own), and derives the
 * server-authoritative `assistancePolicy` + `allowedActions`. The pure pieces
 * live in `mage-types.ts` so the client can import them without dragging `db`
 * into the bundle; the db-backed ownership checks stay here.
 *
 * Phase 1 stops at authorization + derivation: it does NOT yet resolve ids into
 * grounding material (Phase 2) — the route delegates to `startChatStream` as a
 * plain chat for now.
 */

import { db } from './db';
import { tiptapJsonToPlainText } from './contentConverter';
import type { TierKey } from './tiers';
import {
  applyModeGate,
  deriveAllowedActions,
  deriveAssistancePolicy,
  deriveRevealGate,
  MAGE_CONTEXT_TYPES,
  MAGE_MODES,
  type MageClientContext,
  type MageContextIds,
  type MageContextType,
  type MageGroundingSource,
  type MageMode,
  type ResolvedMageContext,
} from './mage-types';

/**
 * Ownership predicates — one per id kind. Injected so the security-critical
 * authorization is unit-testable without a live database (mirrors the pattern
 * in `quiz-grading.test.ts`). Each returns true iff `id` belongs to `userId`.
 */
export interface MageOwnershipLookup {
  ownsNotebook(id: string): Promise<boolean>;
  ownsPath(id: string): Promise<boolean>;
  ownsExam(id: string): Promise<boolean>;
  ownsQuizSet(id: string): Promise<boolean>;
  ownsPage(id: string): Promise<boolean>;
  ownsSlot(id: string): Promise<boolean>;
}

/** The real lookup: a cheap `select: { id: true }` existence check per id. */
export function dbOwnershipLookup(userId: string): MageOwnershipLookup {
  return {
    ownsNotebook: (id) =>
      db.studyContainer.findFirst({ where: { id, userId }, select: { id: true } }).then(Boolean),
    ownsPath: (id) =>
      db.studyPlan.findFirst({ where: { id, userId }, select: { id: true } }).then(Boolean),
    ownsExam: (id) =>
      db.exam.findFirst({ where: { id, userId }, select: { id: true } }).then(Boolean),
    ownsQuizSet: (id) =>
      db.quizSet.findFirst({ where: { id, userId }, select: { id: true } }).then(Boolean),
    // Page → Section → Notebook → user.
    ownsPage: (id) =>
      db.page
        .findFirst({ where: { id, section: { notebook: { userId } } }, select: { id: true } })
        .then(Boolean),
    // CheckpointSlot → StudyPhase → StudyPlan → user.
    ownsSlot: (id) =>
      db.checkpointSlot
        .findFirst({ where: { id, phase: { plan: { userId } } }, select: { id: true } })
        .then(Boolean),
  };
}

/**
 * Grounding loaders — one per id kind, each resolving an ALREADY-AUTHORIZED id
 * into a single source. Injected so the resolution is unit-testable without a
 * live database (mirrors `MageOwnershipLookup`). Every loader returns null when
 * the id has no usable text (a review slot with no theory, an empty page, …).
 */
export interface MageGroundingLoader {
  slotTheory(slotId: string): Promise<MageGroundingSource | null>;
  page(pageId: string): Promise<MageGroundingSource | null>;
  studyPackOutline(notebookId: string): Promise<MageGroundingSource | null>;
  pathOutline(pathId: string): Promise<MageGroundingSource | null>;
  examSummary(examId: string): Promise<MageGroundingSource | null>;
  quizOutline(quizSetId: string): Promise<MageGroundingSource | null>;
}

// Per-source ceiling. chat-stream still applies the global MAX_CONTEXT_CHARS to
// the joined corpus; this just stops one giant theory body from crowding out the
// rest of the context before that cut.
const GROUNDING_TEXT_CAP = 16_000;

function capText(text: string, max = GROUNDING_TEXT_CAP): string {
  return text.length > max ? text.slice(0, max) : text;
}

/**
 * The real grounding loader. Every query is RE-SCOPED to `userId` (defence in
 * depth) even though `resolveMageGrounding` only ever sees ids already
 * authorized by `expandMageContext`.
 */
export function dbGroundingLoader(userId: string): MageGroundingLoader {
  return {
    // slotId → the slot's theory activity body (the lesson the learner is on).
    // Null for review/assessment slots that carry no theory.
    async slotTheory(slotId) {
      const slot = await db.checkpointSlot.findFirst({
        where: { id: slotId, phase: { plan: { userId } } },
        select: {
          title: true,
          phase: { select: { plan: { select: { title: true } } } },
          activities: {
            where: { kind: 'theory' },
            select: { theory: { select: { title: true, body: true } } },
          },
        },
      });
      if (!slot) return null;
      const theory = slot.activities.find((a) => a.theory)?.theory;
      if (!theory) return null;
      const text = tiptapJsonToPlainText(theory.body);
      if (!text) return null;
      return {
        kind: 'theory',
        title: theory.title || slot.title,
        text: capText(text),
        subtitle: slot.phase?.plan?.title || undefined,
        href: `/lesson/${slotId}`,
      };
    },

    // pageId → a study-pack note's plain text (lazy-converts TipTap if the
    // mirror is empty, but never persists — that's chat-stream's job).
    async page(pageId) {
      const page = await db.page.findFirst({
        where: { id: pageId, section: { notebook: { userId } } },
        select: {
          title: true,
          textContent: true,
          content: true,
          // Phase-3 provenance — populated by the PDF importer.
          sourceDocPage: true,
          section: { select: { notebook: { select: { id: true, name: true } } } },
        },
      });
      if (!page) return null;
      const text = page.textContent || tiptapJsonToPlainText(page.content) || '';
      if (!text.trim()) return null;
      const nb = page.section?.notebook;
      return {
        kind: 'page',
        title: page.title,
        text: capText(text),
        subtitle: nb?.name || undefined,
        pageLabel: page.sourceDocPage ? `page ${page.sourceDocPage}` : undefined,
        // Source-highlighting — the chip opens this page's origin (PDF page /
        // video / text) in the source viewer. The resolve route derives the
        // media type from the page id at click time.
        anchor: {
          materialId: pageId,
          materialKind: 'page',
          page: page.sourceDocPage ?? undefined,
        },
      };
    },

    // notebookId → a cheap OUTLINE of the pack (note + document titles), not a
    // full dump. Enough for "what's in this pack?"; deep retrieval is Phase 4.
    async studyPackOutline(notebookId) {
      const nb = await db.studyContainer.findFirst({
        where: { id: notebookId, userId },
        select: {
          name: true,
          documents: { select: { fileName: true }, take: 60 },
          sections: {
            take: 60,
            select: { pages: { select: { title: true }, take: 60 } },
          },
        },
      });
      if (!nb) return null;
      const pageTitles = nb.sections.flatMap((s) => s.pages.map((p) => p.title));
      const docTitles = nb.documents.map((d) => d.fileName);
      const lines: string[] = [];
      if (pageTitles.length) lines.push(`Notes: ${pageTitles.slice(0, 80).join(', ')}`);
      if (docTitles.length) lines.push(`Documents: ${docTitles.slice(0, 80).join(', ')}`);
      if (!lines.length) return null;
      return {
        kind: 'study-pack',
        title: nb.name,
        text: `This study pack contains:\n${lines.join('\n')}`,
      };
    },

    // pathId → an OUTLINE of the path (goal + phase/checkpoint titles). Only
    // used when NOT focused on a single lesson (see resolveMageGrounding).
    async pathOutline(pathId) {
      const plan = await db.studyPlan.findFirst({
        where: { id: pathId, userId },
        select: {
          title: true,
          description: true,
          phases: {
            orderBy: { sortOrder: 'asc' },
            take: 40,
            select: {
              title: true,
              slots: { orderBy: { sortOrder: 'asc' }, take: 60, select: { title: true } },
            },
          },
        },
      });
      if (!plan) return null;
      const outline = plan.phases
        .map((ph) => {
          const slots = ph.slots.map((s) => `  - ${s.title}`).join('\n');
          return slots ? `${ph.title}\n${slots}` : ph.title;
        })
        .join('\n');
      const head = plan.description ? `${plan.description.trim()}\n\n` : '';
      const text = `${head}Checkpoints:\n${outline}`.trim();
      if (!text) return null;
      return { kind: 'path', title: plan.title, text: capText(text), href: `/learn/paths/${pathId}` };
    },

    // examId → a one-line summary (title + date + backing pack). This is the
    // STABLE, cacheable grounding text: the volatile readiness/countdown rides
    // in the separate uncached study-state block (see formatExamStudyState),
    // never here, so a changing readiness can't bust the 1h corpus cache (R2).
    async examSummary(examId) {
      const exam = await db.exam.findFirst({
        where: { id: examId, userId },
        select: { title: true, examDate: true, notebook: { select: { name: true } } },
      });
      if (!exam) return null;
      const when = exam.examDate.toISOString().slice(0, 10);
      const pack = exam.notebook?.name ? ` It is backed by the "${exam.notebook.name}" study pack.` : '';
      return {
        kind: 'exam',
        title: exam.title,
        text: `Exam "${exam.title}" is scheduled for ${when}.${pack}`,
        subtitle: exam.notebook?.name || undefined,
        // The exam overview surface (Phase 5) — readiness + scope editor.
        href: `/exam/${examId}`,
      };
    },

    // quizSetId → title + count ONLY. Never the questions/answers — the model
    // must not leak a quiz it's sitting next to; the reveal gate is Phase 8.
    async quizOutline(quizSetId) {
      const set = await db.quizSet.findFirst({
        where: { id: quizSetId, userId },
        select: { title: true, notebookId: true, _count: { select: { questions: true } } },
      });
      if (!set) return null;
      const n = set._count.questions;
      return {
        kind: 'quiz',
        title: set.title,
        text: `Quiz "${set.title}" has ${n} question${n === 1 ? '' : 's'}. Do NOT reveal the answers; help the learner reason it out instead.`,
        // Runs in the shared practice player; null for inbox/path bundles.
        href: set.notebookId ? `/practice/session/${set.notebookId}/${quizSetId}` : undefined,
      };
    },
  };
}

/**
 * Resolve ALREADY-AUTHORIZED context ids into grounding sources. `ids` must be
 * the `ResolvedMageContext.ids` returned by `expandMageContext` — every id here
 * has been ownership-checked, so the loaders only fetch content. A failing
 * loader drops its source (fail-soft); the turn still streams.
 *
 * When a lesson is in focus (`slotId` present), the path outline is skipped so
 * the lesson theory leads the corpus block instead of being buried under the
 * whole-path skeleton.
 */
export async function resolveMageGrounding(
  ids: MageContextIds,
  loader: MageGroundingLoader
): Promise<MageGroundingSource[]> {
  const tasks: Promise<MageGroundingSource | null>[] = [];
  if (ids.slotId) tasks.push(loader.slotTheory(ids.slotId));
  if (ids.pageId) tasks.push(loader.page(ids.pageId));
  if (ids.notebookId) tasks.push(loader.studyPackOutline(ids.notebookId));
  if (ids.pathId && !ids.slotId) tasks.push(loader.pathOutline(ids.pathId));
  if (ids.examId) tasks.push(loader.examSummary(ids.examId));
  if (ids.quizSetId) tasks.push(loader.quizOutline(ids.quizSetId));

  const settled = await Promise.all(tasks.map((t) => t.catch(() => null)));
  return settled.filter((s): s is MageGroundingSource => s !== null);
}

const CONTEXT_TYPE_SET: ReadonlySet<string> = new Set(MAGE_CONTEXT_TYPES);
const MODE_SET: ReadonlySet<string> = new Set(MAGE_MODES);

function normalizeType(value: unknown): MageContextType {
  return typeof value === 'string' && CONTEXT_TYPE_SET.has(value)
    ? (value as MageContextType)
    : 'global';
}

function normalizeMode(value: unknown): MageMode {
  return typeof value === 'string' && MODE_SET.has(value) ? (value as MageMode) : 'quick';
}

function cap(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/**
 * Resolve + authorize a client context. Never throws on a bad id — an
 * unauthorized or failing lookup simply drops that id. The returned `ids`
 * contain ONLY ids the user owns.
 */
export async function expandMageContext(
  userId: string,
  raw: MageClientContext | null | undefined,
  opts: { tier: TierKey; lookup?: MageOwnershipLookup }
): Promise<ResolvedMageContext> {
  const lookup = opts.lookup ?? dbOwnershipLookup(userId);
  const type = normalizeType(raw?.type);
  const mode = normalizeMode(raw?.mode);
  const rawIds: MageContextIds = raw?.ids ?? {};

  const authorized: MageContextIds = {};
  const checks: Promise<void>[] = [];
  const want = (key: keyof MageContextIds, owns: (id: string) => Promise<boolean>) => {
    const val = rawIds[key];
    if (typeof val !== 'string' || val.length === 0) return;
    checks.push(
      owns(val)
        .then((ok) => {
          if (ok) authorized[key] = val;
        })
        // A failed lookup is treated as "not owned" — fail closed, never throw.
        .catch(() => {})
    );
  };

  want('notebookId', lookup.ownsNotebook);
  want('pathId', lookup.ownsPath);
  want('examId', lookup.ownsExam);
  want('quizSetId', lookup.ownsQuizSet);
  want('pageId', lookup.ownsPage);
  want('slotId', lookup.ownsSlot);
  await Promise.all(checks);

  const isPro = opts.tier !== 'FREE';
  const assistancePolicy = deriveAssistancePolicy(type);

  return {
    type,
    ids: authorized,
    title: cap(raw?.title, 200),
    selectedText: cap(raw?.selectedText, 4000),
    activeQuestionId: typeof raw?.activeQuestionId === 'string' ? raw.activeQuestionId : undefined,
    questionContext: cap(raw?.questionContext, 2000),
    mode,
    assistancePolicy,
    // Phase 8 — structural gate, derived from the policy (never client-claimed).
    // Phase 9 — strict mode tightens it a notch (open → hint_only) via
    // applyModeGate; quick / deep leave the policy gate untouched.
    revealGate: applyModeGate(deriveRevealGate(assistancePolicy), mode),
    allowedActions: deriveAllowedActions(type, authorized, isPro),
  };
}
