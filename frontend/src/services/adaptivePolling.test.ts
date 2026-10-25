import { describe, expect, it, vi } from 'vitest';
import { startAdaptivePolling } from './adaptivePolling';

describe('startAdaptivePolling', () => {
  it('runs immediately and schedules the next successful cycle at the base interval', async () => {
    vi.useFakeTimers();
    const task = vi.fn().mockResolvedValue(undefined);

    const stop = startAdaptivePolling({
      task,
      baseIntervalMs: 1_000,
      jitterRatio: 0,
      isPaused: () => false
    });

    await vi.runOnlyPendingTimersAsync();
    expect(task).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(2);

    stop();
    vi.useRealTimers();
  });

  it('backs off after failures and resets after a successful cycle', async () => {
    vi.useFakeTimers();
    const task = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValue(undefined);

    const stop = startAdaptivePolling({
      task,
      baseIntervalMs: 1_000,
      maxIntervalMs: 8_000,
      jitterRatio: 0,
      isPaused: () => false
    });

    await vi.runOnlyPendingTimersAsync();
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(task).toHaveBeenCalledTimes(3);

    stop();
    vi.useRealTimers();
  });

  it('does not poll while paused and resumes immediately when notified', async () => {
    vi.useFakeTimers();
    let paused = true;
    let resume: (() => void) | undefined;
    const task = vi.fn().mockResolvedValue(undefined);

    const stop = startAdaptivePolling({
      task,
      baseIntervalMs: 1_000,
      jitterRatio: 0,
      isPaused: () => paused,
      subscribeResume: (listener) => {
        resume = listener;
        return () => {
          resume = undefined;
        };
      }
    });

    await vi.runOnlyPendingTimersAsync();
    expect(task).not.toHaveBeenCalled();

    paused = false;
    resume?.();
    await vi.runOnlyPendingTimersAsync();
    expect(task).toHaveBeenCalledTimes(1);

    stop();
    vi.useRealTimers();
  });
});
