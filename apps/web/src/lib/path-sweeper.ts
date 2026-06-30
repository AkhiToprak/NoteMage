import { db } from './db';
import { enqueueJob } from './background-jobs';
import { staleGenerationCutoff } from './path-loader';

/**
 * Boot-time recovery for paths wedged in `generating` with a DEAD orchestrator —
 * the [[stuck_generating_path_recovery]] failure mode: a process killed mid-run
 * (e.g. a Coolify redeploy) leaves the row `generating` forever, and previously
 * the user had to click Regenerate by hand. This re-enqueues a `path.regenerate`
 * job for each stale row so generation RESUMES automatically (runGenerationPass
 * is idempotent — it skips already-built slots).
 *
 * Safety:
 *  - Uses `path.regenerate` (never `path.generate`), so it can NEVER trigger the
 *    ultra-credit refund — that's owned exclusively by the original create job.
 *  - The exact `generating` match excludes a path mid-cancel (`cancelling`); a
 *    cancel that lands AFTER re-enqueue is caught by the re-run's first cancel
 *    checkpoint (isCancelRequested), which deletes the path cleanly.
 *  - `enqueueJob` is dedupe-keyed (same key the regenerate route uses), so if a
 *    live job already exists for the plan this is a no-op — no double-run.
 *  - Only STALE rows (updatedAt < cutoff) are touched, so an actively-generating
 *    path (fresh updatedAt, writer alive) is never disturbed.
 *
 * Run once at worker boot — a redeploy means a new process + a fresh boot, which
 * is exactly when killed in-flight runs need reviving.
 */
export async function recoverStalePaths(): Promise<void> {
  const stale = await db.studyPlan.findMany({
    where: { generationStatus: 'generating', updatedAt: { lt: staleGenerationCutoff() } },
    select: { id: true },
  });
  if (stale.length === 0) return;
  console.info(`[worker] recovering ${stale.length} stale generating path(s)`);
  for (const { id: planId } of stale) {
    try {
      await enqueueJob('path.regenerate', { planId }, { dedupeKey: `path:generate:${planId}` });
      console.info(`[worker] re-enqueued stale path ${planId}`);
    } catch (error) {
      console.warn(`[worker] failed to re-enqueue stale path ${planId}`, error);
    }
  }
}
