import { sessionRepository } from '../../data/repositories';
import { ResourceItem } from '../../types/resource';
import { traceRuntimeTarget } from './runtimeTargetTrace';

export type RuntimeTargetContent =
  | {
      kind: 'resource';
      title: string;
      resource: ResourceItem;
    }
  | {
      kind: 'character';
      title: string;
      characterId: string;
    };

export type RuntimeTargetPlaybackState = {
  status: 'playing' | 'paused' | 'stopped';
  loop: boolean;
  commandToken: string;
};

export type RuntimeTargetState = {
  visible: boolean;
  content: RuntimeTargetContent | null;
  playback?: RuntimeTargetPlaybackState | null;
  rotationQuarterTurns?: number | null;
  updatedAt: string;
};

export type RuntimeTargetDescriptor = {
  id: string;
  title: string;
  widgetType: 'character_sheet' | 'open_target_overlay' | 'screen_viewer';
  screenName: string;
  tabName: string;
  channelKey?: string | null;
};

const channels = new Map<string, BroadcastChannel>();

function buildStorageKey(sessionId: string, templateId: string, targetId: string): string {
  return `nexusforge.runtimeTarget.${sessionId}.${templateId}.${targetId}`;
}

function buildEventName(sessionId: string, templateId: string, targetId: string): string {
  return `nexusforge:runtimeTarget:${sessionId}:${templateId}:${targetId}`;
}

function getChannel(channelKey: string): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null;
  }
  if (!channels.has(channelKey)) {
    channels.set(channelKey, new BroadcastChannel(channelKey));
  }
  return channels.get(channelKey) ?? null;
}

function normalizeUpdatedAt(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRotationQuarterTurns(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  const normalized = Math.trunc(value) % 4;
  return normalized < 0 ? normalized + 4 : normalized;
}

function shouldReplaceRuntimeTargetState(current: RuntimeTargetState, incoming: RuntimeTargetState): boolean {
  const currentUpdatedAt = normalizeUpdatedAt(current.updatedAt);
  const incomingUpdatedAt = normalizeUpdatedAt(incoming.updatedAt);
  if (incomingUpdatedAt > currentUpdatedAt) {
    return true;
  }
  if (incomingUpdatedAt < currentUpdatedAt) {
    return false;
  }
  return JSON.stringify(current) !== JSON.stringify(incoming);
}

export function readRuntimeTargetState(params: { sessionId: string; templateId: string; targetId: string }): RuntimeTargetState {
  if (typeof window === 'undefined') {
    return { visible: false, content: null, updatedAt: new Date(0).toISOString() };
  }

  const raw = window.localStorage.getItem(buildStorageKey(params.sessionId, params.templateId, params.targetId));
  if (!raw) {
    return { visible: false, content: null, updatedAt: new Date(0).toISOString() };
  }

  try {
    const parsed = JSON.parse(raw) as RuntimeTargetState;
    return {
      visible: Boolean(parsed?.visible),
      content: parsed?.content ?? null,
      playback:
        parsed?.playback && typeof parsed.playback === 'object'
          ? {
              status:
                parsed.playback.status === 'playing' || parsed.playback.status === 'paused' || parsed.playback.status === 'stopped'
                  ? parsed.playback.status
                  : 'stopped',
              loop: Boolean(parsed.playback.loop),
              commandToken:
                typeof parsed.playback.commandToken === 'string' && parsed.playback.commandToken
                  ? parsed.playback.commandToken
                  : new Date(0).toISOString()
            }
          : null,
      rotationQuarterTurns: normalizeRotationQuarterTurns(parsed?.rotationQuarterTurns),
      updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString()
    };
  } catch {
    return { visible: false, content: null, updatedAt: new Date(0).toISOString() };
  }
}

export function writeRuntimeTargetState(params: {
  sessionId: string;
  templateId: string;
  targetId: string;
  state: RuntimeTargetState;
}): void {
  if (typeof window === 'undefined') {
    return;
  }

  traceRuntimeTarget({
    source: 'runtime-targets',
    sessionId: params.sessionId,
    templateId: params.templateId,
    targetId: params.targetId,
    event: 'write-state',
    detail: {
      visible: params.state.visible,
      hasContent: Boolean(params.state.content),
      playbackStatus: params.state.playback?.status ?? null,
      loop: params.state.playback?.loop ?? null,
      rotationQuarterTurns: params.state.rotationQuarterTurns ?? 0,
      updatedAt: params.state.updatedAt
    }
  });
  window.localStorage.setItem(buildStorageKey(params.sessionId, params.templateId, params.targetId), JSON.stringify(params.state));
  window.dispatchEvent(new CustomEvent(buildEventName(params.sessionId, params.templateId, params.targetId), { detail: params.state }));
  const channel = getChannel(`${params.sessionId}.${params.templateId}.${params.targetId}`);
  channel?.postMessage(params.state);
  void sessionRepository.writeRuntimeTargetState(params).catch(() => undefined);
}

export function subscribeRuntimeTargetState(
  params: { sessionId: string; templateId: string; targetId: string },
  onChange: (state: RuntimeTargetState) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const storageKey = buildStorageKey(params.sessionId, params.templateId, params.targetId);
  const eventName = buildEventName(params.sessionId, params.templateId, params.targetId);
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== storageKey) {
      return;
    }
    onChange(readRuntimeTargetState(params));
  };
  window.addEventListener('storage', handleStorage);
  const handleLocalEvent = (event: Event) => {
    const customEvent = event as CustomEvent<RuntimeTargetState>;
    onChange(customEvent.detail ?? readRuntimeTargetState(params));
  };
  window.addEventListener(eventName, handleLocalEvent as EventListener);

  const channel = getChannel(`${params.sessionId}.${params.templateId}.${params.targetId}`);
  const handleMessage = (event: MessageEvent<RuntimeTargetState>) => onChange(event.data);
  channel?.addEventListener('message', handleMessage);

  let disposed = false;
  const poll = window.setInterval(() => {
    void sessionRepository
      .readRuntimeTargetState(params)
      .then((remoteState) => {
        if (disposed || !remoteState || typeof remoteState !== 'object') {
          return;
        }
        const state = remoteState as RuntimeTargetState;
        const current = readRuntimeTargetState(params);
        const normalizedState = {
          visible: Boolean(state.visible),
          content: state.content ?? null,
          playback: state.playback ?? null,
          rotationQuarterTurns: normalizeRotationQuarterTurns(state.rotationQuarterTurns),
          updatedAt: typeof state.updatedAt === 'string' ? state.updatedAt : new Date().toISOString()
        } satisfies RuntimeTargetState;
        if (!shouldReplaceRuntimeTargetState(current, normalizedState)) {
          traceRuntimeTarget({
            source: 'runtime-targets',
            sessionId: params.sessionId,
            templateId: params.templateId,
            targetId: params.targetId,
            event: 'skip-stale-remote-state',
            detail: {
              currentUpdatedAt: current.updatedAt,
              incomingUpdatedAt: normalizedState.updatedAt
            }
          });
          return;
        }
        traceRuntimeTarget({
          source: 'runtime-targets',
          sessionId: params.sessionId,
          templateId: params.templateId,
          targetId: params.targetId,
          event: 'apply-remote-state',
          detail: {
            currentUpdatedAt: current.updatedAt,
            incomingUpdatedAt: normalizedState.updatedAt,
            playbackStatus: normalizedState.playback?.status ?? null,
            loop: normalizedState.playback?.loop ?? null,
            rotationQuarterTurns: normalizedState.rotationQuarterTurns ?? 0
          }
        });
        window.localStorage.setItem(buildStorageKey(params.sessionId, params.templateId, params.targetId), JSON.stringify(normalizedState));
        onChange(normalizedState);
      })
      .catch(() => undefined);
  }, 2_500);

  return () => {
    disposed = true;
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(eventName, handleLocalEvent as EventListener);
    channel?.removeEventListener('message', handleMessage);
    window.clearInterval(poll);
  };
}
