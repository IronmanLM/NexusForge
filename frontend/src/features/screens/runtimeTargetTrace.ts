type RuntimeTargetTraceEntry = {
  at: string;
  source: string;
  targetId?: string;
  templateId?: string;
  sessionId?: string;
  event: string;
  detail?: Record<string, unknown>;
};

declare global {
  interface Window {
    __nexusforgeRuntimeTargetTrace?: RuntimeTargetTraceEntry[];
  }
}

export function traceRuntimeTarget(entry: Omit<RuntimeTargetTraceEntry, 'at'>): void {
  if (typeof window === 'undefined') {
    return;
  }
  const traceEntry: RuntimeTargetTraceEntry = {
    at: new Date().toISOString(),
    ...entry
  };
  const current = window.__nexusforgeRuntimeTargetTrace ?? [];
  current.push(traceEntry);
  if (current.length > 200) {
    current.splice(0, current.length - 200);
  }
  window.__nexusforgeRuntimeTargetTrace = current;
  console.debug('[runtime-target-trace]', traceEntry);
}
