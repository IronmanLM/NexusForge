import { useEffect, useMemo, useState } from 'react';
import { messageRepository } from '../../../data/repositories';
import { Message } from '../../../types/message';
import { Session } from '../../../types/session';
import { User } from '../../../types/user';

type SessionDiceHistoryWidgetProps = {
  currentSession: Session;
  currentUser: User;
  scope?: string;
  limit?: number;
};

export default function SessionDiceHistoryWidget({
  currentSession,
  currentUser,
  scope = 'party',
  limit = 10
}: SessionDiceHistoryWidgetProps) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      const loaded = await messageRepository.listForSession(currentSession.id);
      if (active) {
        setMessages(loaded);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [currentSession.id]);

  const rolls = useMemo(() => {
    return messages
      .filter((message) => message.systemType === 'roll')
      .filter((message) => {
        if (scope === 'self') {
          return message.fromUserId === currentUser.id;
        }
        return true;
      })
      .slice(-Math.max(1, limit))
      .reverse();
  }, [currentUser.id, limit, messages, scope]);

  if (rolls.length === 0) {
    return <p style={{ margin: 0 }}>Aucun jet visible.</p>;
  }

  return (
    <div style={{ display: 'grid', gap: '0.45rem' }}>
      {rolls.map((message) => (
        <article key={message.id} className="card" style={{ margin: 0, padding: '0.55rem 0.7rem' }}>
          <strong>{message.fromUserId === 'system' ? 'Systeme' : message.fromUserId === currentUser.id ? 'Vous' : message.fromUserId}</strong>
          <div style={{ whiteSpace: 'pre-wrap', color: '#cbd5e1' }}>{message.content}</div>
        </article>
      ))}
    </div>
  );
}
