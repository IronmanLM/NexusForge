import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalAction } from '../types/localAction';

const repositoryMocks = vi.hoisted(() => ({
  listSyncCandidates: vi.fn(),
  markSynced: vi.fn(),
  markConflict: vi.fn(),
  markRejected: vi.fn(),
  markFailed: vi.fn()
}));
const transportMocks = vi.hoisted(() => ({
  pushActionToServer: vi.fn()
}));

vi.mock('../data/repositories', () => ({
  localActionRepository: repositoryMocks
}));
vi.mock('./syncTransport', () => transportMocks);

import { runSyncCycle } from './syncService';

function action(overrides: Partial<LocalAction> = {}): LocalAction {
  return {
    id: 'action-1',
    entityType: 'session',
    entityId: 'session-1',
    actionType: 'update',
    payload: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    syncStatus: 'pending',
    retryCount: 0,
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { onLine: true });
});

describe('runSyncCycle', () => {
  it('persists accepted, conflicting and rejected outcomes', async () => {
    const accepted = action({ id: 'accepted' });
    const conflict = action({ id: 'conflict' });
    const rejected = action({ id: 'rejected' });
    repositoryMocks.listSyncCandidates.mockResolvedValue([accepted, conflict, rejected]);
    transportMocks.pushActionToServer
      .mockResolvedValueOnce({ status: 'accepted' })
      .mockResolvedValueOnce({
        status: 'conflict',
        reason: 'server changed',
        conflictFields: ['name'],
        conflictServerValues: { name: 'Server name' }
      })
      .mockResolvedValueOnce({ status: 'rejected', reason: 'not allowed' });

    const report = await runSyncCycle();

    expect(report).toEqual({ processed: 3, synced: 1, failed: 0, conflicts: 1, rejected: 1, skipped: 0 });
    expect(repositoryMocks.markSynced).toHaveBeenCalledWith('accepted');
    expect(repositoryMocks.markConflict).toHaveBeenCalledWith('conflict', 'server changed', ['name'], { name: 'Server name' });
    expect(repositoryMocks.markRejected).toHaveBeenCalledWith('rejected', 'not allowed', 5);
  });

  it('marks transport errors as retryable failures', async () => {
    repositoryMocks.listSyncCandidates.mockResolvedValue([action({ id: 'failed' })]);
    transportMocks.pushActionToServer.mockRejectedValue(new Error('network unavailable'));

    const report = await runSyncCycle();

    expect(report).toEqual({ processed: 1, synced: 0, failed: 1, conflicts: 0, rejected: 0, skipped: 0 });
    expect(repositoryMocks.markFailed).toHaveBeenCalledWith('failed', 'network unavailable');
  });

  it('skips failed actions until their retry backoff has elapsed', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:03.000Z'));
    repositoryMocks.listSyncCandidates.mockResolvedValue([
      action({
        id: 'backing-off',
        syncStatus: 'failed',
        retryCount: 2,
        lastSyncAttemptAt: '2026-01-01T00:00:00.000Z'
      })
    ]);

    const report = await runSyncCycle();

    expect(report).toEqual({ processed: 0, synced: 0, failed: 0, conflicts: 0, rejected: 0, skipped: 1 });
    expect(transportMocks.pushActionToServer).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does not read or send actions while offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });

    const report = await runSyncCycle();

    expect(report).toEqual({ processed: 0, synced: 0, failed: 0, conflicts: 0, rejected: 0, skipped: 0 });
    expect(repositoryMocks.listSyncCandidates).not.toHaveBeenCalled();
  });
});
