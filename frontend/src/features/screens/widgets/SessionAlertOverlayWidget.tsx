import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AuthenticatedImage from '../../../components/AuthenticatedImage';
import { messageRepository } from '../../../data/repositories';
import { getSocialUserByIdService } from '../../../services/socialService';
import { useChatStore } from '../../../stores/chatStore';
import { Message, SystemMessageType } from '../../../types/message';
import { Session, SessionParticipant } from '../../../types/session';
import { User } from '../../../types/user';

type SessionAlertOverlayWidgetProps = {
  currentSession: Session;
  currentUser: User;
  role: 'gm' | 'player';
  source?: 'incoming' | 'gm_priority' | 'all';
  durationMs?: number;
  position?: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';
};

type ParticipantIdentity = {
  label: string;
  avatarUrl?: string | null;
  avatarResourceId?: string | null;
};

const DEFAULT_ALERT_SYSTEM_MESSAGE_TYPES: SystemMessageType[] = ['combat_start', 'turn', 'combat_end', 'roll'];
const acknowledgedAlertIdsByViewer = new Map<string, Set<string>>();

function getViewerKey(sessionId: string, userId: string, role: 'gm' | 'player'): string {
  return `${sessionId}:${userId}:${role}`;
}

function getAcknowledgedIds(viewerKey: string): Set<string> {
  const existing = acknowledgedAlertIdsByViewer.get(viewerKey);
  if (existing) {
    return existing;
  }
  const created = new Set<string>();
  acknowledgedAlertIdsByViewer.set(viewerKey, created);
  return created;
}

function participantLabel(participant: SessionParticipant | null | undefined, fallbackUserId = ''): string {
  return participant?.nickname || participant?.displayName || fallbackUserId || 'Inconnu';
}

function buildParticipantIdentityMap(
  currentSession: Session,
  currentUser: User
): Record<string, ParticipantIdentity> {
  const identities: Record<string, ParticipantIdentity> = Object.fromEntries(
    (currentSession.participants ?? []).map((participant) => [
      participant.userId,
      {
        label: participantLabel(participant, participant.userId)
      }
    ])
  );

  identities[currentUser.id] = {
    label: currentUser.nickname || currentUser.displayName || currentUser.id,
    avatarUrl: currentUser.avatarUrl ?? currentUser.discordAccount?.avatarUrl ?? null,
    avatarResourceId: currentUser.avatarResourceId ?? null
  };

  identities.system = {
    label: 'Système'
  };

  return identities;
}

function participantInitials(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    return '?';
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

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

function getAlertDurationMs(message: Message, fallbackDurationMs: number): number {
  switch (message.systemType) {
    case 'combat_start':
    case 'combat_end':
    case 'roll':
      return 10_000;
    case 'turn':
      return 5_000;
    default:
      return fallbackDurationMs;
  }
}

function alertTitle(message: Message): string {
  switch (message.systemType) {
    case 'combat_start':
      return 'Début de combat';
    case 'turn':
      return 'Tour en cours';
    case 'combat_end':
      return 'Fin de combat';
    case 'round':
      return 'Nouveau round';
    case 'roll':
      return 'Jet de dés';
    default:
      if (message.channelType === 'system') {
        return 'Système';
      }
      if (message.isPrivateToGM) {
        return 'Prioritaire MJ';
      }
      return 'Message entrant';
  }
}

function shouldDisplayMessageAsAlert(
  message: Message,
  currentUser: User,
  role: 'gm' | 'player',
  source: 'incoming' | 'gm_priority' | 'all',
  now: number,
  durationMs: number,
  dismissedIds: string[],
  enabledSystemTypes: SystemMessageType[]
): boolean {
  if (!isVisibleMessage(message, currentUser, role)) {
    return false;
  }
  if (dismissedIds.includes(message.id)) {
    return false;
  }
  if (message.ui?.shouldShowBanner === false) {
    return false;
  }

  const age = now - new Date(message.createdAt).getTime();
  if (age > getAlertDurationMs(message, durationMs)) {
    return false;
  }

  if (message.channelType === 'system' && (!message.systemType || !enabledSystemTypes.includes(message.systemType))) {
    return false;
  }

  if (source === 'incoming') {
    return message.fromUserId !== currentUser.id && message.channelType !== 'system';
  }

  if (source === 'gm_priority') {
    return message.ui?.importance === 'high' || message.ui?.importance === 'critical' || Boolean(message.isPrivateToGM);
  }

  return true;
}

function getRecipientLabel(message: Message, participantIdentities: Record<string, ParticipantIdentity>): string {
  if (message.channelType === 'system') {
    return 'Tous';
  }
  if (message.isPrivateToGM) {
    return 'MJ';
  }
  if (Array.isArray(message.toUserIds) && message.toUserIds.length > 0) {
    return message.toUserIds
      .map((userId) => participantIdentities[userId]?.label || userId)
      .join(', ');
  }
  return 'Tous';
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
  const viewerKey = useMemo(() => getViewerKey(currentSession.id, currentUser.id, role), [currentSession.id, currentUser.id, role]);
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => Array.from(getAcknowledgedIds(viewerKey)));
  const [participantIdentities, setParticipantIdentities] = useState<Record<string, ParticipantIdentity>>(() =>
    buildParticipantIdentityMap(currentSession, currentUser)
  );
  const visibleAlertIdsRef = useRef<string[]>([]);
  const { openMessageInChat } = useChatStore({
    sessionId: currentSession.id,
    gmUserId: currentSession.gmUserId,
    currentUserId: currentUser.id,
    currentUserRole: role,
    participants: currentSession.participants ?? [],
    allowPlayerToPlayerChat: currentSession.settings?.allowPlayerToPlayerChat !== false
  });

  const enabledSystemTypes = currentSession.settings?.alertBannerSystemMessageTypes ?? DEFAULT_ALERT_SYSTEM_MESSAGE_TYPES;

  const acknowledgeAlertIds = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) {
        return;
      }
      const store = getAcknowledgedIds(viewerKey);
      ids.forEach((id) => store.add(id));
      setDismissedIds(Array.from(store));
    },
    [viewerKey]
  );

  useEffect(() => {
    setDismissedIds(Array.from(getAcknowledgedIds(viewerKey)));
  }, [viewerKey]);

  useEffect(() => {
    setParticipantIdentities(buildParticipantIdentityMap(currentSession, currentUser));
  }, [currentSession, currentUser]);

  useEffect(() => {
    const participantIds = Array.from(
      new Set(
        (currentSession.participants ?? [])
          .map((participant) => participant.userId)
          .concat(currentUser.id)
          .filter((userId) => userId && userId !== 'system')
      )
    );

    if (participantIds.length === 0) {
      return;
    }

    let active = true;

    void Promise.allSettled(participantIds.map((userId) => getSocialUserByIdService(userId))).then((results) => {
      if (!active) {
        return;
      }
      setParticipantIdentities((current) => {
        const next = { ...current };
        results.forEach((result, index) => {
          if (result.status !== 'fulfilled') {
            return;
          }
          const userId = participantIds[index];
          const user = result.value;
          next[userId] = {
            label: user.nickname || user.displayName || current[userId]?.label || userId,
            avatarUrl: user.avatarUrl ?? current[userId]?.avatarUrl ?? null,
            avatarResourceId: current[userId]?.avatarResourceId ?? null
          };
        });
        return next;
      });
    });

    return () => {
      active = false;
    };
  }, [currentSession.participants, currentUser.id]);

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
    }, 1_500);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [currentSession.id]);

  const alerts = useMemo(() => {
    const now = Date.now();
    return messages
      .filter((message) =>
        shouldDisplayMessageAsAlert(
          message,
          currentUser,
          role,
          source,
          now,
          durationMs,
          dismissedIds,
          enabledSystemTypes
        )
      )
      .slice(-5)
      .reverse();
  }, [currentUser, dismissedIds, durationMs, enabledSystemTypes, messages, role, source]);

  useEffect(() => {
    visibleAlertIdsRef.current = alerts.map((message) => message.id);
  }, [alerts]);

  useEffect(() => {
    return () => {
      acknowledgeAlertIds(visibleAlertIdsRef.current);
    };
  }, [acknowledgeAlertIds]);

  const alignment =
    position === 'top_left'
      ? { alignItems: 'start', justifyItems: 'start' }
      : position === 'bottom_left'
      ? { alignItems: 'end', justifyItems: 'start' }
      : position === 'bottom_right'
      ? { alignItems: 'end', justifyItems: 'end' }
      : { alignItems: 'start', justifyItems: 'end' };

  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className="screen-runtime-alert-overlay" style={{ ...alignment }}>
      <div className="screen-runtime-alert-overlay__stack">
        <div className="screen-runtime-alert-overlay__toolbar">
          <strong>Bandeau d alerte</strong>
          <button
            className="button secondary"
            type="button"
            onClick={() => acknowledgeAlertIds(alerts.map((message) => message.id))}
          >
            Valider tout
          </button>
        </div>
        {alerts.map((message) => {
          const sender = participantIdentities[message.fromUserId] ?? {
            label: message.fromUserId === 'system' ? 'Système' : message.fromUserId
          };
          const recipientLabel = getRecipientLabel(message, participantIdentities);
          return (
            <article
              key={message.id}
              className="card screen-runtime-alert-overlay__card"
              onClick={() => openMessageInChat(message.id)}
            >
              <div className="screen-runtime-alert-overlay__meta">
                <div className="screen-runtime-alert-overlay__avatar" aria-hidden="true">
                  {sender.avatarUrl ? (
                    <AuthenticatedImage
                      src={sender.avatarUrl}
                      resourceId={sender.avatarResourceId}
                      alt={sender.label}
                      className="screen-runtime-alert-overlay__avatar-image"
                    />
                  ) : (
                    <span>{participantInitials(sender.label)}</span>
                  )}
                </div>
                <div className="screen-runtime-alert-overlay__summary">
                  <div className="screen-runtime-alert-overlay__summary-top">
                    <strong>{alertTitle(message)}</strong>
                    <small>{new Date(message.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</small>
                  </div>
                  <small>De : {sender.label}</small>
                  <small>Pour : {recipientLabel}</small>
                </div>
                <button
                  className="button secondary"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    acknowledgeAlertIds([message.id]);
                  }}
                >
                  Valider
                </button>
              </div>
              <p className="screen-runtime-alert-overlay__content">{message.content}</p>
              <small className="screen-runtime-alert-overlay__hint">Cliquer pour ouvrir le chat sur ce message.</small>
            </article>
          );
        })}
      </div>
    </div>
  );
}
