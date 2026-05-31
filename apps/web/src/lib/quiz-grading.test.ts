import { describe, it, expect } from 'vitest';
import { grade, type LegacyMcColumns } from './quiz-grading';

// Equation rows carry their answer key on `payload`; the legacy MC columns are
// unused, so a sentinel suffices.
const NO_LEGACY: LegacyMcColumns = { options: [], correctIndex: 0 };

describe('grade() — equation kind', () => {
  it('marks a numerically-correct constant answer correct', () => {
    const r = grade('equation', { expectedExpression: '2 + 2' }, NO_LEGACY, {
      kind: 'equation',
      expression: '1 + 3',
    });
    expect(r.isCorrect).toBe(true);
  });

  it('marks a wrong constant answer incorrect', () => {
    const r = grade('equation', { expectedExpression: '2 + 2' }, NO_LEGACY, {
      kind: 'equation',
      expression: '5',
    });
    expect(r.isCorrect).toBe(false);
  });

  it('accepts an algebraically-equivalent answer via variable sampling', () => {
    const r = grade(
      'equation',
      { expectedExpression: 'x*(x + 2)', variables: ['x'] },
      NO_LEGACY,
      { kind: 'equation', expression: 'x^2 + 2*x' }
    );
    expect(r.isCorrect).toBe(true);
  });

  it('rejects a non-equivalent answer with variables', () => {
    const r = grade(
      'equation',
      { expectedExpression: 'x*(x + 2)', variables: ['x'] },
      NO_LEGACY,
      { kind: 'equation', expression: 'x^2 + 3*x' }
    );
    expect(r.isCorrect).toBe(false);
  });

  it('treats a sandbox-escape answer as a wrong answer (no execution)', () => {
    const r = grade('equation', { expectedExpression: '2 + 2' }, NO_LEGACY, {
      kind: 'equation',
      expression: 'cos.constructor("return process")()',
    });
    expect(r.isCorrect).toBe(false);
  });

  it('treats a disabled-function answer as a wrong answer', () => {
    const r = grade(
      'equation',
      { expectedExpression: 'x + 1', variables: ['x'] },
      NO_LEGACY,
      { kind: 'equation', expression: 'import("child_process")' }
    );
    expect(r.isCorrect).toBe(false);
  });
});
