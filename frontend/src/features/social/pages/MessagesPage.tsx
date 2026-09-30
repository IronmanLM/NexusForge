import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../../../components/Layout';
import Button from '../../../components/Button';
import SocialUserAutocomplete from '../../../components/SocialUserAutocomplete';
import { useAuth } from '../../../hooks/useAuth';
import { DirectConversationSummary, DirectMessage, SocialUser } from '../../../types/social';
import {
  getSocialUserByIdService,
  listDirectConversationsService,
  listDirectMessagesService,
  sendDirectMessageService
} from '../../../services/socialService';

export default function MessagesPage() {
  const { currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<DirectConversationSummary[]>([]);
  const [selectedUser, setSelectedUser] = useState<SocialUser | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedConversation = useMemo(
    () => (selectedUser ? conversations.find((item) => item.otherUserId === selectedUser.id) ?? null : null),
    [conversations, selectedUser]
  );

  const reloadConversations = async (preferredUserId?: string | null) => {
    const items = await listDirectConversationsService();
    setConversations(items);
    const targetUserId = preferredUserId ?? selectedUser?.id ?? null;
    if (targetUserId) {
      const maybe = items.find((item) => item.otherUserId === targetUserId);
      if (maybe) {
        setSelectedUser(maybe.user);
      }
    }
  };

  const loadMessages = async (user: SocialUser) => {
    const items = await listDirectMessagesService(user.id);
    setMessages(items);
  };

  const refreshConversationState = useCallback(
    async (preferredUserId?: string | null) => {
      await reloadConversations(preferredUserId ?? selectedUser?.id ?? null);
      if (selectedUser) {
        await loadMessages(selectedUser);
      }
    },
    [selectedUser]
  );

  useEffect(() => {
    const run = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        await reloadConversations();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger la messagerie.');
      } finally {
        setIsLoading(false);
      }
    };
    void run();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    let active = true;
    const refresh = async () => {
      try {
        await refreshConversationState(selectedUser?.id ?? null);
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Impossible d’actualiser la messagerie.');
        }
      }
    };

    const interval = window.setInterval(() => {
      void refresh();
    }, 3_000);

    const handleFocus = () => {
      void refresh();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void refresh();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUser, selectedUser, refreshConversationState]);

  useEffect(() => {
    const targetUserId = searchParams.get('user');
    if (!targetUserId || !currentUser) {
      return;
    }

    if (targetUserId === currentUser.id) {
      setErrorMessage(null);
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete('user');
        return next;
      }, { replace: true });
      return;
    }

    const run = async () => {
      try {
        const existingConversation = conversations.find((item) => item.otherUserId === targetUserId);
        if (existingConversation) {
          await handleSelectUser(existingConversation.user);
          setSearchParams((current) => {
            const next = new URLSearchParams(current);
            next.delete('user');
            return next;
          }, { replace: true });
          return;
        }

        const user = await getSocialUserByIdService(targetUserId);
        await handleSelectUser(user);
        setSearchParams((current) => {
          const next = new URLSearchParams(current);
          next.delete('user');
          return next;
        }, { replace: true });
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Impossible d’ouvrir cette conversation.');
      }
    };

    void run();
  }, [searchParams, conversations, currentUser?.id]);

  const handleSelectUser = async (user: SocialUser) => {
    setSelectedUser(user);
    setErrorMessage(null);
    try {
      await loadMessages(user);
      await reloadConversations(user.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger la conversation.');
    }
  };

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedUser || !draft.trim()) {
      return;
    }
    setIsSending(true);
    setErrorMessage(null);
    try {
      await sendDirectMessageService(selectedUser.id, draft);
      setDraft('');
      await loadMessages(selectedUser);
      await reloadConversations(selectedUser.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Envoi impossible.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Layout wide>
      <section className="card">
        <h1>Messagerie</h1>
        <p>Messagerie privée hors partie. Les utilisateurs ignorés ne peuvent pas t’écrire.</p>
        {errorMessage ? <p className="home-alert home-alert--error">{errorMessage}</p> : null}
        <div className="social-messages-layout">
          <aside className="card social-sidebar">
            <div className="social-sidebar__header">
              <h2>Conversations</h2>
              <Button type="button" variant="secondary" onClick={() => void refreshConversationState()}>
                Actualiser
              </Button>
            </div>
            <label htmlFor="socialUserSearch">Nouvelle conversation</label>
            <SocialUserAutocomplete
              value={query}
              onChange={setQuery}
              onSelect={(user) => {
                setQuery('');
                void handleSelectUser(user);
              }}
              placeholder="Rechercher un joueur ou un MJ"
              filterResults={(items) => items.filter((user) => user.id !== currentUser?.id)}
            />
            {conversations.length === 0 && !isLoading ? (
              <p className="social-user-autocomplete__hint">
                Aucune conversation pour le moment. Recherche un pseudo ci-dessus pour démarrer un échange.
              </p>
            ) : null}
            <div className="social-conversation-list">
              {isLoading ? <p>Chargement...</p> : null}
              {conversations.map((conversation) => (
                <button
                  key={conversation.otherUserId}
                  type="button"
                  className={`social-user-list-item ${selectedUser?.id === conversation.otherUserId ? 'is-active' : ''}`.trim()}
                  onClick={() => void handleSelectUser(conversation.user)}
                >
                  <div className="social-user-list-item__row">
                    <strong>{conversation.user.displayName}</strong>
                    {conversation.unreadCount > 0 ? <span className="home-pill home-pill--accent">{conversation.unreadCount}</span> : null}
                  </div>
                  <span>{conversation.lastMessagePreview}</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="card social-chat-panel">
            {selectedUser ? (
              <>
                <header className="social-chat-panel__header">
                  <div>
                    <h2>{selectedUser.displayName}</h2>
                    <p>@{selectedUser.nickname || selectedUser.id}</p>
                  </div>
                  {selectedConversation?.unreadCount ? <span className="home-pill home-pill--accent">{selectedConversation.unreadCount} non lus</span> : null}
                </header>
                <div className="social-chat-messages">
                  {messages.map((message) => (
                    <article
                      key={message.id}
                      className={`social-chat-message ${message.fromUserId === currentUser?.id ? 'is-own' : 'is-other'}`.trim()}
                    >
                      <p>{message.content}</p>
                      <small>{new Date(message.createdAt).toLocaleString('fr-FR')}</small>
                    </article>
                  ))}
                </div>
                <form className="social-chat-form" onSubmit={handleSend}>
                  <textarea rows={4} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ecrire un message..." />
                  <Button type="submit" disabled={isSending || !draft.trim()}>
                    {isSending ? 'Envoi...' : 'Envoyer'}
                  </Button>
                </form>
              </>
            ) : (
              <div className="social-empty-state">
                <h2>Choisis une conversation</h2>
                <p>Sélectionne un utilisateur à gauche ou démarre une nouvelle conversation.</p>
                <div className="social-empty-state__actions">
                  <label htmlFor="socialUserSearchMain">Nouvelle conversation</label>
                  <SocialUserAutocomplete
                    value={query}
                    onChange={setQuery}
                    onSelect={(user) => {
                      setQuery('');
                      void handleSelectUser(user);
                    }}
                    placeholder="Rechercher un joueur ou un MJ"
                    filterResults={(items) => items.filter((user) => user.id !== currentUser?.id)}
                  />
                </div>
              </div>
            )}
          </section>
        </div>
      </section>
    </Layout>
  );
}
