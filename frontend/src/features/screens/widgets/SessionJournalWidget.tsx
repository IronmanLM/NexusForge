import { useEffect, useMemo, useState } from 'react';
import { messageRepository } from '../../../data/repositories';
import { Message } from '../../../types/message';
import { Session } from '../../../types/session';

type SessionJournalWidgetProps = {
  currentSession: Session;
  limit?: number;
  showFilters?: boolean;
};

export default function SessionJournalWidget({
  currentSession,
  limit = 10,
  showFilters = true
}: SessionJournalWidgetProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState<'all' | 'system' | 'chat'>('all');

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

  const items = useMemo(() => {
    return messages
      .filter((message) => {
        if (filter === 'system') {
          return message.fromUserId === 'system' || message.channelType === 'system';
        }
        if (filter === 'chat') {
          return message.fromUserId !== 'system' && message.channelType !== 'system';
        }
        return true;
      })
      .slice(-Math.max(1, limit))
      .reverse();
  }, [filter, limit, messages]);

  return (
    <div style={{ display: 'grid', gap: '0.6rem', alignContent: 'start' }}>
      {showFilters ? (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button className={`button secondary ${filter === 'all' ? 'is-active' : ''}`.trim()} type="button" onClick={() => setFilter('all')}>
            Tout
          </button>
          <button className={`button secondary ${filter === 'system' ? 'is-active' : ''}`.trim()} type="button" onClick={() => setFilter('system')}>
            Systeme
          </button>
          <button className={`button secondary ${filter === 'chat' ? 'is-active' : ''}`.trim()} type="button" onClick={() => setFilter('chat')}>
            Chat
          </button>
        </div>
      ) : null}

      {items.length === 0 ? <p style={{ margin: 0 }}>Aucun evenement pour le moment.</p> : null}
      {items.map((message) => (
        <article key={message.id} className="card" style={{ margin: 0, padding: '0.55rem 0.7rem' }}>
          <strong>{message.fromUserId === 'system' ? 'Systeme' : 'Message'}</strong>
          <div style={{ whiteSpace: 'pre-wrap', color: '#cbd5e1' }}>{message.content}</div>
        </article>
      ))}
    </div>
  );
}
