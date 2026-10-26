export type AdaptivePollingOptions = {
  task: () => Promise<void> | void;
  baseIntervalMs: number;
  maxIntervalMs?: number;
  jitterRatio?: number;
  isPaused?: () => boolean;
  subscribeResume?: (listener: () => void) => () => void;
  random?: () => number;
};

function defaultIsPaused(): boolean {
  const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  return isHidden || isOffline;
}

function defaultSubscribeResume(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined;
  }

  document.addEventListener('visibilitychange', listener);
  window.addEventListener('online', listener);
  return () => {
    document.removeEventListener('visibilitychange', listener);
    window.removeEventListener('online', listener);
  };
}

export function startAdaptivePolling({
  task,
  baseIntervalMs,
  maxIntervalMs = baseIntervalMs * 8,
  jitterRatio = 0.1,
  isPaused = defaultIsPaused,
  subscribeResume = defaultSubscribeResume,
  random = Math.random
}: AdaptivePollingOptions): () => void {
  let stopped = false;
  let failureCount = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (delayMs: number) => {
    if (stopped) {
      return;
    }
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, delayMs);
  };

  const nextDelay = () => {
    const backoffDelay = Math.min(maxIntervalMs, baseIntervalMs * Math.pow(2, failureCount));
    const jitterMultiplier = 1 + (random() * 2 - 1) * jitterRatio;
    return Math.max(0, Math.round(backoffDelay * jitterMultiplier));
  };

  const run = async () => {
    if (stopped) {
      return;
    }
    if (isPaused()) {
      schedule(baseIntervalMs);
      return;
    }

    try {
      await task();
      failureCount = 0;
    } catch {
      failureCount += 1;
    }
    schedule(nextDelay());
  };

  const unsubscribeResume = subscribeResume(() => {
    if (!isPaused()) {
      schedule(0);
    }
  });

  schedule(0);

  return () => {
    stopped = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    unsubscribeResume();
  };
}
