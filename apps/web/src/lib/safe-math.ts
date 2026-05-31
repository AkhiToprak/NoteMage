// Hardened mathjs instance for evaluating UNTRUSTED user input.
//
// mathjs's expression parser has a recurring history of sandbox-escape
// vulnerabilities (most recently CVE-2026-40897) where a crafted expression
// reaches the `Function` constructor and runs arbitrary JavaScript. Quiz
// equation answers are evaluated server-side during attempt grading
// (apps/web/app/api/notebooks/[id]/quiz-sets/[setId]/attempts/route.ts), so a
// parser escape there is authenticated RCE. Upgrading to mathjs >= 15.2.0
// patches the known CVE; this module is defense-in-depth so the next such bug
// can't silently re-open that hole.
//
// Per the official mathjs "limited evaluate" guidance
// (https://mathjs.org/docs/expressions/security.html) we build a dedicated
// instance and disable the functions a numeric answer never needs and that are
// the usual escape vectors: import/createUnit (load arbitrary JS into the
// namespace) and evaluate/simplify/derivative/resolve (re-entry + symbolic
// engine). We deliberately keep `parse` enabled because the grader calls it
// directly — so we capture the original parse/evaluate references *before*
// disabling the rest. Our own code keeps working, while an expression that
// tries to call any disabled function resolves to a throwing stub.

import { create, all } from 'mathjs';

const math = create(all);

const disabled =
  (name: string) =>
  (): never => {
    throw new Error(`mathjs function "${name}" is disabled for untrusted input`);
  };

// Capture the originals before the override below disables them on the instance.
const originalParse = math.parse;
const originalEvaluate = math.evaluate;

math.import(
  {
    import: disabled('import'),
    createUnit: disabled('createUnit'),
    evaluate: disabled('evaluate'),
    simplify: disabled('simplify'),
    derivative: disabled('derivative'),
    resolve: disabled('resolve'),
  },
  { override: true }
);

/**
 * Parse an untrusted expression into a mathjs node. The node's
 * `.evaluate(scope)` resolves any disabled function to the throwing stub above,
 * so a malicious expression can't re-enter import/evaluate/etc.
 */
export const safeParse = originalParse;

/**
 * Evaluate an untrusted expression to a value, with the dangerous functions
 * disabled. Throws on a disabled function or a parse/evaluation error — callers
 * that grade user input should treat a throw as "wrong answer".
 */
export const safeEvaluate = originalEvaluate;
