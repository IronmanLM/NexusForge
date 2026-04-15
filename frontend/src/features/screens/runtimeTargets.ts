import { sessionRepository } from '../../data/repositories';
import { ResourceItem } from '../../types/resource';

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

export type RuntimeTargetState = {
  visible: boolean;
  content: RuntimeTargetContent | null;
  updatedAt: string;
};

export type RuntimeTargetDescriptor = {
  id: string;
  title: string;
  widgetType: 'character_sheet' | 'open_target_overlay';
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
        if (JSON.stringify(current) === JSON.stringify(state)) {
          return;
        }
        window.localStorage.setItem(buildStorageKey(params.sessionId, params.templateId, params.targetId), JSON.stringify(state));
        onChange(state);
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
