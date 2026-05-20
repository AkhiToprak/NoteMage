// P10 — translatable snapshot loader. Single source of truth for what
// the translation flow sees of a SharedPath. Mirrors the
// `loadSharedPathSnapshot` shape from moderation L1 — the same surface
// (title + description + phase + slot titles/descriptions) the detail
// page renders, so the cached translation is exactly what the user sees.
//
// Why a separate loader from the L1 one: L1 cares about scanning every
// translatable token for a wordlist match — including theory body,
// flashcard fronts/backs, quiz prompts. Translation cares only about
// the public detail-page surface (AC-Browse-6 — phase + slot titles
// only). Loading the deeper surface here would pay a token budget for
// content we don't translate.

import { db } from '@/lib/db';
import type { TranslatableSnapshot } from './prompt';

/**
 * Load the translatable surface for a SharedPath. Returns null when the
 * row is missing or not approved — callers (the route handler) should
 * 404 on null without distinguishing the two cases (same existence-leak
 * policy as the rest of the path-publishing surface).
 *
 * The runner pre-fills `sourceLanguage` from `SharedPath.language` and
 * passes the caller-supplied `targetLanguage` directly through.
 */
export async function loadTranslatableSnapshot(
  sharedPathId: string,
  targetLanguage: string,
): Promise<TranslatableSnapshot | null> {
  const sharedPath = await db.sharedPath.findUnique({
    where: { id: sharedPathId },
    select: {
      id: true,
      planId: true,
      moderationStatus: true,
      language: true,
      title: true,
      description: true,
    },
  });
  if (!sharedPath || sharedPath.moderationStatus !== 'approved') {
    return null;
  }

  const phases = await db.studyPhase.findMany({
    where: { planId: sharedPath.planId },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      title: true,
      description: true,
      sortOrder: true,
      slots: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
        },
      },
    },
  });

  return {
    sourceLanguage: sharedPath.language,
    targetLanguage,
    title: sharedPath.title,
    description: sharedPath.description,
    phases: phases.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      slots: p.slots.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
      })),
    })),
  };
}
