import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Session } from '../../../types/session';
import { User } from '../../../types/user';
import { Message } from '../../../types/message';
import { useChatStore } from '../../../stores/chatStore';

type SessionChatScreenWidgetProps = {
  currentUser: User;
  currentSession: Session;
  role: 'gm' | 'player';
  allowWhispers?: boolean;
};

function formatTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function SessionChatScreenWidget({
  currentUser,
  currentSession,
  role,
  allowWhispers = true
}: SessionChatScreenWidgetProps) {
  const {
    channels,
    messages,
    currentWhisperBannerMessageId,
    userDisplayNames,
    sendMessage,
    dismissWhisperBanner,
    openWhisperBannerInChat
  } = useChatStore({
    sessionId: currentSession.id,
    gmUserId: currentSession.gmUserId,
    currentUserId: currentUser.id,
    currentUserRole: role,
    participants: currentSession.participants ?? [],
    allowPlayerToPlayerChat: currentSession.settings?.allowPlayerToPlayerChat !== false
  });

  const [draft, setDraft] = useState('');
  const messagesRef = useRef<HTMLElement | null>(null);

  const participantMeta = useMemo(() => {
    return (currentSession.participants ?? []).map((participant) => ({
      id: participant.userId,
      nickname: participant.nickname?.trim() || (participant.role === 'gm' ? 'MJ' : participant.userId),
      isGm: participant.role === 'gm' || participant.userId === currentSession.gmUserId
    }));
  }, [currentSession.gmUserId, currentSession.participants]);

  const recipientOptions = useMemo(() => {
    return participantMeta.filter((participant) => {
      if (participant.id === currentUser.id) {
        return false;
      }
      if (role === 'gm') {
        return true;
      }
      if (participant.isGm) {
        return true;
      }
      return currentSession.settings?.allowPlayerToPlayerChat !== false;
    });
  }, [currentSession.settings?.allowPlayerToPlayerChat, currentUser.id, participantMeta, role]);

  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);

  useEffect(() => {
    setSelectedRecipientIds((current) => {
      const allowedIds = recipientOptions.map((item) => item.id);
      const preserved = current.filter((id) => allowedIds.includes(id));
      return preserved.length > 0 ? preserved : allowedIds;
    });
  }, [recipientOptions]);

  const bannerMessage = useMemo(
    () => messages.find((message) => message.id === currentWhisperBannerMessageId) ?? null,
    [currentWhisperBannerMessageId, messages]
  );
  const allRecipientIds = useMemo(() => recipientOptions.map((participant) => participant.id), [recipientOptions]);
  const globalChannelId = useMemo(
    () => channels.find((channel) => channel.kind === 'global' && channel.sessionId === currentSession.id)?.id ?? `${currentSession.id}-channel-global`,
    [channels, currentSession.id]
  );

  const visibleMessages = useMemo(
    () =>
      [...messages]
        .filter((message) => message.channelType !== 'system')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [messages]
  );

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [visibleMessages.length]);

  const recipientNames = useMemo(
    () =>
      Object.fromEntries(
        participantMeta.map((participant) => [
          participant.id,
          participant.nickname
        ])
      ),
    [participantMeta]
  );

  const recipientSummary = (message: Message): string => {
    if (message.channelType === 'global' || !message.toUserIds || message.toUserIds.length === 0) {
      return 'Tous';
    }
    const gmRecipients = participantMeta.filter((participant) => participant.isGm).map((participant) => participant.id);
    const uniqueRecipients = Array.from(new Set(message.toUserIds));
    if (uniqueRecipients.length > 0 && uniqueRecipients.every((id) => gmRecipients.includes(id))) {
      return 'MJ';
    }
    return uniqueRecipients.map((id) => recipientNames[id] || id).join(', ');
  };

  const handleSend = (event: FormEvent) => {
    event.preventDefault();

    const content = draft.trim();
    if (!content || selectedRecipientIds.length === 0) {
      return;
    }

    const shouldSendToAll = selectedRecipientIds.length === allRecipientIds.length;
    const gmRecipientIds = recipientOptions.filter((participant) => participant.isGm).map((participant) => participant.id);
    const isOnlyGm =
      selectedRecipientIds.length > 0 &&
      selectedRecipientIds.every((recipientId) => gmRecipientIds.includes(recipientId));

    sendMessage({
      fromUserId: currentUser.id,
      content,
      channelId: shouldSendToAll
        ? globalChannelId
        : `${currentSession.id}-${selectedRecipientIds.slice().sort().join('-')}`,
      channelType: shouldSendToAll ? 'global' : selectedRecipientIds.length === 1 || isOnlyGm ? 'direct' : 'group',
      toUserIds: shouldSendToAll ? [] : selectedRecipientIds,
      options: isOnlyGm ? { isPrivateToGM: true, importance: 'high' } : undefined
    });

    setDraft('');
  };

  return (
    <div className="chat-widget">
      {role === 'gm' && bannerMessage ? (
        <div className="card" style={{ marginBottom: '0.6rem', borderColor: '#38bdf8' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center' }}>
            <div style={{ display: 'grid', gap: '0.25rem' }}>
              <strong>Message prioritaire</strong>
              <span>
                {userDisplayNames[bannerMessage.fromUserId] ?? bannerMessage.fromUserId}: {bannerMessage.content.slice(0, 80)}
                {bannerMessage.content.length > 80 ? '...' : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button className="button secondary" type="button" onClick={openWhisperBannerInChat}>
                Ouvrir
              </button>
              <button className="button secondary" type="button" onClick={dismissWhisperBanner}>
                Masquer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="chat-widget__layout chat-widget__layout--recipients">
        <aside className="chat-widget__sidebar">
          <div className="chat-widget__sidebar-header">
            <strong>Destinataires</strong>
            <div className="chat-widget__recipient-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setSelectedRecipientIds(allRecipientIds)}
                disabled={allRecipientIds.length === 0}
              >
                Tout
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => setSelectedRecipientIds([])}
                disabled={selectedRecipientIds.length === 0}
              >
                Aucun
              </button>
            </div>
          </div>
          <div className="chat-widget__recipient-list">
            {recipientOptions.map((participant) => {
              const isSelected = selectedRecipientIds.includes(participant.id);
              return (
                <label key={participant.id} className={`chat-recipient-item ${isSelected ? 'is-selected' : ''}`.trim()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(event) => {
                      setSelectedRecipientIds((current) =>
                        event.target.checked ? [...current, participant.id] : current.filter((id) => id !== participant.id)
                      );
                    }}
                  />
                  <span>{participant.nickname}</span>
                  {participant.isGm ? <small>MJ</small> : null}
                </label>
              );
            })}
          </div>
        </aside>

        <section ref={messagesRef} className="chat-widget__messages" aria-live="polite">
          {visibleMessages.length > 0 ? (
            visibleMessages.map((message) => {
              const isOwnMessage = message.fromUserId === currentUser.id;
              const isSystem = message.channelType === 'system' || message.fromUserId === 'system';

              if (isSystem) {
                return (
                  <article key={message.id} className="chat-system-message" aria-label="Message systeme">
                    <span>{message.content}</span>
                  </article>
                );
              }

              return (
                <article
                  key={message.id}
                  className={`chat-message ${isOwnMessage ? 'is-own' : 'is-other'} ${
                    message.isPrivateToGM ? 'is-whisper' : ''
                  }`}
                >
                  <header className="chat-message__meta">
                    <strong>{isOwnMessage ? 'Vous' : recipientNames[message.fromUserId] ?? userDisplayNames[message.fromUserId] ?? message.fromUserId}</strong>
                    <span>{formatTime(message.createdAt)}</span>
                  </header>
                  <small className="chat-message__recipients">Pour: {recipientSummary(message)}</small>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message.content}</p>
                </article>
              );
            })
          ) : (
            <p style={{ margin: 0 }}>Aucun message visible.</p>
          )}
        </section>
      </div>

      <form className="chat-widget__composer" onSubmit={handleSend}>
        <input
          type="text"
          placeholder="Votre message..."
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <p className="chat-widget__recipient-summary">
          Envoi: {selectedRecipientIds.length === allRecipientIds.length ? 'Tous' : selectedRecipientIds.map((id) => recipientNames[id] || id).join(', ') || 'Aucun'}
        </p>
        <button className="button" type="submit" disabled={selectedRecipientIds.length === 0}>
          Envoyer
        </button>
      </form>
    </div>
  );
}
