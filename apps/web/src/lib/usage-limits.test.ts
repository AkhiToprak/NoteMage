// Phase 6 of plans/path-generation-reliability.md — the reserve-and-settle
// refund. The security-critical property: a refund can NEVER mint credit
// (clamped at 0) and is a no-op when there's nothing to give back.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// `vi.mock` factories are hoisted above imports, so the mock object must be
// created with `vi.hoisted` to be in scope when the factory runs.
const mockDb = vi.hoisted(() => ({
  usageRecord: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));

import { refundUsage } from './usage-limits';

beforeEach(() => {
  mockDb.usageRecord.findUnique.mockReset();
  mockDb.usageRecord.update.mockReset();
});

describe('refundUsage', () => {
  it('decrements the current-month count by the amount', async () => {
    mockDb.usageRecord.findUnique.mockResolvedValue({ count: 3 });
    await refundUsage('u1', 'ultra_path');
    expect(mockDb.usageRecord.update).toHaveBeenCalledTimes(1);
    expect(mockDb.usageRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { count: 2 } }),
    );
  });

  it('clamps at 0 — a refund can never mint credit below the floor', async () => {
    mockDb.usageRecord.findUnique.mockResolvedValue({ count: 1 });
    await refundUsage('u1', 'ultra_path', 5);
    expect(mockDb.usageRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { count: 0 } }),
    );
  });

  it('is a no-op when there is no usage record', async () => {
    mockDb.usageRecord.findUnique.mockResolvedValue(null);
    await refundUsage('u1', 'ultra_path');
    expect(mockDb.usageRecord.update).not.toHaveBeenCalled();
  });

  it('is a no-op when the count is already 0 (nothing to refund)', async () => {
    mockDb.usageRecord.findUnique.mockResolvedValue({ count: 0 });
    await refundUsage('u1', 'ultra_path');
    expect(mockDb.usageRecord.update).not.toHaveBeenCalled();
  });
});
