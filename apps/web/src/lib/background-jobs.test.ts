import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  db: {
    backgroundJob: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/db', () => ({ db: mocks.db }));

import { claimNextJob, completeJob, enqueueJob, failOrRetryJob } from './background-jobs';

const baseJob = {
  id: 'job-1',
  kind: 'import.pdf',
  payload: { jobId: 'import-1' },
  status: 'queued',
  attempts: 0,
  maxAttempts: 3,
  runAt: new Date('2026-06-23T12:00:00Z'),
  lockedAt: null,
  lockedBy: null,
  lastError: null,
  dedupeKey: 'import:pdf:import-1',
  createdAt: new Date('2026-06-23T12:00:00Z'),
  updatedAt: new Date('2026-06-23T12:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('background job queue helpers', () => {
  it('enqueueJob creates a queued job with typed payload and dedupe key', async () => {
    mocks.db.backgroundJob.create.mockResolvedValueOnce(baseJob);

    const job = await enqueueJob(
      'import.pdf',
      { jobId: 'import-1' },
      { dedupeKey: 'import:pdf:import-1' }
    );

    expect(job).toBe(baseJob);
    expect(mocks.db.backgroundJob.create).toHaveBeenCalledWith({
      data: {
        kind: 'import.pdf',
        payload: { jobId: 'import-1' },
        runAt: expect.any(Date),
        maxAttempts: 3,
        dedupeKey: 'import:pdf:import-1',
      },
    });
  });

  it('enqueueJob returns an active duplicate when the dedupe key already exists', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['dedupeKey'] },
    });
    mocks.db.backgroundJob.create.mockRejectedValueOnce(duplicate);
    mocks.db.backgroundJob.findFirst.mockResolvedValueOnce(baseJob);

    const job = await enqueueJob(
      'import.pdf',
      { jobId: 'import-1' },
      { dedupeKey: 'import:pdf:import-1' }
    );

    expect(job).toBe(baseJob);
    expect(mocks.db.backgroundJob.findFirst).toHaveBeenCalledWith({
      where: {
        dedupeKey: 'import:pdf:import-1',
        status: { in: ['queued', 'running'] },
      },
    });
  });

  it('claimNextJob atomically claims and returns the claimed row', async () => {
    const running = { ...baseJob, status: 'running', attempts: 1, lockedBy: 'worker-1' };
    mocks.db.backgroundJob.findFirst.mockResolvedValueOnce(baseJob);
    mocks.db.backgroundJob.updateMany.mockResolvedValueOnce({ count: 1 });
    mocks.db.backgroundJob.findUnique.mockResolvedValueOnce(running);

    const job = await claimNextJob({ workerId: 'worker-1', leaseMs: 1_000 });

    expect(job).toBe(running);
    expect(mocks.db.backgroundJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'job-1',
        OR: expect.any(Array),
      },
      data: {
        status: 'running',
        lockedAt: expect.any(Date),
        lockedBy: 'worker-1',
        attempts: { increment: 1 },
      },
    });
  });

  it('completeJob clears the active dedupe key', async () => {
    await completeJob('job-1');

    expect(mocks.db.backgroundJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: {
        status: 'succeeded',
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        dedupeKey: null,
      },
    });
  });

  it('failOrRetryJob backs off unfinished attempts and fails exhausted jobs', async () => {
    await failOrRetryJob({ ...baseJob, attempts: 1 }, new Error('temporary'));
    expect(mocks.db.backgroundJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: {
        status: 'queued',
        runAt: expect.any(Date),
        lockedAt: null,
        lockedBy: null,
        lastError: 'temporary',
      },
    });

    await failOrRetryJob({ ...baseJob, attempts: 3, maxAttempts: 3 }, new Error('done'));
    expect(mocks.db.backgroundJob.update).toHaveBeenLastCalledWith({
      where: { id: 'job-1' },
      data: {
        status: 'failed',
        lockedAt: null,
        lockedBy: null,
        lastError: 'done',
        dedupeKey: null,
      },
    });
  });
});
