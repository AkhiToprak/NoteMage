import type { NextRequest } from 'next/server';
import { EXECUTABLE_CODE_LANGUAGES, type ExecutableCodeLanguage } from '@notemage/shared';
import { getAuthUserId } from '@/lib/auth';
import {
  badRequestResponse,
  internalErrorResponse,
  serviceUnavailableResponse,
  successResponse,
  tooManyRequestsResponse,
  unauthorizedResponse,
} from '@/lib/api-response';
import { executeCode, isPistonConfigured } from '@/lib/piston-client';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';
import { logTelemetry } from '@/lib/telemetry-server';

// Phase 10.9 — code_write execution proxy.
//
// Two modes, both proxied through this route:
//   - "run" (no tests): the learner clicks Run in the editor and sees
//     stdout/stderr/exitCode for one execution. Used for practice before
//     submitting.
//   - "grade" (with tests): the renderer runs the user's code against
//     each declared test case and returns per-test results plus an
//     aggregated allPassed boolean. The CodeWriteRenderer commits the
//     verdict to its UserAnswer on submit so quiz-grading.ts can read it.
//
// Safeguards (defense in depth):
//   - Auth required (next-auth JWT).
//   - Rate limit: 30 executions / minute / user.
//   - Code length cap: 10 KB.
//   - Test count cap: 8.
//   - stdin / expectedStdout length cap: 8 KB each.
//   - Piston-side: 5s run timeout, 10s compile timeout, 128 MB memory.

const MAX_CODE_BYTES = 10_000;
const MAX_STDIO_BYTES = 8_000;
const MAX_TESTS = 8;
const RATE_LIMIT_PER_MIN = 30;

interface CodeExecuteTest {
  name?: string;
  stdin?: string;
  expectedStdout: string;
}

interface CodeExecuteBody {
  language?: string;
  code?: string;
  /** Practice mode when omitted; grade mode when present. */
  tests?: CodeExecuteTest[];
  runTimeoutMs?: number;
}

interface SingleRunResult {
  name?: string;
  stdin?: string;
  expectedStdout?: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  ok: boolean;
  isCorrect?: boolean;
  durationMs: number;
}

function isExecutableLanguage(s: unknown): s is ExecutableCodeLanguage {
  return typeof s === 'string' && (EXECUTABLE_CODE_LANGUAGES as readonly string[]).includes(s);
}

function trimBytes(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max);
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    if (!isPistonConfigured()) {
      return serviceUnavailableResponse(
        'Code execution is not configured on this server.',
      );
    }

    const limit = await rateLimit(
      rateLimitKey('code-exec', request, userId),
      RATE_LIMIT_PER_MIN,
      60_000,
    );
    if (!limit.success) {
      return tooManyRequestsResponse(
        'Too many code executions. Try again in a moment.',
        limit.retryAfterMs,
      );
    }

    const body = (await request.json().catch(() => ({}))) as CodeExecuteBody;
    if (!isExecutableLanguage(body.language)) {
      return badRequestResponse(
        `Unsupported language. Allowed: ${EXECUTABLE_CODE_LANGUAGES.join(', ')}`,
      );
    }
    if (typeof body.code !== 'string' || body.code.length === 0) {
      return badRequestResponse('Code is required.');
    }
    if (body.code.length > MAX_CODE_BYTES) {
      return badRequestResponse(`Code is too long (max ${MAX_CODE_BYTES} characters).`);
    }
    const runTimeoutMs =
      typeof body.runTimeoutMs === 'number' && body.runTimeoutMs > 0
        ? Math.min(15_000, Math.max(500, Math.floor(body.runTimeoutMs)))
        : 5000;

    const tests = Array.isArray(body.tests) ? body.tests : null;
    const gradeMode = tests !== null && tests.length > 0;
    if (gradeMode && tests.length > MAX_TESTS) {
      return badRequestResponse(`Too many test cases (max ${MAX_TESTS}).`);
    }

    const language = body.language;
    const code = body.code;

    // Practice mode: one execution, no test comparison.
    if (!gradeMode) {
      const started = Date.now();
      const result = await executeCode({ language, code, runTimeoutMs });
      const durationMs = Date.now() - started;
      logTelemetry(userId, 'code.execute.run', {
        language,
        ok: result.ok,
        exitCode: result.exitCode,
        durationMs,
      });
      const run: SingleRunResult = {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        ok: result.ok,
        durationMs,
      };
      return successResponse({ mode: 'run', runs: [run], allPassed: result.ok });
    }

    // Grade mode: run once per test, compare stdout to expectedStdout.
    const runs: SingleRunResult[] = [];
    let allPassed = true;
    for (let i = 0; i < tests.length; i++) {
      const t = tests[i];
      if (typeof t.expectedStdout !== 'string') {
        return badRequestResponse(`tests[${i}].expectedStdout must be a string.`);
      }
      const stdin = typeof t.stdin === 'string' ? trimBytes(t.stdin, MAX_STDIO_BYTES) : '';
      const expected = trimBytes(t.expectedStdout, MAX_STDIO_BYTES);
      const started = Date.now();
      const result = await executeCode({ language, code, stdin, runTimeoutMs });
      const durationMs = Date.now() - started;
      const normalizedActual = result.stdout.replace(/\r\n/g, '\n');
      const normalizedExpected = expected.replace(/\r\n/g, '\n');
      const isCorrect = result.ok && normalizedActual === normalizedExpected;
      if (!isCorrect) allPassed = false;
      runs.push({
        name: t.name,
        stdin: stdin.length > 0 ? stdin : undefined,
        expectedStdout: expected,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        ok: result.ok,
        isCorrect,
        durationMs,
      });
    }
    logTelemetry(userId, 'code.execute.grade', {
      language,
      tests: tests.length,
      allPassed,
      passed: runs.filter((r) => r.isCorrect).length,
    });
    return successResponse({ mode: 'grade', runs, allPassed });
  } catch (error) {
    console.error('[code-execute POST]', error);
    return internalErrorResponse();
  }
}
