// Validate-and-repair loop for structured AI output — the shared reliability
// railing. Lives in its own dependency-free module so BOTH the onboarding
// preview (path-preview.ts) and the full Stage-B generators (path-generator.ts)
// can use it without an import cycle (path-preview imports from path-generator).
//
// Pattern (research: Try-Check-Retry, +25% tool-call accuracy): call → validate
// → on failure re-call ONCE more with the SPECIFIC failure summary folded back
// in as a corrective notice. Two attempts capture 76–95% of achievable gains;
// past that, decompose the task rather than retry.

/** First try + one repair by default. */
export const DEFAULT_REPAIR_ATTEMPTS = 2;

export interface RepairResult<T> {
  /** Validated artifact, or null after every attempt missed. */
  data: T | null;
  attempts: number;
  lastError: string | null;
}

/**
 * Run a structured model call through validate-and-repair: call → validate →
 * (on failure) re-call with the prior failure summary folded back in as a
 * corrective notice. Generic so any artifact (theory, flashcards, quiz, …)
 * reuses it. Returns `data: null` once `attempts` are spent — the caller decides
 * the fallback.
 */
export async function generateWithRepair<T>(opts: {
  /** Total attempts incl. the first (default 2 = one repair). */
  attempts?: number;
  /** Perform the model call. `corrective` is null on the first attempt and the
   *  prior failure summary on a repair — fold it into the prompt tail. */
  call: (corrective: string | null) => Promise<unknown>;
  /** Validate + normalize the raw model output. */
  parse: (raw: unknown) => { ok: true; data: T } | { ok: false; error: string };
}): Promise<RepairResult<T>> {
  const max = Math.max(1, opts.attempts ?? DEFAULT_REPAIR_ATTEMPTS);
  let corrective: string | null = null;
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      const raw = await opts.call(corrective);
      const parsed = opts.parse(raw);
      if (parsed.ok) return { data: parsed.data, attempts: attempt, lastError: null };
      lastError = parsed.error;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    corrective = lastError;
  }
  return { data: null, attempts: max, lastError };
}
