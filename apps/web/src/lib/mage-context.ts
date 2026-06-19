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
import type { TierKey } from './tiers';
import {
  deriveAllowedActions,
  deriveAssistancePolicy,
  MAGE_CONTEXT_TYPES,
  MAGE_MODES,
  type MageClientContext,
  type MageContextIds,
  type MageContextType,
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
      db.notebook.findFirst({ where: { id, userId }, select: { id: true } }).then(Boolean),
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

  return {
    type,
    ids: authorized,
    title: cap(raw?.title, 200),
    selectedText: cap(raw?.selectedText, 4000),
    activeQuestionId: typeof raw?.activeQuestionId === 'string' ? raw.activeQuestionId : undefined,
    mode,
    assistancePolicy: deriveAssistancePolicy(type),
    allowedActions: deriveAllowedActions(type, authorized, isPro),
  };
}
