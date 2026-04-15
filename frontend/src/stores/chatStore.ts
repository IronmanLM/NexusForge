import { useCallback, useEffect, useMemo, useState } from 'react';
import { messageRepository } from '../data/repositories';
import { ChatChannel } from '../types/chat';
import { Message, MessageImportance, SystemMessageType } from '../types/message';
import { SessionParticipant } from '../types/session';

type ChatStoreOptions = {
  sessionId: string;
  gmUserId: string;
  currentUserId: string;
  currentUserRole: 'gm' | 'player';
  participants?: SessionParticipant[];
  allowPlayerToPlayerChat?: boolean;
};

export interface ChatStoreState {
  channels: ChatChannel[];
  messages: Message[];
  selectedChannelId: string | null;
  currentWhisperBannerMessageId: string | null;
  userDisplayNames: Record<string, string>;
  gmUserId: string;
  selectChannel: (channelId: string) => void;
  sendMessage: (params: {
    fromUserId: string;
    content: string;
    channelId?: string;
    channelType?: 'global' | 'group' | 'direct';
    toUserIds?: string[];
    options?: {
      isPrivateToGM?: boolean;
      importance?: MessageImportance;
    };
  }) => void;
  sendSystemMessage: (params: {
    sessionId: string;
    content: string;
    systemType: SystemMessageType;
  }) => void;
  getMessagesForChannel: (channelId: string) => Message[];
  dismissWhisperBanner: () => void;
  openWhisperBannerInChat: () => void;
  openMessageInChat: (messageId: string) => void;
}

type SessionChatState = {
  channels: ChatChannel[];
  messages: Message[];
  selectedChannelId: string | null;
  currentWhisperBannerMessageId: string | null;
  userDisplayNames: Record<string, string>;
  gmUserId: string;
};

const sessionStates = new Map<string, SessionChatState>();
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function buildDisplayName(participant: SessionParticipant, gmUserIds: string[], index: number): string {
  if (participant.displayName) {
    return participant.displayName;
  }
  if (participant.nickname) {
    return participant.nickname;
  }
  if (gmUserIds.includes(participant.userId) || participant.role === 'gm') {
    return gmUserIds.length > 1 ? `MJ ${index + 1}` : 'MJ';
  }
  return `Joueur ${index + 1}`;
}

function buildInitialSessionState(
  sessionId: string,
  gmUserId: string,
  participants: SessionParticipant[] = [],
  allowPlayerToPlayerChat = true
): SessionChatState {
  const normalizedParticipants: SessionParticipant[] =
    participants.length > 0 ? participants : [{ userId: gmUserId, role: 'gm' as const }];
  const gmUserIds = Array.from(
    new Set(
      normalizedParticipants
        .filter((participant) => participant.role === 'gm' || participant.userId === gmUserId)
        .map((participant) => participant.userId)
        .concat(gmUserId)
    )
  );
  const allMembers = Array.from(new Set(normalizedParticipants.map((participant) => participant.userId).concat(gmUserIds)));
  const globalChannelId = `${sessionId}-channel-global`;
  const channels: ChatChannel[] = [
    {
      id: globalChannelId,
      kind: 'global',
      title: 'Global',
      sessionId,
      memberUserIds: allMembers
    }
  ];

  for (let i = 0; i < normalizedParticipants.length; i += 1) {
    for (let j = i + 1; j < normalizedParticipants.length; j += 1) {
      const left = normalizedParticipants[i];
      const right = normalizedParticipants[j];
      const pairHasGm = gmUserIds.includes(left.userId) || gmUserIds.includes(right.userId);
      if (!pairHasGm && !allowPlayerToPlayerChat) {
        continue;
      }

      channels.push({
        id: `${sessionId}-channel-direct-${[left.userId, right.userId].sort().join('-')}`,
        kind: 'direct',
        title: `MP - ${buildDisplayName(left, gmUserIds, i)} / ${buildDisplayName(right, gmUserIds, j)}`,
        sessionId,
        memberUserIds: [left.userId, right.userId]
      });
    }
  }

  const userDisplayNames = Object.fromEntries(
    normalizedParticipants.map((participant, index) => [
      participant.userId,
      buildDisplayName(participant, gmUserIds, index)
    ])
  );

  return {
    channels,
    messages: [],
    selectedChannelId: globalChannelId,
    currentWhisperBannerMessageId: null,
    userDisplayNames,
    gmUserId
  };
}

function getSessionState(
  sessionId: string,
  gmUserId: string,
  participants: SessionParticipant[] = [],
  allowPlayerToPlayerChat = true
): SessionChatState {
  const existing = sessionStates.get(sessionId);
  if (existing) {
    if (existing.gmUserId !== gmUserId) {
      existing.gmUserId = gmUserId;
    }
    const next = buildInitialSessionState(sessionId, gmUserId, participants, allowPlayerToPlayerChat);
    existing.channels = next.channels;
    existing.userDisplayNames = next.userDisplayNames;
    return existing;
  }

  const state = buildInitialSessionState(sessionId, gmUserId, participants, allowPlayerToPlayerChat);
  sessionStates.set(sessionId, state);
  return state;
}

async function hydrateSessionMessages(
  sessionId: string,
  gmUserId: string,
  participants: SessionParticipant[] = [],
  allowPlayerToPlayerChat = true
): Promise<void> {
  const state = getSessionState(sessionId, gmUserId, participants, allowPlayerToPlayerChat);
  const persistedMessages = await messageRepository.listForSession(sessionId);
  state.messages = persistedMessages;

  const latestIncomingWhisper = [...persistedMessages]
    .reverse()
    .find((message) => message.isPrivateToGM && message.fromUserId !== gmUserId && message.ui?.shouldShowBanner);

  state.currentWhisperBannerMessageId = latestIncomingWhisper?.id ?? null;
  notifyListeners();
}

export function sendSystemMessage(params: { sessionId: string; content: string; systemType: SystemMessageType }): void {
  const fallbackGmUserId = 'user-gm-1';
  const state = getSessionState(params.sessionId, sessionStates.get(params.sessionId)?.gmUserId ?? fallbackGmUserId);
  const globalChannel = state.channels.find((channel) => channel.kind === 'global' && channel.sessionId === params.sessionId);

  if (!globalChannel) {
    return;
  }

  const trimmedContent = params.content.trim();
  if (!trimmedContent) {
    return;
  }

  const importance: MessageImportance =
    params.systemType === 'combat_start' || params.systemType === 'combat_end' ? 'high' : 'normal';

  const systemMessage: Message = {
    id: `${params.sessionId}-system-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: params.sessionId,
    channelId: globalChannel.id,
    channelType: 'system',
    fromUserId: 'system',
    content: trimmedContent,
    createdAt: new Date().toISOString(),
    systemType: params.systemType,
    ui: {
      importance
    }
  };

  void (async () => {
    const created = await messageRepository.create(systemMessage);
    state.messages = [...state.messages.filter((item) => item.id !== created.id), created];
    notifyListeners();
  })();
}

export function useChatStore({
  sessionId,
  gmUserId,
  currentUserId,
  currentUserRole,
  participants = [],
  allowPlayerToPlayerChat = true
}: ChatStoreOptions): ChatStoreState {
  const [, forceRender] = useState(0);

  useEffect(() => subscribe(() => forceRender((value) => value + 1)), []);

  const sessionState = useMemo(
    () => getSessionState(sessionId, gmUserId, participants, allowPlayerToPlayerChat),
    [allowPlayerToPlayerChat, gmUserId, participants, sessionId]
  );

  useEffect(() => {
    void hydrateSessionMessages(sessionId, gmUserId, participants, allowPlayerToPlayerChat);
  }, [allowPlayerToPlayerChat, gmUserId, participants, sessionId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void hydrateSessionMessages(sessionId, gmUserId, participants, allowPlayerToPlayerChat);
    }, 2_500);
    return () => window.clearInterval(interval);
  }, [allowPlayerToPlayerChat, gmUserId, participants, sessionId]);

  const selectChannel = useCallback(
    (channelId: string) => {
      sessionState.selectedChannelId = channelId;
      notifyListeners();
    },
    [sessionState]
  );

  const sendMessage = useCallback(
    (params: {
      fromUserId: string;
      content: string;
      channelId?: string;
      channelType?: 'global' | 'group' | 'direct';
      toUserIds?: string[];
      options?: {
        isPrivateToGM?: boolean;
        importance?: MessageImportance;
      };
    }) => {
      const trimmedContent = params.content.trim();
      if (!trimmedContent) {
        return;
      }

      const channelType = params.channelType ?? 'global';
      const explicitRecipients = Array.isArray(params.toUserIds)
        ? Array.from(new Set(params.toUserIds.filter((userId) => typeof userId === 'string' && userId && userId !== params.fromUserId)))
        : [];
      const channel =
        (params.channelId ? sessionState.channels.find((item) => item.id === params.channelId) : null) ??
        (channelType === 'global'
          ? sessionState.channels.find((item) => item.kind === 'global')
          : null);
      const otherMembers =
        explicitRecipients.length > 0
          ? explicitRecipients
          : channel?.memberUserIds.filter((userId) => userId !== params.fromUserId) ?? [];
      const isDirectGmConversation =
        channelType === 'direct' &&
        (otherMembers.includes(gmUserId) || (channel?.kind === 'direct' && channel.memberUserIds.includes(gmUserId)));
      const shouldMarkAsWhisper = params.options?.isPrivateToGM === true || isDirectGmConversation;
      const isIncomingGmWhisper = shouldMarkAsWhisper && params.fromUserId !== gmUserId;
      const resolvedChannelId =
        params.channelId ||
        channel?.id ||
        (channelType === 'direct'
          ? `${sessionId}-channel-direct-${[params.fromUserId, ...otherMembers].sort().join('-')}`
          : channelType === 'group'
          ? `${sessionId}-channel-group-${[params.fromUserId, ...otherMembers].sort().join('-')}`
          : `${sessionId}-channel-global`);

      const message: Message = {
        id: `${sessionId}-message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sessionId,
        channelId: resolvedChannelId,
        channelType,
        fromUserId: params.fromUserId,
        content: trimmedContent,
        createdAt: new Date().toISOString(),
        toUserIds: channelType === 'global' ? [] : otherMembers
      };

      if (channelType === 'group') {
        message.channelType = 'group';
        message.groupId = resolvedChannelId;
      }

      if (channelType === 'direct') {
        message.channelType = 'direct';
        message.toUserIds = otherMembers;
      }

      if (shouldMarkAsWhisper) {
        message.channelType = 'direct';
        message.toUserIds = [gmUserId];
        message.isPrivateToGM = true;
        message.ui = {
          shouldShowBanner: isIncomingGmWhisper,
          importance: params.options?.importance ?? 'high'
        };
      }

      void (async () => {
        const created = await messageRepository.create(message);
        sessionState.messages = [...sessionState.messages.filter((item) => item.id !== created.id), created];

        if (currentUserRole === 'gm' && isIncomingGmWhisper && created.ui?.shouldShowBanner) {
          sessionState.currentWhisperBannerMessageId = created.id;
        }

        notifyListeners();
      })();
    },
    [currentUserRole, gmUserId, sessionId, sessionState]
  );

  const getMessagesForChannel = useCallback(
    (channelId: string) =>
      sessionState.messages
        .filter((message) => message.channelId === channelId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [sessionState]
  );

  const dismissWhisperBanner = useCallback(() => {
    sessionState.currentWhisperBannerMessageId = null;
    notifyListeners();
  }, [sessionState]);

  const openWhisperBannerInChat = useCallback(() => {
    if (!sessionState.currentWhisperBannerMessageId) {
      return;
    }

    const whisperMessage = sessionState.messages.find(
      (message) => message.id === sessionState.currentWhisperBannerMessageId
    );
    if (!whisperMessage?.channelId) {
      sessionState.currentWhisperBannerMessageId = null;
      notifyListeners();
      return;
    }

    sessionState.selectedChannelId = whisperMessage.channelId;
    sessionState.currentWhisperBannerMessageId = null;
    notifyListeners();
  }, [sessionState]);

  const openMessageInChat = useCallback(
    (messageId: string) => {
      const targetMessage = sessionState.messages.find((message) => message.id === messageId);
      if (!targetMessage?.channelId) {
        return;
      }
      sessionState.selectedChannelId = targetMessage.channelId;
      if (sessionState.currentWhisperBannerMessageId === messageId) {
        sessionState.currentWhisperBannerMessageId = null;
      }
      notifyListeners();
    },
    [sessionState]
  );

  return {
    channels: sessionState.channels,
    messages: sessionState.messages,
    selectedChannelId: sessionState.selectedChannelId,
    currentWhisperBannerMessageId: currentUserRole === 'gm' ? sessionState.currentWhisperBannerMessageId : null,
    userDisplayNames: {
      ...sessionState.userDisplayNames,
      [currentUserId]: sessionState.userDisplayNames[currentUserId] ?? 'Vous'
    },
    gmUserId,
    selectChannel,
    sendMessage,
    sendSystemMessage,
    getMessagesForChannel,
    dismissWhisperBanner,
    openWhisperBannerInChat,
    openMessageInChat
  };
}
