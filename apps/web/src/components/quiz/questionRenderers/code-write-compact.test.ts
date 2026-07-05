import { describe, it, expect } from 'vitest';
import { compactRuns } from './CodeWriteRenderer';

// compactRuns builds the compact runs the Mage serializer reads. Two load-bearing
// facts: `ok` reflects the GRADED verdict (`isCorrect`), not the "ran without
// crashing" `ok`; and long fields are truncated so the answer stays small.
describe('compactRuns', () => {
  it('maps isCorrect → ok (graded verdict, not the raw ok)', () => {
    const [passed, failed] = compactRuns([
      // ran fine (ok:true) but output was wrong (isCorrect:false) → FAIL verdict.
      { name: 't1', stdout: 'x', stderr: '', exitCode: 0, ok: true, isCorrect: false, durationMs: 1 },
      // ran fine and output matched → PASS.
      { name: 't2', stdout: 'y', stderr: '', exitCode: 0, ok: true, isCorrect: true, durationMs: 1 },
    ]);
    expect(passed.ok).toBe(false);
    expect(failed.ok).toBe(true);
  });

  it('falls back to ok when isCorrect is absent (practice run)', () => {
    const [r] = compactRuns([{ stdout: '', stderr: '', exitCode: 0, ok: true, durationMs: 1 }]);
    expect(r.ok).toBe(true);
  });

  it('truncates long fields to keep the answer small', () => {
    const huge = 'a'.repeat(1000);
    const [r] = compactRuns([{ stdout: huge, stderr: '', exitCode: 0, ok: true, isCorrect: true, durationMs: 1 }]);
    expect(r.stdout!.length).toBe(400);
  });

  it('caps the number of runs', () => {
    const many = Array.from({ length: 20 }, () => ({ stdout: '', stderr: '', exitCode: 0, ok: true, durationMs: 1 }));
    expect(compactRuns(many)).toHaveLength(12);
  });
});
