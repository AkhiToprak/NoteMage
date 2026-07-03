import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TypedBackgroundJob } from './background-jobs';

const mocks = vi.hoisted(() => ({
  runPdfImportJob: vi.fn(),
  runVideoImportJob: vi.fn(),
  runOneNoteImportJob: vi.fn(),
  generatePath: vi.fn(),
}));

vi.mock('@/lib/pdf-import/run-job', () => ({ runPdfImportJob: mocks.runPdfImportJob }));
vi.mock('@/lib/video-import/run-job', () => ({ runVideoImportJob: mocks.runVideoImportJob }));
vi.mock('@/lib/onenote-import/run-job', () => ({
  runOneNoteImportJob: mocks.runOneNoteImportJob,
}));
vi.mock('@/lib/path-generator', () => ({ generatePath: mocks.generatePath }));

import { runJob } from './background-job-runner';

function job(kind: TypedBackgroundJob['kind'], payload: unknown): TypedBackgroundJob {
  return {
    id: `job-${kind}`,
    kind,
    payload,
    status: 'running',
    attempts: 1,
    maxAttempts: 3,
    runAt: new Date(),
    lockedAt: new Date(),
    lockedBy: 'worker',
    lastError: null,
    dedupeKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as TypedBackgroundJob;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runJob', () => {
  it('dispatches import jobs to their domain workers', async () => {
    await runJob(job('import.pdf', { jobId: 'pdf-1' }));
    await runJob(job('import.video', { jobId: 'video-1' }));
    await runJob(job('import.onenote', { jobId: 'one-1' }));

    expect(mocks.runPdfImportJob).toHaveBeenCalledWith('pdf-1');
    expect(mocks.runVideoImportJob).toHaveBeenCalledWith('video-1');
    expect(mocks.runOneNoteImportJob).toHaveBeenCalledWith('one-1');
  });

  it('dispatches path jobs with the expected options', async () => {
    await runJob(job('path.generate', { planId: 'plan-1', allowRefund: true }));
    await runJob(job('path.regenerate', { planId: 'plan-2' }));

    expect(mocks.generatePath).toHaveBeenCalledWith('plan-1', { allowRefund: true });
    expect(mocks.generatePath).toHaveBeenCalledWith('plan-2');
  });
});
