// Self-hosted Piston client. Piston (https://github.com/engineer-man/piston)
// is a code-execution sandbox we run as a separate container on Coolify.
// This module is the only place that talks to it — the /api/quiz/code-execute
// route proxies requests through, applying auth, rate limits, and caps.

import type { ExecutableCodeLanguage } from '@notemage/shared';

/**
 * Internal language id → Piston runtime mapping. The right-hand side is the
 * `language` value the Piston `/execute` endpoint accepts. Piston ships
 * many language versions; we pin the latest stable per language at module
 * load time by fetching `/runtimes` on demand and caching the result.
 */
const PISTON_LANGUAGE_MAP: Record<ExecutableCodeLanguage, string> = {
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  java: 'java',
  cpp: 'c++',
  sql: 'sqlite3',
  go: 'go',
  rust: 'rust',
};

const PISTON_FILE_NAMES: Record<ExecutableCodeLanguage, string> = {
  python: 'main.py',
  javascript: 'main.js',
  typescript: 'main.ts',
  java: 'Main.java',
  cpp: 'main.cpp',
  sql: 'main.sql',
  go: 'main.go',
  rust: 'main.rs',
};

export interface PistonExecuteOptions {
  language: ExecutableCodeLanguage;
  code: string;
  stdin?: string;
  /** Hard cap, milliseconds. Piston's default is 3000ms for run. */
  runTimeoutMs?: number;
  /** Hard cap, milliseconds. Piston's default is 10000ms for compile. */
  compileTimeoutMs?: number;
}

export interface PistonExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** True when the program completed without crashing or being killed. */
  ok: boolean;
  /** True when Piston wasn't configured (PISTON_URL missing). */
  notConfigured?: boolean;
}

interface PistonRawRunStage {
  stdout: string;
  stderr: string;
  code: number;
  signal: string | null;
  output: string;
}

interface PistonRawResponse {
  language: string;
  version: string;
  run: PistonRawRunStage;
  compile?: PistonRawRunStage;
}

interface PistonRuntime {
  language: string;
  version: string;
  aliases?: string[];
}

const runtimeCache: { fetchedAt: number; runtimes: PistonRuntime[] } = {
  fetchedAt: 0,
  runtimes: [],
};
const RUNTIME_CACHE_TTL_MS = 5 * 60 * 1000;

function pistonBaseUrl(): string | null {
  const url = process.env.PISTON_URL?.trim();
  if (!url) return null;
  return url.replace(/\/+$/, '');
}

async function fetchRuntimes(): Promise<PistonRuntime[]> {
  const base = pistonBaseUrl();
  if (!base) return [];
  const now = Date.now();
  if (
    runtimeCache.runtimes.length > 0 &&
    now - runtimeCache.fetchedAt < RUNTIME_CACHE_TTL_MS
  ) {
    return runtimeCache.runtimes;
  }
  try {
    const res = await fetch(`${base}/api/v2/runtimes`);
    if (!res.ok) return runtimeCache.runtimes;
    const data = (await res.json()) as PistonRuntime[];
    runtimeCache.runtimes = Array.isArray(data) ? data : [];
    runtimeCache.fetchedAt = now;
    return runtimeCache.runtimes;
  } catch {
    return runtimeCache.runtimes;
  }
}

function pickVersion(language: string, runtimes: PistonRuntime[]): string | null {
  for (const r of runtimes) {
    if (r.language === language) return r.version;
    if (r.aliases?.includes(language)) return r.version;
  }
  return null;
}

export function isPistonConfigured(): boolean {
  return pistonBaseUrl() !== null;
}

export async function executeCode(
  opts: PistonExecuteOptions,
): Promise<PistonExecuteResult> {
  const base = pistonBaseUrl();
  if (!base) {
    return {
      stdout: '',
      stderr: 'Code execution is not configured on this server.',
      exitCode: -1,
      ok: false,
      notConfigured: true,
    };
  }

  const pistonLanguage = PISTON_LANGUAGE_MAP[opts.language];
  if (!pistonLanguage) {
    return {
      stdout: '',
      stderr: `Unsupported language: ${opts.language}`,
      exitCode: -1,
      ok: false,
    };
  }

  const runtimes = await fetchRuntimes();
  const version = pickVersion(pistonLanguage, runtimes) ?? '*';

  const fileName = PISTON_FILE_NAMES[opts.language];
  const body = {
    language: pistonLanguage,
    version,
    files: [{ name: fileName, content: opts.code }],
    stdin: opts.stdin ?? '',
    run_timeout: opts.runTimeoutMs ?? 5000,
    compile_timeout: opts.compileTimeoutMs ?? 10000,
    run_memory_limit: 128_000_000,
    compile_memory_limit: 256_000_000,
  };

  let res: Response;
  try {
    res = await fetch(`${base}/api/v2/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return {
      stdout: '',
      stderr: error instanceof Error ? error.message : 'Network error reaching Piston',
      exitCode: -1,
      ok: false,
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return {
      stdout: '',
      stderr: `Piston error ${res.status}: ${text || res.statusText}`.slice(0, 1000),
      exitCode: -1,
      ok: false,
    };
  }

  const data = (await res.json()) as PistonRawResponse;
  const compile = data.compile;
  if (compile && compile.code !== 0) {
    return {
      stdout: compile.stdout ?? '',
      stderr: compile.stderr || compile.output || 'Compile error',
      exitCode: compile.code,
      ok: false,
    };
  }
  const run = data.run;
  return {
    stdout: run.stdout ?? '',
    stderr: run.stderr ?? '',
    exitCode: run.code,
    ok: run.signal === null && run.code === 0,
  };
}

export const PISTON_SUPPORTED_LANGUAGES = Object.keys(
  PISTON_LANGUAGE_MAP,
) as ExecutableCodeLanguage[];
