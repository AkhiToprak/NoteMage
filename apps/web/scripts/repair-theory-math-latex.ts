/**
 * Migration: repair JSON-escape-collapsed LaTeX in already-generated path
 * theory.
 *
 * Path theory is stored as a TipTap JSON document in `TheoryContent.body`.
 * `inlineMath` / `blockMath` nodes carry their LaTeX on `attrs.latex`. Before
 * the generator was hardened, single-backslash LaTeX from the model collapsed
 * during JSON parsing (\t -> TAB, \r -> CR, ...), so stored `latex` values
 * contain control characters that KaTeX renders as literal letters
 * ("ext", "ightarrow"). This walks every TheoryContent row and rewrites the
 * affected `latex` attrs using the same `repairMathLatex` helper the generator
 * now applies at ingestion.
 *
 * Dry-run by default (reports what WOULD change). Pass `--apply` to write.
 *
 *   npx tsx scripts/repair-theory-math-latex.ts          # dry run
 *   npx tsx scripts/repair-theory-math-latex.ts --apply  # persist repairs
 */

import { PrismaClient } from '@prisma/client';
import { repairMathLatex, looksLikeCorruptedLatex } from '../src/lib/math-latex-repair';

const db = new PrismaClient();
const APPLY = process.argv.includes('--apply');

interface MathNode {
  type?: string;
  attrs?: { latex?: unknown } | null;
  content?: MathNode[] | null;
}

// Repair math nodes in place. Returns the number of latex attrs changed.
function repairDoc(node: MathNode | null | undefined): number {
  if (!node || typeof node !== 'object') return 0;
  let changed = 0;
  if (
    (node.type === 'inlineMath' || node.type === 'blockMath') &&
    node.attrs &&
    typeof node.attrs.latex === 'string'
  ) {
    const before = node.attrs.latex;
    if (looksLikeCorruptedLatex(before)) {
      const after = repairMathLatex(before);
      if (after !== before) {
        node.attrs.latex = after;
        changed += 1;
      }
    }
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) changed += repairDoc(child);
  }
  return changed;
}

async function main() {
  console.log(`Theory math-LaTeX repair — ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  const rows = await db.theoryContent.findMany({ select: { id: true, title: true, body: true } });
  console.log(`Scanning ${rows.length} theory records...\n`);

  let affectedRows = 0;
  let totalFixes = 0;

  for (const row of rows) {
    if (!row.body || typeof row.body !== 'object') continue;
    const doc = JSON.parse(JSON.stringify(row.body)) as MathNode;
    const fixes = repairDoc(doc);
    if (fixes === 0) continue;

    affectedRows += 1;
    totalFixes += fixes;
    console.log(`  ${row.id} "${row.title}" — ${fixes} math node(s)`);

    if (APPLY) {
      await db.theoryContent.update({
        where: { id: row.id },
        data: { body: doc as object },
      });
    }
  }

  console.log(
    `\n${APPLY ? 'Repaired' : 'Would repair'} ${totalFixes} math node(s) across ${affectedRows} theory record(s).`,
  );
  if (!APPLY && affectedRows > 0) console.log('Re-run with --apply to persist.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
