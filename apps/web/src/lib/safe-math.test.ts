import { describe, it, expect } from 'vitest';
import { safeEvaluate, safeParse } from './safe-math';

describe('safe-math — hardened mathjs for untrusted input', () => {
  it('evaluates ordinary arithmetic', () => {
    expect(Number(safeEvaluate('2 + 2'))).toBe(4);
    expect(Number(safeEvaluate('sqrt(16) + 3^2'))).toBe(13);
    expect(Number(safeEvaluate('(1 + 2) * 3 - 4 / 2'))).toBe(7);
  });

  it('parses and evaluates with a variable scope (node.evaluate still works)', () => {
    expect(Number(safeParse('x^2 + 2*x').evaluate({ x: 3 }))).toBe(15);
    expect(Number(safeParse('a*b + c').evaluate({ a: 2, b: 5, c: 1 }))).toBe(11);
  });

  // The disabled functions are the load-arbitrary-JS / re-entry vectors. A
  // numeric answer never needs them, so they must throw when an expression
  // tries to call them.
  it.each(['import("fs")', 'createUnit("zzz")', 'evaluate("1+1")', 'simplify("x")', 'resolve("x")'])(
    'disables dangerous function: %s',
    (expr) => {
      expect(() => safeEvaluate(expr)).toThrow();
    }
  );

  // CVE-2026-40897-class payloads reach the Function constructor through the
  // parser. The mathjs >= 15.2.0 upgrade patches the known vector; this asserts
  // the result never escapes to a callable or the Node process handle, whether
  // the parser throws (expected) or returns something inert.
  it.each([
    'cos.constructor("return process")()',
    '[].map.constructor("return process")()',
    'cos.constructor("return process.mainModule.require")()("child_process")',
  ])('never leaks a callable or process handle via: %s', (expr) => {
    let threw = false;
    let value: unknown;
    try {
      value = safeEvaluate(expr);
    } catch {
      threw = true;
    }
    expect(threw || (typeof value !== 'function' && value !== process)).toBe(true);
  });
});
