export type GoalKey =
  | 'dailyStudyMinutesGoal'
  | 'weeklyStudyPlansGoal'
  | 'weeklyNotesGoal'
  | 'weeklyChatsGoal';

const GOAL_KEYS: readonly GoalKey[] = [
  'dailyStudyMinutesGoal',
  'weeklyStudyPlansGoal',
  'weeklyNotesGoal',
  'weeklyChatsGoal',
] as const;

const GOAL_BOUNDS: Record<GoalKey, { min: number; max: number }> = {
  dailyStudyMinutesGoal: { min: 1, max: 1440 },
  weeklyStudyPlansGoal: { min: 1, max: 100 },
  weeklyNotesGoal: { min: 1, max: 1000 },
  weeklyChatsGoal: { min: 1, max: 1000 },
};

export function validateGoals(
  input: unknown
): { ok: true; data: Partial<Record<GoalKey, number | null>> } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'goals must be an object' };
  }
  const out: Partial<Record<GoalKey, number | null>> = {};
  for (const key of GOAL_KEYS) {
    if (!(key in (input as Record<string, unknown>))) continue;
    const raw = (input as Record<string, unknown>)[key];
    if (raw === null) {
      out[key] = null;
      continue;
    }
    if (typeof raw !== 'number' || !Number.isInteger(raw)) {
      return { ok: false, error: `${key} must be an integer or null` };
    }
    const { min, max } = GOAL_BOUNDS[key];
    if (raw < min || raw > max) {
      return { ok: false, error: `${key} must be between ${min} and ${max}` };
    }
    out[key] = raw;
  }
  return { ok: true, data: out };
}
