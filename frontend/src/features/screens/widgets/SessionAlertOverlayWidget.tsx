import { useEffect, useMemo, useState } from 'react';
import { messageRepository } from '../../../data/repositories';
import { useChatStore } from '../../../stores/chatStore';
import { Message } from '../../../types/message';
import { Session } from '../../../types/session';
import { User } from '../../../types/user';

type SessionAlertOverlayWidgetProps = {
  currentSession: Session;
  currentUser: User;
  role: 'gm' | 'player';
  source?: 'incoming' | 'gm_priority' | 'all';
  durationMs?: number;
  position?: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';
};

function isVisibleMessage(message: Message, currentUser: User, role: 'gm' | 'player'): boolean {
  if (message.channelType === 'system') {
    return true;
  }
  if (role === 'gm') {
    return true;
  }
  if (message.isPrivateToGM && message.fromUserId !== currentUser.id) {
    return false;
  }
  if (Array.isArray(message.toUserIds) && message.toUserIds.length > 0) {
    return message.toUserIds.includes(currentUser.id) || message.fromUserId === currentUser.id;
  }
  return true;
}

export default function SessionAlertOverlayWidget({
  currentSession,
  currentUser,
  role,
  source = 'all',
  durationMs = 5000,
  position = 'top_right'
}: SessionAlertOverlayWidgetProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const { openMessageInChat } = useChatStore({
    sessionId: currentSession.id,
    gmUserId: currentSession.gmUserId,
    currentUserId: currentUser.id,
    currentUserRole: role,
    participants: currentSession.participants ?? [],
    allowPlayerToPlayerChat: currentSession.settings?.allowPlayerToPlayerChat !== false
  });

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const items = await messageRepository.listForSession(currentSession.id);
      if (mounted) {
        setMessages(items);
      }
    };

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 4000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [currentSession.id]);

  const alerts = useMemo(() => {
    const now = Date.now();
    return messages
      .filter((message) => isVisibleMessage(message, currentUser, role))
      .filter((message) => !dismissedIds.includes(message.id))
      .filter((message) => {
        const age = now - new Date(message.createdAt).getTime();
        if (age > durationMs) {
          return false;
        }
        if (source === 'incoming') {
          return message.fromUserId !== currentUser.id && message.channelType !== 'system';
        }
        if (source === 'gm_priority') {
          return message.ui?.importance === 'high' || message.ui?.importance === 'critical' || message.isPrivateToGM;
        }
        return true;
      })
      .slice(-5)
      .reverse();
  }, [currentUser.id, currentUser, dismissedIds, durationMs, messages, role, source]);

  const alignment =
    position === 'top_left'
      ? { alignItems: 'start', justifyItems: 'start' }
      : position === 'bottom_left'
      ? { alignItems: 'end', justifyItems: 'start' }
      : position === 'bottom_right'
      ? { alignItems: 'end', justifyItems: 'end' }
      : { alignItems: 'start', justifyItems: 'end' };

  return (
    <div style={{ display: 'grid', height: '100%', ...alignment }}>
      <div style={{ display: 'grid', gap: '0.5rem', width: 'min(100%, 420px)' }}>
        {alerts.length === 0 ? <p style={{ margin: 0 }}>Aucune alerte active.</p> : null}
        {alerts.map((message) => (
          <article
            key={message.id}
            className="card"
            style={{ margin: 0, borderColor: '#38bdf8', display: 'grid', gap: '0.35rem', cursor: 'pointer' }}
            onClick={() => openMessageInChat(message.id)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
              <strong>{message.channelType === 'system' ? 'Systeme' : message.isPrivateToGM ? 'Prioritaire MJ' : 'Message entrant'}</strong>
              <button
                className="button secondary"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setDismissedIds((current) => [...current, message.id]);
                }}
              >
                Masquer
              </button>
            </div>
            <small>{new Date(message.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</small>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message.content}</p>
            <small style={{ color: '#38bdf8' }}>Cliquer pour ouvrir le chat sur ce message.</small>
          </article>
        ))}
      </div>
    </div>
  );
}
