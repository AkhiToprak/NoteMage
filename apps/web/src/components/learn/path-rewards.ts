// Shape returned by the activity-completion + assessment routes when finishing
// an activity newly unlocks one or more achievements. Surfaced up from the
// checkpoint viewers so the path page can celebrate (e.g. the tutorial's
// first-section RewardTakeover).

export interface PathUnlock {
  badge: string;
  name: string;
  /** Cosmetic slugs granted by the achievement (catalog ids). */
  cosmetics: string[];
}

/** Extract the unlocked array from a completion API response body, if present. */
export function readUnlocked(body: unknown): PathUnlock[] {
  const data = (body as { data?: { unlocked?: unknown } } | null)?.data;
  const raw = data?.unlocked;
  return Array.isArray(raw) ? (raw as PathUnlock[]) : [];
}
