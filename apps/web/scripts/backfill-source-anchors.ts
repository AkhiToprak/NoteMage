/**
 * Optional one-off backfill (source-highlighting feature): populate
 * `sourceMaterialId` / `sourceMaterialKind` on EXISTING quiz questions that carry
 * a `sourceLabel` (written before this feature) but no resolved material
 * identity. It re-matches the label against the question's path corpus
 * (StudyPlan.materialIds) exactly the way generation now does at write time —
 * so a backfilled row resolves in the source viewer identically to a freshly
 * generated one.
 *
 * Quiz-only by design: theory/flashcard `sourceLabel` columns are new, so legacy
 * theory/flashcard rows have no label to match. New rows already get identity
 * stamped at generation time — this only heals pre-feature quiz rows.
 *
 * Read-only by default. Connects to whatever DATABASE_URL points at — the banner
 * prints the host so you can confirm the target before --apply.
 *
 *   npx tsx scripts/backfill-source-anchors.ts            # report only (read-only)
 *   npx tsx scripts/backfill-source-anchors.ts --apply    # write the matches
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const APPLY = process.argv.includes('--apply');

function dbHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? '').host || '(unknown)';
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

// Mirrors normalizeSourceLabel in src/lib/path-corpus.ts — KEEP IN SYNC so the
// backfill matches generation-time resolution exactly.
function normLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

type MaterialRef = { id: string; kind: 'page' | 'document' };

// Mirrors buildSourceIdentityIndex: page/document titles → id, first-wins on a
// title collision (same as generation).
async function buildIndex(userId: string, materialIds: string[]): Promise<Map<string, MaterialRef>> {
  const index = new Map<string, MaterialRef>();
  if (materialIds.length === 0) return index;
  const [pages, docs] = await Promise.all([
    db.page.findMany({
      where: { id: { in: materialIds }, section: { notebook: { userId } } },
      select: { id: true, title: true },
    }),
    db.document.findMany({
      where: { id: { in: materialIds }, notebook: { userId } },
      select: { id: true, fileName: true },
    }),
  ]);
  for (const p of pages) {
    const k = normLabel(p.title);
    if (k && !index.has(k)) index.set(k, { id: p.id, kind: 'page' });
  }
  for (const d of docs) {
    const k = normLabel(d.fileName);
    if (k && !index.has(k)) index.set(k, { id: d.id, kind: 'document' });
  }
  return index;
}

async function main() {
  console.log(`DB: ${dbHost()}   mode: ${APPLY ? 'APPLY (writing)' : 'dry-run (read-only)'}`);

  const candidates = await db.quizQuestion.findMany({
    where: { sourceLabel: { not: null }, sourceMaterialId: null },
    select: { id: true, sourceLabel: true, quizSet: { select: { sourcePathId: true } } },
  });
  console.log(`Quiz questions with a label but no material id: ${candidates.length}`);

  // Group candidates by their path so each corpus index is built once.
  const byPath = new Map<string, { id: string; label: string }[]>();
  let noPath = 0;
  for (const q of candidates) {
    const pid = q.quizSet?.sourcePathId;
    if (!pid || !q.sourceLabel) {
      noPath++;
      continue;
    }
    const arr = byPath.get(pid) ?? [];
    arr.push({ id: q.id, label: q.sourceLabel });
    byPath.set(pid, arr);
  }

  let matched = 0;
  let unmatched = 0;
  let missingPlans = 0;

  for (const [pid, qs] of byPath) {
    const plan = await db.studyPlan.findUnique({
      where: { id: pid },
      select: { userId: true, materialIds: true },
    });
    if (!plan) {
      missingPlans++;
      unmatched += qs.length;
      continue;
    }
    const index = await buildIndex(plan.userId, plan.materialIds);
    for (const q of qs) {
      const ref = index.get(normLabel(q.label));
      if (!ref) {
        unmatched++;
        continue;
      }
      matched++;
      if (APPLY) {
        await db.quizQuestion.update({
          where: { id: q.id },
          data: { sourceMaterialId: ref.id, sourceMaterialKind: ref.kind },
        });
      }
    }
  }

  console.log(
    `Matched: ${matched}   Unmatched: ${unmatched}   No source path: ${noPath}   Missing plans: ${missingPlans}`,
  );
  if (!APPLY && matched > 0) {
    console.log('Re-run with --apply to write these matches.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
